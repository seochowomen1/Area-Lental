"use client";

import { useSearchParams } from "next/navigation";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { useState, type FormEvent } from "react";

export default function AdminLoginForm() {
  const sp = useSearchParams();
  const next = sp.get("next") ?? "/admin";
  const errParam = sp.get("err");
  const loggedOut = sp.get("out") === "1";
  const [pw, setPw] = useState("");
  // 01_spec ③-J — 세션 안내 문구
  const [err, setErr] = useState<string | null>(
    errParam === "session_upgraded"
      ? "보안 강화로 다시 로그인해야 합니다. 비밀번호를 입력해 주세요."
      : errParam === "session_expired"
        ? "30분 동안 사용하지 않아 로그아웃되었습니다. 다시 로그인해 주세요."
        : null
  );
  const [showOut, setShowOut] = useState(loggedOut && !errParam);
  const [loading, setLoading] = useState(false);

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    setShowOut(false);

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
      <p className="mt-2 text-sm text-slate-600">환경변수 ADMIN_PASSWORD로 보호됩니다.</p>

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
        {showOut ? (
          <div role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
            로그아웃했습니다. 이 기기의 관리자 접속이 끊겼습니다.
          </div>
        ) : null}
        {err && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</div>}
        <Button type="submit" variant="primary" disabled={loading} className="w-full py-2">{loading ? "로그인 중..." : "로그인"}</Button>
      </form>
    </Card>
  );
}
