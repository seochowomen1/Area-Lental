"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { todayYmdSeoul } from "@/lib/datetime";

/* ── 유틸 ────────────────────────────────────────────── */
function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function fmtYMD(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function addMonths(d: Date, delta: number) {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1);
}

function getCalendarGrid(monthStart: Date) {
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const first = new Date(year, month, 1);
  const startDow = first.getDay();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const days: Date[] = [];

  const prevMonthLast = new Date(year, month, 0).getDate();
  for (let i = startDow - 1; i >= 0; i--) {
    days.push(new Date(year, month - 1, prevMonthLast - i));
  }
  for (let d = 1; d <= lastDay; d++) {
    days.push(new Date(year, month, d));
  }
  let nextDay = 1;
  while (days.length % 7 !== 0) {
    days.push(new Date(year, month + 1, nextDay++));
  }
  return days;
}

const DOW_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

function dateAriaLabel(d: Date, extra?: string) {
  const label = `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${DOW_NAMES[d.getDay()]}요일`;
  return extra ? `${label}, ${extra}` : label;
}

/* ── 컴포넌트 ────────────────────────────────────────── */
/**
 * 신청 폼용 컴팩트 달력 날짜 선택기.
 * 공휴일·일요일·마감일을 시각적으로 표시하고 선택을 차단합니다.
 */
export default function DatePickerCalendar({
  value,
  onChange,
  roomId,
  disabled,
}: {
  value: string; // "YYYY-MM-DD" 또는 ""
  onChange: (ymd: string) => void;
  roomId?: string; // 선택된 공간 ID (마감 조회용)
  disabled?: boolean;
}) {
  const [month, setMonth] = useState(() => {
    if (value) {
      const [y, m] = value.split("-").map(Number);
      return new Date(y, m - 1, 1);
    }
    return new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  });

  const days = useMemo(() => getCalendarGrid(month), [month]);
  const [holidayMap, setHolidayMap] = useState<Map<string, string>>(new Map());
  const [bookedDates, setBookedDates] = useState<Set<string>>(new Set());

  // 월 변경 시 공휴일 + 마감일 조회
  useEffect(() => {
    if (!roomId) {
      // roomId 없으면 공휴일만 조회
      const monthKey = `${month.getFullYear()}-${pad2(month.getMonth() + 1)}`;
      fetch(`/api/booked-dates?roomId=lecture-4&month=${monthKey}`)
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data.holidays)) {
            const m = new Map<string, string>();
            for (const h of data.holidays) m.set(h.date, h.name);
            setHolidayMap(m);
          } else {
            setHolidayMap(new Map());
          }
          setBookedDates(new Set());
        })
        .catch(() => {});
      return;
    }

    const monthKey = `${month.getFullYear()}-${pad2(month.getMonth() + 1)}`;
    fetch(`/api/booked-dates?roomId=${encodeURIComponent(roomId)}&month=${monthKey}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.holidays)) {
          const m = new Map<string, string>();
          for (const h of data.holidays) m.set(h.date, h.name);
          setHolidayMap(m);
        } else {
          setHolidayMap(new Map());
        }
        if (data.ok && Array.isArray(data.bookedDates)) {
          setBookedDates(new Set(data.bookedDates));
        } else {
          setBookedDates(new Set());
        }
      })
      .catch(() => {});
  }, [month, roomId]);

  const monthLabel = `${month.getFullYear()}.${pad2(month.getMonth() + 1)}`;
  const todayYmd = todayYmdSeoul();

  return (
    <div className={cn("select-none", disabled && "pointer-events-none opacity-50")}>
      {/* 헤더: 월 네비게이션 */}
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-800">{monthLabel}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="rounded border bg-white px-1.5 py-0.5 text-xs hover:bg-slate-50"
            onClick={() => setMonth((m) => addMonths(m, -1))}
            aria-label="이전 달"
          >
            ◀
          </button>
          <button
            type="button"
            className="rounded border bg-white px-1.5 py-0.5 text-xs hover:bg-slate-50"
            onClick={() => {
              const today = new Date();
              setMonth(new Date(today.getFullYear(), today.getMonth(), 1));
            }}
            aria-label="오늘로 이동"
          >
            오늘
          </button>
          <button
            type="button"
            className="rounded border bg-white px-1.5 py-0.5 text-xs hover:bg-slate-50"
            onClick={() => setMonth((m) => addMonths(m, 1))}
            aria-label="다음 달"
          >
            ▶
          </button>
        </div>
      </div>

      {/* 달력 그리드 */}
      <div className="overflow-hidden rounded-lg border bg-white" role="grid" aria-label={`${monthLabel} 달력`}>
        <div className="grid grid-cols-7 border-b bg-slate-50 text-center text-xs font-semibold text-slate-600" role="row">
          {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
            <div key={d} role="columnheader" className={cn("py-1.5", d === "일" && "text-rose-700")}>
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {days.map((d) => {
            const ymd = fmtYMD(d);
            const isCurrentMonth = d.getMonth() === month.getMonth();
            const isSelected = ymd === value;
            const isToday = ymd === todayYmd;
            const isPast = ymd < todayYmd;
            const isSunday = d.getDay() === 0;
            const isHoliday = holidayMap.has(ymd);
            const holidayName = holidayMap.get(ymd);
            const isBooked = bookedDates.has(ymd);
            const isDisabled = !isCurrentMonth || isPast || isSunday || isHoliday || isBooked;
            // 칸 상태(02_ui §4-1과 같은 순서: 지난 날짜 > 휴관 > 공휴일 > 마감 > 선택 > 선택 가능)
            const view = !isCurrentMonth ? "other" : isPast ? "past" : isSunday ? "closed" : isHoliday ? "holiday" : isBooked ? "booked" : isSelected ? "selected" : "available";

            const statusHint = view === "other" ? "" : view === "selected" ? "선택" : view === "closed" ? "휴관" : view === "holiday" ? (holidayName ?? "공휴일") : view === "booked" ? "마감" : view === "past" ? "지난 날짜" : "선택 가능";

            return (
              <button
                key={ymd}
                type="button"
                disabled={isDisabled}
                onClick={() => onChange(ymd)}
                aria-label={dateAriaLabel(d, statusHint)}
                aria-current={isToday && isCurrentMonth ? "date" : undefined}
                aria-pressed={isSelected || undefined}
                className={cn(
                  "relative flex min-h-[48px] flex-col items-center justify-start border-b border-r border-line pt-1.5 transition",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky",
                  isDisabled && "cursor-default",
                  (view === "other" || view === "past") && "bg-white",
                  (view === "closed" || view === "holiday") && "bg-rose-50",
                  view === "booked" && "bg-slate-100",
                  view === "available" && "bg-white hover:bg-slate-50",
                  view === "selected" && "z-10 bg-brand-soft shadow-[inset_0_0_0_2px_rgb(var(--brand-primary))]",
                )}
              >
                {view !== "other" && (
                  <span
                    className={cn(
                      "text-[15px] tabular-nums leading-5",
                      view === "past" && "font-medium text-slate-300",
                      (view === "closed" || view === "holiday") && "font-semibold text-rose-700",
                      view === "booked" && "font-medium text-slate-500",
                      view === "selected" && "font-bold text-brand",
                      view === "available" && "font-bold text-ink",
                      isToday && "underline decoration-accent decoration-2 underline-offset-4",
                    )}
                  >
                    {d.getDate()}
                  </span>
                )}
                {view === "available" && <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />}
                {view === "closed" && <span className="text-xs leading-4 text-rose-700">휴관</span>}
                {view === "holiday" && <span className="text-xs leading-4 text-rose-700">공휴일</span>}
                {view === "booked" && <span className="text-xs leading-4 text-slate-600">마감</span>}
                {view === "selected" && <span className="text-xs font-bold leading-4 text-brand">선택</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* 범례 */}
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-2" aria-hidden="true">
        <div className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
          <span>선택 가능</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-flex h-4 items-center rounded-sm bg-slate-100 px-1 text-slate-600">마감</span>
          <span>= 예약 완료</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-flex h-4 items-center rounded-sm bg-rose-50 px-1 text-rose-700">휴관</span>
          <span>= 일요일·공휴일</span>
        </div>
        <div className="flex items-center gap-1">
          <span>흐린 숫자 = 지난 날짜</span>
        </div>
      </div>
    </div>
  );
}
