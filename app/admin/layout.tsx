import Image from "next/image";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";

import AdminNavTabs from "@/components/AdminNavTabs";
import AdminLogoutButton from "@/components/admin/AdminLogoutButton";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="no-print border-b border-brand-hover bg-brand">
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
              <span className="rounded bg-accent px-1.5 py-0.5 text-xs font-bold tracking-wider text-ink">
                관리자
              </span>
            </Link>

            <div className="flex items-center justify-between gap-3">
              <a
                href="/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[44px] items-center whitespace-nowrap rounded-full border border-white/30 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky focus-visible:ring-offset-2 focus-visible:ring-offset-brand"
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

      <main id="main-content" className="mx-auto max-w-7xl px-4 py-6 text-[15px]">{children}</main>
    </div>
  );
}
