"use client";

import { useState } from "react";

import FormSubmitButton from "@/components/FormSubmitButton";
import Modal, { MODAL_BTN_SECONDARY } from "@/components/ui/Modal";

/**
 * 관리자 상세(갤러리) — 공휴일 미확인·내장표로 접수된 신청 배너 + [다시 계산] 확인 모달
 * (audit-fix-2 ③-F-3~F-6 · 03_api 1-4/1-5 · 02_ui §2-5)
 * - 데이터는 서버 렌더에서 getGalleryRecalcView()로 미리 계산해 내려받는다(미리보기 API 없음).
 * - 확정은 서버 액션 recalcGalleryFeeAction(이 1건만 · 첫 줄 assertAdminAuth).
 */
type Counts = { weekdayCount: number; saturdayCount: number; exhibitionDayCount: number; feeKRW: number };

export type GalleryHolidayBannerView = {
  bannerLevel: "strong" | "weak";
  nowUnavailable: boolean;
  periodHolidayLabels: string[];
  statusAllowed: boolean;
  canRecalc: boolean;
  before: Counts;
  after: Counts | null;
  startDate: string;
  endDate: string;
  recalculatedAt: string | null;
};

const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;

export default function GalleryHolidayBanner({
  view,
  action,
}: {
  view: GalleryHolidayBannerView;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const strong = view.bannerLevel === "strong";
  const title = strong ? "공휴일을 확인하지 못한 채 접수된 신청입니다" : "기본 공휴일표로 계산된 신청입니다";
  const lead = strong
    ? "신청 당시 공휴일 정보를 불러오지 못해 공휴일도 전시일로 계산되었습니다."
    : "임시공휴일은 반영되지 않았을 수 있습니다. 승인 전 기간을 확인해 주세요.";

  const holidaysLine = view.nowUnavailable
    ? `지금도 공휴일 정보를 불러오지 못했습니다. 기간(${view.startDate}~${view.endDate})에 공휴일이 있는지 달력에서 직접 확인해 주세요.`
    : view.periodHolidayLabels.length > 0
      ? `기간 중 공휴일: ${view.periodHolidayLabels.join(", ")}`
      : "기간 중 공휴일: 없음 — 금액은 그대로 맞습니다.";

  const b = view.before;
  const a = view.after;
  const changeLine = a
    ? `평일 ${b.weekdayCount}일 · 토요일 ${b.saturdayCount}일 · ${won(b.feeKRW)} → 평일 ${a.weekdayCount}일 · 토요일 ${a.saturdayCount}일 · ${won(a.feeKRW)}`
    : "";

  const showStatusBlock = !view.nowUnavailable && view.periodHolidayLabels.length > 0 && !view.statusAllowed;

  return (
    <section
      role="status"
      aria-labelledby="gallery-holiday-banner-title"
      className={strong ? "rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-900" : "rounded-xl border border-line bg-white px-5 py-4 text-ink-2"}
    >
      <h2 id="gallery-holiday-banner-title" className="text-base font-bold">{title}</h2>
      <p className="mt-1 text-[15px] leading-6">
        {lead} {holidaysLine}
      </p>
      {view.recalculatedAt ? (
        <p className="mt-1 text-sm text-amber-800">이미 다시 계산한 신청입니다({view.recalculatedAt.slice(0, 16).replace("T", " ")}).</p>
      ) : null}

      {showStatusBlock ? (
        <p className="mt-2 text-[15px] font-bold">
          결제 안내가 이미 나갔으므로 자동으로 바꾸지 않습니다. 차액은 할인·환불 기록으로 처리해 주세요.
        </p>
      ) : null}

      {view.canRecalc && a ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex min-h-[44px] items-center whitespace-nowrap rounded-xl border border-slate-300 bg-white px-4 text-[15px] font-semibold text-ink hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky focus-visible:ring-offset-2"
          >
            공휴일 반영해 이용료 다시 계산
          </button>
        </div>
      ) : null}

      {view.canRecalc && a ? (
        <Modal
          open={open}
          onClose={() => setOpen(false)}
          title="이용료를 다시 계산할까요?"
          showClose={false}
          footer={
            <form action={action} className="flex gap-2">
              <button type="button" data-modal-cancel onClick={() => setOpen(false)} className={MODAL_BTN_SECONDARY}>
                취소
              </button>
              <FormSubmitButton idleText="다시 계산" pendingText="계산 중…" />
            </form>
          }
        >
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-lg bg-slate-100 px-4 py-3 text-center">
            <div>
              <div className="text-sm text-ink-3">지금</div>
              <div className="text-lg font-bold tabular-nums text-ink">{won(b.feeKRW)}</div>
              <div className="text-sm text-ink-3">평일 {b.weekdayCount}일 · 토요일 {b.saturdayCount}일</div>
            </div>
            <div className="text-xl text-ink-3" aria-hidden="true">→</div>
            <div>
              <div className="text-sm text-ink-3">다시 계산</div>
              <div className="text-lg font-bold tabular-nums text-brand">{won(a.feeKRW)}</div>
              <div className="text-sm text-ink-3">평일 {a.weekdayCount}일 · 토요일 {a.saturdayCount}일</div>
            </div>
          </div>
          <p className="mt-3 text-[15px] text-ink-2">{changeLine}</p>
          <p className="mt-1 text-[15px] text-ink-2">이 신청 1건만 바뀝니다. 신청자에게 메일은 자동으로 가지 않습니다.</p>
        </Modal>
      ) : null}
    </section>
  );
}
