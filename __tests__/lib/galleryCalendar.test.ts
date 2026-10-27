/**
 * audit-fix-2 항목 3·7·Q9 — 갤러리 상세 달력 칸 상태 · 이번 달 신청 가능한 날 수
 */
import { countGallerySelectableDays, datesOfMonth, galleryBaseDayState, galleryPrepAfterText } from "@/lib/galleryCalendar";

// MOCK 예시: 전시 11/2~4(월~수), 11/16~18(월~수) — bookedDates에 철거일(마지막 날) 포함
const booked = new Set(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-16", "2026-11-17", "2026-11-18"]);
const holidays = new Set(["2026-12-25"]);

describe("칸 상태(선택 전)", () => {
  const ctx = { today: "2026-11-10", booked, holidays };

  test("지난 날짜·오늘 = past (일요일·전시일이어도 지난 날이면 past)", () => {
    expect(galleryBaseDayState("2026-11-10", ctx)).toBe("past"); // 오늘(갤러리는 당일 불가)
    expect(galleryBaseDayState("2026-11-08", ctx)).toBe("past"); // 지난 일요일
    expect(galleryBaseDayState("2026-11-03", ctx)).toBe("past"); // 지난 전시일
  });

  test("미래: 일요일 closed · 공휴일 holiday · 전시·철거일 booked · 그 밖 available", () => {
    expect(galleryBaseDayState("2026-11-15", ctx)).toBe("closed");
    expect(galleryBaseDayState("2026-12-25", ctx)).toBe("holiday");
    expect(galleryBaseDayState("2026-11-18", ctx)).toBe("booked"); // 앞 전시 철거일 = 마감
    expect(galleryBaseDayState("2026-11-19", ctx)).toBe("available");
    expect(galleryBaseDayState("2026-11-11", ctx)).toBe("available");
  });
});

describe("이번 달 신청 가능한 날 N", () => {
  test("2026-11, 오늘 10/27: 30일 − 일요일 5 − 전시 6 = 19", () => {
    expect(datesOfMonth("2026-11")).toHaveLength(30);
    expect(countGallerySelectableDays("2026-11", { today: "2026-10-27", booked, holidays })).toBe(19);
  });

  test("이번 달 중간(오늘 11/10): 11/11~30 중 일요일 3·전시 3 제외 = 14", () => {
    expect(countGallerySelectableDays("2026-11", { today: "2026-11-10", booked, holidays })).toBe(14);
  });

  test("모두 지난 달 = 0 · 형식 오류 = 0", () => {
    expect(countGallerySelectableDays("2026-09", { today: "2026-10-27", booked, holidays })).toBe(0);
    expect(countGallerySelectableDays("2026-9", { today: "2026-10-27", booked, holidays })).toBe(0);
  });
});

test("준비일 둘째 줄 문구: 평일 17:00 이후 · 토 11:00 이후", () => {
  expect(galleryPrepAfterText("2026-11-18")).toBe("17:00 이후");
  expect(galleryPrepAfterText("2026-11-21")).toBe("11:00 이후");
});
