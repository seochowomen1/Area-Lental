"use client";

import { usePathname, useSearchParams } from "next/navigation";

/**
 * 관리자 헤더 검색 (audit-fix-3 3-2 · 02_ui v2 §2-1) — 검색창은 헤더 한 곳
 * GET /admin?q=… → 서버가 이름(2자 이상)·전화번호 뒤 4자리로 거른다(목록에 전화번호 전체를 싣지 않음).
 * 자바스크립트 없이도 동작하는 일반 form.
 */
export default function AdminHeaderSearch({ className = "" }: { className?: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = pathname === "/admin" ? searchParams.get("q") ?? "" : "";

  return (
    <form action="/admin" method="get" role="search" aria-label="신청 찾기" className={`flex gap-2 ${className}`}>
      <input
        // 검색어가 바뀌면 다시 그려 기본값을 맞춘다
        key={current}
        type="search"
        name="q"
        defaultValue={current}
        aria-label="신청 찾기"
        placeholder="이름 또는 전화번호 뒤 4자리"
        autoComplete="off"
        className="min-h-[44px] min-w-0 flex-1 rounded-lg border border-transparent bg-white px-3.5 text-base text-ink placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-sky"
      />
      <button
        type="submit"
        className="inline-flex min-h-[44px] shrink-0 items-center justify-center whitespace-nowrap rounded-xl bg-white px-[18px] text-[15px] font-bold text-brand transition hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky focus-visible:ring-offset-2 focus-visible:ring-offset-brand"
      >
        찾기
      </button>
    </form>
  );
}
