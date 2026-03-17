import Image from "next/image";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";

import AdminNavTabs from "@/components/AdminNavTabs";
import AdminLogoutButton from "@/components/admin/AdminLogoutButton";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="no-print border-b border-slate-700 bg-slate-800">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex flex-col gap-4 py-4 md:flex-row md:items-center md:justify-between">
            <Link href="/admin" className="flex items-center gap-3">
              <Image
                src="/brand/seochowomen-ci.png"
                alt="서초여성가족플라자 서초센터"
                width={260}
                height={52}
                priority
                className="h-8 w-auto brightness-0 invert"
              />
              <span className="rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-white">
                관리자
              </span>
            </Link>

            <div className="flex items-center justify-between gap-3">
              <a
                href="/"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-slate-500 bg-slate-700/50 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-800"
              >
                사용자 화면 ↗
              </a>
              <AdminLogoutButton variant="dark" />
            </div>
          </div>

          <div className="pb-5">
            <Suspense>
              <AdminNavTabs />
            </Suspense>
          </div>
        </div>
      </header>

      <main id="main-content" className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
