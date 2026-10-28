import Image from "next/image";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";

import AdminNavTabs from "@/components/AdminNavTabs";
import AdminHeaderSearch from "@/components/admin/AdminHeaderSearch";
import AdminLogoutButton from "@/components/admin/AdminLogoutButton";

/**
 * 관리자 공통 헤더 (audit-fix-3 3-2 · 02_ui v2 §2-1)
 * PC(≥900): 1줄 로고·검색(420)·사용자 화면·로그아웃 / 2줄 탭(할 일 | 공간 3 | 캘린더·실적·설정)
 * 휴대폰: 1줄 로고·로그아웃 → 2줄 검색(전체 폭) → 흰 탭 줄(가로 스크롤)
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="no-print border-b border-brand-hover bg-brand">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex items-center justify-between gap-4 py-3">
            <Link href="/admin" className="flex min-h-[44px] shrink-0 items-center gap-3">
              <Image
                src="/brand/seochowomen-ci.png"
                alt="서초여성가족플라자 서초센터"
                width={260}
                height={52}
                priority
                className="h-7 w-auto brightness-0 invert min-[900px]:h-8"
              />
              <span className="rounded bg-accent px-1.5 py-0.5 text-xs font-bold tracking-wider text-ink">
                관리자
              </span>
            </Link>

            <Suspense>
              <AdminHeaderSearch className="hidden w-[420px] min-[900px]:flex" />
            </Suspense>

            <div className="flex shrink-0 items-center gap-2">
              <a
                href="/"
                target="_blank"
                rel="noopener noreferrer"
                className="hidden min-h-[44px] items-center whitespace-nowrap rounded-full border border-white/30 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky focus-visible:ring-offset-2 focus-visible:ring-offset-brand min-[900px]:inline-flex"
              >
                사용자 화면 ↗
              </a>
              <AdminLogoutButton variant="dark" />
            </div>
          </div>

          {/* 휴대폰: 검색 전체 폭 */}
          <div className="pb-3 min-[900px]:hidden">
            <Suspense>
              <AdminHeaderSearch />
            </Suspense>
          </div>

          {/* PC: 탭 줄 */}
          <div className="hidden pb-3 min-[900px]:block">
            <Suspense>
              <AdminNavTabs variant="dark" />
            </Suspense>
          </div>
        </div>
      </header>

      {/* 휴대폰: 흰 탭 줄(가로 스크롤) */}
      <div className="no-print min-[900px]:hidden">
        <Suspense>
          <AdminNavTabs variant="light" />
        </Suspense>
      </div>

      <main id="main-content" className="mx-auto max-w-7xl px-4 py-4 text-[15px] min-[900px]:py-6">{children}</main>
    </div>
  );
}
