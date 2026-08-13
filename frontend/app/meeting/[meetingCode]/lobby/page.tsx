"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { MeetingDetail } from "@/types";
import { Mic, MicOff, Video as VideoIcon, VideoOff, ArrowRight, Loader2, User, Shield } from "lucide-react";

function LobbyContent() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const meetingCode = params.meetingCode as string;

  const [meeting, setMeeting] = useState<MeetingDetail | null>(null);
  const [displayName, setDisplayName] = useState(searchParams.get("name") || "Default User");
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);

  // 1. Fetch meeting info
  useEffect(() => {
    async function fetchMeeting() {
      try {
        const data = await api.getMeeting(meetingCode);
        setMeeting(data);
      } catch (err: any) {
        setError(err.message || "Meeting not found or has ended");
      } finally {
        setLoading(false);
      }
    }
    fetchMeeting();
  }, [meetingCode]);

  // 2. Request camera & mic preview
  useEffect(() => {
    let stream: MediaStream | null = null;
    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        setLocalStream(stream);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.warn("Could not access media devices:", err);
        setIsVideoOff(true);
        setIsMuted(true);
      }
    }
    startCamera();

    return () => {
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const toggleMic = () => {
    const nextMuted = !isMuted;
    if (localStream) {
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = !nextMuted;
      });
    }
    setIsMuted(nextMuted);
  };

  const toggleCamera = () => {
    const nextVideoOff = !isVideoOff;
    if (localStream) {
      localStream.getVideoTracks().forEach((track) => {
        track.enabled = !nextVideoOff;
      });
    }
    setIsVideoOff(nextVideoOff);
  };

  const handleJoinNow = async () => {
    if (!displayName.trim()) return;
    try {
      setJoining(true);
      const res = await api.joinMeeting(meetingCode, displayName);
      // Pass participant details in query or sessionStorage
      sessionStorage.setItem(`participant_${meetingCode}`, JSON.stringify(res));
      sessionStorage.setItem(`media_settings_${meetingCode}`, JSON.stringify({ isMuted, isVideoOff }));
      router.push(`/meeting/${meetingCode}`);
    } catch (err: any) {
      setError(err.message || "Failed to join meeting");
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zoom-darkBg flex items-center justify-center text-zoom-textMuted gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-zoom-blue" />
        <span className="text-sm">Setting up lobby...</span>
      </div>
    );
  }

  if (error || !meeting) {
    return (
      <div className="min-h-screen bg-zoom-darkBg flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-zoom-cardBg border border-zoom-border rounded-2xl p-8 text-center space-y-4">
          <h2 className="text-xl font-bold text-white">Cannot Join Meeting</h2>
          <p className="text-xs text-zoom-textMuted">{error || "Invalid meeting code"}</p>
          <button
            onClick={() => router.push("/")}
            className="bg-zoom-blue hover:bg-zoom-blueHover text-white text-xs font-semibold px-5 py-2.5 rounded-xl"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zoom-darkBg flex flex-col items-center justify-center p-6">
      <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
        {/* Left: Camera Preview Tile */}
        <div className="md:col-span-7 space-y-4">
          <div className="relative w-full aspect-video bg-zoom-cardBg border border-zoom-border rounded-2xl overflow-hidden shadow-2xl flex items-center justify-center">
            {/* Video element always mounted so srcObject binding is instant */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover scale-x-[-1] ${!isVideoOff && localStream ? "block" : "hidden"}`}
            />

            {(isVideoOff || !localStream) && (
              <div className="flex flex-col items-center justify-center gap-3">
                <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-zoom-blue to-purple-600 flex items-center justify-center text-white text-2xl font-bold">
                  {displayName[0]?.toUpperCase() || <User className="w-8 h-8" />}
                </div>
                <span className="text-xs text-zoom-textMuted">Camera is turned off</span>
              </div>
            )}

            {/* Media toggle buttons on video preview */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-black/60 backdrop-blur-md p-2 rounded-2xl border border-white/10">
              <button
                onClick={toggleMic}
                className={`p-3 rounded-xl transition-colors ${
                  isMuted ? "bg-red-500/20 text-red-400 border border-red-500/40" : "bg-white/10 text-white hover:bg-white/20"
                }`}
              >
                {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
              <button
                onClick={toggleCamera}
                className={`p-3 rounded-xl transition-colors ${
                  isVideoOff ? "bg-red-500/20 text-red-400 border border-red-500/40" : "bg-white/10 text-white hover:bg-white/20"
                }`}
              >
                {isVideoOff ? <VideoOff className="w-5 h-5" /> : <VideoIcon className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Right: Join Info & Controls */}
        <div className="md:col-span-5 space-y-6 bg-zoom-cardBg border border-zoom-border rounded-2xl p-8 shadow-xl">
          <div>
            <span className="text-[11px] font-bold text-zoom-blue uppercase tracking-wider bg-zoom-blue/10 px-2.5 py-1 rounded-md border border-zoom-blue/20">
              Ready to Join
            </span>
            <h1 className="text-2xl font-bold text-white tracking-tight mt-2">{meeting.title}</h1>
            <p className="text-xs text-zoom-textMuted mt-1">Host: {meeting.host?.name || "Default Host"}</p>
          </div>

          <div className="space-y-4 pt-2">
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1.5 uppercase tracking-wider">
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full bg-zoom-darkBg border border-zoom-border rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-zoom-blue transition-colors"
              />
            </div>

            <button
              onClick={handleJoinNow}
              disabled={joining || !displayName.trim()}
              className="w-full bg-zoom-blue hover:bg-zoom-blueHover text-white font-semibold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-zoom-blue/20 transition-all hover:scale-[1.01] disabled:opacity-50"
            >
              {joining ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Joining Room...</span>
                </>
              ) : (
                <>
                  <span>Join Now</span>
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LobbyPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zoom-darkBg flex items-center justify-center text-zoom-textMuted">Loading lobby...</div>}>
      <LobbyContent />
    </Suspense>
  );
}
