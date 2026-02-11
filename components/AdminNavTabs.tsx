"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { cn } from "@/lib/cn";
import { normalizeRoomCategory, type RoomCategory } from "@/lib/space";

const STORAGE_KEY = "rental-app-improved:admin:lastCategory";

const CATEGORIES: { id: RoomCategory; label: string; color: string; bg: string }[] = [
  { id: "lecture", label: "강의실", color: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
  { id: "studio", label: "E-스튜디오", color: "text-violet-700", bg: "bg-violet-50 border-violet-200" },
  { id: "gallery", label: "우리동네 갤러리", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
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
  const meta = getCategoryMeta(category as RoomCategory);

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
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-medium text-gray-500">공간:</span>
        {CATEGORIES.map((cat) => {
          const isActive = cat.id === category;
          return (
            <Link
              key={cat.id}
              href={buildCategoryHref(cat.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                isActive
                  ? `${cat.bg} ${cat.color}`
                  : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
              )}
            >
              {cat.label}
            </Link>
          );
        })}
      </div>

      {/* 페이지 탭 */}
      <nav className="flex flex-wrap items-center gap-2">
        {pageTabs.map((t) => (
          <Link
            key={t.label}
            href={t.href}
            className={cn(
              "rounded-full px-4 py-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--brand-primary))] focus-visible:ring-offset-2",
              t.active
                ? "bg-[rgb(var(--brand-primary))] text-white shadow-sm"
                : "bg-white text-gray-700 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50"
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
