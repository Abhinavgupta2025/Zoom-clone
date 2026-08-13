"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { api } from "@/lib/api";
import { Video, ArrowRight, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

function JoinFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [code, setCode] = useState("");
  const [displayName, setDisplayName] = useState("Default User");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const codeParam = searchParams.get("code");
    if (codeParam) {
      setCode(codeParam);
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanCode = code.trim().replace(/.*[?&]code=/, "");
    if (!cleanCode) {
      setError("Please enter a valid meeting code");
      return;
    }

    try {
      setLoading(true);
      // Validate meeting existence first
      await api.getMeeting(cleanCode);
      // Navigate to lobby with displayName in query or session
      router.push(`/meeting/${cleanCode}/lobby?name=${encodeURIComponent(displayName)}`);
    } catch (err: any) {
      setError(err.message || "Meeting not found or has ended");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md w-full mx-auto my-12 bg-zoom-cardBg border border-zoom-border rounded-2xl p-8 shadow-2xl space-y-6">
      <div className="text-center space-y-2">
        <div className="w-12 h-12 rounded-2xl bg-zoom-blue/10 border border-zoom-blue/20 text-zoom-blue flex items-center justify-center mx-auto shadow-md">
          <Video className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Join a Meeting</h1>
        <p className="text-xs text-zoom-textMuted">Enter your meeting ID or paste the shareable invite link</p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3.5 flex items-center gap-3 text-xs text-red-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-300 mb-1.5 uppercase tracking-wider">
            Meeting Code or Invite Link
          </label>
          <input
            type="text"
            required
            placeholder="e.g. 3mKpXtR-9vLa"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full bg-zoom-darkBg border border-zoom-border rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-zoom-blue transition-colors font-mono"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-300 mb-1.5 uppercase tracking-wider">
            Your Display Name
          </label>
          <input
            type="text"
            required
            placeholder="Enter your name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full bg-zoom-darkBg border border-zoom-border rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-zoom-blue transition-colors"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-zoom-blue hover:bg-zoom-blueHover text-white font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-zoom-blue/20 transition-all hover:scale-[1.01] disabled:opacity-50 mt-6"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Validating Meeting...</span>
            </>
          ) : (
            <>
              <span>Continue to Lobby</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>
    </div>
  );
}

export default function JoinPage() {
  return (
    <div className="min-h-screen flex flex-col bg-zoom-darkBg">
      <Navbar />
      <main className="flex-1 flex items-center justify-center px-6">
        <Suspense fallback={<div className="text-zoom-textMuted text-sm">Loading form...</div>}>
          <JoinFormContent />
        </Suspense>
      </main>
    </div>
  );
}
