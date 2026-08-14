"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Video, Lock, Mail, ArrowRight, Loader2, Sparkles, UserCheck } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.login({ email, password });
      localStorage.setItem("zoom_token", res.access_token);
      localStorage.setItem("zoom_user", JSON.stringify(res.user));
      router.push("/");
    } catch (err: any) {
      setError(err.message || "Failed to sign in. Check your email & password.");
    } finally {
      setLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setError(null);
    setGuestLoading(true);
    try {
      const res = await api.guestLogin();
      localStorage.setItem("zoom_token", res.access_token);
      localStorage.setItem("zoom_user", JSON.stringify(res.user));
      router.push("/");
    } catch (err: any) {
      setError(err.message || "Failed to create guest session.");
    } finally {
      setGuestLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-[#101416] text-[#E0E3E6] px-6 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[#0E71EB]/15 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md space-y-8 relative z-10">
        {/* Brand Header */}
        <div className="text-center space-y-3">
          <Link href="/" className="inline-flex items-center gap-3 group">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#0E71EB] to-[#2D8CFF] flex items-center justify-center shadow-xl shadow-[#0E71EB]/30 group-hover:scale-105 transition-transform">
              <Video className="w-6 h-6 text-white" />
            </div>
            <span className="font-extrabold text-3xl tracking-tight text-white">
              zoom <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[#0E71EB]/20 text-[#2D8CFF] border border-[#0E71EB]/30 ml-1 align-middle">One</span>
            </span>
          </Link>
          <h1 className="text-2xl font-bold text-white tracking-tight">Sign in to your account</h1>
          <p className="text-xs text-gray-400">Welcome back! Please enter your details or test as Guest.</p>
        </div>

        {/* Card */}
        <div className="bg-[#1D2022] border border-white/10 rounded-2xl p-7 shadow-2xl space-y-6">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-xs text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-gray-300">Email Address</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-[#101416] border border-white/10 rounded-xl pl-10 pr-4 py-3 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#0E71EB] transition-colors"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-gray-300">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[#101416] border border-white/10 rounded-xl pl-10 pr-4 py-3 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#0E71EB] transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#0E71EB] hover:bg-[#2D8CFF] text-white font-bold text-xs py-3.5 rounded-xl shadow-lg shadow-[#0E71EB]/25 flex items-center justify-center gap-2 hover:scale-[1.01] transition-all disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative flex items-center justify-center">
            <div className="border-t border-white/10 w-full" />
            <span className="bg-[#1D2022] px-3 text-[11px] text-gray-400 font-semibold uppercase">Or Instant Test</span>
          </div>

          {/* Guest Login Trigger */}
          <button
            onClick={handleGuestLogin}
            disabled={guestLoading}
            className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold text-xs py-3.5 rounded-xl flex items-center justify-center gap-2 hover:scale-[1.01] transition-all disabled:opacity-50"
          >
            {guestLoading ? (
              <Loader2 className="w-4 h-4 animate-spin text-[#2D8CFF]" />
            ) : (
              <>
                <UserCheck className="w-4 h-4 text-green-400" />
                <span>Continue as Guest (1-Click Test)</span>
              </>
            )}
          </button>
        </div>

        {/* Footer Link */}
        <p className="text-center text-xs text-gray-400">
          Don't have an account yet?{" "}
          <Link href="/signup" className="text-[#2D8CFF] font-bold hover:underline">
            Create Account
          </Link>
        </p>
      </div>
    </div>
  );
}
