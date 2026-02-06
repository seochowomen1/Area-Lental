"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { normalizeRoomCategory } from "@/lib/space";

const STORAGE_KEY = "rental-app-improved:admin:lastCategory";

export default function AdminNavTabs() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const rawCategory = searchParams.get("category");
  const normalizedFromUrl = normalizeRoomCategory(rawCategory);

  // settings 등 category 없는 페이지에서도 마지막 선택값을 유지하기 위해 sessionStorage에 저장합니다.
  const [persisted, setPersisted] = useState<string>(() => "lecture");

  useEffect(() => {
    // URL에 category가 있으면 우선 저장
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

    // URL에 category가 없으면 저장된 값을 불러옵니다.
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

  // 최종 category: URL이 우선, 없으면 persisted
  const category = rawCategory ? normalizedFromUrl : persisted;

  const tabs = [
    // 공간(허브)로 이동하더라도 category를 URL에 남겨 탭 전환 시 유지되도록 합니다.
    {
      href: `/admin?category=${encodeURIComponent(category)}`,
      label: "공간",
      active: pathname === "/admin",
    },
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
    // settings도 category를 함께 전달해, settings → 목록/캘린더 이동 시 선택값이 유지됩니다.
    {
      href: `/admin/settings?category=${encodeURIComponent(category)}`,
      label: "설정",
      active: pathname.startsWith("/admin/settings"),
    },
  ];

  return (
    <nav className="flex flex-wrap items-center gap-2">
      {tabs.map((t) => (
        <Link
          key={t.label}
          href={t.href}
          className={
            "rounded-full px-4 py-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--brand-primary))] focus-visible:ring-offset-2 " +
            (t.active
              ? "bg-[rgb(var(--brand-primary))] text-white shadow-sm"
              : "bg-white text-gray-700 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50")
          }
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}