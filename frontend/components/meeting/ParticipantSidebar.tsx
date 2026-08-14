"use client";

import { Participant } from "@/types";
import { Users, Mic, MicOff, Shield, UserX, VolumeX, X } from "lucide-react";

interface ParticipantSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  participants: Participant[];
  currentParticipantId?: number;
  isHost: boolean;
  onMuteAll: () => void;
  onRemoveParticipant: (id: number) => void;
}

export function ParticipantSidebar({
  isOpen,
  onClose,
  participants,
  currentParticipantId,
  isHost,
  onMuteAll,
  onRemoveParticipant,
}: ParticipantSidebarProps) {
  if (!isOpen) return null;

  return (
    <aside className="w-80 h-full bg-zoom-cardBg border-l border-zoom-border flex flex-col z-30 shadow-2xl animate-in slide-in-from-right duration-200">
      <div className="p-4 border-b border-zoom-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-zoom-blue" />
          <h2 className="font-semibold text-white text-base">Participants ({participants.length})</h2>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-zoom-surface text-gray-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Participant List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {participants.map((p, index) => {
          const formattedName =
            p.display_name.startsWith("Guest") || p.display_name.startsWith("Participant")
              ? `Participant ${index + 1}`
              : p.display_name;

          return (
            <div
              key={p.id}
              className="flex items-center justify-between p-2.5 rounded-lg hover:bg-zoom-surface group transition-colors"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-zoom-blue to-purple-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                  {formattedName[0]?.toUpperCase() || "P"}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate flex items-center gap-1.5">
                    {formattedName}
                    {p.is_host && (
                      <span className="text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.2 rounded font-semibold flex items-center gap-0.5">
                        <Shield className="w-2.5 h-2.5" /> Host
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {p.is_muted ? (
                  <MicOff className="w-4 h-4 text-red-400" />
                ) : (
                  <Mic className="w-4 h-4 text-green-400" />
                )}

                {isHost && !p.is_host && (
                  <button
                    onClick={() => onRemoveParticipant(p.id)}
                    title="Remove participant"
                    className="opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:text-red-300 transition-opacity"
                  >
                    <UserX className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Host Controls Footer */}
      {isHost && (
        <div className="p-4 border-t border-zoom-border bg-zoom-surface/50 space-y-2">
          <p className="text-xs font-semibold text-zoom-textMuted uppercase tracking-wider mb-2">Host Controls</p>
          <button
            onClick={onMuteAll}
            className="w-full bg-zoom-surface hover:bg-zoom-border text-white text-xs font-semibold py-2 px-3 rounded-lg border border-zoom-border flex items-center justify-center gap-2 transition-colors"
          >
            <VolumeX className="w-4 h-4 text-red-400" />
            <span>Mute All Participants</span>
          </button>
        </div>
      )}
    </aside>
  );
}
