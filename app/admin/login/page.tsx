"use client";

import { useSearchParams } from "next/navigation";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { useState, type FormEvent } from "react";

export default function AdminLoginPage() {
  const sp = useSearchParams();
  const next = sp.get("next") ?? "/admin";
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);

    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: pw, next })
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setErr(data?.message ?? "로그인에 실패했습니다.");
      setLoading(false);
      return;
    }

    window.location.href = data.redirect ?? "/admin";
  }

  return (
    <Card pad="lg" className="mx-auto max-w-md shadow-[0_8px_24px_rgba(0,0,0,0.06)]">
      <h1 className="text-xl font-semibold">관리자 로그인</h1>
      <p className="mt-2 text-sm text-gray-600">환경변수 ADMIN_PASSWORD로 보호됩니다.</p>

      <form onSubmit={onLogin} className="mt-6 space-y-3">
        <label className="block text-sm font-medium">비밀번호</label>
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          className="w-full rounded-xl border px-3 py-2"
          placeholder="관리자 비밀번호"
          required
        />
        {err && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</div>}
        <Button type="submit" variant="primary" disabled={loading} className="w-full py-2">{loading ? "로그인 중..." : "로그인"}</Button>
      </form>
    </Card>
  );
}
