"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { VideoGrid } from "@/components/meeting/VideoGrid";
import { ControlBar } from "@/components/meeting/ControlBar";
import { ParticipantSidebar } from "@/components/meeting/ParticipantSidebar";
import { MediasoupClientManager, RemoteTrack } from "@/lib/mediasoupClient";
import { api } from "@/lib/api";
import { Participant, JoinResponse } from "@/types";
import { Loader2, AlertTriangle } from "lucide-react";

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";

export default function MeetingRoomPage() {
  const router = useRouter();
  const params = useParams();
  const meetingCode = params.meetingCode as string;

  const [participant, setParticipant] = useState<JoinResponse | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteTracks, setRemoteTracks] = useState<RemoteTrack[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sfuConnected, setSfuConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sfuError, setSfuError] = useState<string | null>(null);

  const mediasoupManagerRef = useRef<MediasoupClientManager | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // 1. Initialise participant info & media
  useEffect(() => {
    async function initRoom() {
      try {
        // Load stored participant info or auto-join as guest
        const storedPart = sessionStorage.getItem(`participant_${meetingCode}`);
        let p: JoinResponse;
        if (storedPart) {
          p = JSON.parse(storedPart);
        } else {
          p = await api.joinMeeting(meetingCode, "Guest User");
        }
        setParticipant(p);

        // Load media preferences from lobby
        const storedMedia = sessionStorage.getItem(`media_settings_${meetingCode}`);
        if (storedMedia) {
          const { isMuted: m, isVideoOff: v } = JSON.parse(storedMedia);
          setIsMuted(m);
          setIsVideoOff(v);
        }

        // Get local media stream
        let stream: MediaStream | null = null;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true,
          });
          setLocalStream(stream);
        } catch (mediaErr) {
          console.warn("Media devices not accessible:", mediaErr);
          setIsVideoOff(true);
          setIsMuted(true);
        }

        // 2. Connect to SFU (mediasoup)
        const msManager = new MediasoupClientManager(
          meetingCode,
          p.participant_id.toString(),
          p.display_name
        );
        mediasoupManagerRef.current = msManager;

        try {
          await msManager.connect((updatedTracks) => {
            setRemoteTracks(updatedTracks);
          });
          setSfuConnected(true);

          // Produce local tracks if available
          if (stream) {
            const audioTrack = stream.getAudioTracks()[0];
            const videoTrack = stream.getVideoTracks()[0];
            await msManager.produceTracks(audioTrack, videoTrack);
          }
        } catch (err: any) {
          console.warn("mediasoup SFU connection notice:", err.message);
          setSfuError("Running in local fallback mode (SFU server not connected)");
        }

        // 3. Connect to FastAPI WS presence channel
        const protocol = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss:" : "ws:";
        const host = typeof window !== "undefined" ? window.location.host : "localhost:8000";
        const wsUrl = process.env.NEXT_PUBLIC_WS_URL || `${protocol}//${host}`;
        const ws = new WebSocket(`${wsUrl}/ws/meetings/${meetingCode}`);
        wsRef.current = ws;

        ws.onopen = () => {
          ws.send(
            JSON.stringify({
              event: "joined",
              participant_id: p.participant_id,
              display_name: p.display_name,
              is_host: p.is_host,
            })
          );
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.event === "init") {
              setParticipants(data.participants);
            } else if (data.event === "participant_joined") {
              setParticipants((prev) => {
                if (prev.some((item) => item.id === data.participant.id)) return prev;
                return [...prev, data.participant];
              });
            } else if (data.event === "participant_left") {
              setParticipants((prev) => prev.filter((item) => item.id !== data.participant_id));
            } else if (data.event === "participant_muted") {
              setParticipants((prev) =>
                prev.map((item) =>
                  item.id === data.participant_id ? { ...item, is_muted: data.is_muted } : item
                )
              );
            }
          } catch (e) {
            console.error("WS message parse error:", e);
          }
        };

        setLoading(false);
      } catch (err: any) {
        console.error("Room initialization failed:", err);
        router.push(`/meeting/${meetingCode}/lobby`);
      }
    }

    initRoom();

    // 4. Polling fallback to keep participant list fresh
    const pollInterval = setInterval(async () => {
      try {
        const activeParts = await api.getParticipants(meetingCode);
        if (activeParts && activeParts.length > 0) {
          setParticipants(activeParts);
        }
      } catch (pollErr) {
        // Silent fail on background poll
      }
    }, 3000);

    return () => {
      clearInterval(pollInterval);
      mediasoupManagerRef.current?.disconnect();
      if (wsRef.current) {
        wsRef.current.close();
      }
      localStream?.getTracks().forEach((t) => t.stop());
    };
  }, [meetingCode]);

  // Handle local track toggle
  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    if (localStream) {
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = !nextMuted;
      });
    }
    mediasoupManagerRef.current?.toggleAudio(!nextMuted);
    setIsMuted(nextMuted);

    if (wsRef.current && participant) {
      wsRef.current.send(
        JSON.stringify({
          event: "muted",
          participant_id: participant.participant_id,
          is_muted: nextMuted,
        })
      );
    }
  };

  const handleToggleVideo = () => {
    const nextVideoOff = !isVideoOff;
    if (localStream) {
      localStream.getVideoTracks().forEach((track) => {
        track.enabled = !nextVideoOff;
      });
    }
    mediasoupManagerRef.current?.toggleVideo(!nextVideoOff);
    setIsVideoOff(nextVideoOff);
  };

  const handleLeave = async () => {
    if (participant) {
      await api.leaveMeeting(meetingCode, participant.participant_id).catch(() => {});
      if (wsRef.current) {
        wsRef.current.send(
          JSON.stringify({
            event: "left",
            participant_id: participant.participant_id,
          })
        );
      }
    }
    router.push("/");
  };

  // Host Controls
  const handleMuteAll = async () => {
    await api.muteAll(meetingCode).catch(() => {});
  };

  const handleRemoveParticipant = async (id: number) => {
    await api.removeParticipant(meetingCode, id).catch(() => {});
  };

  if (loading) {
    return (
      <div className="h-screen bg-zoom-darkBg flex items-center justify-center text-zoom-textMuted gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-zoom-blue" />
        <span className="text-sm">Connecting to meeting...</span>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-zoom-darkBg overflow-hidden">
      {/* Fallback Banner Notice if SFU is offline */}
      {sfuError && (
        <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-2 flex items-center justify-between text-xs text-amber-300">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-400" />
            <span>{sfuError}</span>
          </div>
          <span className="text-[10px] bg-amber-500/20 px-2 py-0.5 rounded font-mono">Local Preview Active</span>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden relative">
        <VideoGrid
          localStream={localStream}
          localDisplayName={participant?.display_name || "You"}
          localMuted={isMuted}
          localVideoOff={isVideoOff}
          remoteTracks={remoteTracks}
        />

        {/* Slide-in Participant Sidebar */}
        <ParticipantSidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          participants={participants}
          isHost={participant?.is_host || false}
          onMuteAll={handleMuteAll}
          onRemoveParticipant={handleRemoveParticipant}
        />
      </div>

      {/* Zoom Control Bar */}
      <ControlBar
        isMuted={isMuted}
        isVideoOff={isVideoOff}
        onToggleMute={handleToggleMute}
        onToggleVideo={handleToggleVideo}
        onLeave={handleLeave}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        participantCount={participants.length}
        meetingCode={meetingCode}
      />
    </div>
  );
}
