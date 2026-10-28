/**
 * 우리동네 갤러리 회차·요금 계산 — 순수 함수 (audit-fix-1 [3] · 2026-10-26)
 *
 * 신청서(ApplyGalleryClient)·상세 달력(SpaceBookingGalleryRange)·서버(lib/gallery.ts)가 모두 이 함수를 쓴다.
 * - 서버 전용 모듈(holidays·DB) import 금지 → 공휴일은 인자(ReadonlySet<"YYYY-MM-DD">)로 받는다.
 * - 운영시간: 평일 09:00~18:00 · 화 09:00~20:00 · 토 09:00~13:00 · 일·공휴일 휴관
 * - 요금: 평일 20,000 · 토 10,000 · 준비일 무료 (GALLERY_FEE_KRW)
 */

import { toMinutes } from "@/lib/datetime";
import { addDays, dayOfWeek, isYmd } from "@/lib/rules/ymd";
import { GALLERY_FEE_KRW, GALLERY_RULES } from "@/lib/constants";

export type GalleryWindow = { startTime: string; endTime: string };
export type GalleryPlanSession = { date: string; startTime: string; endTime: string; isPrepDay?: boolean };

export type GalleryPlan = {
  /** 준비일(있으면 맨 앞) + 전시일 — 전시일이 하나도 없으면 [] */
  sessions: GalleryPlanSession[];
  prepDate: string | null;
  weekdayCount: number;
  saturdayCount: number;
  exhibitionDayCount: number;
  /** 기간 안의 (일요일이 아닌) 공휴일 — 휴관이라 빠진 날 */
  excludedHolidays: string[];
  totalFeeKRW: number;
};

const EMPTY_PLAN: GalleryPlan = {
  sessions: [],
  prepDate: null,
  weekdayCount: 0,
  saturdayCount: 0,
  exhibitionDayCount: 0,
  excludedHolidays: [],
  totalFeeKRW: 0,
};

// 날짜 유틸은 lib/rules/ymd.ts 1벌 (3-3) — addDaysYmd는 기존 import 호환 별칭
export const addDaysYmd = addDays;

/** 운영시간 창 — 일요일·공휴일은 null */
export function galleryOperatingWindowFor(dateYmd: string, holidays: ReadonlySet<string>): GalleryWindow | null {
  const dow = dayOfWeek(dateYmd);
  if (dow === 0) return null;
  if (holidays.has(dateYmd)) return null;
  if (dow === 2) return { startTime: "09:00", endTime: "20:00" };
  if (dow === 6) return { startTime: "09:00", endTime: "13:00" };
  return { startTime: "09:00", endTime: "18:00" };
}

/** 앞 전시가 있는 날 준비 시작 시각 (평일 17:00 · 토 11:00) */
export function galleryPrepStartAfterExhibitionFor(dateYmd: string): string {
  return dayOfWeek(dateYmd) === 6 ? GALLERY_RULES.PREP_AFTER.SATURDAY : GALLERY_RULES.PREP_AFTER.WEEKDAY;
}

/** 준비일 회차 시간창 — 앞 전시가 있으면 철거 후(17:00/11:00)부터 */
export function galleryPrepWindowFor(dateYmd: string, afterExhibition: boolean, holidays: ReadonlySet<string>): GalleryWindow | null {
  const w = galleryOperatingWindowFor(dateYmd, holidays);
  if (!w) return null;
  if (!afterExhibition) return w;
  const start = galleryPrepStartAfterExhibitionFor(dateYmd);
  if (toMinutes(start) >= toMinutes(w.endTime)) return w; // 설정 오류 안전장치
  return { startTime: start, endTime: w.endTime };
}

/** 자동 준비일: 시작 전날, 일요일·공휴일이면 더 앞 */
export function defaultPrepDate(startDate: string, holidays: ReadonlySet<string>): string {
  let prep = addDaysYmd(startDate, -1);
  let safety = 0;
  while ((dayOfWeek(prep) === 0 || holidays.has(prep)) && safety++ < 30) prep = addDaysYmd(prep, -1);
  return prep;
}

/**
 * 시작일의 무료 준비일 확정 — 준비일은 반드시 있어야 한다(2026-10-28 사용자 "무조건 최소 전날").
 * 기본 준비일(전날, 일·공휴일이면 더 앞)이 오늘 이후이고, 비어 있거나 앞 전시의 마지막 날이면 그 날.
 * 아니면 null = 그 날은 시작일로 고를 수 없음.
 */
export function resolveGalleryPrep(
  startDate: string,
  ctx: {
    holidays: ReadonlySet<string>;
    booked: ReadonlySet<string>;
    exhibitionEnds: ReadonlySet<string>;
    prepOnly?: ReadonlySet<string>;
    today: string;
  }
): { date: string; afterExhibition: boolean } | null {
  if (!isYmd(startDate)) return null;
  const prep = defaultPrepDate(startDate, ctx.holidays);
  if (!isYmd(prep) || prep <= ctx.today) return null;
  if (ctx.prepOnly?.has(prep)) return null;
  if (ctx.booked.has(prep)) return ctx.exhibitionEnds.has(prep) ? { date: prep, afterExhibition: true } : null;
  return { date: prep, afterExhibition: false };
}

/**
 * 준비일 후보 — 시작 전날부터 거꾸로, 일요일·공휴일 제외, 최대 count개
 * - todayYmd를 주면 오늘 이전 날짜는 뺀다(서버 getAvailablePrepDates는 주지 않음 = 기존 동작)
 */
export function availablePrepDates(startDate: string, holidays: ReadonlySet<string>, count = 7, todayYmd?: string): string[] {
  if (!isYmd(startDate)) return [];
  const dates: string[] = [];
  let cur = addDaysYmd(startDate, -1);
  let safety = 0;
  while (dates.length < count && safety++ < 30) {
    if (todayYmd && cur < todayYmd) break;
    if (dayOfWeek(cur) !== 0 && !holidays.has(cur)) dates.push(cur);
    cur = addDaysYmd(cur, -1);
  }
  return dates;
}

/**
 * 기간 → 회차·일수·요금
 * @param prepDate undefined = 자동 계산 · null/"" = 준비일 없음 · "YYYY-MM-DD" = 그 날
 */
export function planGallery(args: {
  startDate: string;
  endDate: string;
  prepDate?: string | null;
  prepAfterExhibition?: boolean;
  holidays: ReadonlySet<string>;
}): GalleryPlan {
  const { startDate, endDate, holidays } = args;
  if (!isYmd(startDate) || !isYmd(endDate) || endDate < startDate) return { ...EMPTY_PLAN };

  let prep: string | null = null;
  if (args.prepDate === undefined) prep = defaultPrepDate(startDate, holidays);
  else if (args.prepDate && isYmd(args.prepDate)) prep = args.prepDate;

  const sessions: GalleryPlanSession[] = [];
  let prepDate: string | null = null;
  if (prep) {
    const w = galleryPrepWindowFor(prep, Boolean(args.prepAfterExhibition), holidays);
    if (w) {
      sessions.push({ date: prep, startTime: w.startTime, endTime: w.endTime, isPrepDay: true });
      prepDate = prep;
    }
  }

  let weekdayCount = 0;
  let saturdayCount = 0;
  const excludedHolidays: string[] = [];
  let cur = startDate;
  let safety = 0;
  while (cur <= endDate && safety++ < 5000) {
    const dow = dayOfWeek(cur);
    if (dow !== 0 && holidays.has(cur)) excludedHolidays.push(cur);
    const w = galleryOperatingWindowFor(cur, holidays);
    if (w) {
      sessions.push({ date: cur, startTime: w.startTime, endTime: w.endTime });
      if (dow === 6) saturdayCount++;
      else weekdayCount++;
    }
    cur = addDaysYmd(cur, 1);
  }

  const exhibitionDayCount = weekdayCount + saturdayCount;
  if (exhibitionDayCount === 0) return { ...EMPTY_PLAN, excludedHolidays };

  return {
    sessions,
    prepDate,
    weekdayCount,
    saturdayCount,
    exhibitionDayCount,
    excludedHolidays,
    totalFeeKRW: weekdayCount * GALLERY_FEE_KRW.WEEKDAY + saturdayCount * GALLERY_FEE_KRW.SATURDAY,
  };
}
