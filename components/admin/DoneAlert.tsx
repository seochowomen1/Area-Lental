"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

/**
 * 처리 성공 알림 1줄 (audit-fix-3 3-2 · 02_ui v2 §2-5)
 * 승인톤 · 15 semibold · role="status" · 나타나면 초점 이동 · 자동으로 사라지지 않음(다음 동작 때 바뀜)
 */
export default function DoneAlert({ message }: { message: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus({ preventScroll: false });
  }, [message]);

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="status"
      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-[15px] font-semibold leading-6 text-emerald-700 outline-none focus-visible:ring-2 focus-visible:ring-sky"
    >
      <span>✓ {message}</span>
      <Link href="/admin" className="inline-flex min-h-[44px] items-center whitespace-nowrap text-brand underline underline-offset-[3px]">
        할 일로
      </Link>
    </div>
  );
}
