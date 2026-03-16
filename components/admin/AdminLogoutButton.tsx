"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AdminLogoutButton({ variant = "light" }: { variant?: "light" | "dark" }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    try {
      await fetch("/api/admin/login", { method: "DELETE" });
    } catch {
      // ignore
    }
    router.push("/admin/login");
  }

  const cls = variant === "dark"
    ? "rounded-full border border-slate-500 bg-slate-700/50 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-700 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-800 disabled:opacity-50"
    : "rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-500 shadow-sm transition hover:bg-gray-50 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--brand-primary))] focus-visible:ring-offset-2 disabled:opacity-50";

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      className={cls}
    >
      {loading ? "로그아웃..." : "로그아웃"}
    </button>
  );
}
