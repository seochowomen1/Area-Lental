"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";
import {
  HOME_CARD_BASE,
  HOME_CARD_HOVER,
  HOME_BUTTON_BASE,
  HOME_BUTTON_PRIMARY,
} from "@/components/ui/presets";

export default function HomeReservationCheck() {
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
        <div className="flex-1 text-center sm:text-left">
          <h2 className="text-lg font-bold text-slate-900">신청 내역 조회</h2>
          <p className="mt-0.5 text-sm text-slate-500">이메일과 생년월일로 신청 내역을 확인하세요</p>
        </div>

        {/* 버튼 */}
        <Link
          href="/my"
          className={cn(
            HOME_BUTTON_BASE,
            HOME_BUTTON_PRIMARY,
            "shrink-0 whitespace-nowrap px-6 py-2.5 text-sm"
          )}
        >
          조회하기
        </Link>
      </div>
    </div>
  );
}
