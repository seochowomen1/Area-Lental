"use client";

/**
 * 2단계 우리동네 갤러리 전시 기간 고르기 (02_ui_apply §3 · 2차 갤러리 칸 규칙 그대로)
 * 시작일 → 끝나는 날을 차례로 누름. 달력 아래 안내 줄이 차례를 말함.
 * 회차·금액은 planGallery() 한 곳(신청서·서버와 같은 함수). 화면에 "대관" 글자 없음.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import type { SpaceRoom } from "@/lib/space";
import { REQUEST_LIMITS } from "@/lib/constants";

const GALLERY_MAX_EXHIBITION_DAYS = REQUEST_LIMITS.GALLERY_MAX_EXHIBITION_DAYS;
import {
  addDays,
  dayOfWeek,
  diffDaysInclusive,
  formatKoDate,
  isYmd,
  kstNow,
} from "@/lib/rules/ymd";
import {
  countGallerySelectableDays,
  galleryBaseDayState,
  galleryPrepAfterText,
} from "@/lib/galleryCalendar";
import { planGallery, resolveGalleryPrep } from "@/lib/galleryPlan";
import {
  formatExcludedHolidays,
  galleryMonthsForRange,
  useGalleryMonthData,
} from "@/lib/useGalleryMonthData";
import { useBookedDates } from "@/lib/client/useBookedDates";
import { applyHrefForGallery, formatPeriod } from "@/lib/apply/schedule";
import HolidayUnavailableNotice from "@/components/HolidayUnavailableNotice";
import MonthCalendar, {
  addMonthKey,
  CalendarLegend,
  monthKeyOf,
  type CellSpec,
} from "@/components/apply/MonthCalendar";
import Step2Shell from "@/components/apply/Step2Shell";
import FeeSummary, { galleryFeeLines } from "@/components/apply/FeeSummary";
import {
  A_BTN_PRIMARY,
  A_CARD,
  A_ERROR_TEXT,
  A_HELP,
} from "@/components/apply/ui";

export const PICK_PERIOD_FIRST_TEXT =
  "먼저 달력에서 전시 시작일과 종료일을 골라 주세요.";
export const NO_PREP_TEXT =
  "전시 시작 전날(운영일)에 준비일을 잡을 수 없어 그 날은 시작일로 고를 수 없습니다. 다른 날을 골라 주세요.";

export default function GalleryPeriodPicker({
  room,
  initialStart,
  initialEnd,
  scheduleError,
}: {
  room: SpaceRoom;
  initialStart: string;
  initialEnd: string;
  scheduleError: boolean;
}) {
  const router = useRouter();
  const [startDate, setStartDate] = useState(initialStart);
  const [endDate, setEndDate] = useState(initialEnd);
  const [error, setError] = useState("");
  const [needPick, setNeedPick] = useState(false);
  const [month, setMonth] = useState(() =>
    monthKeyOf(initialStart || kstNow().ymd),
  );
  const booked = useBookedDates("gallery", month);

  const today = booked.data?.today || kstNow().ymd;
  const monthHolidays = useMemo(
    () => booked.data?.holidays ?? new Map<string, string>(),
    [booked.data],
  );
  const calCtx = useMemo(
    () => ({
      today,
      booked: booked.data?.bookedDates ?? new Set<string>(),
      holidays: new Set(monthHolidays.keys()) as ReadonlySet<string>,
    }),
    [today, booked.data, monthHolidays],
  );
  const baseAvailableCount =
    booked.data?.availableDayCount ?? countGallerySelectableDays(month, calCtx);

  const rangeMonths = useMemo(
    () => galleryMonthsForRange(startDate, endDate),
    [startDate, endDate],
  );
  const rangeData = useGalleryMonthData(rangeMonths);
  const allBooked = useMemo(
    () =>
      new Set([
        ...Array.from(rangeData.booked),
        ...Array.from(booked.data?.bookedDates ?? []),
      ]),
    [rangeData.booked, booked.data],
  );
  const allPrepOnly = useMemo(
    () =>
      new Set([
        ...Array.from(rangeData.prepOnly),
        ...Array.from(booked.data?.prepOnlyDates ?? []),
      ]),
    [rangeData.prepOnly, booked.data],
  );

  // 보이는 달 + 앞 달(1일 시작이면 준비일이 앞 달) — 시작일 후보마다 준비일이 잡히는지 판단용
  const viewMonths = useMemo(() => [addMonthKey(month, -1), month], [month]);
  const viewData = useGalleryMonthData(viewMonths);
  /** 준비일이 반드시 있어야 한다(2026-10-28) — 준비일을 잡을 수 없는 날은 시작일로 고를 수 없음 */
  function canStartOn(ymd: string): boolean {
    if (viewData.status !== "ok") return true; // 확인 전에는 막지 않음(서버가 다시 검사)
    return Boolean(
      resolveGalleryPrep(ymd, {
        holidays: new Set([
          ...Array.from(viewData.holidaySet),
          ...Array.from(monthHolidays.keys()),
        ]),
        booked: new Set([
          ...Array.from(viewData.booked),
          ...Array.from(calCtx.booked),
        ]),
        exhibitionEnds: viewData.exhibitionEnds,
        prepOnly: viewData.prepOnly,
        today,
      }),
    );
  }

  // "이번 달 신청 가능한 날" — 시작일로 고를 수 있는 날만(재검수 R-2)
  let availableCount = baseAvailableCount;
  if (booked.status === "ok" && viewData.status === "ok") {
    availableCount = 0;
    for (let d = `${month}-01`; d.startsWith(month); d = addDays(d, 1)) {
      if (galleryBaseDayState(d, calCtx) === "available" && canStartOn(d))
        availableCount++;
    }
  }

  // 준비일(준비·철거 규정 2026-10-19) — 없으면 그 시작일은 고를 수 없다
  const prepInfo = useMemo(
    () =>
      resolveGalleryPrep(startDate, {
        holidays: rangeData.holidaySet,
        booked: rangeData.booked,
        exhibitionEnds: rangeData.exhibitionEnds,
        prepOnly: rangeData.prepOnly,
        today,
      }) ?? { date: "", afterExhibition: false },
    [
      startDate,
      rangeData.holidaySet,
      rangeData.booked,
      rangeData.exhibitionEnds,
      rangeData.prepOnly,
      today,
    ],
  );
  const prepAfterLabel = prepInfo.afterExhibition
    ? galleryPrepAfterText(prepInfo.date)
    : "";

  const plan = useMemo(
    () =>
      planGallery({
        startDate,
        endDate,
        prepDate: prepInfo.date || null,
        prepAfterExhibition: prepInfo.afterExhibition,
        holidays: rangeData.holidaySet,
      }),
    [startDate, endDate, prepInfo, rangeData.holidaySet],
  );
  const excludedText = formatExcludedHolidays(
    plan.excludedHolidays,
    rangeData.holidayNames,
  );
  const prepLoading = Boolean(startDate) && rangeData.status === "loading";
  const chosen = Boolean(
    startDate &&
    endDate &&
    !error &&
    plan.exhibitionDayCount > 0 &&
    prepInfo.date,
  );

  function isBlockedBySelection(ymd: string) {
    if (isYmd(startDate) && !isYmd(endDate)) {
      if (ymd < startDate) return true;
      if (diffDaysInclusive(startDate, ymd) > GALLERY_MAX_EXHIBITION_DAYS)
        return true;
      let cur = startDate;
      let guard = 0;
      while (cur < ymd && guard++ < 40) {
        if (allPrepOnly.has(cur)) return true;
        cur = addDays(cur, 1);
        if (cur <= ymd && allBooked.has(cur)) return true;
      }
    }
    if (isYmd(startDate) && isYmd(endDate)) {
      if (ymd === startDate) return false;
      if (ymd < startDate || ymd > endDate) return true;
    }
    return false;
  }

  function cellFor(ymd: string): CellSpec {
    const base = galleryBaseDayState(ymd, calCtx);
    const name = monthHolidays.get(ymd);
    const isStart = ymd === startDate;
    const isEnd = ymd === endDate;
    const between = Boolean(
      startDate && endDate && startDate <= ymd && ymd <= endDate,
    );
    if (base === "past")
      return { view: "past", srState: "지난 날짜", clickable: false };
    if (base === "closed")
      return { view: "closed", sub: "휴관", srState: "휴관", clickable: false };
    if (base === "holiday")
      return {
        view: "closed",
        sub: (
          <>
            <span className="sm:hidden">공휴일</span>
            <span className="hidden sm:inline">{name ?? "공휴일"}</span>
          </>
        ),
        srState: name ?? "공휴일",
        clickable: false,
      };
    if (prepInfo.date === ymd && !isStart && !isEnd)
      return {
        view: "prep",
        sub: (
          <>
            준비
            {prepAfterLabel ? (
              <>
                <br />
                <span className="sm:hidden">
                  {prepAfterLabel.replace(" 이후", "")}~
                </span>
                <span className="hidden sm:inline">{prepAfterLabel}</span>
              </>
            ) : null}
          </>
        ),
        srState: `준비일${prepAfterLabel ? ` ${prepAfterLabel}` : ""}`,
        clickable: false,
      };
    if (isStart)
      return {
        view: "chosen",
        sub: "시작",
        srState: "시작일",
        clickable: true,
      };
    if (isEnd)
      return {
        view: "chosen",
        sub: "종료",
        srState: "종료일",
        clickable: true,
      };
    if (between)
      return {
        view: "between",
        srState: "선택한 기간",
        clickable: !isBlockedBySelection(ymd),
      };
    if (base === "booked")
      return { view: "booked", sub: "마감", srState: "마감", clickable: false };
    if (isBlockedBySelection(ymd))
      return { view: "blocked", srState: "선택할 수 없음", clickable: false };
    // 시작일을 고르는 차례(또는 시작일보다 앞을 눌러 시작일이 바뀌는 경우)에는 준비일이 잡히는 날만
    const picksStart = !startDate || Boolean(endDate) || ymd < startDate;
    // 누르면 이유를 알려 준다(재검수 R-1 — 휴대폰에서 회색 숫자만으로는 이유를 알 수 없음)
    if (picksStart && !canStartOn(ymd))
      return {
        view: "blocked",
        sub: "준비불가",
        srState: "전날 준비일을 잡을 수 없어 시작일로 고를 수 없음",
        clickable: true,
      };
    return { view: "available", srState: "선택 가능", clickable: true };
  }

  function setRange(s: string, e: string) {
    setStartDate(s);
    setEndDate(e);
    if (s && e && diffDaysInclusive(s, e) > GALLERY_MAX_EXHIBITION_DAYS)
      setError("전시 기간은 최대 30일까지 신청할 수 있습니다.");
    else setError("");
  }

  function onPick(ymd: string) {
    setNeedPick(false);
    if (dayOfWeek(ymd) === 0) {
      setError(
        "일요일은 전시일로 선택할 수 없습니다. (일요일은 자동 제외됩니다)",
      );
      return;
    }
    if (!startDate || (startDate && endDate)) {
      if (startDate && endDate && ymd === startDate) {
        setRange("", "");
        return;
      }
      if (!canStartOn(ymd)) {
        setError(NO_PREP_TEXT);
        return;
      }
      setRange(ymd, "");
      return;
    }
    if (ymd < startDate && !canStartOn(ymd)) {
      setError(NO_PREP_TEXT);
      return;
    }
    const s = ymd < startDate ? ymd : startDate;
    const e = ymd < startDate ? startDate : ymd;
    if (diffDaysInclusive(s, e) > GALLERY_MAX_EXHIBITION_DAYS) {
      setError("전시 기간은 최대 30일까지 신청할 수 있습니다.");
      return;
    }
    setRange(s, e);
  }

  function goNext() {
    if (!chosen) {
      setNeedPick(true);
      document
        .getElementById("calendar-card")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    router.push(applyHrefForGallery(startDate, endDate, prepInfo.date || null));
  }

  const hint = !startDate
    ? "시작일을 눌러 주세요."
    : !endDate
      ? "끝나는 날을 눌러 주세요."
      : prepInfo.date
        ? `준비일 ${formatKoDate(prepInfo.date)}은 무료입니다.${prepAfterLabel ? ` (앞 전시 철거 후 ${prepAfterLabel} 입장)` : ""}`
        : prepLoading
          ? "준비일을 확인하고 있습니다…"
          : NO_PREP_TEXT;

  const fee = chosen ? (
    <>
      {rangeData.status === "ok" &&
      rangeData.holidayStatus === "unavailable" ? (
        <HolidayUnavailableNotice />
      ) : null}
      <FeeSummary
        title="예상 전시 공간 이용료"
        lines={galleryFeeLines(plan)}
        total={plan.totalFeeKRW}
        target="전시"
      />
    </>
  ) : null;

  return (
    <Step2Shell
      room={room}
      title="우리동네 갤러리 · 전시 기간 고르기"
      step1Href="/"
      summary={
        <div className={cn(A_CARD, "space-y-3 p-5")}>
          <h2 className="text-[18px] font-extrabold leading-7 text-ink">
            전시 기간
          </h2>
          <p className="text-[17px] leading-7 text-ink">
            {chosen
              ? `${formatPeriod(startDate, endDate)} · ${plan.exhibitionDayCount}일`
              : "달력에서 날짜를 누르세요."}
          </p>
          {chosen ? (
            <div className="flex items-baseline justify-between border-t border-line pt-3">
              <span className="text-[17px] font-bold text-ink">
                예상 전시 공간 이용료
              </span>
              <span className="text-[24px] font-extrabold tabular-nums text-brand">
                {plan.totalFeeKRW.toLocaleString()}원
              </span>
            </div>
          ) : null}
          <button type="button" className={A_BTN_PRIMARY} onClick={goNext}>
            다음: 신청서 쓰기
          </button>
        </div>
      }
      bar={
        <div>
          {chosen ? (
            <>
              <p className="truncate text-[16px] leading-6 text-ink-2">
                {formatPeriod(startDate, endDate)}
              </p>
              <p className="flex items-baseline justify-between">
                <span className="text-[16px] text-ink-2">
                  예상 전시 공간 이용료
                </span>
                <span className="text-[20px] font-extrabold tabular-nums text-ink">
                  {plan.totalFeeKRW.toLocaleString()}원
                </span>
              </p>
            </>
          ) : null}
          <button
            type="button"
            className={`${A_BTN_PRIMARY} mt-1.5`}
            onClick={goNext}
          >
            다음: 신청서 쓰기
          </button>
        </div>
      }
    >
      <MonthCalendar
        monthKey={month}
        minMonthKey={monthKeyOf(today)}
        onMonthChange={setMonth}
        status={booked.status}
        onReload={booked.reload}
        today={today}
        cellFor={cellFor}
        onPick={onPick}
        headExtra={
          booked.status === "ok" ? (
            availableCount > 0 ? (
              <p className="text-[15px] leading-6 text-ink-2">
                이번 달 신청 가능한 날{" "}
                <b className="font-bold tabular-nums text-ink">
                  {availableCount}
                </b>
                일
              </p>
            ) : (
              <p className="text-[15px] leading-6 text-ink-2">
                이번 달은 신청 가능한 날이 없습니다 ·{" "}
                <button
                  type="button"
                  onClick={() => setMonth(addMonthKey(month, 1))}
                  className="inline-flex min-h-[44px] items-center font-semibold text-brand underline underline-offset-2"
                >
                  다음 달 보기 →
                </button>
              </p>
            )
          ) : null
        }
        above={
          <>
            {scheduleError ? (
              <div
                role="alert"
                className="mb-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[17px] font-bold leading-7 text-amber-900"
              >
                일정 정보가 올바르지 않아 날짜 고르기로 돌아왔습니다.
              </div>
            ) : null}
            {needPick ? (
              <div
                role="alert"
                className="mb-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[17px] font-bold leading-7 text-amber-900"
              >
                {PICK_PERIOD_FIRST_TEXT}
              </div>
            ) : null}
          </>
        }
        below={
          <>
            <p
              className="mt-3 text-[15px] font-bold leading-6 text-brand"
              aria-live="polite"
            >
              {hint}
            </p>
            {error ? (
              <p role="alert" className={`${A_ERROR_TEXT} mt-1`}>
                {error}
              </p>
            ) : null}
            {chosen && excludedText ? (
              <p className={`${A_HELP} mt-1`}>{excludedText}</p>
            ) : null}
            <CalendarLegend
              extra={
                <>
                  <li className="flex items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className="inline-flex h-5 items-center rounded bg-white px-1 text-[12px] font-bold text-accent-ink shadow-[inset_0_0_0_2px_rgb(var(--brand-accent))]"
                    >
                      준비
                    </span>
                    무료 준비일
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className="inline-flex h-5 items-center rounded px-1 text-[12px] font-bold text-ink-3"
                    >
                      준비불가
                    </span>
                    전날 준비일을 잡을 수 없어 시작일로 못 고름
                  </li>
                </>
              }
            />
          </>
        }
      />
      <div className="min-[900px]:hidden">{fee}</div>
    </Step2Shell>
  );
}
