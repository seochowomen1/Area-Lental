"use client";

import { useMemo, useState } from "react";
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

  const days = useMemo(() => {
    if (!isYmd(startDate) || !isYmd(endDate) || endDate < startDate) return 0;
    return diffDaysInclusive(startDate, endDate);
  }, [startDate, endDate]);

  // 대관비 자동 계산: 평일 20,000원/일, 토요일 10,000원/일, 준비일 무료
  const feeBreakdown = useMemo(() => {
    if (!isYmd(startDate) || !isYmd(endDate) || endDate < startDate) {
      return { weekdays: 0, saturdays: 0, prepDays: 0, total: 0 };
    }

    // 준비일: 시작일 이전 1일(일요일이면 직전 영업일)
    let prepYmd = dateToYmdLocal(new Date(toDateLocal(startDate).getFullYear(), toDateLocal(startDate).getMonth(), toDateLocal(startDate).getDate() - 1));
    while (isYmd(prepYmd) && dayOfWeekLocal(prepYmd) === 0) {
      const d = toDateLocal(prepYmd);
      d.setDate(d.getDate() - 1);
      prepYmd = dateToYmdLocal(d);
    }

    let weekdays = 0;
    let saturdays = 0;
    let prepDays = 0;

    // 준비일 카운트
    if (isYmd(prepYmd) && prepYmd < startDate && dayOfWeekLocal(prepYmd) !== 0) {
      prepDays = 1;
    }

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
  }, [startDate, endDate]);

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

    // leading blanks
    for (let i = 0; i < firstDow; i++) {
      cells.push({ ymd: "", day: 0, inMonth: false });
    }

    for (let d = 1; d <= lastDay; d++) {
      const ymd = dateToYmdLocal(new Date(year, m, d));
      cells.push({ ymd, day: d, inMonth: true });
    }

    // trailing to 6 rows
    while (cells.length % 7 !== 0) cells.push({ ymd: "", day: 0, inMonth: false });
    while (cells.length < 42) cells.push({ ymd: "", day: 0, inMonth: false });

    return cells;
  }, [month]);

  function isCellDisabled(ymd: string) {
    if (!isYmd(ymd)) return true;
    // 일요일은 선택 불가
    if (dayOfWeekLocal(ymd) === 0) return true;

    // 시작일만 선택된 상태: 시작일 이전은 비활성, 최대 30일(포함) 초과는 비활성
    if (isYmd(startDate) && !isYmd(endDate)) {
      if (ymd < startDate) return true;
      if (diffDaysInclusive(startDate, ymd) > 30) return true;
    }

    // 시작/종료 모두 선택된 상태: 범위 밖은 비활성
    if (isYmd(startDate) && isYmd(endDate)) {
      if (!inRange(ymd, startDate, endDate)) return true;
    }

    return false;
  }

  return (
    <div className={cn(CARD_BASE, "p-5", className)}>
      <div className="rounded-lg border bg-slate-50 p-4 text-sm text-slate-700">
        <p className="font-semibold">우리동네 갤러리(4층) 신청 안내</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
          <li>갤러리는 <span className="font-semibold">일 단위</span>로 신청합니다. (시간 선택 없음)</li>
          <li>일요일은 자동 제외되며, 공휴일은 자동 제외되지 않습니다(차단시간으로 관리).</li>
          <li>준비(세팅)일 1일은 무료로 자동 포함됩니다. (시작일 이전, 일요일이면 더 이전)</li>
          <li>전시 기간은 최대 30일까지 신청할 수 있습니다.</li>
          <li>전시 마지막 날 <span className="font-semibold">17시까지 철수 완료</span> 필수</li>
        </ul>
      </div>

      <div className="mt-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-900">전시 기간</span>
            <span className={cn(
              "rounded-full px-3 py-1 text-xs font-bold",
              startDate ? "border border-[rgb(var(--brand-primary))] bg-[rgb(var(--brand-primary)/0.06)] text-[rgb(var(--brand-primary))]" : "border border-slate-200 bg-white text-slate-500"
            )}>
              시작: {startDate || "-"}
            </span>
            <span className={cn(
              "rounded-full px-3 py-1 text-xs font-bold",
              endDate ? "border border-[rgb(var(--brand-primary))] bg-[rgb(var(--brand-primary)/0.06)] text-[rgb(var(--brand-primary))]" : "border border-slate-200 bg-white text-slate-500"
            )}>
              종료: {endDate || "-"}
            </span>
            {startDate && !endDate ? (
              <span className="text-xs text-slate-500">종료일을 선택해 주세요.</span>
            ) : null}

            {startDate ? (
              <button
                type="button"
                onClick={clearRange}
                className="ml-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                기간 다시 선택
              </button>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMonth((prev) => addMonths(prev, -1))}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              aria-label="이전 달"
            >
              ◀
            </button>
            <div className="min-w-[90px] text-center text-sm font-semibold text-slate-900">{getMonthLabel(month)}</div>
            <button
              type="button"
              onClick={() => setMonth((prev) => addMonths(prev, 1))}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              aria-label="다음 달"
            >
              ▶
            </button>
          </div>
        </div>

        <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-500">
            {["일", "월", "화", "수", "목", "금", "토"].map((w) => (
              <div key={w} className={cn(w === "일" ? "text-rose-500" : "", "py-1")}>{w}</div>
            ))}
          </div>

          <div className="mt-1 grid grid-cols-7 gap-1">
            {monthGrid.map((c, idx) => {
              if (!c.inMonth) {
                return <div key={idx} className="h-14" />;
              }
              const isSunday = dayOfWeekLocal(c.ymd) === 0;
              const isStart = c.ymd === startDate;
              const isEnd = c.ymd === endDate;
              const isBetween = startDate && endDate ? inRange(c.ymd, startDate, endDate) : false;

              const disabled = isCellDisabled(c.ymd);
              const isSelected = isStart || isEnd;

              let cellStyle = "border-slate-200 bg-white text-slate-900 hover:bg-slate-50";
              if (disabled) {
                cellStyle = "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300";
              } else if (isSelected) {
                cellStyle = "border-orange-500 bg-orange-500 text-white shadow-md ring-2 ring-orange-200";
              } else if (isBetween) {
                cellStyle = "border-blue-200 bg-blue-50 text-blue-900";
              }

              return (
                <button
                  key={c.ymd}
                  type="button"
                  disabled={disabled}
                  onClick={() => onPickDay(c.ymd)}
                  className={cn(
                    "relative flex h-14 flex-col items-center justify-center rounded-xl border text-sm font-bold transition",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400",
                    cellStyle
                  )}
                  aria-pressed={isSelected}
                >
                  <span className={cn("text-base", isSelected && !disabled ? "text-white" : "")}>
                    {c.day}
                  </span>
                  {isSunday ? (
                    <span className="text-[9px] font-medium text-slate-300">
                      휴관
                    </span>
                  ) : null}
                  {isStart && !disabled ? (
                    <span className="text-[9px] font-bold text-orange-100">시작</span>
                  ) : null}
                  {isEnd && !disabled && !isStart ? (
                    <span className="text-[9px] font-bold text-orange-100">종료</span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="mt-3 text-xs text-slate-500">
            날짜를 클릭하여 시작일과 종료일을 선택합니다. 선택된 기간은 달력에서 함께 표시됩니다. (일요일은 선택 불가)
          </div>
        </div>
      </div>

      <div className="mt-2">
        {error ? <p className="text-sm font-semibold text-red-600">{error}</p> : null}
        {!error && days > 0 ? <FieldHelp>선택 기간: {days}일 (일요일 제외/준비일 포함은 서버에서 자동 계산됩니다)</FieldHelp> : null}
      </div>

      {/* 대관비 자동 계산 */}
      {!error && days > 0 && (feeBreakdown.weekdays > 0 || feeBreakdown.saturdays > 0) && (
        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-blue-50/80 via-white to-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5">
            <span className="text-base">💰</span>
            <span className="text-sm font-bold text-slate-800">예상 대관비</span>
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
              {feeBreakdown.prepDays > 0 && (
                <div className="flex items-center justify-between text-sm text-slate-400">
                  <span>준비일 {feeBreakdown.prepDays}일</span>
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
