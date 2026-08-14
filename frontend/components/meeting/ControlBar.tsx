"use client";

import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  Users,
  Copy,
  Check,
} from "lucide-react";
import { useState } from "react";

interface ControlBarProps {
  isMuted: boolean;
  isVideoOff: boolean;
  isHost?: boolean;
  onToggleMute?: () => void;
  onToggleAudio?: () => void;
  onToggleVideo: () => void;
  onLeave?: () => void;
  onLeaveMeeting?: () => void;
  onToggleSidebar: () => void;
  participantCount: number;
  meetingCode: string;
}

export function ControlBar({
  isMuted,
  isVideoOff,
  isHost,
  onToggleMute,
  onToggleAudio,
  onToggleVideo,
  onLeave,
  onLeaveMeeting,
  onToggleSidebar,
  participantCount,
  meetingCode,
}: ControlBarProps) {
  const [copied, setCopied] = useState(false);

  const handleAudioToggle = onToggleAudio || onToggleMute || (() => {});
  const handleLeaveAction = onLeaveMeeting || onLeave || (() => {});

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <footer className="h-16 bg-[#101416]/95 border-t border-white/10 px-6 flex items-center justify-between z-20 backdrop-blur-md">
      {/* Left: Meeting Code */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleCopyLink}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono text-gray-300 hover:text-white transition-colors"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5 text-gray-400" />}
          <span>{meetingCode}</span>
        </button>
      </div>

      {/* Center Controls */}
      <div className="flex items-center gap-3">
        {/* Mute Button */}
        <button
          onClick={handleAudioToggle}
          className={`p-3 rounded-2xl border transition-all ${
            isMuted
              ? "bg-red-500/20 border-red-500/40 text-red-400 hover:bg-red-500/30"
              : "bg-[#1D2022] border-white/10 text-white hover:bg-white/10"
          }`}
          title={isMuted ? "Unmute Mic" : "Mute Mic"}
        >
          {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        {/* Video Toggle Button */}
        <button
          onClick={onToggleVideo}
          className={`p-3 rounded-2xl border transition-all ${
            isVideoOff
              ? "bg-red-500/20 border-red-500/40 text-red-400 hover:bg-red-500/30"
              : "bg-[#1D2022] border-white/10 text-white hover:bg-white/10"
          }`}
          title={isVideoOff ? "Turn On Camera" : "Turn Off Camera"}
        >
          {isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
        </button>

        {/* Leave Meeting Button */}
        <button
          onClick={handleLeaveAction}
          className="bg-red-600 hover:bg-red-500 text-white px-5 py-3 rounded-2xl font-bold text-xs flex items-center gap-2 shadow-lg shadow-red-600/30 transition-all hover:scale-[1.02]"
        >
          <PhoneOff className="w-4 h-4" />
          <span>End / Leave</span>
        </button>
      </div>

      {/* Right Controls: Sidebar & Participants */}
      <div className="flex items-center gap-2">
        <button
          onClick={onToggleSidebar}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#1D2022] hover:bg-white/10 border border-white/10 text-xs font-semibold text-gray-300 hover:text-white transition-colors"
        >
          <Users className="w-4 h-4 text-[#2D8CFF]" />
          <span>Participants</span>
          <span className="bg-[#0E71EB] text-white px-1.5 py-0.5 rounded-full text-[10px] font-mono">
            {participantCount}
          </span>
        </button>
      </div>
    </footer>
  );
}
