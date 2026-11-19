"use client";

import { useRef } from "react";
import FormSubmitButton from "@/components/FormSubmitButton";

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  today: string;
  appliedAt: string;
  pledgeDate: string;
  headcount: number | string;
  /** 한 번만 쓰는 강의실·E-스튜디오 건이면 시간도 고친다 */
  showTime: boolean;
  startTime?: string;
  endTime?: string;
};

const LABEL = "block text-base font-semibold text-slate-800";
const INPUT =
  "mt-2 block min-h-[52px] w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-lg text-slate-900 focus:border-brand focus:outline-none focus:ring-2 focus:ring-sky/40";

/**
 * 서면 접수 정보 고치기 — 팝업 창 (2026-11-19 · 접힌 줄 안의 칸이 너무 작다는 사용자 지적)
 * 칸은 큰 글씨로 한 줄에 두 개까지. 저장은 서버 액션 그대로.
 */
export default function IntakeFixDialog({ action, today, appliedAt, pledgeDate, headcount, showTime, startTime, endTime }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className="my-2 inline-flex min-h-[44px] items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-[15px] font-semibold text-ink hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky"
      >
        접수 정보 고치기
      </button>

      <dialog
        ref={ref}
        aria-labelledby="intake-fix-title"
        className="w-[min(92vw,640px)] rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl backdrop:bg-slate-900/50"
        onClick={(e) => {
          // 바깥(어두운 곳)을 누르면 닫는다
          if (e.target === ref.current) ref.current?.close();
        }}
      >
        <form action={action} className="p-6 sm:p-8">
          <h2 id="intake-fix-title" className="text-xl font-bold text-ink">
            접수 정보 고치기
          </h2>
          <p className="mt-2 text-[15px] leading-6 text-slate-600">종이 신청서에 적힌 내용으로 맞춥니다.</p>

          <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <label className={LABEL}>
              접수일
              <input type="date" name="appliedAt" required max={today} defaultValue={appliedAt} className={INPUT} />
            </label>
            <label className={LABEL}>
              서약일
              <input type="date" name="pledgeDate" required max={today} defaultValue={pledgeDate} className={INPUT} />
            </label>
            <label className={LABEL}>
              인원(명)
              <input type="number" name="headcount" required min={1} inputMode="numeric" defaultValue={headcount} className={INPUT} />
            </label>
            {showTime && (
              <>
                <div className="hidden sm:block" aria-hidden="true" />
                <label className={LABEL}>
                  시작 시각
                  <input type="time" name="startTime" required step={1800} defaultValue={startTime} className={INPUT} />
                </label>
                <label className={LABEL}>
                  끝 시각
                  <input type="time" name="endTime" required step={1800} defaultValue={endTime} className={INPUT} />
                </label>
              </>
            )}
          </div>

          <ul className="mt-5 list-disc space-y-1 pl-5 text-[15px] leading-6 text-slate-600">
            <li>여러 회차면 접수일, 서약일, 인원이 모든 회차에 같이 적용됩니다.</li>
            {showTime && <li>시간은 30분 단위입니다. 다른 신청이나 정규 수업과 겹치면 저장되지 않습니다.</li>}
            {showTime && <li>할인이 있으면 할인률은 그대로 두고 금액을 다시 계산합니다.</li>}
          </ul>

          <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => ref.current?.close()}
              className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-slate-300 bg-white px-5 text-base font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky"
            >
              닫기
            </button>
            <FormSubmitButton idleText="고친 내용 저장" pendingText="저장 중…" className="min-h-[48px] px-6 text-base" />
          </div>
        </form>
      </dialog>
    </>
  );
}
