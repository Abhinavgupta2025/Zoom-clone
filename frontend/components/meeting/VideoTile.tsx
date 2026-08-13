"use client";

import { useEffect, useRef } from "react";
import { Mic, MicOff, User } from "lucide-react";

interface VideoTileProps {
  stream?: MediaStream | null;
  displayName: string;
  isLocal?: boolean;
  isMuted?: boolean;
  isVideoOff?: boolean;
}

export function VideoTile({
  stream,
  displayName,
  isLocal = false,
  isMuted = false,
  isVideoOff = false,
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      if (stream) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      } else {
        videoRef.current.srcObject = null;
      }
    }
  }, [stream, isVideoOff]);

  const hasVideoTrack = stream && stream.getVideoTracks().length > 0 && stream.getVideoTracks()[0].enabled;
  const showVideo = !isVideoOff && hasVideoTrack;

  return (
    <div className="relative w-full h-full bg-zoom-cardBg rounded-xl overflow-hidden border border-zoom-border/80 shadow-md flex items-center justify-center group">
      {/* Video element always mounted so srcObject is never lost */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className={`w-full h-full object-cover ${isLocal ? "scale-x-[-1]" : ""} ${showVideo ? "block" : "hidden"}`}
      />

      {/* Avatar Fallback Placeholder when video is off */}
      {!showVideo && (
        <div className="flex flex-col items-center justify-center gap-3">
          <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-zoom-blue to-indigo-600 flex items-center justify-center text-white text-2xl font-bold shadow-lg">
            {displayName ? displayName[0].toUpperCase() : <User className="w-8 h-8" />}
          </div>
          <span className="text-sm font-medium text-gray-300">{displayName}</span>
        </div>
      )}

      {/* Overlay label */}
      <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-md px-3 py-1 rounded-lg flex items-center gap-2 border border-white/10 z-10">
        <span className="text-xs font-medium text-white truncate max-w-[150px]">
          {displayName} {isLocal && "(You)"}
        </span>
        {isMuted ? (
          <MicOff className="w-3.5 h-3.5 text-red-400" />
        ) : (
          <Mic className="w-3.5 h-3.5 text-green-400" />
        )}
      </div>
    </div>
  );
}
