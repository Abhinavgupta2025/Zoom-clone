"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { api } from "@/lib/api";
import { Calendar, Clock, FileText, CheckCircle2, Copy, ArrowRight, Loader2 } from "lucide-react";

export default function SchedulePage() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dateStr, setDateStr] = useState("");
  const [timeStr, setTimeStr] = useState("");
  const [duration, setDuration] = useState(60);

  const [loading, setLoading] = useState(false);
  const [createdMeeting, setCreatedMeeting] = useState<any | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !dateStr || !timeStr) return;

    try {
      setLoading(true);
      const scheduledStart = new Date(`${dateStr}T${timeStr}`).toISOString();

      const meeting = await api.scheduleMeeting({
        title,
        description,
        scheduled_start: scheduledStart,
        duration_minutes: duration,
      });

      setCreatedMeeting(meeting);
    } catch (err: any) {
      console.error("Failed to schedule meeting:", err);
      alert(err.message || "Failed to schedule meeting");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = () => {
    if (createdMeeting?.invite_link) {
      navigator.clipboard.writeText(createdMeeting.invite_link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-zoom-darkBg">
      <Navbar />

      <main className="flex-1 max-w-2xl w-full mx-auto px-6 py-12">
        <div className="bg-zoom-cardBg border border-zoom-border rounded-2xl p-8 shadow-2xl space-y-6">
          <div className="flex items-center gap-3 border-b border-zoom-border pb-5">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center shadow-md">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Schedule a Meeting</h1>
              <p className="text-xs text-zoom-textMuted">Set up a future conference room with custom title & duration</p>
            </div>
          </div>

          {!createdMeeting ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1.5 uppercase tracking-wider">
                  Meeting Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Q3 Sprint Planning"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-zoom-darkBg border border-zoom-border rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-zoom-blue transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1.5 uppercase tracking-wider">
                  Description (Optional)
                </label>
                <textarea
                  rows={3}
                  placeholder="Agenda items or context for participants..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-zoom-darkBg border border-zoom-border rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-zoom-blue transition-colors resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1.5 uppercase tracking-wider">
                    Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={dateStr}
                    onChange={(e) => setDateStr(e.target.value)}
                    className="w-full bg-zoom-darkBg border border-zoom-border rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-zoom-blue transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1.5 uppercase tracking-wider">
                    Start Time *
                  </label>
                  <input
                    type="time"
                    required
                    value={timeStr}
                    onChange={(e) => setTimeStr(e.target.value)}
                    className="w-full bg-zoom-darkBg border border-zoom-border rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-zoom-blue transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1.5 uppercase tracking-wider">
                  Duration (Minutes)
                </label>
                <select
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="w-full bg-zoom-darkBg border border-zoom-border rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-zoom-blue transition-colors"
                >
                  <option value={15}>15 Minutes</option>
                  <option value={30}>30 Minutes</option>
                  <option value={45}>45 Minutes</option>
                  <option value={60}>1 Hour</option>
                  <option value={90}>1.5 Hours</option>
                  <option value={120}>2 Hours</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-zoom-blue hover:bg-zoom-blueHover text-white font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-zoom-blue/20 transition-all hover:scale-[1.01] disabled:opacity-50 mt-6"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Scheduling...</span>
                  </>
                ) : (
                  <>
                    <span>Create Scheduled Meeting</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          ) : (
            /* Success Card */
            <div className="space-y-6 text-center py-4">
              <div className="w-16 h-16 rounded-full bg-green-500/10 border border-green-500/30 text-green-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Meeting Scheduled Successfully!</h2>
                <p className="text-xs text-zoom-textMuted mt-1">Share the link below with your participants</p>
              </div>

              <div className="bg-zoom-darkBg border border-zoom-border rounded-xl p-4 flex items-center justify-between gap-3 text-left">
                <div className="min-w-0">
                  <p className="text-xs text-zoom-textMuted uppercase font-semibold">Invite Link</p>
                  <p className="text-sm font-mono text-white truncate">{createdMeeting.invite_link}</p>
                </div>
                <button
                  onClick={handleCopyLink}
                  className="bg-zoom-surface hover:bg-zoom-border text-white text-xs font-semibold px-4 py-2 rounded-lg border border-zoom-border flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  {copied ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                  <span>{copied ? "Copied!" : "Copy Link"}</span>
                </button>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => router.push("/")}
                  className="flex-1 bg-zoom-surface hover:bg-zoom-border text-white text-sm font-semibold py-3 rounded-xl border border-zoom-border transition-colors"
                >
                  Back to Dashboard
                </button>
                <button
                  onClick={() => router.push(`/meeting/${createdMeeting.meeting_code}/lobby`)}
                  className="flex-1 bg-zoom-blue hover:bg-zoom-blueHover text-white text-sm font-semibold py-3 rounded-xl shadow-lg shadow-zoom-blue/20 transition-all"
                >
                  Go to Lobby Now
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
