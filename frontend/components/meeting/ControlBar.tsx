"use client";

import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  Users,
  ShieldAlert,
  Copy,
  Check,
} from "lucide-react";
import { useState } from "react";

interface ControlBarProps {
  isMuted: boolean;
  isVideoOff: boolean;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onLeave: () => void;
  onToggleSidebar: () => void;
  participantCount: number;
  meetingCode: string;
}

export function ControlBar({
  isMuted,
  isVideoOff,
  onToggleMute,
  onToggleVideo,
  onLeave,
  onToggleSidebar,
  participantCount,
  meetingCode,
}: ControlBarProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(meetingCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <footer className="h-20 bg-zoom-cardBg/90 backdrop-blur-md border-t border-zoom-border px-6 flex items-center justify-between sticky bottom-0 z-40">
      {/* Meeting info badge */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleCopyCode}
          className="flex items-center gap-2 bg-zoom-surface hover:bg-zoom-border px-3 py-1.5 rounded-lg border border-zoom-border text-xs text-gray-300 transition-colors"
          title="Click to copy meeting code"
        >
          <span className="font-mono text-white font-semibold">{meetingCode}</span>
          {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5 text-gray-400" />}
        </button>
      </div>

      {/* Main control buttons */}
      <div className="flex items-center gap-3">
        {/* Mute toggle */}
        <button
          onClick={onToggleMute}
          className={`flex flex-col items-center justify-center w-14 h-12 rounded-xl transition-all ${
            isMuted
              ? "bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30"
              : "bg-zoom-surface text-gray-200 hover:bg-zoom-border hover:text-white"
          }`}
        >
          {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          <span className="text-[10px] mt-0.5">{isMuted ? "Unmute" : "Mute"}</span>
        </button>

        {/* Video toggle */}
        <button
          onClick={onToggleVideo}
          className={`flex flex-col items-center justify-center w-14 h-12 rounded-xl transition-all ${
            isVideoOff
              ? "bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30"
              : "bg-zoom-surface text-gray-200 hover:bg-zoom-border hover:text-white"
          }`}
        >
          {isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
          <span className="text-[10px] mt-0.5">{isVideoOff ? "Start Video" : "Stop Video"}</span>
        </button>

        {/* Participants toggle */}
        <button
          onClick={onToggleSidebar}
          className="flex flex-col items-center justify-center w-14 h-12 rounded-xl bg-zoom-surface text-gray-200 hover:bg-zoom-border hover:text-white transition-all relative"
        >
          <Users className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">Participants</span>
          {participantCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-zoom-blue text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center shadow-md">
              {participantCount}
            </span>
          )}
        </button>

        {/* Leave meeting */}
        <button
          onClick={onLeave}
          className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold shadow-lg shadow-red-600/20 transition-all hover:scale-105"
        >
          <PhoneOff className="w-4 h-4" />
          <span>End / Leave</span>
        </button>
      </div>

      <div className="hidden sm:block text-right">
        <span className="text-xs text-zoom-textMuted">Zoom Clone SFU</span>
      </div>
    </footer>
  );
}
