"use client";

import { useState } from "react";
import Link from "next/link";
import { Meeting } from "@/types";
import { Calendar, Clock, Copy, Check, Video, ArrowRight, Shield } from "lucide-react";

interface MeetingCardProps {
  meeting: Meeting;
  type: "upcoming" | "recent";
}

export function MeetingCard({ meeting, type }: MeetingCardProps) {
  const [copied, setCopied] = useState(false);

  const formattedDate = meeting.scheduled_start
    ? new Date(meeting.scheduled_start).toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Instant Room";

  const handleCopyLink = () => {
    if (meeting.invite_link) {
      navigator.clipboard.writeText(meeting.invite_link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="bg-[#1D2022] border border-white/10 rounded-2xl p-5 hover:border-[#0E71EB]/50 transition-all duration-200 shadow-lg hover:shadow-xl flex flex-col justify-between group">
      <div>
        <div className="flex items-start justify-between gap-3 mb-3">
          <h3 className="font-bold text-base text-white group-hover:text-[#2D8CFF] transition-colors line-clamp-1">
            {meeting.title}
          </h3>
          <span
            className={`text-[10px] px-2.5 py-0.5 rounded-full font-semibold border ${
              meeting.status === "active"
                ? "bg-green-500/10 text-green-400 border-green-500/30"
                : meeting.status === "ended"
                ? "bg-gray-500/10 text-gray-400 border-gray-500/30"
                : "bg-[#0E71EB]/10 text-[#2D8CFF] border border-[#0E71EB]/30"
            }`}
          >
            {meeting.status}
          </span>
        </div>

        {meeting.description && (
          <p className="text-xs text-gray-400 mb-4 line-clamp-2 leading-relaxed">
            {meeting.description}
          </p>
        )}

        <div className="space-y-2 text-xs text-gray-300 mb-5">
          <div className="flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-[#2D8CFF]" />
            <span>{formattedDate}</span>
          </div>
          {meeting.duration_minutes && (
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-[#2D8CFF]" />
              <span>{meeting.duration_minutes} mins</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Video className="w-3.5 h-3.5 text-[#2D8CFF]" />
            <span className="font-mono text-gray-400 text-[11px]">ID: {meeting.meeting_code}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-3 border-t border-white/10">
        <Link
          href={`/meeting/${meeting.meeting_code}/lobby`}
          className="flex-1 bg-[#0E71EB] hover:bg-[#2D8CFF] text-white text-xs font-semibold py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-md hover:scale-[1.01]"
        >
          <span>Join Meeting</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>

        {meeting.invite_link && (
          <button
            onClick={handleCopyLink}
            title="Copy Invite Link"
            className="p-2.5 rounded-xl bg-[#101416] hover:bg-white/10 text-gray-300 hover:text-white border border-white/10 transition-colors"
          >
            {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
          </button>
        )}
      </div>
    </div>
  );
}
