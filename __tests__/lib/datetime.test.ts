import { toMinutes, overlaps, dayOfWeek, inRangeYmd } from "@/lib/datetime";

// ─── toMinutes ───

describe("toMinutes", () => {
  test("00:00 → 0", () => expect(toMinutes("00:00")).toBe(0));
  test("01:30 → 90", () => expect(toMinutes("01:30")).toBe(90));
  test("10:00 → 600", () => expect(toMinutes("10:00")).toBe(600));
  test("23:59 → 1439", () => expect(toMinutes("23:59")).toBe(1439));
  test("20:00 → 1200", () => expect(toMinutes("20:00")).toBe(1200));
});

// ─── overlaps ───

describe("overlaps", () => {
  test("겹치는 구간 → true", () => {
    expect(overlaps("10:00", "12:00", "11:00", "13:00")).toBe(true);
  });

  test("겹치지 않는 구간 → false", () => {
    expect(overlaps("10:00", "12:00", "12:00", "14:00")).toBe(false);
  });

  test("완전 포함 → true", () => {
    expect(overlaps("10:00", "14:00", "11:00", "13:00")).toBe(true);
  });

  test("동일 구간 → true", () => {
    expect(overlaps("10:00", "12:00", "10:00", "12:00")).toBe(true);
  });

  test("인접(종료=시작) → false", () => {
    expect(overlaps("10:00", "11:00", "11:00", "12:00")).toBe(false);
  });

  test("완전 분리 → false", () => {
    expect(overlaps("10:00", "11:00", "14:00", "15:00")).toBe(false);
  });
});

// ─── dayOfWeek ───

describe("dayOfWeek", () => {
  test("2026-01-01(목) → 4", () => expect(dayOfWeek("2026-01-01")).toBe(4));
  test("2026-03-15(일) → 0", () => expect(dayOfWeek("2026-03-15")).toBe(0));
  test("2026-03-14(토) → 6", () => expect(dayOfWeek("2026-03-14")).toBe(6));
  test("2026-03-16(월) → 1", () => expect(dayOfWeek("2026-03-16")).toBe(1));
  test("2026-03-17(화) → 2", () => expect(dayOfWeek("2026-03-17")).toBe(2));

  // 타임존 안전성: UTC 기반으로 해석하므로 타임존에 무관
  test("2025-12-31(수) → 3", () => expect(dayOfWeek("2025-12-31")).toBe(3));
});

// ─── inRangeYmd ───

describe("inRangeYmd", () => {
  test("범위 내 → true", () => {
    expect(inRangeYmd("2026-03-15", "2026-03-01", "2026-03-31")).toBe(true);
  });

  test("범위 이전 → false", () => {
    expect(inRangeYmd("2026-02-28", "2026-03-01", "2026-03-31")).toBe(false);
  });

  test("범위 이후 → false", () => {
    expect(inRangeYmd("2026-04-01", "2026-03-01", "2026-03-31")).toBe(false);
  });

  test("from만 지정 → from 이상이면 true", () => {
    expect(inRangeYmd("2026-03-15", "2026-03-01")).toBe(true);
    expect(inRangeYmd("2026-02-28", "2026-03-01")).toBe(false);
  });

  test("to만 지정 → to 이하이면 true", () => {
    expect(inRangeYmd("2026-03-15", undefined, "2026-03-31")).toBe(true);
    expect(inRangeYmd("2026-04-01", undefined, "2026-03-31")).toBe(false);
  });

  test("둘 다 미지정 → 항상 true", () => {
    expect(inRangeYmd("2099-12-31")).toBe(true);
  });

  test("경계값 포함", () => {
    expect(inRangeYmd("2026-03-01", "2026-03-01", "2026-03-31")).toBe(true);
    expect(inRangeYmd("2026-03-31", "2026-03-01", "2026-03-31")).toBe(true);
  });
});
