"use client";

/**
 * 예상 이용료 상자 (02_ui_apply §2-5 6 · §3 금액 이름)
 * 흰 카드 · 제목 18 → 내역 줄 17 → 구분선 → `합계` 24 brand → `승인 후 확정됩니다.` + PAYMENT_FLOW_SHORT 원문
 * 금액 계산은 lib/rules/lecturePlan · lib/galleryPlan 결과를 그대로 받는다(여기서 다시 계산하지 않음).
 */
import { PAYMENT_FLOW_SHORT } from "@/lib/policy";
export { galleryFeeLines, lectureFeeLines, type FeeLine } from "@/lib/apply/fee";
import type { FeeLine } from "@/lib/apply/fee";
import { cn } from "@/lib/cn";
import { A_CARD, A_CARD_TITLE, A_HELP } from "@/components/apply/ui";

export default function FeeSummary({
  title,
  lines,
  total,
  target,
  className,
}: {
  title: string;
  lines: FeeLine[];
  total: number;
  target: "예약" | "전시";
  className?: string;
}) {
  return (
    <section aria-label={title} className={cn(A_CARD, "p-4 sm:p-5", className)}>
      <h2 className={A_CARD_TITLE}>{title}</h2>
      {lines.length ? (
        <ul className="mt-2 space-y-1">
          {lines.map((l) => (
            <li key={l.label} className="flex items-baseline justify-between gap-3 text-[17px] leading-7 text-ink">
              <span className="min-w-0">{l.label}</span>
              <span className="shrink-0 tabular-nums">{l.amount === null ? "무료" : `${l.amount.toLocaleString()}원`}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-line pt-3">
        <span className="text-[17px] font-bold text-ink">합계</span>
        <span className="text-[24px] font-extrabold tabular-nums text-brand">{total.toLocaleString()}원</span>
      </div>
      <p className={cn(A_HELP, "mt-2")}>
        승인 후 확정됩니다. {PAYMENT_FLOW_SHORT(target)}
      </p>
    </section>
  );
}
