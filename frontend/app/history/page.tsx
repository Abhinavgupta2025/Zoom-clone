"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { api } from "@/lib/api";
import { ApiAuditLog, Meeting } from "@/types";
import {
  Clock,
  History,
  Calendar,
  Video,
  Copy,
  Check,
  ArrowRight,
  Loader2,
  FileText,
  Activity,
  Globe,
} from "lucide-react";

export default function HistoryPage() {
  const [activeTab, setActiveTab] = useState<"past_meetings" | "api_logs">("past_meetings");
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [auditLogs, setAuditLogs] = useState<ApiAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  useEffect(() => {
    async function loadHistory() {
      try {
        setLoading(true);
        const [recentData, logsData] = await Promise.all([
          api.getRecentMeetings(),
          api.getApiAuditLogs(),
        ]);
        setMeetings(recentData);
        setAuditLogs(logsData);
      } catch (err) {
        console.error("Failed to load history data:", err);
      } finally {
        setLoading(false);
      }
    }
    loadHistory();
  }, []);

  const handleCopyLink = (link?: string, code?: string) => {
    if (link) {
      navigator.clipboard.writeText(link);
      setCopiedCode(code || link);
      setTimeout(() => setCopiedCode(null), 2000);
    }
  };

  const formatDuration = (m: Meeting) => {
    if (m.actual_duration_seconds) {
      const mins = Math.floor(m.actual_duration_seconds / 60);
      const secs = m.actual_duration_seconds % 60;
      return `${mins}m ${secs}s`;
    }
    if (m.duration_minutes) {
      return `${m.duration_minutes} minutes`;
    }
    return "Ongoing / N/A";
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#101416] text-[#E0E3E6]">
      <Navbar />

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-10 space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#0E71EB]/10 text-[#2D8CFF] text-xs font-semibold border border-[#0E71EB]/20">
              <History className="w-3.5 h-3.5" /> Meeting & API Analytics
            </div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight">Past Meetings & Audit History</h1>
            <p className="text-xs text-gray-400">
              Review completed sessions, actual meeting durations, start/end timestamps, and API creation logs.
            </p>
          </div>

          {/* Tab Switcher */}
          <div className="flex items-center gap-2 bg-[#1D2022] p-1.5 rounded-2xl border border-white/10 self-start sm:self-auto">
            <button
              onClick={() => setActiveTab("past_meetings")}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
                activeTab === "past_meetings"
                  ? "bg-[#0E71EB] text-white shadow-md shadow-[#0E71EB]/30"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>Past Meetings ({meetings.length})</span>
            </button>
            <button
              onClick={() => setActiveTab("api_logs")}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
                activeTab === "api_logs"
                  ? "bg-[#0E71EB] text-white shadow-md shadow-[#0E71EB]/30"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>API Audit Logs ({auditLogs.length})</span>
            </button>
          </div>
        </div>

        {/* Tab 1: Past Meetings List */}
        {activeTab === "past_meetings" && (
          <div className="space-y-4">
            {loading ? (
              <div className="h-40 flex items-center justify-center text-gray-400 gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-[#0E71EB]" />
                <span className="text-xs">Loading past meetings...</span>
              </div>
            ) : meetings.length === 0 ? (
              <div className="bg-[#1D2022] border border-white/10 rounded-2xl p-12 text-center text-gray-400 text-xs">
                No past meeting history found.
              </div>
            ) : (
              <div className="space-y-3">
                {meetings.map((m) => (
                  <div
                    key={m.id}
                    className="bg-[#1D2022] border border-white/10 hover:border-[#0E71EB]/40 rounded-2xl p-5 shadow-lg transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 group"
                  >
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="font-bold text-base text-white group-hover:text-[#2D8CFF] transition-colors">
                          {m.title}
                        </h3>
                        <span
                          className={`text-[10px] px-2.5 py-0.5 rounded-full font-semibold border ${
                            m.status === "ended"
                              ? "bg-gray-500/10 text-gray-400 border-gray-500/30"
                              : m.status === "active"
                              ? "bg-green-500/10 text-green-400 border-green-500/30"
                              : "bg-[#0E71EB]/10 text-[#2D8CFF] border border-[#0E71EB]/30"
                          }`}
                        >
                          {m.status.toUpperCase()}
                        </span>
                        <span className="text-[10px] font-mono bg-white/5 border border-white/10 px-2 py-0.5 rounded text-gray-300">
                          {m.type}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-gray-400">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-3.5 h-3.5 text-[#2D8CFF]" />
                          <span>Started: {new Date(m.created_at).toLocaleString()}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <Clock className="w-3.5 h-3.5 text-purple-400" />
                          <span>Duration: <strong className="text-white font-mono">{formatDuration(m)}</strong></span>
                        </div>

                        <div className="flex items-center gap-2">
                          <Video className="w-3.5 h-3.5 text-[#2D8CFF]" />
                          <span className="font-mono text-gray-300">Code: {m.meeting_code}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end md:self-center">
                      {m.invite_link && (
                        <button
                          onClick={() => handleCopyLink(m.invite_link, m.meeting_code)}
                          className="bg-[#101416] hover:bg-white/10 text-gray-300 hover:text-white border border-white/10 text-xs font-semibold px-3 py-2 rounded-xl flex items-center gap-1.5 transition-colors"
                        >
                          {copiedCode === m.meeting_code ? (
                            <Check className="w-3.5 h-3.5 text-green-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          <span>{copiedCode === m.meeting_code ? "Copied" : "Copy Link"}</span>
                        </button>
                      )}

                      <Link
                        href={`/meeting/${m.meeting_code}/lobby`}
                        className="bg-[#0E71EB] hover:bg-[#2D8CFF] text-white text-xs font-semibold px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-md transition-all hover:scale-[1.02]"
                      >
                        <span>Rejoin Room</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: API Audit Logs */}
        {activeTab === "api_logs" && (
          <div className="space-y-4">
            {loading ? (
              <div className="h-40 flex items-center justify-center text-gray-400 gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-[#0E71EB]" />
                <span className="text-xs">Loading audit logs...</span>
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="bg-[#1D2022] border border-white/10 rounded-2xl p-12 text-center text-gray-400 text-xs">
                No API creation audit logs recorded yet.
              </div>
            ) : (
              <div className="bg-[#1D2022] border border-white/10 rounded-2xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#101416] border-b border-white/10 text-gray-400 font-semibold uppercase tracking-wider">
                      <tr>
                        <th className="p-4">Timestamp</th>
                        <th className="p-4">Action</th>
                        <th className="p-4">Meeting Code</th>
                        <th className="p-4">Type</th>
                        <th className="p-4">Client IP</th>
                        <th className="p-4 text-right">Invite Link</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-gray-300">
                      {auditLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-white/5 transition-colors">
                          <td className="p-4 whitespace-nowrap text-gray-400">
                            {new Date(log.created_at).toLocaleString()}
                          </td>
                          <td className="p-4 whitespace-nowrap font-mono text-[#2D8CFF] font-semibold">
                            {log.action}
                          </td>
                          <td className="p-4 whitespace-nowrap font-mono text-white font-bold">
                            {log.meeting_code}
                          </td>
                          <td className="p-4 whitespace-nowrap">
                            <span className="bg-white/5 border border-white/10 px-2 py-0.5 rounded text-[11px]">
                              {log.meeting_type}
                            </span>
                          </td>
                          <td className="p-4 whitespace-nowrap font-mono text-gray-400">
                            <div className="flex items-center gap-1.5">
                              <Globe className="w-3 h-3 text-gray-500" />
                              <span>{log.client_ip || "127.0.0.1"}</span>
                            </div>
                          </td>
                          <td className="p-4 whitespace-nowrap text-right font-mono">
                            {log.invite_link && (
                              <button
                                onClick={() => handleCopyLink(log.invite_link, `log_${log.id}`)}
                                className="bg-[#101416] hover:bg-white/10 border border-white/10 px-3 py-1 rounded-lg text-gray-300 hover:text-white transition-colors"
                              >
                                {copiedCode === `log_${log.id}` ? "Copied!" : "Copy Link"}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
