import {
  operatingRangesForDate,
  operatingRangesForDayOfWeek,
  buildHourSlotsForDate,
  validateOperatingHours,
  validateOperatingHoursByDayOfWeek,
  explainNoAvailability,
  operatingNoticeText,
  operatingNoticeLines,
  isTuesdayNightOverlap,
} from "@/lib/operating";
import { _clearHolidayCache } from "@/lib/holidays";

// 공휴일 캐시를 테스트마다 초기화 (외부 API 의존 제거)
beforeEach(() => {
  _clearHolidayCache();
});

// ─── operatingRangesForDate ───

describe("operatingRangesForDate", () => {
  test("일요일 → 빈 배열", () => {
    // 2026-03-15 = 일요일
    expect(operatingRangesForDate("2026-03-15")).toEqual([]);
  });

  test("토요일 → 10:00~12:00", () => {
    // 2026-03-14 = 토요일
    const ranges = operatingRangesForDate("2026-03-14");
    expect(ranges).toHaveLength(1);
    expect(ranges[0].start).toBe("10:00");
    expect(ranges[0].end).toBe("12:00");
  });

  test("화요일 → 10:00~20:00", () => {
    // 2026-03-17 = 화요일
    const ranges = operatingRangesForDate("2026-03-17");
    expect(ranges).toHaveLength(1);
    expect(ranges[0].start).toBe("10:00");
    expect(ranges[0].end).toBe("20:00");
  });

  test("수요일(평일) → 10:00~17:00", () => {
    // 2026-03-18 = 수요일
    const ranges = operatingRangesForDate("2026-03-18");
    expect(ranges).toHaveLength(1);
    expect(ranges[0].start).toBe("10:00");
    expect(ranges[0].end).toBe("17:00");
  });
});

// ─── operatingRangesForDayOfWeek ───

describe("operatingRangesForDayOfWeek", () => {
  test("일요일(0) → 빈 배열", () => {
    expect(operatingRangesForDayOfWeek(0)).toEqual([]);
  });

  test("월요일(1) → 평일 운영", () => {
    const r = operatingRangesForDayOfWeek(1);
    expect(r[0].start).toBe("10:00");
    expect(r[0].end).toBe("17:00");
  });

  test("화요일(2) → 야간 포함", () => {
    const r = operatingRangesForDayOfWeek(2);
    expect(r[0].end).toBe("20:00");
  });

  test("토요일(6) → 오전만", () => {
    const r = operatingRangesForDayOfWeek(6);
    expect(r[0].end).toBe("12:00");
  });
});

// ─── buildHourSlotsForDate ───

describe("buildHourSlotsForDate", () => {
  test("평일 → 14개 슬롯 (10:00~17:00, 30분 단위)", () => {
    // 2026-03-18 = 수요일
    const slots = buildHourSlotsForDate("2026-03-18");
    expect(slots).toHaveLength(14);
    expect(slots[0]).toEqual({ start: "10:00", end: "10:30" });
    expect(slots[slots.length - 1]).toEqual({ start: "16:30", end: "17:00" });
  });

  test("화요일 → 20개 슬롯 (10:00~20:00)", () => {
    const slots = buildHourSlotsForDate("2026-03-17");
    expect(slots).toHaveLength(20);
  });

  test("토요일 → 4개 슬롯 (10:00~12:00)", () => {
    const slots = buildHourSlotsForDate("2026-03-14");
    expect(slots).toHaveLength(4);
  });

  test("일요일 → 빈 배열", () => {
    expect(buildHourSlotsForDate("2026-03-15")).toEqual([]);
  });
});

// ─── validateOperatingHours ───

describe("validateOperatingHours", () => {
  test("평일 정상 시간 → ok", () => {
    expect(validateOperatingHours("2026-03-18", "10:00", "12:00")).toEqual({ ok: true });
  });

  test("평일 범위 초과 → 실패", () => {
    const result = validateOperatingHours("2026-03-18", "10:00", "18:00");
    expect(result.ok).toBe(false);
  });

  test("일요일 → 실패", () => {
    const result = validateOperatingHours("2026-03-15", "10:00", "12:00");
    expect(result.ok).toBe(false);
    expect("message" in result && result.message).toContain("일요일");
  });

  test("종료 < 시작 → 실패", () => {
    const result = validateOperatingHours("2026-03-18", "14:00", "12:00");
    expect(result.ok).toBe(false);
  });

  test("화요일 야간 포함 → ok", () => {
    expect(validateOperatingHours("2026-03-17", "18:00", "20:00")).toEqual({ ok: true });
  });

  test("토요일 12:00 초과 → 실패", () => {
    const result = validateOperatingHours("2026-03-14", "10:00", "13:00");
    expect(result.ok).toBe(false);
    expect("message" in result && result.message).toContain("토요일");
  });
});

// ─── validateOperatingHoursByDayOfWeek ───

describe("validateOperatingHoursByDayOfWeek", () => {
  test("월요일 정상 → ok", () => {
    expect(validateOperatingHoursByDayOfWeek(1, "10:00", "12:00")).toEqual({ ok: true });
  });

  test("일요일 → 실패", () => {
    expect(validateOperatingHoursByDayOfWeek(0, "10:00", "12:00").ok).toBe(false);
  });
});

// ─── explainNoAvailability ───

describe("explainNoAvailability", () => {
  test("과거 날짜 → PAST", () => {
    const result = explainNoAvailability("2020-01-01", { todayYmd: "2026-03-16" });
    expect(result.code).toBe("PAST");
  });

  test("일요일 → SUNDAY_CLOSED", () => {
    const result = explainNoAvailability("2026-03-15", { todayYmd: "2026-03-14" });
    expect(result.code).toBe("SUNDAY_CLOSED");
  });

  test("마감 → FULLY_BOOKED_OR_BLOCKED", () => {
    const result = explainNoAvailability("2026-03-18", { todayYmd: "2026-03-16", fullyBooked: true });
    expect(result.code).toBe("FULLY_BOOKED_OR_BLOCKED");
  });

  test("일반 미래 평일 → UNKNOWN", () => {
    const result = explainNoAvailability("2026-03-18", { todayYmd: "2026-03-16" });
    expect(result.code).toBe("UNKNOWN");
  });
});

// ─── operatingNoticeText ───

describe("operatingNoticeText", () => {
  test("일반 공간 → 평일/화/토 포함", () => {
    const text = operatingNoticeText();
    expect(text).toContain("평일");
    expect(text).toContain("화");
    expect(text).toContain("토");
    expect(text).toContain("공휴일");
  });

  test("갤러리 → 9시 시작", () => {
    const text = operatingNoticeText("gallery");
    expect(text).toContain("9:00");
  });
});

// ─── operatingNoticeLines ───

describe("operatingNoticeLines", () => {
  test("일반 공간 → 3라인", () => {
    expect(operatingNoticeLines()).toHaveLength(3);
  });

  test("갤러리 → 3라인", () => {
    expect(operatingNoticeLines("gallery")).toHaveLength(3);
  });
});

// ─── isTuesdayNightOverlap (호환성) ───

describe("isTuesdayNightOverlap", () => {
  test("항상 false 반환 (야간 통합 후 호환)", () => {
    expect(isTuesdayNightOverlap("2026-03-17", "18:00", "20:00")).toBe(false);
    expect(isTuesdayNightOverlap(null, null, null)).toBe(false);
  });
});
