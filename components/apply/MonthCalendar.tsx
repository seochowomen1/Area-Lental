"use client";

/**
 * 2단계 달력 카드 (02_ui_apply §2-3 · §2-4) — 강의실·E-스튜디오·갤러리 공용 틀
 * - 머리: `2026년 11월`(20) · `◀` `▶`(44) · 불러오는 중이면 옆에 `불러오는 중…`
 * - 칸: 휴대폰 ≈47×60 · PC 72 · 숫자 18 굵게 + 12 상태 글자 또는 6 점
 * - 예약 현황 실패(P-3): 반려톤 상자 + `다시 불러오기`, 칸은 모두 흐린 숫자(누를 수 없음)
 * 칸 상태는 부모가 정한다(cellFor).
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { dayOfWeek } from "@/lib/rules/ymd";
import { datesOfMonth } from "@/lib/galleryCalendar";
import { A_BTN_SECONDARY } from "@/components/apply/ui";

export type CellView =
  | "past" // 지난 날짜(흐린 숫자)
  | "closed" // 일요일·공휴일
  | "booked" // 마감
  | "available" // 신청 가능(점)
  | "chosen" // 고른 날짜(목록에 있음)
  | "active" // 지금 시간을 고르는 날짜
  | "between" // 갤러리 기간 사이
  | "prep" // 갤러리 준비일
  | "blocked" // 지금 고를 수 없음(점 없음)
  | "dim"; // 불러오는 중·오류

export type CellSpec = {
  view: CellView;
  /** 칸 아래 12px 글자(없으면 available은 점) */
  sub?: ReactNode;
  /** 화면 읽기 상태 말 */
  srState: string;
  clickable: boolean;
};

export function monthKeyOf(ymd: string): string {
  return ymd.slice(0, 7);
}

export function addMonthKey(key: string, delta: number): string {
  const y = parseInt(key.slice(0, 4), 10);
  const m = parseInt(key.slice(5, 7), 10) - 1 + delta;
  const ny = y + Math.floor(m / 12);
  const nm = ((m % 12) + 12) % 12;
  return `${ny}-${String(nm + 1).padStart(2, "0")}`;
}

const DOW = ["일", "월", "화", "수", "목", "금", "토"];
export const CALENDAR_LOAD_ERROR = "예약 현황을 불러오지 못했습니다. 잠시 뒤 다시 불러와 주세요.";

export default function MonthCalendar({
  id = "calendar-card",
  monthKey,
  minMonthKey,
  onMonthChange,
  status,
  onReload,
  today,
  cellFor,
  onPick,
  above,
  below,
  headExtra,
}: {
  id?: string;
  monthKey: string;
  /** 이 달보다 앞으로는 ◀ 비활성 */
  minMonthKey: string;
  onMonthChange: (key: string) => void;
  status: "loading" | "error" | "ok";
  onReload: () => void;
  today: string;
  cellFor: (ymd: string) => CellSpec;
  onPick: (ymd: string) => void;
  /** 달력 위 안내 상자(접수톤 등) */
  above?: ReactNode;
  /** 범례·안내 줄 */
  below?: ReactNode;
  /** 머리 아래 한 줄(갤러리 `이번 달 신청 가능한 날 N일`) */
  headExtra?: ReactNode;
}) {
  const [y, m] = monthKey.split("-").map((v) => parseInt(v, 10));
  const dates = datesOfMonth(monthKey);
  const lead = dates.length ? dayOfWeek(dates[0]) : 0;
  const cells: Array<string | null> = [...Array.from({ length: lead }, () => null), ...dates];
  while (cells.length % 7 !== 0) cells.push(null);
  const prevDisabled = monthKey <= minMonthKey;
  const navBtn =
    "inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-300 bg-white text-[16px] font-bold text-ink hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky disabled:cursor-not-allowed disabled:border-transparent disabled:bg-slate-200 disabled:text-slate-400";

  return (
    <section id={id} tabIndex={-1} aria-label="달력" className="scroll-mt-4 rounded-xl border border-line bg-white p-3 outline-none sm:p-5">
      {status === "error" ? (
        <div role="alert" className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3.5">
          <p className="text-[17px] font-bold leading-7 text-red-700">{CALENDAR_LOAD_ERROR}</p>
          <button type="button" onClick={onReload} className={`${A_BTN_SECONDARY} mt-2`}>
            다시 불러오기
          </button>
        </div>
      ) : null}
      {above}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[20px] font-extrabold leading-[30px] text-ink" aria-live="polite">
            {y}년 {m}월
          </h2>
          {status === "loading" ? <span className="text-[15px] text-ink-3">불러오는 중…</span> : null}
        </div>
        <div className="flex gap-2">
          <button type="button" className={navBtn} aria-label="이전 달" disabled={prevDisabled} onClick={() => onMonthChange(addMonthKey(monthKey, -1))}>
            ◀
          </button>
          <button type="button" className={navBtn} aria-label="다음 달" onClick={() => onMonthChange(addMonthKey(monthKey, 1))}>
            ▶
          </button>
        </div>
      </div>
      {headExtra}
      <div className="mt-2 grid grid-cols-7 text-center text-[15px] font-bold leading-8 text-ink-3" aria-hidden="true">
        {DOW.map((d, i) => (
          <div key={d} className={i === 0 ? "text-rose-700" : undefined}>
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
        {cells.map((ymd, i) => {
          if (!ymd) return <div key={`b${i}`} aria-hidden="true" className="h-[60px] sm:h-[72px]" />;
          const day = parseInt(ymd.slice(8, 10), 10);
          const spec: CellSpec = status === "ok" ? cellFor(ymd) : { view: "dim", srState: status === "loading" ? "불러오는 중" : "예약 현황 없음", clickable: false };
          const v = spec.view;
          const isToday = ymd === today;
          return (
            <button
              key={ymd}
              type="button"
              aria-disabled={!spec.clickable || undefined}
              aria-label={`${m}월 ${day}일 ${DOW[dayOfWeek(ymd)]}요일, ${spec.srState}`}
              aria-current={isToday ? "date" : undefined}
              onClick={() => {
                if (spec.clickable) onPick(ymd);
              }}
              className={cn(
                "relative flex h-[60px] flex-col items-center justify-start rounded-lg pt-2 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky sm:h-[72px] sm:pt-2.5",
                !spec.clickable && "cursor-default",
                v === "available" && "bg-white hover:bg-slate-50",
                v === "booked" && "bg-slate-100",
                v === "closed" && "bg-rose-50",
                v === "chosen" && "bg-brand-soft shadow-[inset_0_0_0_2px_rgb(var(--brand-primary))]",
                v === "active" && "bg-brand",
                v === "between" && "bg-brand-soft",
                v === "prep" && "bg-white shadow-[inset_0_0_0_2px_rgb(var(--brand-accent))]"
              )}
            >
              <span
                className={cn(
                  "text-[18px] leading-6 tabular-nums",
                  (v === "past" || v === "dim") && "font-medium text-slate-300",
                  v === "blocked" && "font-medium text-ink-3",
                  v === "booked" && "font-medium text-slate-500",
                  v === "closed" && "font-bold text-rose-700",
                  (v === "available" || v === "between" || v === "prep") && "font-bold text-ink",
                  v === "chosen" && "font-bold text-brand",
                  v === "active" && "font-bold text-white",
                  isToday && v !== "active" && "underline decoration-accent decoration-2 underline-offset-4"
                )}
              >
                {day}
              </span>
              {spec.sub ? (
                <span
                  className={cn(
                    "mt-0.5 max-w-full break-keep px-0.5 text-center text-[12px] font-bold leading-[14px]",
                    v === "booked" && "text-slate-600",
                    v === "closed" && "text-rose-700",
                    v === "chosen" && "text-brand",
                    v === "active" && "text-white",
                    v === "prep" && "text-accent-ink"
                  )}
                >
                  {spec.sub}
                </span>
              ) : v === "available" ? (
                <span aria-hidden="true" className="mt-1.5 inline-block h-1.5 w-1.5 rounded-full bg-accent" />
              ) : null}
            </button>
          );
        })}
      </div>
      {below}
    </section>
  );
}

/** 범례 3개(02_ui_apply §2-3) — 칸과 같은 모양의 작은 견본 */
export function CalendarLegend({ extra }: { extra?: ReactNode }) {
  return (
    <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[15px] leading-6 text-ink-2" aria-label="달력 범례">
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
        신청 가능
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className="inline-flex h-5 items-center rounded bg-slate-100 px-1 text-[12px] font-bold text-slate-600">
          마감
        </span>
        예약 있음
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className="inline-flex h-5 items-center rounded bg-rose-50 px-1 text-[12px] font-bold text-rose-700">
          휴관
        </span>
        일요일·공휴일
      </li>
      {extra}
    </ul>
  );
}
