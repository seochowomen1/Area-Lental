/**
 * audit-fix-1 [3] 갤러리 회차·요금 공용 순수 함수 — 신청서·상세 달력·서버가 같은 결과
 */
import { availablePrepDates, planGallery } from "@/lib/galleryPlan";
import { computeGalleryStats, buildGallerySessionsFromPeriod, getAvailablePrepDates } from "@/lib/gallery";
import { _clearHolidayCache, _primeHolidaysForTest } from "@/lib/holidays";

const H = (...d: string[]) => new Set(d);

describe("planGallery", () => {
  test("12/21~12/26 · 성탄절(금) 제외 → 평일 4 · 토 1 · 90,000원", () => {
    const p = planGallery({ startDate: "2026-12-21", endDate: "2026-12-26", prepDate: null, holidays: H("2026-12-25") });
    expect(p.weekdayCount).toBe(4);
    expect(p.saturdayCount).toBe(1);
    expect(p.totalFeeKRW).toBe(90_000);
    expect(p.excludedHolidays).toEqual(["2026-12-25"]);
    expect(p.sessions.map((s) => s.date)).not.toContain("2026-12-25");
    expect(p.prepDate).toBeNull();
  });

  test("공휴일이 없으면 기존 계산과 같다(평일 5 · 토 1 = 110,000)", () => {
    const p = planGallery({ startDate: "2026-12-21", endDate: "2026-12-26", prepDate: null, holidays: H() });
    expect(p.totalFeeKRW).toBe(110_000);
  });

  test("준비일 자동 계산은 일요일·공휴일을 건너뛴다", () => {
    // 시작 12/26(토) → 전날 12/25(공휴일) → 12/24(목)
    const p = planGallery({ startDate: "2026-12-26", endDate: "2026-12-26", holidays: H("2026-12-25") });
    expect(p.prepDate).toBe("2026-12-24");
    expect(p.sessions[0]).toMatchObject({ date: "2026-12-24", isPrepDay: true });
  });

  test("준비일로 공휴일을 고르면 준비 회차가 생기지 않는다", () => {
    const p = planGallery({ startDate: "2026-12-28", endDate: "2026-12-29", prepDate: "2026-12-25", holidays: H("2026-12-25") });
    expect(p.prepDate).toBeNull();
    expect(p.sessions.some((s) => s.isPrepDay)).toBe(false);
  });

  test("앞 전시 철거 후 준비: 평일 17:00 · 토 11:00", () => {
    const wd = planGallery({ startDate: "2026-12-22", endDate: "2026-12-22", prepDate: "2026-12-21", prepAfterExhibition: true, holidays: H() });
    expect(wd.sessions[0]).toMatchObject({ date: "2026-12-21", startTime: "17:00", endTime: "18:00", isPrepDay: true });
    const sat = planGallery({ startDate: "2026-12-21", endDate: "2026-12-21", prepDate: "2026-12-19", prepAfterExhibition: true, holidays: H() });
    expect(sat.sessions[0]).toMatchObject({ date: "2026-12-19", startTime: "11:00", endTime: "13:00" });
  });

  test("전부 휴관이면 빈 계획", () => {
    const p = planGallery({ startDate: "2026-12-25", endDate: "2026-12-25", prepDate: null, holidays: H("2026-12-25") });
    expect(p.sessions).toEqual([]);
    expect(p.totalFeeKRW).toBe(0);
  });

  test("availablePrepDates — 공휴일·일요일 제외, 오늘 이전 제외", () => {
    expect(availablePrepDates("2026-12-28", H("2026-12-25"))).toEqual([
      "2026-12-26", "2026-12-24", "2026-12-23", "2026-12-22", "2026-12-21", "2026-12-19", "2026-12-18",
    ]);
    expect(availablePrepDates("2026-12-28", H("2026-12-25"), 7, "2026-12-23")).toEqual(["2026-12-26", "2026-12-24", "2026-12-23"]);
  });
});

/** 서버 함수(공휴일 캐시 사용)와 순수 함수가 같은 결과 — 공휴일 표 7가지 */
describe("서버 computeGalleryStats = planGallery", () => {
  const cases: Array<{ name: string; start: string; end: string; prep?: string | null; holidays: string[]; fee: number; wd: number; sat: number }> = [
    { name: "성탄절(평일)", start: "2026-12-21", end: "2026-12-26", prep: null, holidays: ["2026-12-25"], fee: 90_000, wd: 4, sat: 1 },
    { name: "설날 연휴(토 포함)+대체공휴일", start: "2027-02-05", end: "2027-02-13", prep: null, holidays: ["2027-02-06", "2027-02-07", "2027-02-08", "2027-02-09"], fee: 90_000, wd: 4, sat: 1 },
    { name: "토요일 공휴일(광복절)", start: "2026-08-10", end: "2026-08-15", prep: null, holidays: ["2026-08-15"], fee: 100_000, wd: 5, sat: 0 },
    { name: "월 걸침 + 개천절(토)", start: "2026-09-28", end: "2026-10-03", prep: null, holidays: ["2026-10-03"], fee: 100_000, wd: 5, sat: 0 },
    { name: "준비일이 공휴일(자동 → 더 앞)", start: "2026-12-26", end: "2026-12-29", prep: undefined, holidays: ["2026-12-25"], fee: 50_000, wd: 2, sat: 1 },
    { name: "대체공휴일(월)+한글날", start: "2026-10-05", end: "2026-10-10", prep: "", holidays: ["2026-10-05", "2026-10-09"], fee: 70_000, wd: 3, sat: 1 },
    { name: "공휴일 없음", start: "2026-11-02", end: "2026-11-14", prep: "2026-10-31", holidays: [], fee: 220_000, wd: 10, sat: 2 },
  ];

  for (const c of cases) {
    test(c.name, () => {
      _clearHolidayCache();
      _primeHolidaysForTest(c.holidays.map((date) => ({ date, name: "테스트공휴일" })));
      const server = computeGalleryStats(c.start, c.end, c.prep);
      const pure = planGallery({ startDate: c.start, endDate: c.end, prepDate: c.prep, holidays: new Set(c.holidays) });
      expect(server).toEqual({
        prepDate: pure.prepDate,
        weekdayCount: pure.weekdayCount,
        saturdayCount: pure.saturdayCount,
        exhibitionDayCount: pure.exhibitionDayCount,
        totalFeeKRW: pure.totalFeeKRW,
      });
      expect(pure.totalFeeKRW).toBe(c.fee);
      expect(pure.weekdayCount).toBe(c.wd);
      expect(pure.saturdayCount).toBe(c.sat);
      expect(buildGallerySessionsFromPeriod(c.start, c.end, c.prep)).toEqual(pure.sessions);
      expect(getAvailablePrepDates(c.start)).toEqual(availablePrepDates(c.start, new Set(c.holidays)));
    });
  }
  afterAll(() => _clearHolidayCache());
});
