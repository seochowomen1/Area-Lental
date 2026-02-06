import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import AdminNavTabs from "@/components/AdminNavTabs";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="no-print border-b bg-white">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex flex-col gap-4 py-4 md:flex-row md:items-center md:justify-between">
            <Link href="/admin" className="flex items-center gap-3">
              <Image
                src="/brand/seochowomen-ci.png"
                alt="서초여성가족플라자 서초센터"
                width={260}
                height={52}
                priority
                className="h-8 w-auto"
              />
              <span className="hidden text-sm font-semibold text-gray-700 md:inline">대관 관리자</span>
            </Link>

            <div className="flex items-center justify-between gap-4">
              <Link
                href="/space"
                className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--brand-primary))] focus-visible:ring-offset-2"
              >
                사용자 화면
              </Link>
            </div>
          </div>

          <div className="pb-5">
            <AdminNavTabs />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
