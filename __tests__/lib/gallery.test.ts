import {
  galleryOperatingWindow,
  validateGalleryOperatingHours,
  buildGallerySessionsFromPeriod,
  getDefaultPrepDate,
  getAvailablePrepDates,
  computeGalleryStats,
  galleryTeardownDeadline,
  galleryPrepWindow,
  buildGalleryOccupancy,
  galleryDateConflicts,
  isPrepAfterExhibition,
} from "@/lib/gallery";
import type { RentalRequest } from "@/lib/types";
import { _clearHolidayCache } from "@/lib/holidays";

beforeEach(() => {
  _clearHolidayCache();
});

// ─── galleryOperatingWindow ───

describe("galleryOperatingWindow", () => {
  test("일요일 → null", () => {
    expect(galleryOperatingWindow("2026-03-15")).toBeNull();
  });

  test("화요일 → 09:00~20:00", () => {
    const w = galleryOperatingWindow("2026-03-17");
    expect(w).toEqual({ startTime: "09:00", endTime: "20:00" });
  });

  test("토요일 → 09:00~13:00", () => {
    const w = galleryOperatingWindow("2026-03-14");
    expect(w).toEqual({ startTime: "09:00", endTime: "13:00" });
  });

  test("평일(수) → 09:00~18:00", () => {
    const w = galleryOperatingWindow("2026-03-18");
    expect(w).toEqual({ startTime: "09:00", endTime: "18:00" });
  });
});

// ─── validateGalleryOperatingHours ───

describe("validateGalleryOperatingHours", () => {
  test("평일 정상 범위 → ok", () => {
    expect(validateGalleryOperatingHours("2026-03-18", "09:00", "18:00")).toEqual({ ok: true });
  });

  test("평일 초과 → 실패", () => {
    const r = validateGalleryOperatingHours("2026-03-18", "09:00", "19:00");
    expect(r.ok).toBe(false);
  });

  test("일요일 → 실패", () => {
    const r = validateGalleryOperatingHours("2026-03-15", "09:00", "18:00");
    expect(r.ok).toBe(false);
  });

  test("종료 ≤ 시작 → 실패", () => {
    const r = validateGalleryOperatingHours("2026-03-18", "15:00", "10:00");
    expect(r.ok).toBe(false);
  });

  test("토요일 13:00 초과 → 실패", () => {
    const r = validateGalleryOperatingHours("2026-03-14", "09:00", "14:00");
    expect(r.ok).toBe(false);
  });

  test("화요일 20:00까지 → ok", () => {
    expect(validateGalleryOperatingHours("2026-03-17", "09:00", "20:00")).toEqual({ ok: true });
  });
});

// ─── buildGallerySessionsFromPeriod ───

describe("buildGallerySessionsFromPeriod", () => {
  test("월~금 기간 → 5일 전시 + 준비일 (일요일 자동 제외)", () => {
    // 2026-03-16(월)~2026-03-20(금)
    const sessions = buildGallerySessionsFromPeriod("2026-03-16", "2026-03-20");
    const exhibition = sessions.filter((s) => !s.isPrepDay);
    const prep = sessions.filter((s) => s.isPrepDay);
    expect(exhibition).toHaveLength(5);
    expect(prep).toHaveLength(1); // 자동 준비일
  });

  test("준비일 없음 (빈 문자열) → 준비일 0개", () => {
    const sessions = buildGallerySessionsFromPeriod("2026-03-16", "2026-03-18", "");
    const prep = sessions.filter((s) => s.isPrepDay);
    expect(prep).toHaveLength(0);
  });

  test("준비일 없음 (null) → 준비일 0개", () => {
    const sessions = buildGallerySessionsFromPeriod("2026-03-16", "2026-03-18", null);
    expect(sessions.filter((s) => s.isPrepDay)).toHaveLength(0);
  });

  test("커스텀 준비일 지정 → 해당 날짜가 준비일", () => {
    const sessions = buildGallerySessionsFromPeriod("2026-03-18", "2026-03-20", "2026-03-16");
    const prep = sessions.find((s) => s.isPrepDay);
    expect(prep).toBeDefined();
    expect(prep!.date).toBe("2026-03-16");
  });

  test("일요일만 포함된 기간 → 빈 배열 (전시일 없음)", () => {
    // 2026-03-15 = 일요일 (1일만)
    const sessions = buildGallerySessionsFromPeriod("2026-03-15", "2026-03-15");
    expect(sessions).toEqual([]);
  });

  test("일요일 포함 기간 → 일요일 제외", () => {
    // 2026-03-14(토)~2026-03-16(월) → 토, 월만 포함 (일 제외)
    const sessions = buildGallerySessionsFromPeriod("2026-03-14", "2026-03-16", "");
    const dates = sessions.map((s) => s.date);
    expect(dates).not.toContain("2026-03-15");
    expect(dates).toContain("2026-03-14");
    expect(dates).toContain("2026-03-16");
  });

  test("토요일 세션 → 09:00~13:00", () => {
    const sessions = buildGallerySessionsFromPeriod("2026-03-14", "2026-03-14", "");
    expect(sessions[0].startTime).toBe("09:00");
    expect(sessions[0].endTime).toBe("13:00");
  });
});

// ─── getDefaultPrepDate ───

describe("getDefaultPrepDate", () => {
  test("월요일 시작 → 전일(토요일)이 준비일", () => {
    // 2026-03-16(월) → 준비일 = 2026-03-14(토) (일요일 건너뜀)
    const prep = getDefaultPrepDate("2026-03-16");
    expect(prep).toBe("2026-03-14");
  });

  test("화요일 시작 → 전일(월요일)이 준비일", () => {
    const prep = getDefaultPrepDate("2026-03-17");
    expect(prep).toBe("2026-03-16");
  });
});

// ─── getAvailablePrepDates ───

describe("getAvailablePrepDates", () => {
  test("일요일 제외한 이전 날짜 반환", () => {
    // 2026-03-16(월) 기준 → 14(토), 13(금), 12(목), ...
    const dates = getAvailablePrepDates("2026-03-16", 3);
    expect(dates).toHaveLength(3);
    expect(dates).not.toContain("2026-03-15"); // 일요일 제외
  });
});

// ─── computeGalleryStats ───

describe("computeGalleryStats", () => {
  test("월~금 전시 → 평일 5일, 토 0일", () => {
    const stats = computeGalleryStats("2026-03-16", "2026-03-20", "");
    expect(stats.weekdayCount).toBe(5);
    expect(stats.saturdayCount).toBe(0);
    expect(stats.exhibitionDayCount).toBe(5);
    expect(stats.totalFeeKRW).toBe(5 * 20000);
  });

  test("토요일 포함 → 토요일은 10,000원", () => {
    // 2026-03-16(월)~2026-03-21(토)
    const stats = computeGalleryStats("2026-03-16", "2026-03-21", "");
    expect(stats.saturdayCount).toBe(1);
    expect(stats.weekdayCount).toBe(5);
    expect(stats.totalFeeKRW).toBe(5 * 20000 + 1 * 10000);
  });

  test("준비일 없음 → prepDate null", () => {
    const stats = computeGalleryStats("2026-03-16", "2026-03-18", "");
    expect(stats.prepDate).toBeNull();
  });

  test("자동 준비일 → prepDate 반환", () => {
    const stats = computeGalleryStats("2026-03-16", "2026-03-18");
    expect(stats.prepDate).toBeDefined();
    expect(stats.prepDate).not.toBeNull();
  });
});

// ─── 준비·철거 규정 (2026-10-19) ───

function req(partial: Partial<RentalRequest>): RentalRequest {
  return { requestId: "r", roomId: "gallery", status: "승인", date: "", startTime: "09:00", endTime: "18:00", ...partial } as unknown as RentalRequest;
}

describe("갤러리 준비·철거 규정", () => {
  test("철거 기한: 평일 16:00 · 토요일 11:00 · 일요일 null", () => {
    expect(galleryTeardownDeadline("2026-10-28")).toBe("16:00"); // 수
    expect(galleryTeardownDeadline("2026-10-31")).toBe("11:00"); // 토
    expect(galleryTeardownDeadline("2026-11-01")).toBeNull(); // 일
  });

  test("준비일 창: 전시 없으면 운영시간 전체, 있으면 17:00~(토 11:00~)", () => {
    expect(galleryPrepWindow("2026-10-28", false)).toEqual({ startTime: "09:00", endTime: "18:00" });
    expect(galleryPrepWindow("2026-10-28", true)).toEqual({ startTime: "17:00", endTime: "18:00" });
    expect(galleryPrepWindow("2026-10-27", true)).toEqual({ startTime: "17:00", endTime: "20:00" }); // 화 야간
    expect(galleryPrepWindow("2026-10-31", true)).toEqual({ startTime: "11:00", endTime: "13:00" }); // 토
  });

  test("점유 집합: 1행 형식 + 구형 batch", () => {
    const occ = buildGalleryOccupancy([
      req({ requestId: "a", startDate: "2026-10-14", endDate: "2026-10-28", galleryPrepDate: "2026-10-13" }),
      req({ requestId: "b", batchId: "B", date: "2026-11-02", isPrepDay: true }),
      req({ requestId: "b2", batchId: "B", date: "2026-11-03" }),
      req({ requestId: "b3", batchId: "B", date: "2026-11-04" }),
      req({ requestId: "c", status: "반려", startDate: "2026-12-01", endDate: "2026-12-05" }),
    ]);
    expect(occ.exhibitionDates.has("2026-10-20")).toBe(true);
    expect(occ.exhibitionDates.has("2026-10-18")).toBe(false); // 일요일 제외
    expect(occ.endDates.has("2026-10-28")).toBe(true);
    expect(occ.prepDates.has("2026-10-13")).toBe(true);
    expect(occ.prepDates.has("2026-11-02")).toBe(true);
    expect(occ.endDates.has("2026-11-04")).toBe(true);
    expect(occ.exhibitionDates.has("2026-12-01")).toBe(false); // 반려 제외
  });

  test("충돌: 앞 전시 마지막 날은 준비일로 허용, 중간 날은 불가", () => {
    const occ = buildGalleryOccupancy([
      req({ requestId: "a", startDate: "2026-10-14", endDate: "2026-10-28", galleryPrepDate: "2026-10-13" }),
    ]);
    expect(galleryDateConflicts(occ, "2026-10-28", "prep")).toBe(false);
    expect(isPrepAfterExhibition(occ, "2026-10-28")).toBe(true);
    expect(galleryDateConflicts(occ, "2026-10-27", "prep")).toBe(true);
    expect(galleryDateConflicts(occ, "2026-10-13", "prep")).toBe(true); // 준비일끼리
    expect(galleryDateConflicts(occ, "2026-10-28", "exhibition", "2026-10-30")).toBe(true);
    expect(galleryDateConflicts(occ, "2026-10-29", "exhibition", "2026-10-30")).toBe(false);
  });

  test("관리자 날짜 범위 차단(내부 전시)의 마지막 날도 철거일로 준비 허용", () => {
    const occ = buildGalleryOccupancy([], [
      { id: "blk", roomId: "gallery", date: "2026-10-14", endDate: "2026-10-28", startTime: "09:00", endTime: "18:00", reason: "내부 전시" },
    ]);
    expect(occ.exhibitionDates.has("2026-10-20")).toBe(true);
    expect(occ.endDates.has("2026-10-28")).toBe(true);
    expect(galleryDateConflicts(occ, "2026-10-28", "prep")).toBe(false);
    expect(galleryDateConflicts(occ, "2026-10-27", "prep")).toBe(true);
    expect(isPrepAfterExhibition(occ, "2026-10-28")).toBe(true);
  });

  test("충돌: 다른 신청의 준비일은 우리 마지막 날에서만 허용", () => {
    const occ = buildGalleryOccupancy([
      req({ requestId: "n", startDate: "2026-11-05", endDate: "2026-11-10", galleryPrepDate: "2026-11-04" }),
    ]);
    expect(galleryDateConflicts(occ, "2026-11-04", "exhibition", "2026-11-04")).toBe(false);
    expect(galleryDateConflicts(occ, "2026-11-04", "exhibition", "2026-11-06")).toBe(true);
  });

  test("회차 생성: 준비일이 앞 전시 철거일이면 17:00 시작", () => {
    const sessions = buildGallerySessionsFromPeriod("2026-10-29", "2026-10-30", "2026-10-28", { prepAfterExhibition: true });
    expect(sessions[0]).toEqual({ date: "2026-10-28", startTime: "17:00", endTime: "18:00", isPrepDay: true });
    expect(sessions.length).toBe(3);
  });
});
