/**
 * 우리동네 갤러리 상세 달력 — 칸 상태·이번 달 신청 가능한 날 수 (audit-fix-2 항목 3·7 · ⑧ Q9)
 *
 * 순수 함수(DB·서버 전용 import 없음) → 클라이언트 달력과 서버(/api/booked-dates availableDayCount)가 같은 규칙을 쓴다.
 * "이번 달 신청 가능한 날 N일"의 N은 이 파일의 countGallerySelectableDays()와 칸의 주황 점 수가 정확히 같아야 한다.
 *
 * 선택 전(A 단계) 칸 상태 우선순위 — 02_ui §4-1(지난 날짜가 휴관·공휴일보다 우선):
 *   past(오늘 포함 — 갤러리는 당일 신청 불가) > closed(일요일) > holiday(공휴일) > booked(전시·철거일·내부 차단) > available
 * - 준비일(B·C 단계)·시작/종료·기간 표시는 선택 상태에 따라 화면이 덧그린다(이 함수 밖).
 * - 다른 신청의 준비일만 잡힌 날(prepOnlyDates)은 available이다(그 날을 우리 마지막 날로 고를 수 있음).
 */

import { dayOfWeek } from "@/lib/datetime";
import { GALLERY_RULES } from "@/lib/constants";

export type GalleryDayState = "past" | "closed" | "holiday" | "booked" | "available";

export type GalleryMonthContext = {
  /** 오늘(KST) YYYY-MM-DD — /api/booked-dates 응답의 today를 쓰면 서버와 같다 */
  today: string;
  /** /api/booked-dates bookedDates (철거일 포함) */
  booked: ReadonlySet<string>;
  /** 공휴일 날짜 집합 */
  holidays: ReadonlySet<string>;
};

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;

/** 선택 전 칸 상태 */
export function galleryBaseDayState(ymd: string, ctx: GalleryMonthContext): GalleryDayState {
  if (!YMD.test(ymd ?? "")) return "past";
  if (ymd <= ctx.today) return "past";
  if (dayOfWeek(ymd) === 0) return "closed";
  if (ctx.holidays.has(ymd)) return "holiday";
  if (ctx.booked.has(ymd)) return "booked";
  return "available";
}

/** "YYYY-MM"의 모든 날짜 */
export function datesOfMonth(monthKey: string): string[] {
  if (!MONTH.test(monthKey ?? "")) return [];
  const y = parseInt(monthKey.slice(0, 4), 10);
  const m = parseInt(monthKey.slice(5, 7), 10);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: last }, (_, i) => `${monthKey}-${String(i + 1).padStart(2, "0")}`);
}

/** 이번 달 신청 가능한 날 수 = 선택 전 상태가 available인 칸 수 */
export function countGallerySelectableDays(monthKey: string, ctx: GalleryMonthContext): number {
  return datesOfMonth(monthKey).filter((d) => galleryBaseDayState(d, ctx) === "available").length;
}

/** 준비일이 앞 전시 철거일과 겹칠 때 둘째 줄 문구 — "17:00 이후"(평일) · "11:00 이후"(토) */
export function galleryPrepAfterText(ymd: string): string {
  const t = dayOfWeek(ymd) === 6 ? GALLERY_RULES.PREP_AFTER.SATURDAY : GALLERY_RULES.PREP_AFTER.WEEKDAY;
  return `${t} 이후`;
}
