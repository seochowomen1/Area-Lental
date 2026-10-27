"use client";

import { useState } from "react";

export default function AdminLogoutButton({ variant = "light" }: { variant?: "light" | "dark" }) {
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    try {
      await fetch("/api/admin/login", { method: "DELETE" });
    } catch {
      // ignore
    }
    // 전체 이동 + 현재 기록 대체 — 뒤로가기로 관리자 화면 캐시가 다시 보이지 않게 (audit-fix-1 [7])
    window.location.replace("/admin/login?out=1");
  }

  const cls = variant === "dark"
    ? "min-h-[44px] whitespace-nowrap rounded-full border border-white/30 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky focus-visible:ring-offset-2 focus-visible:ring-offset-brand disabled:bg-white/5 disabled:text-white/70"
    : "rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:bg-slate-200 disabled:text-slate-500";

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      className={cls}
    >
      {loading ? "로그아웃 중…" : "로그아웃"}
    </button>
  );
}
