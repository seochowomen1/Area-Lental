import { dayOfWeek } from "@/lib/datetime";
import { computeBaseTotalKRW, computeFeesForRequest, computeFeesForBundle, normalizeDiscount } from "@/lib/pricing";
import { computeGalleryStats } from "@/lib/gallery";
import type { RentalRequest } from "@/lib/types";

// ─── dayOfWeek (타임존 안전 테스트) ───

describe("dayOfWeek", () => {
  test("2026-02-14(토요일)을 6으로 반환", () => {
    expect(dayOfWeek("2026-02-14")).toBe(6);
  });

  test("2026-02-15(일요일)을 0으로 반환", () => {
    expect(dayOfWeek("2026-02-15")).toBe(0);
  });

  test("2026-02-16(월요일)을 1로 반환", () => {
    expect(dayOfWeek("2026-02-16")).toBe(1);
  });

  test("2026-02-11(수요일)을 3으로 반환", () => {
    expect(dayOfWeek("2026-02-11")).toBe(3);
  });
});

// ─── 갤러리 요금 계산 ───

describe("갤러리 요금 계산", () => {
  test("평일 갤러리 = 20,000원", () => {
    const result = computeBaseTotalKRW({
      roomId: "gallery",
      date: "2026-02-16", // 월
      startTime: "09:00",
      endTime: "18:00",
      isPrepDay: false,
      equipment: {},
    });
    expect(result.rentalFeeKRW).toBe(20000);
    expect(result.totalFeeKRW).toBe(20000);
  });

  test("토요일 갤러리 = 10,000원", () => {
    const result = computeBaseTotalKRW({
      roomId: "gallery",
      date: "2026-02-14", // 토
      startTime: "09:00",
      endTime: "13:00",
      isPrepDay: false,
      equipment: {},
    });
    expect(result.rentalFeeKRW).toBe(10000);
    expect(result.totalFeeKRW).toBe(10000);
  });

  test("일요일 갤러리 = 0원 (휴관)", () => {
    const result = computeBaseTotalKRW({
      roomId: "gallery",
      date: "2026-02-15", // 일
      startTime: "09:00",
      endTime: "18:00",
      isPrepDay: false,
      equipment: {},
    });
    expect(result.rentalFeeKRW).toBe(0);
  });

  test("준비일 갤러리 = 0원 (무료)", () => {
    const result = computeBaseTotalKRW({
      roomId: "gallery",
      date: "2026-02-16", // 월
      startTime: "09:00",
      endTime: "18:00",
      isPrepDay: true,
      equipment: {},
    });
    expect(result.rentalFeeKRW).toBe(0);
    expect(result.totalFeeKRW).toBe(0);
  });

  test("갤러리 장비비 = 0원 고정", () => {
    const result = computeBaseTotalKRW({
      roomId: "gallery",
      date: "2026-02-16",
      startTime: "09:00",
      endTime: "18:00",
      isPrepDay: false,
      equipment: { laptop: true, projector: true },
    });
    expect(result.equipmentFeeKRW).toBe(0);
  });
});

// ─── 강의실 요금 계산 ───

describe("강의실 요금 계산", () => {
  test("상상교실2 (50,000원/h) × 2시간 = 100,000원", () => {
    const result = computeBaseTotalKRW({
      roomId: "sangsang2",
      date: "2026-02-16",
      startTime: "09:00",
      endTime: "11:00",
      equipment: {},
    });
    expect(result.rentalFeeKRW).toBe(100000);
    expect(result.durationHours).toBe(2);
  });
});

// ─── 할인 정규화 ───

describe("normalizeDiscount", () => {
  test("10% 할인 → 금액 계산", () => {
    const result = normalizeDiscount(100000, { ratePct: 10, mode: "rate" });
    expect(result.discountRatePct).toBe(10);
    expect(result.discountAmountKRW).toBe(10000);
  });

  test("금액 기준 할인 → 비율 역산", () => {
    const result = normalizeDiscount(200000, { amountKRW: 20000, mode: "amount" });
    expect(result.discountAmountKRW).toBe(20000);
    expect(result.discountRatePct).toBe(10);
  });

  test("총액 0원이면 할인 0", () => {
    const result = normalizeDiscount(0, { ratePct: 50, mode: "rate" });
    expect(result.discountAmountKRW).toBe(0);
    expect(result.discountRatePct).toBe(0);
  });

  test("할인이 총액 초과 불가", () => {
    const result = normalizeDiscount(10000, { amountKRW: 50000, mode: "amount" });
    expect(result.discountAmountKRW).toBe(10000);
  });
});

// ─── 갤러리 묶음 요금 ───

describe("갤러리 묶음 요금 (computeFeesForBundle)", () => {
  test("평일 3일 + 토 1일 + 준비일 1일 = 70,000원", () => {
    const sessions: RentalRequest[] = [
      makeGalleryReq("2026-02-13", false), // 금 20k
      makeGalleryReq("2026-02-14", false), // 토 10k
      makeGalleryReq("2026-02-16", false), // 월 20k
      makeGalleryReq("2026-02-17", false), // 화 20k
      makeGalleryReq("2026-02-12", true),  // 목 준비일 0
    ];
    const fee = computeFeesForBundle(sessions);
    expect(fee.totalFeeKRW).toBe(70000);
    expect(fee.finalFeeKRW).toBe(70000);
    expect(fee.discountAmountKRW).toBe(0);
  });
});

// ─── 갤러리 1행 형식 요금 계산 ───

describe("갤러리 1행 형식 요금 (computeBaseTotalKRW)", () => {
  test("평일 3일 + 토 1일 = 70,000원 (단건 계산)", () => {
    const result = computeBaseTotalKRW({
      roomId: "gallery",
      date: "2026-02-16",           // startDate
      startTime: "09:00",
      endTime: "18:00",
      startDate: "2026-02-16",
      endDate: "2026-02-21",
      galleryWeekdayCount: 3,
      gallerySaturdayCount: 1,
      galleryExhibitionDayCount: 4,
      equipment: {},
    });
    expect(result.rentalFeeKRW).toBe(70000);
    expect(result.totalFeeKRW).toBe(70000);
  });

  test("batchId가 있으면 기존 다행 형식 (1일분)", () => {
    const result = computeBaseTotalKRW({
      roomId: "gallery",
      date: "2026-02-16",           // 월요일
      startTime: "09:00",
      endTime: "18:00",
      batchId: "BAT-old",
      startDate: "2026-02-16",
      endDate: "2026-02-21",
      galleryWeekdayCount: 3,
      gallerySaturdayCount: 1,
      galleryExhibitionDayCount: 4,
      isPrepDay: false,
      equipment: {},
    });
    // batchId가 있으므로 기존 로직 적용 → 월요일 1일 = 20,000원
    expect(result.rentalFeeKRW).toBe(20000);
  });
});

// ─── computeGalleryStats ───

describe("computeGalleryStats", () => {
  test("2026-02-16(월) ~ 2026-02-21(토) → 평일4 + 토1 = 90,000원", () => {
    // 월,화,수,목 = 평일4, 금 = 평일5? 아니 2/16=월~2/21=토
    // 2/16(월), 2/17(화), 2/18(수), 2/19(목), 2/20(금), 2/21(토)
    // 평일 5일 + 토 1일
    const stats = computeGalleryStats("2026-02-16", "2026-02-21");
    expect(stats.weekdayCount).toBe(5);
    expect(stats.saturdayCount).toBe(1);
    expect(stats.exhibitionDayCount).toBe(6);
    expect(stats.totalFeeKRW).toBe(110000); // 5*20000 + 1*10000
    expect(stats.prepDate).toBe("2026-02-14"); // 토요일 (시작일-1 = 2/15=일 → 2/14=토)
  });

  test("일요일은 자동 제외", () => {
    // 2026-02-14(토) ~ 2026-02-16(월) → 토 + 월 (일요일 제외)
    const stats = computeGalleryStats("2026-02-14", "2026-02-16");
    expect(stats.exhibitionDayCount).toBe(2); // 토, 월
    expect(stats.saturdayCount).toBe(1);
    expect(stats.weekdayCount).toBe(1);
  });
});

function makeGalleryReq(date: string, isPrepDay: boolean): RentalRequest {
  return {
    requestId: `R-${date}`,
    roomId: "gallery",
    roomName: "우리동네 갤러리",
    date,
    startTime: "09:00",
    endTime: "18:00",
    applicantName: "테스트",
    birth: "2000-01-01",
    address: "서울",
    phone: "010-1234-5678",
    email: "test@test.com",
    orgName: "개인",
    headcount: 1,
    purpose: "전시",
    equipment: {},
    status: "접수",
    createdAt: "2026-02-01T09:00:00Z",
    pledgeDate: "2026-02-01",
    pledgeName: "테스트",
    isPrepDay,
  } as unknown as RentalRequest;
}
