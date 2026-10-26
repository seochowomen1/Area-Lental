/**
 * 결제 파생 상태·링크 검증·기한 문자열 (가명 픽스처)
 */
import type { RentalRequest } from "@/lib/types";
import {
  derivePaymentView,
  isAllowedPaymentLinkUrl,
  formatDueDateKo,
  formatShortMd,
  addDaysYmd,
  publicPaymentText,
  paymentListChip,
  summarizePaymentChips,
  AUTO_CANCEL_DECIDED_BY,
} from "@/lib/payment";

function req(over: Partial<RentalRequest>): RentalRequest {
  return {
    requestId: "REQ-20261001-A0000001",
    createdAt: "2026-10-01T10:00:00.000Z",
    roomId: "bookcafe",
    roomName: "북카페",
    date: "2026-11-10",
    startTime: "10:00",
    endTime: "12:00",
    applicantName: "홍가명",
    birth: "1990-01-01",
    address: "***",
    phone: "010-0000-0000",
    email: "applicant@example.com",
    orgName: "개인",
    headcount: 5,
    equipment: { laptop: false, projector: false, audio: false },
    purpose: "테스트",
    attachments: [],
    privacyAgree: true,
    pledgeAgree: true,
    pledgeDate: "2026-10-01",
    pledgeName: "홍가명",
    status: "승인",
    adminMemo: "",
    rejectReason: "",
    decidedAt: "2026-10-20T09:00:00.000Z",
    decidedBy: "시설총무",
    ...over,
  };
}

const LINK = "https://www.seochowomen.kr/course/1";

describe("isAllowedPaymentLinkUrl", () => {
  beforeEach(() => delete process.env.PAYMENT_LINK_HOSTS);
  test("기본 허용 호스트 https만", () => {
    expect(isAllowedPaymentLinkUrl("https://www.seochowomen.kr/x")).toBe(true);
    expect(isAllowedPaymentLinkUrl("https://seochowomen.kr/x?y=1")).toBe(true);
    expect(isAllowedPaymentLinkUrl("http://www.seochowomen.kr/x")).toBe(false);
    expect(isAllowedPaymentLinkUrl("https://evil.example/x")).toBe(false);
    expect(isAllowedPaymentLinkUrl("https://www.seochowomen.kr.evil.example/x")).toBe(false);
    expect(isAllowedPaymentLinkUrl("not a url")).toBe(false);
    expect(isAllowedPaymentLinkUrl("")).toBe(false);
    expect(isAllowedPaymentLinkUrl("https://www.seochowomen.kr/" + "a".repeat(500))).toBe(false);
  });
  test("PAYMENT_LINK_HOSTS로 바꿀 수 있다", () => {
    process.env.PAYMENT_LINK_HOSTS = "example.org";
    expect(isAllowedPaymentLinkUrl("https://example.org/x")).toBe(true);
    expect(isAllowedPaymentLinkUrl("https://www.seochowomen.kr/x")).toBe(false);
  });
});

describe("날짜 표기", () => {
  test("formatDueDateKo · formatShortMd · addDaysYmd", () => {
    expect(formatDueDateKo("2026-10-27")).toBe("2026-10-27(화)");
    expect(formatShortMd("2026-10-27")).toBe("10/27");
    expect(addDaysYmd("2026-10-20", 7)).toBe("2026-10-27");
    expect(addDaysYmd("2026-12-28", 7)).toBe("2027-01-04");
  });
});

describe("derivePaymentView — 상태 모델", () => {
  const TODAY = "2026-10-26";

  test("승인 0건 → none · 배지 없음", () => {
    const v = derivePaymentView([req({ status: "접수", decidedAt: "", decidedBy: "" })], TODAY);
    expect(v.paymentState).toBe("none");
    expect(publicPaymentText(v)).toBe("-");
    expect(paymentListChip(v).text).toBe("-");
    expect(v.feeBasis).toBe("all");
    expect(v.defaultDueDate).toBe("2026-11-02"); // 승인 0건 → 오늘+7
  });

  test("승인 · 링크·기한 없음 → unnoticed · 기본 기한 = 승인일+7", () => {
    const v = derivePaymentView([req({})], TODAY);
    expect(v.paymentState).toBe("unnoticed");
    expect(v.defaultDueDate).toBe("2026-10-27");
    expect(publicPaymentText(v)).toBe("결제 안내 예정");
    expect(v.approvedFeeKRW).toBeGreaterThan(0);
  });

  test("미결제 · 기한 전 → waiting · D-1 → dueTomorrow", () => {
    const w = derivePaymentView([req({ paymentLinkUrl: LINK, paymentDueDate: "2026-10-30" })], TODAY);
    expect(w.paymentState).toBe("waiting");
    expect(publicPaymentText(w)).toBe("결제 대기");
    expect(w.paymentDueDateKo).toBe("2026-10-30(금)");
    const d = derivePaymentView([req({ paymentLinkUrl: LINK, paymentDueDate: "2026-10-27" })], TODAY);
    expect(d.paymentState).toBe("dueTomorrow");
    // 기한 당일은 아직 waiting
    expect(derivePaymentView([req({ paymentLinkUrl: LINK, paymentDueDate: "2026-10-26" })], TODAY).paymentState).toBe("waiting");
  });

  test("미결제 · 기한 경과 · 아직 승인 → overdue(취소 대기)", () => {
    const v = derivePaymentView([req({ paymentLinkUrl: LINK, paymentDueDate: "2026-10-25" })], TODAY);
    expect(v.paymentState).toBe("overdue");
    expect(publicPaymentText(v)).toBe("결제 기한 지남");
    expect(paymentListChip(v)).toMatchObject({ text: "기한 지남", tone: "red" });
  });

  test("자동 취소됨 → autoCancelled · 게시중이면 closeNeeded", () => {
    const v = derivePaymentView(
      [req({ status: "취소", decidedBy: AUTO_CANCEL_DECIDED_BY, paymentDueDate: "2026-10-22", autoCancelledAt: "2026-10-23T00:00:00.000Z", homepagePostedAt: "2026-10-20" })],
      TODAY
    );
    expect(v.paymentState).toBe("autoCancelled");
    expect(publicPaymentText(v)).toBe("기한 경과 자동 취소");
    expect(v.closeNeeded).toBe(true);
    expect(v.closeNeededDays).toBe(3);
  });

  test("결제완료 → paid · 금액 차이 · 결제 확인 금액", () => {
    const v = derivePaymentView(
      [req({ paymentStatus: "결제완료", paidAt: "2026-10-22", paidAmountKRW: 100000, homepagePostedAt: "2026-10-20", homepageClosedAt: "2026-10-22" })],
      TODAY
    );
    expect(v.paymentState).toBe("paid");
    expect(v.homepageState).toBe("closed");
    expect(v.collectedKRW).toBe(100000);
    expect(v.amountDiffKRW).toBe(v.approvedFeeKRW - 100000);
    expect(v.closeNeeded).toBe(false);
  });

  test("환불 → refunded · 결제 확인 금액 = 결제 − 환불", () => {
    const v = derivePaymentView([req({ paymentStatus: "환불", paidAmountKRW: 100000, refundAmountKRW: 40000, refundedAt: "2026-11-02" })], TODAY);
    expect(v.paymentState).toBe("refunded");
    expect(v.collectedKRW).toBe(60000);
    expect(publicPaymentText(v)).toBe("환불 완료");
  });

  test("묶음: 승인 2·반려 1 → 승인 기준 금액 · 결제 필드는 어느 행에 있어도 읽힌다", () => {
    const b = { batchId: "B-1" };
    const sessions = [
      req({ ...b, requestId: "R1", batchSeq: 1 }),
      req({ ...b, requestId: "R2", batchSeq: 2, status: "반려" }),
      req({ ...b, requestId: "R3", batchSeq: 3, paymentDueDate: "2026-10-30", paymentLinkUrl: LINK }),
    ];
    const v = derivePaymentView(sessions, TODAY);
    expect(v.approvedCount).toBe(2);
    expect(v.feeBasis).toBe("approved");
    expect(v.paymentState).toBe("waiting");
  });
});

describe("summarizePaymentChips", () => {
  test("결제 대기·마감 필요(3일 경과)·자동 취소 집계", () => {
    const TODAY = "2026-10-28";
    const all = [
      req({ requestId: "W1", paymentLinkUrl: LINK, paymentDueDate: "2026-11-05" }),
      req({ requestId: "P1", paymentStatus: "결제완료", paidAt: "2026-10-20", paidAmountKRW: 1, homepagePostedAt: "2026-10-19" }),
      req({ requestId: "A1", status: "취소", decidedBy: AUTO_CANCEL_DECIDED_BY, paymentDueDate: "2026-10-26", autoCancelledAt: "2026-10-27T00:00:00.000Z" }),
    ];
    const s = summarizePaymentChips(all, TODAY);
    expect(s).toEqual({ paymentWaiting: 1, closeNeeded: 1, closeNeededOverdue3d: 1, autoCancelled: 1, autoCancelledOverdue3d: 0 });
  });
});
