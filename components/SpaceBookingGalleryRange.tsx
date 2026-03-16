"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import Button from "@/components/ui/Button";
import { FieldHelp } from "@/components/ui/Field";
import { cn } from "@/lib/cn";
import { CARD_BASE } from "@/components/ui/presets";

function isYmd(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function toDateLocal(ymd: string) {
  const [y, m, d] = ymd.split("-").map((n) => parseInt(n, 10));
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function dateToYmdLocal(dt: Date) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startOfMonth(dt: Date) {
  return new Date(dt.getFullYear(), dt.getMonth(), 1);
}

function addMonths(dt: Date, delta: number) {
  return new Date(dt.getFullYear(), dt.getMonth() + delta, 1);
}

function getMonthLabel(dt: Date) {
  return `${dt.getFullYear()}.${String(dt.getMonth() + 1).padStart(2, "0")}`;
}

function dayOfWeekLocal(ymd: string): number {
  // local timezone 기준
  return toDateLocal(ymd).getDay();
}

function inRange(dateYmd: string, startYmd: string, endYmd: string) {
  return startYmd <= dateYmd && dateYmd <= endYmd;
}

const DOW_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;
function dowLabel(ymd: string): string {
  return DOW_LABELS[dayOfWeekLocal(ymd)] ?? "";
}

function diffDaysInclusive(startYmd: string, endYmd: string) {
  const s = toDateLocal(startYmd).getTime();
  const e = toDateLocal(endYmd).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e)) return 0;
  return Math.floor((e - s) / (24 * 60 * 60 * 1000)) + 1;
}

export default function SpaceBookingGalleryRange({ className }: { className?: string }) {
  const router = useRouter();

  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [error, setError] = useState<string>("");

  const [month, setMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [bookedDates, setBookedDates] = useState<Set<string>>(new Set());
  const [holidayMap, setHolidayMap] = useState<Map<string, string>>(new Map());

  // 월 변경 시 예약 마감 날짜 + 공휴일 조회
  useEffect(() => {
    const monthKey = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
    fetch(`/api/booked-dates?roomId=gallery&month=${monthKey}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && Array.isArray(data.bookedDates)) {
          setBookedDates(new Set(data.bookedDates));
        }
        if (Array.isArray(data.holidays)) {
          const m = new Map<string, string>();
          for (const h of data.holidays) m.set(h.date, h.name);
          setHolidayMap(m);
        } else {
          setHolidayMap(new Map());
        }
      })
      .catch(() => {});
  }, [month]);

  const days = useMemo(() => {
    if (!isYmd(startDate) || !isYmd(endDate) || endDate < startDate) return 0;
    return diffDaysInclusive(startDate, endDate);
  }, [startDate, endDate]);

  // 기본 준비일 계산: 시작일 이전 1일(일요일·예약 마감일이면 직전 영업일)
  const defaultPrepDate = useMemo(() => {
    if (!isYmd(startDate)) return "";
    let prepYmd = dateToYmdLocal(new Date(toDateLocal(startDate).getFullYear(), toDateLocal(startDate).getMonth(), toDateLocal(startDate).getDate() - 1));
    let safety = 0;
    while (isYmd(prepYmd) && safety++ < 30) {
      if (dayOfWeekLocal(prepYmd) !== 0 && !bookedDates.has(prepYmd) && !holidayMap.has(prepYmd)) break;
      const d = toDateLocal(prepYmd);
      d.setDate(d.getDate() - 1);
      prepYmd = dateToYmdLocal(d);
    }
    if (isYmd(prepYmd) && prepYmd < startDate && dayOfWeekLocal(prepYmd) !== 0 && !bookedDates.has(prepYmd) && !holidayMap.has(prepYmd)) return prepYmd;
    return "";
  }, [startDate, bookedDates, holidayMap]);

  // 대관료 자동 계산: 평일 20,000원/일, 토요일 10,000원/일, 준비일 무료
  const feeBreakdown = useMemo(() => {
    if (!isYmd(startDate) || !isYmd(endDate) || endDate < startDate) {
      return { weekdays: 0, saturdays: 0, prepDays: 0, total: 0 };
    }

    let weekdays = 0;
    let saturdays = 0;
    const prepDays = defaultPrepDate ? 1 : 0;

    // 전시 기간 카운트
    let cur = startDate;
    let guard = 0;
    while (cur <= endDate && guard++ < 400) {
      const dow = dayOfWeekLocal(cur);
      if (dow !== 0) {
        if (dow === 6) saturdays++;
        else weekdays++;
      }
      const d = toDateLocal(cur);
      d.setDate(d.getDate() + 1);
      cur = dateToYmdLocal(d);
    }

    const total = weekdays * 20000 + saturdays * 10000;
    return { weekdays, saturdays, prepDays, total };
  }, [startDate, endDate, defaultPrepDate]);

  const canSubmit = Boolean(startDate) && Boolean(endDate) && !error;

  function clearRange() {
    setStartDate("");
    setEndDate("");
    setError("");
  }

  function validate(nextStart: string, nextEnd: string) {
    if (!nextStart || !nextEnd) {
      setError("");
      return;
    }
    if (!isYmd(nextStart) || !isYmd(nextEnd)) {
      setError("날짜 형식을 확인해 주세요.");
      return;
    }
    if (nextEnd < nextStart) {
      setError("종료일은 시작일보다 빠를 수 없습니다.");
      return;
    }
    const d = diffDaysInclusive(nextStart, nextEnd);
    if (d > 30) {
      setError("전시 기간은 최대 30일까지 신청할 수 있습니다.");
      return;
    }
    setError("");
  }

  function trySetRange(nextStart: string, nextEnd: string) {
    setStartDate(nextStart);
    setEndDate(nextEnd);
    validate(nextStart, nextEnd);
  }

  function onPickDay(dateYmd: string) {
    if (!isYmd(dateYmd)) return;
    // 일요일은 자동 제외 대상이므로 시작/종료 선택에서 제외(안내)
    if (dayOfWeekLocal(dateYmd) === 0) {
      setError("일요일은 전시일로 선택할 수 없습니다. (일요일은 자동 제외됩니다)");
      return;
    }

    setError("");

    if (!startDate || (startDate && endDate)) {
      // 시작일과 종료일이 모두 선택된 상태에서 같은 시작일 클릭 → 전체 초기화
      if (startDate && endDate && dateYmd === startDate) {
        clearRange();
        return;
      }
      trySetRange(dateYmd, "");
      return;
    }

    // start만 있는 상태에서 end 선택
    const s = startDate;
    const e = dateYmd;
    const nextStart = e < s ? e : s;
    const nextEnd = e < s ? s : e;

    const d = diffDaysInclusive(nextStart, nextEnd);
    if (d > 30) {
      setError("전시 기간은 최대 30일까지 신청할 수 있습니다.");
      return;
    }

    trySetRange(nextStart, nextEnd);
  }

  function goApply() {
    validate(startDate, endDate);
    if (!canSubmit) return;
    const qs = new URLSearchParams({ roomId: "gallery", startDate, endDate });
    router.push(`/apply?${qs.toString()}`);
  }

  const monthGrid = useMemo(() => {
    const first = startOfMonth(month);
    const year = first.getFullYear();
    const m = first.getMonth();

    const firstDow = first.getDay(); // 0=Sun
    const lastDay = new Date(year, m + 1, 0).getDate();

    const cells: Array<{ ymd: string; day: number; inMonth: boolean }> = [];

    // 이전 달 날짜로 첫 줄 채우기 (강의실 캘린더와 동일)
    const prevMonthLast = new Date(year, m, 0).getDate();
    for (let i = firstDow - 1; i >= 0; i--) {
      const d = prevMonthLast - i;
      const ymd = dateToYmdLocal(new Date(year, m - 1, d));
      cells.push({ ymd, day: d, inMonth: false });
    }

    for (let d = 1; d <= lastDay; d++) {
      const ymd = dateToYmdLocal(new Date(year, m, d));
      cells.push({ ymd, day: d, inMonth: true });
    }

    // 다음 달 날짜로 마지막 줄 채우기
    let nextDay = 1;
    while (cells.length % 7 !== 0) {
      const ymd = dateToYmdLocal(new Date(year, m + 1, nextDay));
      cells.push({ ymd, day: nextDay, inMonth: false });
      nextDay++;
    }

    return cells;
  }, [month]);

  function isCellDisabled(ymd: string) {
    if (!isYmd(ymd)) return true;
    // 일요일·공휴일은 선택 불가
    if (dayOfWeekLocal(ymd) === 0) return true;
    if (holidayMap.has(ymd)) return true;
    // 예약 마감 날짜는 선택 불가
    if (bookedDates.has(ymd)) return true;
    // 과거 및 당일 선택 불가 (준비일이 과거가 되므로 익일부터 선택 가능)
    if (ymd <= dateToYmdLocal(new Date())) return true;

    // 시작일만 선택된 상태: 시작일 이전은 비활성, 최대 30일(포함) 초과는 비활성
    if (isYmd(startDate) && !isYmd(endDate)) {
      if (ymd < startDate) return true;
      if (diffDaysInclusive(startDate, ymd) > 30) return true;
    }

    // 시작/종료 모두 선택된 상태: 범위 밖은 비활성 (단, 시작일은 재클릭으로 초기화 가능)
    if (isYmd(startDate) && isYmd(endDate)) {
      if (ymd === startDate) return false;
      if (!inRange(ymd, startDate, endDate)) return true;
    }

    return false;
  }

  return (
    <div className={cn(CARD_BASE, "p-5", className)}>
      <div className="rounded-lg border bg-slate-50 p-4 text-sm text-slate-700">
        <p className="font-semibold">우리동네 갤러리(4층) 신청 안내</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
          <li>우리동네 갤러리는 <span className="font-semibold">일 단위</span>로 신청합니다. (시간 선택 없음)</li>
          <li>일요일은 자동 제외되며, 공휴일은 자동 제외되지 않습니다(차단시간으로 관리).</li>
          <li>준비(세팅)일 1일은 <span className="font-semibold">무료</span>로 포함됩니다. (신청서에서 날짜 선택 가능)</li>
          <li>전시 기간은 최대 30일까지 신청할 수 있습니다.</li>
          <li>전시 마지막 날 <span className="font-semibold">17시까지 철수 완료</span> 필수</li>
        </ul>
      </div>

      <div className="mt-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-lg font-semibold">{getMonthLabel(month)}</div>
            <span className={cn(
              "rounded-full px-2.5 py-0.5 text-[11px] font-bold",
              startDate ? "border border-[rgb(var(--brand-primary))] bg-[rgb(var(--brand-primary)/0.06)] text-[rgb(var(--brand-primary))]" : "border border-slate-200 bg-white text-slate-400"
            )}>
              시작: {startDate || "-"}
            </span>
            <span className={cn(
              "rounded-full px-2.5 py-0.5 text-[11px] font-bold",
              endDate ? "border border-[rgb(var(--brand-primary))] bg-[rgb(var(--brand-primary)/0.06)] text-[rgb(var(--brand-primary))]" : "border border-slate-200 bg-white text-slate-400"
            )}>
              종료: {endDate || "-"}
            </span>
            {startDate ? (
              <button
                type="button"
                onClick={clearRange}
                className="rounded-md border bg-white px-2 py-1 text-xs text-slate-600 hover:bg-gray-50"
              >
                초기화
              </button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMonth((prev) => addMonths(prev, -1))}
              className="rounded-md border bg-white px-2 py-1 text-sm hover:bg-gray-50"
              aria-label="이전 달"
            >
              ◀
            </button>
            <button
              type="button"
              onClick={() => setMonth(startOfMonth(new Date()))}
              className="rounded-md border bg-white px-2 py-1 text-sm hover:bg-gray-50"
            >
              오늘
            </button>
            <button
              type="button"
              onClick={() => setMonth((prev) => addMonths(prev, 1))}
              className="rounded-md border bg-white px-2 py-1 text-sm hover:bg-gray-50"
              aria-label="다음 달"
            >
              ▶
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border bg-white">
          <div className="grid grid-cols-7 border-b bg-gray-50 text-center text-xs font-semibold text-gray-700">
            {["일", "월", "화", "수", "목", "금", "토"].map((w) => (
              <div key={w} className={`py-2${w === "일" ? " text-rose-500" : w === "토" ? " text-blue-600" : ""}`}>{w}</div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {monthGrid.map((c, idx) => {
              const isSunday = c.inMonth && dayOfWeekLocal(c.ymd) === 0;
              const isToday = c.inMonth && c.ymd === dateToYmdLocal(new Date());
              const isStart = c.inMonth && c.ymd === startDate;
              const isEnd = c.inMonth && c.ymd === endDate;
              const isBetween = c.inMonth && startDate && endDate ? inRange(c.ymd, startDate, endDate) : false;
              const isPrep = c.inMonth && defaultPrepDate && c.ymd === defaultPrepDate;
              const disabled = !c.inMonth || isCellDisabled(c.ymd);
              const isSelected = isStart || isEnd;

              return (
                <button
                  key={`${c.ymd || idx}`}
                  type="button"
                  disabled={disabled}
                  onClick={() => c.inMonth ? onPickDay(c.ymd) : undefined}
                  className={cn(
                    "relative flex h-20 flex-col items-center justify-center border-b border-r text-sm transition",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--brand-primary))]",
                    !c.inMonth && "bg-gray-50 text-gray-300 cursor-default",
                    c.inMonth && !disabled && !isSelected && !isBetween && !isPrep && "bg-white text-slate-900 hover:bg-slate-50",
                    c.inMonth && disabled && !isSelected && !isPrep && "cursor-not-allowed bg-white opacity-50",
                    isSelected && "z-10 bg-orange-50 ring-2 ring-orange-400 ring-inset",
                    isBetween && !isSelected && "bg-blue-50",
                    isPrep && !isSelected && !isBetween && "bg-emerald-50 ring-2 ring-emerald-300 ring-inset",
                  )}
                  aria-pressed={isSelected}
                >
                  <span className={cn("font-medium", isToday && "text-[rgb(var(--brand-primary))]")}>{c.day || ""}</span>
                  {c.inMonth && (
                    <div className="mt-1 flex items-center gap-1">
                      {isPrep ? (
                        <span className="text-[9px] font-bold text-emerald-700">준비</span>
                      ) : (isSunday || holidayMap.has(c.ymd)) ? (
                        <span className="inline-block h-2.5 w-2.5 rounded-full bg-rose-400" title={holidayMap.get(c.ymd) ?? "휴관"} />
                      ) : bookedDates.has(c.ymd) ? (
                        <span className="inline-block h-2.5 w-2.5 rounded-full bg-gray-400" title="마감" />
                      ) : isStart ? (
                        <span className="text-[9px] font-bold text-orange-600">시작</span>
                      ) : isEnd && !isStart ? (
                        <span className="text-[9px] font-bold text-orange-600">종료</span>
                      ) : isBetween ? (
                        <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-400" />
                      ) : c.ymd < dateToYmdLocal(new Date()) ? (
                        <span className="inline-block h-2.5 w-2.5 rounded-full bg-gray-400" title="마감" />
                      ) : (
                        <span className="inline-block h-2.5 w-2.5 rounded-full bg-orange-500" />
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-600">
          <div className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-orange-500" aria-hidden />
            <span>선택 가능</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-400" aria-hidden />
            <span>선택 기간</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm border border-emerald-300 bg-emerald-50" aria-hidden />
            <span>준비일</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-gray-300" aria-hidden />
            <span>휴관</span>
          </div>
        </div>

        <p className="mt-2 text-xs text-gray-500">
          ※ 날짜를 클릭하여 시작일과 종료일을 선택 · 일요일 휴관 · 최대 30일
          {startDate && !endDate ? <><br />※ <b>종료일</b>을 선택해 주세요.</> : null}
        </p>
      </div>

      <div className="mt-2">
        {error ? <p className="text-sm font-semibold text-red-600">{error}</p> : null}
        {!error && days > 0 ? (
          <div className="space-y-1">
            <FieldHelp>선택 기간: {days}일 (일요일 자동 제외)</FieldHelp>
            {defaultPrepDate && (
              <FieldHelp>
                준비일: {defaultPrepDate} ({dowLabel(defaultPrepDate)}) — 신청서에서 변경 가능
              </FieldHelp>
            )}
          </div>
        ) : null}
      </div>

      {/* 대관료 자동 계산 */}
      {!error && days > 0 && (feeBreakdown.weekdays > 0 || feeBreakdown.saturdays > 0) && (
        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-blue-50/80 via-white to-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5">
            <span className="text-base">💰</span>
            <span className="text-sm font-bold text-slate-800">예상 대관료</span>
          </div>
          <div className="px-4 py-3">
            <div className="space-y-2">
              {feeBreakdown.weekdays > 0 && (
                <div className="flex items-center justify-between text-sm text-slate-600">
                  <span>평일 {feeBreakdown.weekdays}일 × 20,000원</span>
                  <span className="font-semibold text-slate-800">{(feeBreakdown.weekdays * 20000).toLocaleString()}원</span>
                </div>
              )}
              {feeBreakdown.saturdays > 0 && (
                <div className="flex items-center justify-between text-sm text-slate-600">
                  <span>토요일 {feeBreakdown.saturdays}일 × 10,000원</span>
                  <span className="font-semibold text-slate-800">{(feeBreakdown.saturdays * 10000).toLocaleString()}원</span>
                </div>
              )}
              {feeBreakdown.prepDays > 0 && defaultPrepDate && (
                <div className="flex items-center justify-between text-sm text-emerald-600">
                  <span>준비일 {feeBreakdown.prepDays}일 ({defaultPrepDate} {dowLabel(defaultPrepDate)})</span>
                  <span className="font-medium">무료</span>
                </div>
              )}
            </div>
            <div className="mt-3 flex items-center justify-between rounded-xl bg-[rgb(var(--brand-primary)/0.06)] px-4 py-3">
              <span className="text-sm font-bold text-slate-900">합계</span>
              <span className="text-lg font-extrabold text-[rgb(var(--brand-primary))]">{feeBreakdown.total.toLocaleString()}원</span>
            </div>
            <p className="mt-2 text-[11px] text-slate-400">※ 할인 및 바우처 적용 불가</p>
          </div>
        </div>
      )}

      <div className="mt-5">
        <Button type="button" className="w-full" disabled={!canSubmit} onClick={goApply}>
          대관 신청서 작성하기
        </Button>
      </div>
    </div>
  );
}
