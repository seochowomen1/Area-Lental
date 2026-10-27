import Link from "next/link";

import PaymentDeadlineCheckButton from "@/components/admin/PaymentDeadlineCheckButton";
import type { summarizePaymentChips } from "@/lib/payment";

export type PaymentChipSummary = ReturnType<typeof summarizePaymentChips>;
export type PaymentFocus = "payment-waiting" | "close-needed" | "auto-cancelled";

type Props = {
  summary: PaymentChipSummary;
  /** 칩 클릭 시 열 목록 URL 앵커(`?focus=` 가 덧붙는다) — 예: `/admin/requests?category=gallery` */
  listHref: string;
  /** 현재 적용 중인 focus (목록 페이지에서 칩을 눌렀을 때 강조) */
  activeFocus?: PaymentFocus | null;
  /** "지금 점검" 링크 표시 여부(홈·목록 둘 다 기본 표시) */
  showCheck?: boolean;
  /** 왼쪽 라벨(기본 "결제 현황" · 관리자 홈은 카테고리별로 "결제 현황 · 강의실") */
  label?: string;
};

const CHIP_BASE =
  "inline-flex min-h-[44px] w-full items-center justify-between gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold md:min-h-[36px] md:w-auto md:justify-start";
const TONE = {
  amber: "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100",
  gray: "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100",
  red: "border-red-200 bg-red-50 text-red-800 hover:bg-red-100",
} as const;

function withFocus(listHref: string, focus: PaymentFocus): string {
  return `${listHref}${listHref.includes("?") ? "&" : "?"}focus=${focus}`;
}

/**
 * 결제 현황 칩 3개 (01_spec ②-(라) · 02_ui §2) — 관리자 홈·목록 상단 공용(서버 컴포넌트)
 * - 결제 대기 N건 / 홈페이지 마감 필요 M건(3일 경과 시 빨강) / 기한 경과 자동 취소 K건(0이면 숨김)
 * - 전부 0건이면 카드 자체를 렌더하지 않는다.
 */
export default function PaymentStatusChips({ summary, listHref, activeFocus = null, showCheck = true, label = "결제 현황" }: Props) {
  const { paymentWaiting, closeNeeded, closeNeededOverdue3d, autoCancelled, autoCancelledOverdue3d } = summary;
  if (paymentWaiting === 0 && closeNeeded === 0 && autoCancelled === 0) return null;

  const ring = (f: PaymentFocus) => (activeFocus === f ? " ring-2 ring-brand ring-offset-1" : "");

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
        <span className="text-xs font-semibold text-slate-500 md:mr-1">{label}</span>

        {paymentWaiting > 0 && (
          <Link href={withFocus(listHref, "payment-waiting")} className={`${CHIP_BASE} ${TONE.amber}${ring("payment-waiting")}`} title="목록에서 보기">
            <span>
              결제 대기 <b className="font-extrabold tabular-nums">{paymentWaiting}</b>건
            </span>
            <span aria-hidden="true">›</span>
          </Link>
        )}

        {closeNeeded > 0 && (
          <Link
            href={withFocus(listHref, "close-needed")}
            className={`${CHIP_BASE} ${closeNeededOverdue3d > 0 ? TONE.red : TONE.amber}${ring("close-needed")}`}
            title="목록에서 보기"
          >
            <span>
              홈페이지 마감 필요 <b className="font-extrabold tabular-nums">{closeNeeded}</b>건{closeNeededOverdue3d > 0 ? ` (3일 경과 ${closeNeededOverdue3d}건)` : ""}
            </span>
            <span aria-hidden="true">›</span>
          </Link>
        )}

        {autoCancelled > 0 && (
          <Link
            href={withFocus(listHref, "auto-cancelled")}
            className={`${CHIP_BASE} ${autoCancelledOverdue3d > 0 ? TONE.red : TONE.gray}${ring("auto-cancelled")}`}
            title="목록에서 보기"
          >
            <span>
              기한 경과 자동 취소 <b className="font-extrabold tabular-nums">{autoCancelled}</b>건 · 홈페이지 마감·미게시 처리 필요
            </span>
            <span aria-hidden="true">›</span>
          </Link>
        )}

        <div className="flex items-center justify-end gap-3 md:ml-auto">
          {activeFocus && (
            <Link href={listHref} className="text-xs text-slate-600 underline hover:text-slate-900">
              전체 보기
            </Link>
          )}
          {showCheck && <PaymentDeadlineCheckButton />}
        </div>
      </div>
    </div>
  );
}
