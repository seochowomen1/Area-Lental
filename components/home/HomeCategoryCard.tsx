import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { HOME_BADGE, HOME_CARD_BASE, HOME_CARD_HOVER, HOME_TITLE } from "@/components/ui/presets";

/**
 * 홈 공간 카드 (02_ui_apply §0-3 · §0-7 · §2-1)
 * - 900 미만: 가로형 카드 = 카드 전체가 링크 하나(아이콘 64 · 이름 20 + 칩 · 짧은 설명 17 1줄 · 요금 15 · 오른쪽 아래 `대관 신청하기 ›`)
 *   640~899는 같은 모양 2열(부모 그리드)
 * - 900 이상: 세로형(지금 홈) · 설명 2줄 17 · 요금 15 · 남색 버튼 56이 링크
 */
type Props = {
  title: string;
  /** PC 설명(줄바꿈 \n) */
  description: string;
  /** 휴대폰 한 줄 설명 */
  shortDescription: string;
  icon: ReactNode;
  href: string;
  badgeLabel: string;
  ctaLabel: string;
  fee: ReactNode;
};

export default function HomeCategoryCard({ title, description, shortDescription, icon, href, badgeLabel, ctaLabel, fee }: Props) {
  return (
    <>
      {/* 휴대폰·태블릿: 가로형 */}
      <Link
        href={href}
        className={cn(
          "flex gap-3.5 p-3.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky focus-visible:ring-offset-2 min-[900px]:hidden",
          HOME_CARD_BASE,
          HOME_CARD_HOVER
        )}
      >
        <span aria-hidden="true" className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white [&>div]:h-16 [&>div]:w-16 [&>div]:border-0 [&_svg]:h-12 [&_svg]:w-12">
          {icon}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[20px] font-extrabold leading-[30px] text-ink">{title}</span>
            <span className={cn(HOME_BADGE, "px-2.5 py-0.5 text-[14px]")}>{badgeLabel}</span>
          </span>
          <span className="text-[17px] leading-7 text-ink-2">{shortDescription}</span>
          <span className="text-[15px] leading-6 text-ink-2">{fee}</span>
          <span className="mt-1 self-end text-[15px] font-bold leading-6 text-brand">{ctaLabel} ›</span>
        </span>
      </Link>

      {/* PC: 세로형 */}
      <div className={cn("hidden flex-col items-center px-6 py-10 text-center min-[900px]:flex", HOME_CARD_BASE, HOME_CARD_HOVER)}>
        <div aria-hidden="true" className="flex h-28 w-28 items-center justify-center">
          {icon}
        </div>
        <div className={cn(HOME_BADGE, "mt-6")}>{badgeLabel}</div>
        <h2 className={cn(HOME_TITLE, "mt-3")}>{title}</h2>
        <p className="mt-3 min-h-[56px] whitespace-pre-line break-keep text-[17px] leading-7 text-ink-2">{description}</p>
        <p className="mt-2 text-[15px] leading-6 text-ink-2">{fee}</p>
        <Link
          href={href}
          className="mt-8 inline-flex min-h-[56px] items-center justify-center rounded-xl bg-brand px-10 text-[18px] font-bold text-white hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky focus-visible:ring-offset-2"
        >
          {ctaLabel}
        </Link>
      </div>
    </>
  );
}
