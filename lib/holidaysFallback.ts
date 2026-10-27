/**
 * 내장 법정공휴일표 2026~2027 (audit-fix-2 R2 · ⑧ Q6 확정)
 *
 * 공휴일 조회 API(특일정보)를 쓸 수 없을 때(키 없음·장애)만 대신 쓴다.
 * - 「관공서의 공휴일에 관한 규정」의 고정 공휴일 + 설·추석 연휴 + 규정에 따른 대체공휴일 + 법정 선거일.
 * - 정부가 따로 지정하는 임시공휴일은 넣지 않는다(API 몫). 이 표를 쓴 달은 상태가 "fallback"이다.
 * - 공개 정보만 담는다(키·URL 없음). 해가 바뀌면 다음 해 표를 더한다.
 * - DB·서버 전용 import 없음 → 순수 데이터.
 */

export type FallbackHoliday = { date: string; name: string };

export const FALLBACK_HOLIDAY_YEARS: readonly number[] = [2026, 2027];

export const FALLBACK_HOLIDAYS: readonly FallbackHoliday[] = [
  // ── 2026 ──
  { date: "2026-01-01", name: "1월1일" },
  { date: "2026-02-16", name: "설날" },
  { date: "2026-02-17", name: "설날" },
  { date: "2026-02-18", name: "설날" },
  { date: "2026-03-01", name: "삼일절" },
  { date: "2026-03-02", name: "대체공휴일(삼일절)" },
  { date: "2026-05-05", name: "어린이날" },
  { date: "2026-05-24", name: "부처님오신날" },
  { date: "2026-05-25", name: "대체공휴일(부처님오신날)" },
  { date: "2026-06-03", name: "전국동시지방선거" },
  { date: "2026-06-06", name: "현충일" },
  { date: "2026-08-15", name: "광복절" },
  { date: "2026-08-17", name: "대체공휴일(광복절)" },
  { date: "2026-09-24", name: "추석" },
  { date: "2026-09-25", name: "추석" },
  { date: "2026-09-26", name: "추석" },
  { date: "2026-10-03", name: "개천절" },
  { date: "2026-10-05", name: "대체공휴일(개천절)" },
  { date: "2026-10-09", name: "한글날" },
  { date: "2026-12-25", name: "기독탄신일" },
  // ── 2027 ──
  { date: "2027-01-01", name: "1월1일" },
  { date: "2027-02-06", name: "설날" },
  { date: "2027-02-07", name: "설날" },
  { date: "2027-02-08", name: "설날" },
  { date: "2027-02-09", name: "대체공휴일(설날)" },
  { date: "2027-03-01", name: "삼일절" },
  { date: "2027-05-05", name: "어린이날" },
  { date: "2027-05-13", name: "부처님오신날" },
  { date: "2027-06-06", name: "현충일" },
  { date: "2027-08-15", name: "광복절" },
  { date: "2027-08-16", name: "대체공휴일(광복절)" },
  { date: "2027-09-14", name: "추석" },
  { date: "2027-09-15", name: "추석" },
  { date: "2027-09-16", name: "추석" },
  { date: "2027-10-03", name: "개천절" },
  { date: "2027-10-04", name: "대체공휴일(개천절)" },
  { date: "2027-10-09", name: "한글날" },
  { date: "2027-10-11", name: "대체공휴일(한글날)" },
  { date: "2027-12-25", name: "기독탄신일" },
  { date: "2027-12-27", name: "대체공휴일(기독탄신일)" },
];

/** 내장표가 그 해를 다루는지 */
export function fallbackCoversYear(year: number): boolean {
  return FALLBACK_HOLIDAY_YEARS.includes(year);
}

/** 그 달의 내장 공휴일 — 표가 그 해를 다루지 않으면 null */
export function fallbackHolidaysForMonth(year: number, month: number): FallbackHoliday[] | null {
  if (!fallbackCoversYear(year)) return null;
  const prefix = `${year}-${String(month).padStart(2, "0")}-`;
  return FALLBACK_HOLIDAYS.filter((h) => h.date.startsWith(prefix));
}
