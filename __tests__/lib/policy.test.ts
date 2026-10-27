/**
 * audit-fix-1 ⑧-2 만 14세 미만 차단 · ③-L 결제 안내 문구 단일 출처 · [8] 삭제 보호 판정
 */
import { ageOn, isUnderMinApplicantAge, PAYMENT_FLOW_SHORT, PAYMENT_FLOW_TEXT, MINOR_APPLICANT_MESSAGE, PRIVACY_POLICY_ANNOUNCED_AT, PRIVACY_POLICY_EFFECTIVE_AT } from "@/lib/policy";
import { RequestInputSchema, GalleryRequestInputSchema } from "@/lib/schema";
import { todayYmdSeoul } from "@/lib/datetime";
import { deletionBlockReason } from "@/lib/payment";

describe("만 나이", () => {
  test("생일 전날·당일 경계", () => {
    expect(ageOn("2012-10-27", "2026-10-26")).toBe(13);
    expect(ageOn("2012-10-26", "2026-10-26")).toBe(14);
    expect(isUnderMinApplicantAge("2012-10-27", "2026-10-26")).toBe(true);
    expect(isUnderMinApplicantAge("2012-10-26", "2026-10-26")).toBe(false);
    expect(isUnderMinApplicantAge("bad", "2026-10-26")).toBe(false);
  });

  test("스키마(신청서·서버 공용)가 만 14세 미만을 birth 오류로 막는다", () => {
    const t = todayYmdSeoul();
    const y = Number(t.slice(0, 4)) - 10;
    const base = {
      roomId: "sangsang1", date: "2099-01-07", startTime: "10:00", endTime: "12:00",
      applicantName: "홍가명", birth: `${y}${t.slice(4)}`, address: "서울", phone: "01000000000", email: "a@b.com",
      orgName: "개인", headcount: "3", purpose: "테스트 목적입니다", privacyAgree: "on", pledgeAgree: "on", pledgeDate: t, pledgeName: "홍가명",
    };
    const r = RequestInputSchema.safeParse(base);
    expect(r.success).toBe(false);
    if (!r.success) {
      const issue = r.error.issues.find((i) => i.path[0] === "birth");
      expect(issue?.message).toBe(MINOR_APPLICANT_MESSAGE);
    }
    expect(RequestInputSchema.safeParse({ ...base, birth: "1990-01-01" }).success).toBe(true);
    const g = GalleryRequestInputSchema.safeParse({ ...base, roomId: "gallery", startDate: "2099-01-05", endDate: "2099-01-06", exhibitionTitle: "전시", galleryRemovalTime: "11:00" });
    expect(!g.success && g.error.issues.some((i) => i.path[0] === "birth" && i.message === MINOR_APPLICANT_MESSAGE)).toBe(true);
  });
});

describe("결제 안내 문구", () => {
  test("대상별 문구·자동 취소 안내 포함 · 방문 결제 문구 없음", () => {
    expect(PAYMENT_FLOW_TEXT("예약")).toContain("결제 기한(기본: 승인일로부터 7일) 안에 홈페이지에서 결제하면 예약이 확정");
    expect(PAYMENT_FLOW_TEXT("전시")).toContain("결제하면 전시가 확정");
    expect(PAYMENT_FLOW_TEXT("예약")).toContain("기한 다음 날 오전 9시에 신청이 자동 취소됩니다.");
    expect(PAYMENT_FLOW_SHORT("예약")).toContain("결제 기한(기본: 승인일로부터 7일) 안에 결제해야 예약이 확정");
    expect(PAYMENT_FLOW_TEXT("예약")).not.toMatch(/방문 결제|현장 결제/);
  });
  test("처리방침 시행일 = 공고일 + 7일", () => {
    const a = Date.parse(`${PRIVACY_POLICY_ANNOUNCED_AT}T00:00:00Z`);
    const e = Date.parse(`${PRIVACY_POLICY_EFFECTIVE_AT}T00:00:00Z`);
    expect((e - a) / 86_400_000).toBe(7);
  });
});

describe("deletionBlockReason [8]", () => {
  test("결제·환불 기록 → payment", () => {
    expect(deletionBlockReason({ paymentStatus: "결제완료" })).toBe("payment");
    expect(deletionBlockReason({ paymentStatus: "환불" })).toBe("payment");
    expect(deletionBlockReason({ paidAt: "2026-10-20" })).toBe("payment");
    expect(deletionBlockReason({ refundedAt: "2026-10-21" })).toBe("payment");
  });
  test("홈페이지 게시 후 마감 전 → homepage · 마감 후 → null", () => {
    expect(deletionBlockReason({ homepagePostedAt: "2026-10-20" })).toBe("homepage");
    expect(deletionBlockReason({ homepagePostedAt: "2026-10-20", homepageClosedAt: "2026-10-27" })).toBeNull();
  });
  test("기록 없음·미결제 → null", () => {
    expect(deletionBlockReason({})).toBeNull();
    expect(deletionBlockReason({ paymentStatus: "미결제" })).toBeNull();
  });
});
