/**
 * audit-fix-1 [결3] E-스튜디오 초과 인원 가산 — 2명 초과 1인당 시간당 10,000원 (lib/pricing.ts 한 곳)
 */
import type { RentalRequest } from "@/lib/types";
import { computeBaseTotalKRW, computeExtraHeadcountFeeKRW, computeFeesForBundle, computeFeesForRequest, extraPersonHourlyKRW } from "@/lib/pricing";

const EQ = { laptop: false, projector: false, audio: false };
function studio(headcount: number | undefined, startTime: string, endTime: string, over: Partial<RentalRequest> = {}) {
  return { roomId: "media", date: "2026-11-04", startTime, endTime, equipment: EQ, headcount, ...over };
}

describe("E-스튜디오 인원 가산", () => {
  test("1인당 시간당 가산액 = 20,000 × 50% = 10,000 · 다른 공간은 0", () => {
    expect(extraPersonHourlyKRW("media")).toBe(10_000);
    expect(extraPersonHourlyKRW("sangsang1")).toBe(0);
    expect(computeExtraHeadcountFeeKRW("sangsang1", 20, 3)).toBe(0);
  });

  test.each([
    ["2명 · 3시간", 2, "10:00", "13:00", 60_000, 0],
    ["4명 · 3시간", 4, "10:00", "13:00", 120_000, 60_000],
    ["3명 · 1.5시간", 3, "10:00", "11:30", 45_000, 15_000],
    ["12명 · 1시간", 12, "10:00", "11:00", 120_000, 100_000],
    ["5명 · 2시간", 5, "10:00", "12:00", 100_000, 60_000],
  ])("%s", (_n, hc, s, e, total, extra) => {
    const b = computeBaseTotalKRW(studio(hc as number, s as string, e as string));
    expect(b.totalFeeKRW).toBe(total);
    expect(b.extraHeadcountFeeKRW).toBe(extra);
    expect(b.rentalFeeKRW).toBe(total); // 장비 없음 → 대관료 = 가산 포함 총액
  });

  test("5명 · 2회차(각 2시간) 묶음 = 200,000", () => {
    const mk = (id: string, date: string) =>
      ({ ...studio(5, "10:00", "12:00", { date }), requestId: id, batchId: "B1", status: "접수" } as unknown as RentalRequest);
    const fee = computeFeesForBundle([mk("A", "2026-11-04"), mk("B", "2026-11-05")]);
    expect(fee.totalFeeKRW).toBe(200_000);
    expect(fee.extraHeadcountFeeKRW).toBe(120_000);
  });

  test("기존 스튜디오 행(인원 1 저장)·인원 없음은 금액 불변 — 1명 3시간 60,000", () => {
    expect(computeBaseTotalKRW(studio(1, "10:00", "13:00")).totalFeeKRW).toBe(60_000);
    expect(computeBaseTotalKRW(studio(undefined, "10:00", "13:00")).totalFeeKRW).toBe(60_000);
  });

  test("할인은 가산 포함 총액 기준", () => {
    const r = { ...studio(4, "10:00", "13:00"), requestId: "X", status: "승인", discountRatePct: 50, discountAmountKRW: 60_000, discountReason: "협약" } as unknown as RentalRequest;
    const f = computeFeesForRequest(r);
    expect(f.totalFeeKRW).toBe(120_000);
    expect(f.finalFeeKRW).toBe(60_000);
  });
});
