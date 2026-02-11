import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import {
  HOME_CARD_BASE,
  HOME_CARD_HOVER,
  HOME_BUTTON_BASE,
  HOME_BUTTON_PRIMARY,
  HOME_BUTTON_SOFT,
  HOME_TITLE,
  HOME_DESC,
  HOME_BADGE,
  HOME_NOTE_BOX,
} from "@/components/ui/presets";

type AccentColor = "blue" | "violet" | "emerald";

const ACCENT_STYLES: Record<AccentColor, { border: string; badge: string; badgeText: string; dot: string }> = {
  blue: { border: "border-blue-200", badge: "bg-blue-50 border-blue-200", badgeText: "text-blue-700", dot: "bg-blue-500" },
  violet: { border: "border-violet-200", badge: "bg-violet-50 border-violet-200", badgeText: "text-violet-700", dot: "bg-violet-500" },
  emerald: { border: "border-emerald-200", badge: "bg-emerald-50 border-emerald-200", badgeText: "text-emerald-700", dot: "bg-emerald-500" },
};

type Props = {
  title: string;
  description: string;
  icon: ReactNode;
  href?: string;
  disabledNote?: string;
  ctaLabel?: string;
  className?: string;
  /** 대기 건수 (admin 전용) */
  pendingCount?: number;
  /** 카테고리별 강조 색상 */
  accentColor?: AccentColor;
};

export default function HomeCategoryCard({
  title,
  description,
  icon,
  href,
  disabledNote,
  ctaLabel,
  className,
  pendingCount,
  accentColor,
}: Props) {
  const isDisabled = !href || Boolean(disabledNote);
  const label = (ctaLabel ?? "예약하기").trim() || "예약하기";
  const note = disabledNote ? (disabledNote.trim().startsWith("※") ? disabledNote.trim() : `※ ${disabledNote.trim()}`) : null;
  const accent = accentColor ? ACCENT_STYLES[accentColor] : null;

  return (
    <div
      className={cn(
        "relative flex min-h-[480px] flex-col items-center px-6 py-12 text-center",
        HOME_CARD_BASE,
        HOME_CARD_HOVER,
        accent && `border-t-[3px] ${accent.border}`,
        className
      )}
    >
      {/* 대기 건수 배지 (admin) */}
      {typeof pendingCount === "number" && pendingCount > 0 && (
        <div className="absolute -right-2 -top-2 z-10">
          <span className="inline-flex items-center gap-1 rounded-full bg-red-500 px-2.5 py-1 text-xs font-bold text-white shadow-md animate-pulse">
            대기 {pendingCount}건
          </span>
        </div>
      )}

      {/* 아이콘 */}
      <div className="flex h-32 w-32 items-center justify-center">{icon}</div>

      {accent ? (
        <div className={cn("mt-6 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-semibold", accent.badge, accent.badgeText)}>
          <span className={cn("inline-block h-2 w-2 rounded-full", accent.dot)} />
          공간안내
        </div>
      ) : (
        <div className={cn(HOME_BADGE, "mt-6")}>공간안내</div>
      )}

      {/* 제목 */}
      <h2 className={cn(HOME_TITLE, "mt-4")}>{title}</h2>

      {/* 설명 */}
      <p className={cn(HOME_DESC, "mt-4 min-h-[60px] whitespace-pre-line")}>{description}</p>

      {/* 버튼 */}
      <div className="mt-10">
        {href && !isDisabled ? (
          <Link href={href} className={cn(HOME_BUTTON_BASE, HOME_BUTTON_PRIMARY)}>
            {label}
          </Link>
        ) : (
          <button disabled className={cn(HOME_BUTTON_BASE, HOME_BUTTON_SOFT)}>
            {label}
          </button>
        )}
      </div>

      {/* 준비중 안내: 대표 사이트 공지문 톤(작고 단정한 안내문) */}
      {note ? (
        <div className={cn(HOME_NOTE_BOX, "mt-5 w-full max-w-[320px] text-left")}>{note}</div>
      ) : null}
    </div>
  );
}
