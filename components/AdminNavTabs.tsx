"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { cn } from "@/lib/cn";
import { normalizeRoomCategory, type RoomCategory } from "@/lib/space";

const STORAGE_KEY = "rental-app-improved:admin:lastCategory";

// 공간별 테마 색은 쓰지 않는다(audit-fix-2 ③-A-2). 구분은 제목 글자 + 4px 좌측 바(bar)로만.
const CATEGORIES: { id: RoomCategory; label: string; tabLabel: string; bar: string }[] = [
  { id: "lecture", label: "강의실", tabLabel: "강의실", bar: "bg-brand" },
  { id: "studio", label: "E-스튜디오", tabLabel: "E-스튜디오", bar: "bg-sky" },
  // 탭은 짧게 `갤러리`, 화면 제목·목록 안은 `우리동네 갤러리`(02_ui v2 §2-1)
  { id: "gallery", label: "우리동네 갤러리", tabLabel: "갤러리", bar: "bg-accent" },
];

export function getCategoryMeta(category: RoomCategory) {
  return CATEGORIES.find((c) => c.id === category) ?? CATEGORIES[0];
}

type Tab = { key: string; href: string; label: string; active: boolean; group: 0 | 1 | 2 };

/**
 * 관리자 상단 탭 (audit-fix-3 3-2 · 02_ui v2 §2-1)
 * `할 일 | 강의실 · E-스튜디오 · 갤러리 | 캘린더 · 실적 · 설정` 한 줄.
 * - 공간 탭 = 기존 공간별 목록(/admin/requests?category=…) 그대로
 * - 캘린더·설정은 마지막으로 본 공간(세션 저장)으로 연다(화면 안에서 공간을 바꿀 수 있음)
 * - variant "dark": PC(≥900) 브랜드 헤더 안 · "light": 휴대폰 흰 탭 줄(가로 스크롤)
 */
export default function AdminNavTabs({ variant = "dark" }: { variant?: "dark" | "light" }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const rawCategory = searchParams.get("category");
  const normalizedFromUrl = normalizeRoomCategory(rawCategory);

  const [persisted, setPersisted] = useState<RoomCategory>("lecture");

  useEffect(() => {
    if (rawCategory) {
      try {
        sessionStorage.setItem(STORAGE_KEY, normalizedFromUrl);
      } catch {
        // ignore
      }
      setPersisted(normalizedFromUrl);
      return;
    }
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) setPersisted(normalizeRoomCategory(saved));
    } catch {
      // ignore
    }
  }, [rawCategory, normalizedFromUrl]);

  const category = rawCategory ? normalizedFromUrl : persisted;
  // 공간 탭은 공간 목록 화면(·서면 등록)에서만 켠다 — 상세는 할 일에서 들어오는 경우가 많아 어느 탭도 켜지 않음
  const onSpaceList = pathname === "/admin/requests" || pathname === "/admin/requests/new";

  const tabs: Tab[] = [
    { key: "todo", href: "/admin", label: "할 일", active: pathname === "/admin", group: 0 },
    ...CATEGORIES.map<Tab>((c) => ({
      key: c.id,
      href: `/admin/requests?category=${c.id}`,
      label: c.tabLabel,
      active: onSpaceList && category === c.id,
      group: 1,
    })),
    { key: "calendar", href: `/admin/calendar?category=${encodeURIComponent(category)}`, label: "캘린더", active: pathname.startsWith("/admin/calendar"), group: 2 },
    { key: "stats", href: "/admin/stats", label: "실적", active: pathname.startsWith("/admin/stats"), group: 2 },
    { key: "settings", href: `/admin/settings?category=${encodeURIComponent(category)}`, label: "설정", active: pathname.startsWith("/admin/settings"), group: 2 },
  ];

  if (variant === "light") {
    return (
      <nav
        aria-label="관리자 메뉴"
        className="flex overflow-x-auto border-b border-line bg-white px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            aria-current={t.active ? "page" : undefined}
            className={cn(
              "my-1 inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap rounded-lg px-[13px] text-[15px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky",
              t.active ? "bg-brand-soft text-brand" : "text-ink-2 hover:bg-slate-50"
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    );
  }

  return (
    <nav aria-label="관리자 메뉴" className="flex items-stretch gap-1">
      {tabs.map((t, i) => (
        <span key={t.key} className="flex items-stretch">
          {i > 0 && tabs[i - 1].group !== t.group && <span className="mx-1.5 my-2 w-px bg-white/25" aria-hidden="true" />}
          <Link
            href={t.href}
            aria-current={t.active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-[44px] items-center whitespace-nowrap rounded-[10px] px-4 text-[15px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky focus-visible:ring-offset-2 focus-visible:ring-offset-brand",
              t.active ? "bg-white/[0.16] text-white" : "text-white/[0.88] hover:bg-white/10"
            )}
          >
            {t.label}
          </Link>
        </span>
      ))}
    </nav>
  );
}

/**
 * 화면 안 공간 바꾸기(캘린더·설정용) — 헤더의 공간 탭은 목록으로 가므로, 캘린더·설정은 화면 안에서 공간을 바꾼다.
 */
export function AdminSpaceSwitch({ basePath, current }: { basePath: "/admin/calendar" | "/admin/settings"; current: RoomCategory }) {
  return (
    <div role="group" aria-label="공간" className="flex flex-wrap gap-2">
      {CATEGORIES.map((c) => {
        const on = c.id === current;
        return (
          <Link
            key={c.id}
            href={`${basePath}?category=${c.id}`}
            aria-current={on ? "page" : undefined}
            className={cn(
              "inline-flex min-h-[44px] items-center whitespace-nowrap rounded-xl border px-4 text-[15px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky",
              on ? "border-brand bg-brand-soft text-brand" : "border-slate-300 bg-white text-ink hover:bg-slate-50"
            )}
          >
            {c.label}
          </Link>
        );
      })}
    </div>
  );
}
