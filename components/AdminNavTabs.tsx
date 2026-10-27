"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { cn } from "@/lib/cn";
import { normalizeRoomCategory, type RoomCategory } from "@/lib/space";

const STORAGE_KEY = "rental-app-improved:admin:lastCategory";

// 공간별 테마 색은 쓰지 않는다(audit-fix-2 ③-A-2). 구분은 제목 글자 + 4px 좌측 바(bar)로만.
const CATEGORIES: { id: RoomCategory; label: string; bar: string }[] = [
  { id: "lecture", label: "강의실", bar: "bg-brand" },
  { id: "studio", label: "E-스튜디오", bar: "bg-sky" },
  { id: "gallery", label: "우리동네 갤러리", bar: "bg-accent" },
];

export function getCategoryMeta(category: RoomCategory) {
  return CATEGORIES.find((c) => c.id === category) ?? CATEGORIES[0];
}

export default function AdminNavTabs() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const rawCategory = searchParams.get("category");
  const normalizedFromUrl = normalizeRoomCategory(rawCategory);

  const [persisted, setPersisted] = useState<string>(() => "lecture");

  useEffect(() => {
    if (rawCategory) {
      const safe = normalizedFromUrl;
      try {
        sessionStorage.setItem(STORAGE_KEY, safe);
      } catch {
        // ignore
      }
      setPersisted(safe);
      return;
    }

    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const norm = normalizeRoomCategory(saved);
        setPersisted(norm);
      }
    } catch {
      // ignore
    }
  }, [rawCategory, normalizedFromUrl]);

  const category = rawCategory ? normalizedFromUrl : persisted;

  const pageTabs = [
    {
      href: `/admin/requests?category=${encodeURIComponent(category)}`,
      label: "목록",
      active: pathname.startsWith("/admin/requests"),
    },
    {
      href: `/admin/calendar?category=${encodeURIComponent(category)}`,
      label: "캘린더",
      active: pathname.startsWith("/admin/calendar"),
    },
    {
      href: `/admin/settings?category=${encodeURIComponent(category)}`,
      label: "설정",
      active: pathname.startsWith("/admin/settings"),
    },
    {
      href: `/admin/stats`,
      label: "실적",
      active: pathname.startsWith("/admin/stats"),
    },
  ];

  // 카테고리 전환 → 해당 공간의 목록 페이지로 이동
  const buildCategoryHref = (catId: string) => {
    return `/admin/requests?category=${catId}`;
  };

  return (
    <div className="space-y-3">
      {/* 카테고리 전환 */}
      <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        <span className="mr-1 shrink-0 text-sm font-medium text-white/80">공간:</span>
        {CATEGORIES.map((cat) => {
          const isActive = cat.id === category;
          return (
            <Link
              key={cat.id}
              href={buildCategoryHref(cat.id)}
              className={cn(
                "inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap rounded-full border px-4 py-1.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky focus-visible:ring-offset-2 focus-visible:ring-offset-brand",
                isActive
                  ? "border-white bg-white text-brand"
                  : "border-white/30 bg-white/10 text-white hover:bg-white/20"
              )}
            >
              {cat.label}
            </Link>
          );
        })}
      </div>

      {/* 페이지 탭 */}
      <nav className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {pageTabs.map((t) => (
          <Link
            key={t.label}
            href={t.href}
            className={cn(
              "inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap rounded-full px-4 py-2 text-[15px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky focus-visible:ring-offset-2 focus-visible:ring-offset-brand",
              t.active
                ? "bg-white font-semibold text-brand"
                : "bg-white/10 text-white ring-1 ring-white/30 hover:bg-white/20"
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
