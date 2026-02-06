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

type Props = {
  title: string;
  description: string;
  icon: ReactNode;
  href?: string;
  disabledNote?: string;
  ctaLabel?: string;
  className?: string;
};

export default function HomeCategoryCard({
  title,
  description,
  icon,
  href,
  disabledNote,
  ctaLabel,
  className,
}: Props) {
  const isDisabled = !href || Boolean(disabledNote);
  const label = (ctaLabel ?? "예약하기").trim() || "예약하기";
  const note = disabledNote ? (disabledNote.trim().startsWith("※") ? disabledNote.trim() : `※ ${disabledNote.trim()}`) : null;

  return (
    <div
      className={cn(
        "flex min-h-[480px] flex-col items-center px-6 py-12 text-center",
        HOME_CARD_BASE,
        HOME_CARD_HOVER,
        className
      )}
    >
      {/* 아이콘 */}
      <div className="flex h-32 w-32 items-center justify-center">{icon}</div>

      <div className={cn(HOME_BADGE, "mt-6")}>공간안내</div>

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
