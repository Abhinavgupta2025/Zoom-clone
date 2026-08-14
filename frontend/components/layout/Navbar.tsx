"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { User } from "@/types";
import { Video, User as UserIcon, LogOut, LogIn } from "lucide-react";

export function Navbar() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("zoom_user");
      if (stored) {
        try {
          setCurrentUser(JSON.parse(stored));
        } catch (e) {}
      }
    }
  }, []);

  const handleLogout = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("zoom_token");
      localStorage.removeItem("zoom_user");
    }
    setCurrentUser(null);
    router.push("/login");
  };

  return (
    <header className="h-16 border-b border-white/10 bg-[#101416]/90 backdrop-blur-xl sticky top-0 z-50 px-6 flex items-center justify-between">
      <Link href="/" className="flex items-center gap-3 group">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#0E71EB] to-[#2D8CFF] flex items-center justify-center shadow-lg shadow-[#0E71EB]/25 group-hover:scale-105 transition-transform">
          <Video className="w-5 h-5 text-white" />
        </div>
        <span className="font-extrabold text-2xl tracking-tight text-white group-hover:text-[#2D8CFF] transition-colors">
          zoom <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[#0E71EB]/20 text-[#2D8CFF] border border-[#0E71EB]/30 ml-1.5 align-middle">One</span>
        </span>
      </Link>

      <div className="flex items-center gap-4">
        <nav className="flex items-center gap-3">
          <Link
            href="/"
            className="text-xs font-semibold text-gray-300 hover:text-white px-3.5 py-2 rounded-xl hover:bg-white/5 transition-colors"
          >
            Dashboard
          </Link>
          <Link
            href="/join"
            className="text-xs font-semibold text-gray-300 hover:text-white px-3.5 py-2 rounded-xl hover:bg-white/5 transition-colors"
          >
            Join Meeting
          </Link>
          <Link
            href="/schedule"
            className="text-xs font-semibold text-gray-300 hover:text-white px-3.5 py-2 rounded-xl hover:bg-white/5 transition-colors"
          >
            Schedule
          </Link>
          <Link
            href="/history"
            className="text-xs font-semibold text-[#2D8CFF] hover:text-white px-3.5 py-2 rounded-xl hover:bg-[#0E71EB]/20 transition-colors border border-[#0E71EB]/30"
          >
            History & Analytics
          </Link>
        </nav>

        <div className="flex items-center gap-3 border-l border-white/10 pl-4">
          {currentUser ? (
            <>
              <div className="flex items-center gap-2.5">
                {currentUser.avatar_url ? (
                  <img
                    src={currentUser.avatar_url}
                    alt={currentUser.name}
                    className="w-9 h-9 rounded-full bg-[#0E71EB]/20 border border-white/10"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-[#0E71EB] to-indigo-600 flex items-center justify-center text-white font-bold text-xs shadow-md border border-white/10">
                    <UserIcon className="w-4 h-4" />
                  </div>
                )}
                <div className="hidden sm:block text-left">
                  <p className="text-xs font-semibold text-white leading-tight">
                    {currentUser.name} {currentUser.is_guest && <span className="text-[10px] text-green-400 font-mono">(Guest)</span>}
                  </p>
                  <p className="text-[10px] text-gray-400 truncate max-w-[120px]">{currentUser.email}</p>
                </div>
              </div>

              <button
                onClick={handleLogout}
                title="Log Out"
                className="p-2 rounded-xl bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-400 border border-white/10 transition-colors ml-1"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="bg-[#0E71EB] hover:bg-[#2D8CFF] text-white text-xs font-semibold px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-md transition-colors"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign In</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
