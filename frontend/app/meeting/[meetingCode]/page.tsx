"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { VideoGrid } from "@/components/meeting/VideoGrid";
import { ControlBar } from "@/components/meeting/ControlBar";
import { ParticipantSidebar } from "@/components/meeting/ParticipantSidebar";
import { api } from "@/lib/api";
import { WebRTCClientManager, RemoteTrack } from "@/lib/webrtcClient";
import { Participant } from "@/types";
import { Copy, Check, ShieldAlert, Loader2, Video, User as UserIcon } from "lucide-react";

export default function MeetingRoom() {
  const params = useParams();
  const router = useRouter();
  const meetingCode = params.meetingCode as string;

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [localDisplayName, setLocalDisplayName] = useState("Guest");
  const [localParticipantId, setLocalParticipantId] = useState<number | undefined>();
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isHost, setIsHost] = useState(false);

  const [remoteTracks, setRemoteTracks] = useState<RemoteTrack[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [copiedLink, setCopiedLink] = useState(false);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sfuConnected, setSfuConnected] = useState(false);
  const [sfuError, setSfuError] = useState<string | null>(null);

  // Name Prompt Modal State
  const [showNameModal, setShowNameModal] = useState(false);
  const [inputName, setInputName] = useState("");
  const [hasSubmittedName, setHasSubmittedName] = useState(false);

  const rtcManagerRef = useRef<WebRTCClientManager | null>(null);

  useEffect(() => {
    // Check if name is already set in localStorage or user profile
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("zoom_display_name");
      const storedUser = localStorage.getItem("zoom_user");
      if (stored) {
        setInputName(stored);
        setHasSubmittedName(true);
      } else if (storedUser) {
        try {
          const u = JSON.parse(storedUser);
          if (u.name) {
            setInputName(u.name);
            localStorage.setItem("zoom_display_name", u.name);
            setHasSubmittedName(true);
          } else {
            setShowNameModal(true);
          }
        } catch (e) {
          setShowNameModal(true);
        }
      } else {
        setShowNameModal(true);
      }
    }
  }, []);

  useEffect(() => {
    if (showNameModal && !hasSubmittedName) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    let stream: MediaStream | null = null;

    async function initMeeting() {
      try {
        setLoading(true);

        // 1. Fetch meeting detail and join via REST
        const nameToUse =
          inputName.trim() ||
          (typeof window !== "undefined"
            ? localStorage.getItem("zoom_display_name") || "Guest"
            : "Guest");

        const joinRes = await api.joinMeeting(meetingCode, nameToUse);

        if (!isMounted) return;

        setLocalDisplayName(joinRes.display_name);
        setLocalParticipantId(joinRes.participant_id);
        setIsHost(joinRes.is_host);

        // 2. Access local user camera/mic stream
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true,
          });
          if (isMounted) setLocalStream(stream);
        } catch (mediaErr) {
          console.warn("Media devices not accessible:", mediaErr);
          if (isMounted) {
            setIsVideoOff(true);
            setIsMuted(true);
          }
        }

        // 3. Connect WebRTC signaling manager
        const rtcManager = new WebRTCClientManager(
          meetingCode,
          joinRes.participant_id.toString(),
          joinRes.display_name,
          stream
        );
        rtcManagerRef.current = rtcManager;

        rtcManager.onRemoteTracks((updatedTracks) => {
          if (isMounted) setRemoteTracks(updatedTracks);
        });

        try {
          await rtcManager.connect();
          if (isMounted) setSfuConnected(true);
        } catch (err: any) {
          console.warn("WebRTC signaling connection notice:", err.message);
          if (isMounted) setSfuError("Running in WebRTC peer mode");
        }

        // 4. Poll active room participants list
        const pollInterval = setInterval(async () => {
          if (!isMounted) return;
          try {
            const list = await api.getParticipants(meetingCode);
            setParticipants(list);
          } catch (e) {}
        }, 3000);

        return () => clearInterval(pollInterval);
      } catch (err: any) {
        console.error("Failed to initialize meeting room:", err);
        alert(err.message || "Failed to join meeting");
        router.push("/");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    initMeeting();

    return () => {
      isMounted = false;
      if (rtcManagerRef.current) {
        rtcManagerRef.current.disconnect();
      }
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [meetingCode, router, hasSubmittedName]);

  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputName.trim()) return;
    if (typeof window !== "undefined") {
      localStorage.setItem("zoom_display_name", inputName.trim());
    }
    setShowNameModal(false);
    setHasSubmittedName(true);
  };

  // Audio mute toggle
  const handleToggleAudio = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  // Video toggle
  const handleToggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      }
    }
  };

  // Leave meeting
  const handleLeaveMeeting = async () => {
    if (localParticipantId) {
      try {
        await api.leaveMeeting(meetingCode, localParticipantId);
      } catch (err) {}
    }
    router.push("/");
  };

  // Host Mute All
  const handleMuteAll = async () => {
    try {
      await api.muteAll(meetingCode);
      alert("All participants muted");
    } catch (err) {}
  };

  // Host Remove Participant
  const handleRemoveParticipant = async (pId: number) => {
    try {
      await api.removeParticipant(meetingCode, pId);
    } catch (err) {}
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Display Name Prompt Modal
  if (showNameModal && !hasSubmittedName) {
    return (
      <div className="min-h-screen bg-[#101416] flex flex-col items-center justify-center text-white px-6 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[#0E71EB]/20 rounded-full blur-3xl pointer-events-none" />
        
        <div className="w-full max-w-md bg-[#1D2022] border border-white/10 rounded-2xl p-8 shadow-2xl space-y-6 relative z-10">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#0E71EB] to-[#2D8CFF] flex items-center justify-center mx-auto shadow-lg shadow-[#0E71EB]/30">
              <Video className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight">Ready to join?</h2>
            <p className="text-xs text-gray-400">Enter your display name for meeting code <span className="font-mono text-[#2D8CFF] font-semibold">{meetingCode}</span></p>
          </div>

          <form onSubmit={handleNameSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-gray-300">Your Name</label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  placeholder="e.g. Abhinav Gupta"
                  value={inputName}
                  onChange={(e) => setInputName(e.target.value)}
                  className="w-full bg-[#101416] border border-white/10 rounded-xl pl-10 pr-4 py-3 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#0E71EB] transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-[#0E71EB] hover:bg-[#2D8CFF] text-white font-bold text-xs py-3.5 rounded-xl shadow-lg shadow-[#0E71EB]/25 flex items-center justify-center gap-2 hover:scale-[1.01] transition-all"
            >
              <span>Join Meeting Now</span>
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#101416] flex flex-col items-center justify-center text-white gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-[#0E71EB]" />
        <p className="text-xs font-semibold text-gray-300">Connecting to meeting room...</p>
      </div>
    );
  }

  return (
    <div className="relative w-screen h-screen bg-[#101416] overflow-hidden flex flex-col justify-between">
      {/* Top Header Bar */}
      <header className="h-14 border-b border-white/10 px-6 flex items-center justify-between bg-[#101416]/90 backdrop-blur-md z-20">
        <div className="flex items-center gap-3">
          <span className="font-extrabold text-lg text-white tracking-tight">zoom</span>
          <span className="text-gray-500">|</span>
          <span className="text-xs text-gray-300 font-mono">Code: {meetingCode}</span>
          <button
            onClick={handleCopyCode}
            className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
            title="Copy Invite Link"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>

        <div className="flex items-center gap-2">
          {sfuConnected ? (
            <span className="text-[10px] bg-green-500/10 text-green-400 border border-green-500/30 px-2.5 py-1 rounded-full font-semibold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              Live WebRTC Connected
            </span>
          ) : (
            <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2.5 py-1 rounded-full font-semibold flex items-center gap-1">
              <ShieldAlert className="w-3 h-3" />
              {sfuError || "Connecting..."}
            </span>
          )}
        </div>
      </header>

      {/* Main Content (Video Grid + Sidebar) */}
      <main className="flex-1 relative flex overflow-hidden">
        <div className="flex-1 h-full relative">
          <VideoGrid
            localStream={localStream}
            localDisplayName={localDisplayName}
            localMuted={isMuted}
            localVideoOff={isVideoOff}
            remoteTracks={remoteTracks}
            participants={participants}
            localParticipantId={localParticipantId}
          />
        </div>

        {/* Slide-in Participant Sidebar */}
        <ParticipantSidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          participants={participants}
          currentParticipantId={localParticipantId}
          isHost={isHost}
          onMuteAll={handleMuteAll}
          onRemoveParticipant={handleRemoveParticipant}
        />
      </main>

      {/* Bottom Control Bar */}
      <ControlBar
        isMuted={isMuted}
        isVideoOff={isVideoOff}
        isHost={isHost}
        participantCount={participants.length || 1}
        meetingCode={meetingCode}
        onToggleAudio={handleToggleAudio}
        onToggleVideo={handleToggleVideo}
        onLeaveMeeting={handleLeaveMeeting}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
      />
    </div>
  );
}
