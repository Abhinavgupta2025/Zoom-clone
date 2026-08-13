"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { MeetingCard } from "@/components/dashboard/MeetingCard";
import { api } from "@/lib/api";
import { Meeting } from "@/types";
import {
  Video,
  Calendar,
  PlusCircle,
  Link as LinkIcon,
  Loader2,
  Sparkles,
  ArrowRight,
  Clock,
} from "lucide-react";

export default function Dashboard() {
  const router = useRouter();
  const [upcoming, setUpcoming] = useState<Meeting[]>([]);
  const [recent, setRecent] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingInstant, setCreatingInstant] = useState(false);
  const [quickCode, setQuickCode] = useState("");

  useEffect(() => {
    async function loadData() {
      try {
        const [upcomingData, recentData] = await Promise.all([
          api.getUpcomingMeetings(),
          api.getRecentMeetings(),
        ]);
        setUpcoming(upcomingData);
        setRecent(recentData);
      } catch (err) {
        console.error("Failed to load dashboard meetings:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const handleStartInstant = async () => {
    try {
      setCreatingInstant(true);
      const res = await api.createInstantMeeting();
      router.push(`/meeting/${res.meeting_code}/lobby`);
    } catch (err) {
      console.error("Instant meeting creation failed:", err);
      alert("Failed to start instant meeting. Please try again.");
    } finally {
      setCreatingInstant(false);
    }
  };

  const handleQuickJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickCode.trim()) return;
    const cleanCode = quickCode.trim().replace(/.*[?&]code=/, "");
    router.push(`/meeting/${cleanCode}/lobby`);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#101416] text-[#E0E3E6]">
      <Navbar />

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-10 space-y-12">
        {/* ---------------------------------------------------------------- */}
        {/* HERO ACTION SECTION: Clean & Simple                              */}
        {/* ---------------------------------------------------------------- */}
        <section className="bg-gradient-to-br from-[#1D2022] via-[#191C1E] to-[#101416] border border-white/10 rounded-2xl p-8 shadow-2xl relative overflow-hidden space-y-8">
          <div className="absolute top-0 right-0 w-72 h-72 bg-[#0E71EB]/10 rounded-full blur-3xl pointer-events-none" />

          {/* Headline */}
          <div className="space-y-2 max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#0E71EB]/10 text-[#2D8CFF] text-xs font-semibold border border-[#0E71EB]/20">
              <Sparkles className="w-3.5 h-3.5" /> High-Performance SFU Video
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              Connect and Collaborate Instantly
            </h1>
            <p className="text-gray-400 text-xs sm:text-sm leading-relaxed">
              Create an instant meeting room with shareable Base62 short links, join via code, or schedule future sessions.
            </p>
          </div>

          {/* 3 Main Action Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {/* New Instant Meeting */}
            <button
              onClick={handleStartInstant}
              disabled={creatingInstant}
              className="bg-[#0E71EB] hover:bg-[#2D8CFF] text-white p-6 rounded-2xl flex flex-col items-center justify-center text-center gap-3 shadow-xl shadow-[#0E71EB]/25 hover:scale-[1.02] transition-all group disabled:opacity-50 border border-[#0E71EB]/40"
            >
              {creatingInstant ? (
                <Loader2 className="w-8 h-8 animate-spin" />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Video className="w-6 h-6 text-white" />
                </div>
              )}
              <div>
                <span className="font-bold text-base block">New Meeting</span>
                <span className="text-xs text-blue-100/70">Start instant room</span>
              </div>
            </button>

            {/* Join Meeting */}
            <button
              onClick={() => router.push("/join")}
              className="bg-[#1D2022] hover:bg-[#272A2D] text-white p-6 rounded-2xl border border-white/10 flex flex-col items-center justify-center text-center gap-3 hover:scale-[1.02] transition-all group"
            >
              <div className="w-12 h-12 rounded-xl bg-green-500/10 text-green-400 border border-green-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                <PlusCircle className="w-6 h-6" />
              </div>
              <div>
                <span className="font-bold text-base block">Join Meeting</span>
                <span className="text-xs text-gray-400">Enter code or link</span>
              </div>
            </button>

            {/* Schedule Meeting */}
            <button
              onClick={() => router.push("/schedule")}
              className="bg-[#1D2022] hover:bg-[#272A2D] text-white p-6 rounded-2xl border border-white/10 flex flex-col items-center justify-center text-center gap-3 hover:scale-[1.02] transition-all group"
            >
              <div className="w-12 h-12 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Calendar className="w-6 h-6" />
              </div>
              <div>
                <span className="font-bold text-base block">Schedule</span>
                <span className="text-xs text-gray-400">Plan for later</span>
              </div>
            </button>
          </div>

          {/* Quick Join Input bar */}
          <div className="pt-4 border-t border-white/10 flex flex-col sm:flex-row items-center gap-3">
            <span className="text-xs text-gray-400 font-medium whitespace-nowrap">Quick Join:</span>
            <form onSubmit={handleQuickJoin} className="flex-1 w-full flex items-center gap-2">
              <div className="relative flex-1">
                <LinkIcon className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Enter meeting code or paste invite link (e.g. 3mKpXtR-9vLa)"
                  value={quickCode}
                  onChange={(e) => setQuickCode(e.target.value)}
                  className="w-full bg-[#101416] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#0E71EB] transition-colors font-mono"
                />
              </div>
              <button
                type="submit"
                disabled={!quickCode.trim()}
                className="bg-[#0E71EB] hover:bg-[#2D8CFF] text-white text-xs font-semibold px-5 py-2.5 rounded-xl disabled:opacity-40 transition-all whitespace-nowrap shadow-md"
              >
                Join Room
              </button>
            </form>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* UPCOMING MEETINGS SECTION                                        */}
        {/* ---------------------------------------------------------------- */}
        <section className="space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-[#2D8CFF]" />
              <h2 className="text-lg font-bold text-white tracking-tight">Upcoming Scheduled Meetings</h2>
            </div>
            <span className="text-xs text-gray-400 font-mono">{upcoming.length} active</span>
          </div>

          {loading ? (
            <div className="h-32 flex items-center justify-center text-gray-400 gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-[#0E71EB]" />
              <span className="text-xs">Loading meetings...</span>
            </div>
          ) : upcoming.length === 0 ? (
            <div className="bg-[#1D2022] border border-white/10 rounded-2xl p-8 text-center text-gray-400 text-xs">
              No upcoming meetings scheduled. Click "Schedule" to create one.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {upcoming.map((m) => (
                <MeetingCard key={m.id} meeting={m} type="upcoming" />
              ))}
            </div>
          )}
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* RECENT MEETINGS HISTORY                                          */}
        {/* ---------------------------------------------------------------- */}
        <section className="space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-purple-400" />
              <h2 className="text-lg font-bold text-white tracking-tight">Recent Past Meetings</h2>
            </div>
            <span className="text-xs text-gray-400 font-mono">{recent.length} in history</span>
          </div>

          {loading ? (
            <div className="h-32 flex items-center justify-center text-gray-400 gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-[#0E71EB]" />
              <span className="text-xs">Loading history...</span>
            </div>
          ) : recent.length === 0 ? (
            <div className="bg-[#1D2022] border border-white/10 rounded-2xl p-8 text-center text-gray-400 text-xs">
              No past meeting history found.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {recent.map((m) => (
                <MeetingCard key={m.id} meeting={m} type="recent" />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
