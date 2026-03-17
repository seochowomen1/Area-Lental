"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import {
  HOME_CARD_BASE,
  HOME_CARD_HOVER,
  HOME_BUTTON_BASE,
  HOME_BUTTON_PRIMARY,
} from "@/components/ui/presets";

export default function HomeReservationCheck() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [birth, setBirth] = useState("");

  const canSubmit = !!email.trim() && !!birth;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = email.trim();
    if (!v || !birth) return;
    router.push(`/my?email=${encodeURIComponent(v)}&birth=${encodeURIComponent(birth)}`);
  }

  return (
    <div className={cn(HOME_CARD_BASE, HOME_CARD_HOVER, "px-6 py-6 sm:px-8")}>
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
        {/* 아이콘 */}
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[rgb(var(--brand-primary)/0.08)]">
          <svg className="h-6 w-6 text-[rgb(var(--brand-primary))]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        {/* 타이틀 + 설명 */}
        <div className="shrink-0 text-center sm:text-left">
          <h2 className="text-lg font-bold text-slate-900">신청 내역 조회</h2>
          <p className="mt-0.5 text-sm text-slate-500">이메일 + 생년월일로 본인 확인</p>
        </div>

        {/* 이메일 + 생년월일 입력 + 버튼 */}
        <form onSubmit={handleSubmit} className="flex w-full flex-1 flex-col gap-2 sm:flex-row sm:gap-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="이메일 주소 입력"
            className="w-full flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-[0_1px_0_rgba(0,0,0,0.02)] focus:border-[rgb(var(--brand-primary)/0.4)] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--brand-primary)/0.15)]"
          />
          <input
            type="date"
            value={birth}
            onChange={(e) => setBirth(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-[0_1px_0_rgba(0,0,0,0.02)] focus:border-[rgb(var(--brand-primary)/0.4)] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--brand-primary)/0.15)] sm:w-44"
          />
          <button
            type="submit"
            disabled={!canSubmit}
            className={cn(
              HOME_BUTTON_BASE,
              HOME_BUTTON_PRIMARY,
              "shrink-0 whitespace-nowrap px-6 py-2.5 text-sm",
              !canSubmit && "opacity-60"
            )}
          >
            조회하기
          </button>
        </form>
      </div>
    </div>
  );
}
