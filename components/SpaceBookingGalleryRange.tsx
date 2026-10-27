"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import Button from "@/components/ui/Button";
import { FieldHelp } from "@/components/ui/Field";
import HolidayUnavailableNotice from "@/components/HolidayUnavailableNotice";
import { cn } from "@/lib/cn";
import { CARD_BASE } from "@/components/ui/presets";
import { GALLERY_FEE_KRW } from "@/lib/constants";
import { todayYmdSeoul } from "@/lib/datetime";
import { countGallerySelectableDays, galleryBaseDayState, galleryPrepAfterText } from "@/lib/galleryCalendar";
import { defaultPrepDate as computeDefaultPrepDate, planGallery } from "@/lib/galleryPlan";
import { formatExcludedHolidays, galleryMonthsForRange, useGalleryMonthData } from "@/lib/useGalleryMonthData";

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
  /** 다른 신청의 준비일만 잡힌 날 — 우리 전시의 마지막 날(종료일)로만 선택 가능 */
  const [prepOnlyDates, setPrepOnlyDates] = useState<Set<string>>(new Set());
  const [holidayMap, setHolidayMap] = useState<Map<string, string>>(new Map());
  /** 서버 기준 오늘(KST) — 지난 날짜 판정은 브라우저 시계 대신 이 값(03_api 1-1) */
  const [serverToday, setServerToday] = useState<string>("");
  /** 서버가 같은 규칙(lib/galleryCalendar)으로 센 이번 달 신청 가능한 날 */
  const [serverAvailable, setServerAvailable] = useState<number | null>(null);
  const [monthLoaded, setMonthLoaded] = useState(false);

  // 월 변경 시 예약 마감 날짜 + 공휴일 조회
  useEffect(() => {
    const monthKey = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
    let alive = true;
    setMonthLoaded(false);
    fetch(`/api/booked-dates?roomId=gallery&month=${monthKey}`)
      .then((r) => r.json())
      .then((data) => {
        if (!alive) return;
        if (data.ok && Array.isArray(data.bookedDates)) {
          setBookedDates(new Set(data.bookedDates));
        }
        setPrepOnlyDates(new Set(Array.isArray(data.prepOnlyDates) ? data.prepOnlyDates : []));
        if (Array.isArray(data.holidays)) {
          const m = new Map<string, string>();
          for (const h of data.holidays) m.set(h.date, h.name);
          setHolidayMap(m);
        } else {
          setHolidayMap(new Map());
        }
        if (typeof data.today === "string" && isYmd(data.today)) setServerToday(data.today);
        setServerAvailable(typeof data.availableDayCount === "number" ? data.availableDayCount : null);
        setMonthLoaded(true);
      })
      .catch(() => {
        if (alive) setMonthLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [month]);

  const today = serverToday || todayYmdSeoul();
  const monthKey = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
  const holidaySetForMonth = useMemo(() => new Set(holidayMap.keys()), [holidayMap]);
  const calCtx = useMemo(
    () => ({ today, booked: bookedDates, holidays: holidaySetForMonth }),
    [today, bookedDates, holidaySetForMonth]
  );
  /** 이번 달 신청 가능한 날 N일 — 주황 점 수와 같은 함수(countGallerySelectableDays) */
  const availableCount = serverAvailable ?? countGallerySelectableDays(monthKey, calCtx);

  // ★ [3] 선택 기간(준비일 후보 포함)이 걸친 달의 공휴일·예약 현황 — 회차·금액은 planGallery() 한 곳에서 계산
  const rangeMonths = useMemo(() => galleryMonthsForRange(startDate, endDate), [startDate, endDate]);
  const rangeData = useGalleryMonthData(rangeMonths);
  const rangeHolidays = rangeData.holidaySet;
  const holidaysPending = rangeData.status === "loading";

  // 기본 준비일 계산 (준비·철거 규정 2026-10-19)
  // - 시작일 직전 운영일(일요일·공휴일만 건너뜀). 마감일을 피해 더 이전으로 밀지 않는다.
  // - 그날이 기존 전시의 마지막 날이면 "철거 후 17:00(토 11:00) 이후" 준비
  // - 그날이 지났거나(오늘 포함) 전시 중간·내부 차단이면 준비일 없음
  const prepInfo = useMemo(() => {
    if (!isYmd(startDate)) return { date: "", afterExhibition: false };
    const prepYmd = computeDefaultPrepDate(startDate, rangeHolidays);
    if (!isYmd(prepYmd) || prepYmd <= today) return { date: "", afterExhibition: false };
    if (rangeData.booked.has(prepYmd)) {
      if (rangeData.exhibitionEnds.has(prepYmd)) return { date: prepYmd, afterExhibition: true };
      return { date: "", afterExhibition: false };
    }
    return { date: prepYmd, afterExhibition: false };
  }, [startDate, rangeHolidays, rangeData.booked, rangeData.exhibitionEnds, today]);
  const defaultPrepDate = prepInfo.date;
  /** 준비일 둘째 줄(앞 전시 철거일과 겹칠 때만) — PC "17:00 이후" */
  const prepAfterLabel = prepInfo.afterExhibition ? galleryPrepAfterText(prepInfo.date) : "";
  /** 휴대폰 칸 폭(약 47px)에 맞춘 짧은 표기 "17:00~"(02_ui §4-3) — 전체 문장은 아래 요약 줄 */
  const prepAfterShort = prepAfterLabel ? `${prepAfterLabel.replace(" 이후", "")}~` : "";

  // 이용료: planGallery()(평일·토 일수 × GALLERY_FEE_KRW · 준비일 무료) — 신청서·서버와 같은 함수
  const plan = useMemo(
    () => planGallery({ startDate, endDate, prepDate: defaultPrepDate || null, prepAfterExhibition: prepInfo.afterExhibition, holidays: rangeHolidays }),
    [startDate, endDate, defaultPrepDate, prepInfo.afterExhibition, rangeHolidays]
  );
  const days = plan.exhibitionDayCount;
  const feeBreakdown = {
    weekdays: plan.weekdayCount,
    saturdays: plan.saturdayCount,
    prepDays: plan.prepDate ? 1 : 0,
    total: plan.totalFeeKRW,
  };
  const excludedHolidayText = formatExcludedHolidays(plan.excludedHolidays, rangeData.holidayNames);

  const canSubmit = Boolean(startDate) && Boolean(endDate) && !error;
  /** ③-D 비활성 이유 한 줄 */
  const ctaReason = !startDate
    ? "시작일과 종료일을 달력에서 먼저 골라 주세요."
    : !endDate
      ? "종료일을 골라 주세요."
      : "";

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
    // 다른 달 칸은 빈 칸(숫자 없음 · 01_spec ②-2-1)
    for (let i = firstDow - 1; i >= 0; i--) cells.push({ ymd: "", day: 0, inMonth: false });
    for (let d = 1; d <= lastDay; d++) {
      cells.push({ ymd: dateToYmdLocal(new Date(year, m, d)), day: d, inMonth: true });
    }
    while (cells.length % 7 !== 0) cells.push({ ymd: "", day: 0, inMonth: false });
    return cells;
  }, [month]);

  /** 이번 달 공휴일 목록(휴대폰은 칸에 "공휴일"만 쓰고 이름은 달력 아래 · 02_ui §4-2) */
  const monthHolidayList = useMemo(() => {
    return Array.from(holidayMap.entries())
      .filter(([d]) => d.startsWith(monthKey))
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([d, name]) => `${parseInt(d.slice(5, 7), 10)}/${parseInt(d.slice(8, 10), 10)}(${dowLabel(d)}) ${name}`);
  }, [holidayMap, monthKey]);

  /** 선택 단계(B·C)에서 고를 수 없는 날 — 기본 상태(galleryBaseDayState)가 available이어도 막힘 */
  function isBlockedBySelection(ymd: string) {
    // 시작일만 선택된 상태: 시작일 이전은 비활성, 최대 30일(포함) 초과는 비활성
    if (isYmd(startDate) && !isYmd(endDate)) {
      if (ymd < startDate) return true;
      if (diffDaysInclusive(startDate, ymd) > 30) return true;
      // 기간 안에 마감일이 끼면 비활성 · 다른 신청의 준비일은 우리 마지막 날로만 가능(그 뒤로는 비활성)
      let cur = startDate;
      let guard = 0;
      while (cur < ymd && guard++ < 40) {
        if (prepOnlyDates.has(cur)) return true;
        const d = toDateLocal(cur);
        d.setDate(d.getDate() + 1);
        cur = dateToYmdLocal(d);
        if (cur <= ymd && bookedDates.has(cur)) return true;
      }
    }
    // 시작/종료 모두 선택된 상태: 범위 밖은 비활성 (단, 시작일은 재클릭으로 초기화 가능)
    if (isYmd(startDate) && isYmd(endDate)) {
      if (ymd === startDate) return false;
      if (!inRange(ymd, startDate, endDate)) return true;
    }
    return false;
  }

  const navBtn =
    "inline-flex h-11 min-w-[44px] items-center justify-center whitespace-nowrap rounded-xl border border-slate-300 bg-white px-3 text-[15px] font-semibold text-ink hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky";

  return (
    <div className={cn(CARD_BASE, "p-4 sm:p-5", className)}>
      <div className="rounded-lg border border-line bg-slate-50 p-4 text-[15px] text-slate-700">
        <p className="font-semibold">우리동네 갤러리(4층) 신청 안내</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          <li>우리동네 갤러리는 <span className="font-semibold">일 단위</span>로 신청합니다. (시간 선택 없음)</li>
          <li>일요일·공휴일은 휴관으로 자동 제외됩니다.</li>
          <li>준비(세팅)일 1일은 <span className="font-semibold">무료</span>로 포함됩니다. (시작 직전 운영일 · 신청서에서 변경 가능)</li>
          <li>전시 기간은 최대 30일까지 신청할 수 있습니다.</li>
          <li><span className="font-semibold">철거</span>: 전시 마지막 날 <span className="font-semibold">평일 16:00 · 토요일 11:00 이전</span> 완료</li>
          <li><span className="font-semibold">준비</span>: 전날 전시가 없으면 운영시간 내 언제든, 전시가 있으면 철거 후 <span className="font-semibold">평일 17:00 · 토요일 11:00 이후</span></li>
        </ul>
      </div>

      <div className="mt-5">
        {/* 달력 머리: 월 · 이번 달 신청 가능한 날 · ◀ 오늘 ▶ */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="text-xl font-bold tabular-nums text-ink">{getMonthLabel(month)}</h3>
            {monthLoaded ? (
              availableCount > 0 ? (
                <p className="text-sm text-ink-2" aria-live="polite">
                  이번 달 신청 가능한 날 <b className="text-base font-bold tabular-nums text-ink">{availableCount}</b>일
                </p>
              ) : (
                <p className="text-sm text-ink-2" aria-live="polite">
                  이번 달은 신청 가능한 날이 없습니다 ·{" "}
                  <button
                    type="button"
                    onClick={() => setMonth((prev) => addMonths(prev, 1))}
                    className="inline-flex min-h-[44px] items-center font-semibold text-brand underline underline-offset-2"
                  >
                    다음 달 보기 →
                  </button>
                </p>
              )
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setMonth((prev) => addMonths(prev, -1))} className={navBtn} aria-label="이전 달">
              ◀
            </button>
            <button type="button" onClick={() => setMonth(startOfMonth(new Date()))} className={navBtn}>
              오늘
            </button>
            <button type="button" onClick={() => setMonth((prev) => addMonths(prev, 1))} className={navBtn} aria-label="다음 달">
              ▶
            </button>
          </div>
        </div>

        {/* 선택한 시작·종료 */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className={cn(
            "rounded-full border px-3 py-1 text-sm font-semibold tabular-nums",
            startDate ? "border-brand bg-brand-soft text-brand" : "border-slate-200 bg-white text-ink-3"
          )}>
            시작: {startDate || "-"}
          </span>
          <span className={cn(
            "rounded-full border px-3 py-1 text-sm font-semibold tabular-nums",
            endDate ? "border-brand bg-brand-soft text-brand" : "border-slate-200 bg-white text-ink-3"
          )}>
            종료: {endDate || "-"}
          </span>
          {startDate ? (
            <button
              type="button"
              onClick={clearRange}
              className="inline-flex min-h-[44px] items-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-ink hover:bg-slate-50"
            >
              초기화
            </button>
          ) : null}
        </div>

        <div className="overflow-hidden rounded-lg border border-line bg-white">
          <div className="grid grid-cols-7 border-b border-line bg-slate-50 text-center text-sm font-semibold text-ink-2">
            {["일", "월", "화", "수", "목", "금", "토"].map((w) => (
              <div key={w} className={cn("py-2", w === "일" && "text-rose-700")}>{w}</div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {monthGrid.map((c, idx) => {
              if (!c.inMonth) {
                return <div key={`blank-${idx}`} className="h-[60px] border-b border-r border-line bg-white sm:h-[76px]" aria-hidden="true" />;
              }
              const base = galleryBaseDayState(c.ymd, calCtx);
              const isToday = c.ymd === today;
              const isStart = c.ymd === startDate;
              const isEnd = c.ymd === endDate;
              const isBetween = startDate && endDate ? inRange(c.ymd, startDate, endDate) : false;
              const isPrep = !!defaultPrepDate && c.ymd === defaultPrepDate;
              const holidayName = holidayMap.get(c.ymd);

              // 칸 상태(02_ui §2-1 표 · 위가 우선)
              type View = "past" | "closed" | "holiday" | "prep" | "start" | "end" | "between" | "booked" | "available" | "blocked";
              let view: View;
              if (base === "past") view = "past";
              else if (base === "closed") view = "closed";
              else if (base === "holiday") view = "holiday";
              else if (isPrep && !isStart && !isEnd) view = "prep";
              else if (isStart) view = "start";
              else if (isEnd) view = "end";
              else if (isBetween) view = "between";
              else if (base === "booked") view = "booked";
              else view = isBlockedBySelection(c.ymd) ? "blocked" : "available";

              const clickable = (view === "available" || view === "start" || view === "end" || view === "between")
                && !(view === "between" && isBlockedBySelection(c.ymd));
              const inMyRangeBg = isBetween && (view === "closed" || view === "holiday");

              const stateLabel =
                view === "past" ? "지난 날짜"
                : view === "closed" ? "휴관"
                : view === "holiday" ? (holidayName ?? "공휴일")
                : view === "prep" ? `준비일${prepAfterLabel ? ` ${prepAfterLabel}` : ""}`
                : view === "start" ? "시작일"
                : view === "end" ? "종료일"
                : view === "between" ? "선택한 기간"
                : view === "booked" ? "마감"
                : view === "blocked" ? "선택할 수 없음"
                : "선택 가능";

              return (
                <button
                  key={c.ymd}
                  type="button"
                  disabled={!clickable}
                  onClick={() => onPickDay(c.ymd)}
                  aria-label={`${parseInt(c.ymd.slice(5, 7), 10)}월 ${c.day}일 ${dowLabel(c.ymd)}요일, ${stateLabel}`}
                  aria-pressed={isStart || isEnd}
                  className={cn(
                    "relative flex h-[60px] flex-col items-center justify-start gap-0.5 border-b border-r border-line pt-2 transition sm:h-[76px] sm:pt-2.5",
                    "focus:outline-none focus-visible:z-20 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky",
                    !clickable && "cursor-default",
                    view === "past" && "bg-white",
                    (view === "closed" || view === "holiday") && (inMyRangeBg ? "bg-brand-soft" : "bg-rose-50"),
                    view === "prep" && "bg-white shadow-[inset_0_0_0_2px_rgb(var(--brand-accent))]",
                    (view === "start" || view === "end") && "z-10 bg-brand-soft shadow-[inset_0_0_0_2px_rgb(var(--brand-primary))]",
                    view === "between" && "bg-brand-soft",
                    view === "booked" && "bg-slate-100",
                    view === "available" && "bg-white hover:bg-slate-50",
                    view === "blocked" && "bg-white",
                  )}
                >
                  <span className={cn(
                    "text-base tabular-nums leading-5",
                    view === "past" && "font-medium text-slate-300",
                    (view === "closed" || view === "holiday") && "font-semibold text-rose-700",
                    view === "booked" && "font-medium text-slate-500",
                    (view === "start" || view === "end") && "font-bold text-brand",
                    (view === "available" || view === "between" || view === "prep") && "font-bold text-ink",
                    view === "blocked" && "font-medium text-ink-3",
                    isToday && "underline decoration-accent decoration-2 underline-offset-4",
                  )}>{c.day}</span>
                  {view === "available" && <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />}
                  {view === "closed" && <span className="text-xs leading-[18px] text-rose-700">휴관</span>}
                  {view === "holiday" && (
                    <>
                      <span className="text-xs leading-[18px] text-rose-700 sm:hidden">공휴일</span>
                      <span className="hidden max-w-full break-keep px-0.5 text-center text-xs leading-[14px] text-rose-700 sm:block">{holidayName}</span>
                    </>
                  )}
                  {view === "booked" && <span className="text-xs leading-[18px] text-slate-600">마감</span>}
                  {(view === "start" || view === "end") && (
                    <span className="text-xs font-bold leading-[18px] text-brand">{view === "start" ? "시작" : "종료"}</span>
                  )}
                  {view === "prep" && (
                    <span className="text-center text-xs font-bold leading-[14px] text-accent-ink">
                      준비
                      {prepAfterLabel ? (
                        <>
                          <br />
                          <span className="hidden font-semibold sm:inline">{prepAfterLabel}</span>
                          <span className="font-semibold sm:hidden">{prepAfterShort}</span>
                        </>
                      ) : null}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {monthHolidayList.length > 0 && (
          <p className="mt-2 text-[13px] text-rose-700 sm:hidden">이번 달 공휴일: {monthHolidayList.join(" · ")}</p>
        )}

        {/* 범례(칸과 같은 모양의 작은 견본) */}
        <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-2" aria-label="달력 범례">
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
            <span>선택 가능</span>
          </li>
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-4 w-5 rounded-sm bg-brand-soft" aria-hidden />
            <span>연한 칸 = 선택한 기간</span>
          </li>
          <li className="flex items-center gap-1.5">
            <span className="inline-flex h-5 items-center rounded-sm bg-white px-1 font-bold text-accent-ink shadow-[inset_0_0_0_2px_rgb(var(--brand-accent))]" aria-hidden>준비</span>
            <span>= 무료 준비일</span>
          </li>
          <li className="flex items-center gap-1.5">
            <span className="inline-flex h-5 items-center rounded-sm bg-slate-100 px-1 text-slate-600" aria-hidden>마감</span>
            <span>= 전시·예약 있음</span>
          </li>
          <li className="flex items-center gap-1.5">
            <span className="inline-flex h-5 items-center rounded-sm bg-rose-50 px-1 text-rose-700" aria-hidden>휴관</span>
            <span>= 일요일·공휴일</span>
          </li>
        </ul>

        <p className="mt-2 text-[13px] text-ink-3">
          ※ 날짜를 눌러 시작일과 종료일을 선택 · 일요일·공휴일 휴관 · 최대 30일
        </p>
      </div>

      <div className="mt-2">
        {error ? <p role="alert" className="text-sm font-semibold text-red-700">{error}</p> : null}
        {!error && days > 0 ? (
          <div className="space-y-1">
            <FieldHelp>선택 기간: {days}일 (일요일·공휴일 자동 제외)</FieldHelp>
            {excludedHolidayText ? <FieldHelp>{excludedHolidayText}</FieldHelp> : null}
            {defaultPrepDate ? (
              <FieldHelp>
                준비일: {defaultPrepDate} ({dowLabel(defaultPrepDate)}){prepAfterLabel ? ` — 앞 전시 철거 후 ${prepAfterLabel} 입장` : ""} — 신청서에서 변경 가능
              </FieldHelp>
            ) : (
              <FieldHelp>준비일: 없음 (직전 운영일이 지났거나 사용 중) — 시작일 당일 운영시간 내 준비</FieldHelp>
            )}
          </div>
        ) : null}
      </div>

      {rangeData.status === "error" ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          공휴일 정보를 불러오지 못해 예상 이용료가 실제와 다를 수 있습니다.{" "}
          <button type="button" onClick={rangeData.reload} className="inline-flex min-h-[44px] items-center font-semibold text-brand underline underline-offset-2">
            다시 불러오기
          </button>
        </div>
      ) : null}

      {/* 이용료 자동 계산 */}
      {!error && days > 0 && (feeBreakdown.weekdays > 0 || feeBreakdown.saturdays > 0) && (
        <>
          {rangeData.status === "ok" && rangeData.holidayStatus === "unavailable" ? <HolidayUnavailableNotice className="mt-4" /> : null}
          <div className="mt-4 overflow-hidden rounded-xl border border-line bg-white">
            <div className="border-b border-line bg-slate-50 px-4 py-2.5">
              <span className="text-[15px] font-bold text-ink">예상 전시 공간 이용료</span>
            </div>
            <div className="px-4 py-3">
              <div className="space-y-2">
                {feeBreakdown.weekdays > 0 && (
                  <div className="flex items-center justify-between text-sm text-ink-2">
                    <span>평일 {feeBreakdown.weekdays}일 × {GALLERY_FEE_KRW.WEEKDAY.toLocaleString()}원</span>
                    <span className="font-semibold tabular-nums text-ink">{(feeBreakdown.weekdays * GALLERY_FEE_KRW.WEEKDAY).toLocaleString()}원</span>
                  </div>
                )}
                {feeBreakdown.saturdays > 0 && (
                  <div className="flex items-center justify-between text-sm text-ink-2">
                    <span>토요일 {feeBreakdown.saturdays}일 × {GALLERY_FEE_KRW.SATURDAY.toLocaleString()}원</span>
                    <span className="font-semibold tabular-nums text-ink">{(feeBreakdown.saturdays * GALLERY_FEE_KRW.SATURDAY).toLocaleString()}원</span>
                  </div>
                )}
                {feeBreakdown.prepDays > 0 && defaultPrepDate && (
                  <div className="flex items-center justify-between text-sm text-ink-2">
                    <span>준비일 {feeBreakdown.prepDays}일 ({defaultPrepDate} {dowLabel(defaultPrepDate)}{prepAfterLabel ? ` · ${prepAfterLabel}` : ""})</span>
                    <span className="font-semibold">무료</span>
                  </div>
                )}
              </div>
              <div className="mt-3 flex items-center justify-between rounded-lg bg-brand-soft px-4 py-3">
                <span className="text-[15px] font-bold text-ink">합계</span>
                <span className="text-2xl font-bold tabular-nums text-brand">{holidaysPending ? "공휴일 확인 중…" : `${feeBreakdown.total.toLocaleString()}원`}</span>
              </div>
              <p className="mt-2 text-[13px] text-ink-3">※ 할인 및 바우처 적용 불가</p>
            </div>
          </div>
        </>
      )}

      <div className="mt-5">
        <Button type="button" className="min-h-[48px] w-full text-base" disabled={!canSubmit} onClick={goApply}>
          전시 신청서 작성하기
        </Button>
        {ctaReason ? <p className="mt-1.5 text-[13px] text-ink-3">{ctaReason}</p> : null}
      </div>
    </div>
  );
}
