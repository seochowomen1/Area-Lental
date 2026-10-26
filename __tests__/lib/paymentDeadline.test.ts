/**
 * 결제 기한 경과 자동 취소 — 대상 선별 4조건 + SINCE + 상한 + 멱등 · D-1 리마인드 (가명 픽스처)
 */
import type { RentalRequest } from "@/lib/types";
import { selectDeadlineCancelTargets, selectReminderTargets } from "@/lib/paymentDeadline";
import { AUTO_CANCEL_DECIDED_BY, autoCancelReason } from "@/lib/payment";

// 메일 모듈은 선별 테스트에서 호출되지 않지만 import 체인을 끊어 둔다
jest.mock("@/lib/mail", () => ({
  sendApplicantAutoCancelEmail: jest.fn(),
  sendApplicantPaymentReminderEmail: jest.fn(),
  sendAdminPaymentDeadlineSummaryEmail: jest.fn(),
}));

let seq = 0;
function req(over: Partial<RentalRequest>): RentalRequest {
  seq += 1;
  return {
    requestId: `REQ-20261001-T${String(seq).padStart(7, "0")}`,
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

const OPTS = { todayYmd: "2026-10-28", sinceYmd: "2026-01-01" };

describe("selectDeadlineCancelTargets — 4조건", () => {
  test("승인·기한 설정·미결제·기한 경과 → 대상", () => {
    const all = [req({ paymentDueDate: "2026-10-27" })];
    const r = selectDeadlineCancelTargets(all, OPTS);
    expect(r.targets).toHaveLength(1);
    expect(r.candidates).toBe(1);
    expect(r.targets[0].paymentDueDate).toBe("2026-10-27");
  });

  test("조건1: 승인 회차 0건(접수·반려·취소)은 제외", () => {
    const all = [
      req({ status: "접수", paymentDueDate: "2026-10-27" }),
      req({ status: "반려", paymentDueDate: "2026-10-27" }),
      req({ status: "취소", paymentDueDate: "2026-10-27" }),
    ];
    expect(selectDeadlineCancelTargets(all, OPTS).candidates).toBe(0);
  });

  test("조건2: 기한 미설정 건은 어떤 경우에도 제외(현장 결제 보호)", () => {
    const all = [req({}), req({ paymentDueDate: "" }), req({ paymentLinkUrl: "https://www.seochowomen.kr/x" })];
    expect(selectDeadlineCancelTargets(all, OPTS).candidates).toBe(0);
  });

  test("조건3: 결제완료·환불은 제외, 빈값·미결제는 포함", () => {
    const all = [
      req({ paymentDueDate: "2026-10-27", paymentStatus: "결제완료", paidAmountKRW: 1 }),
      req({ paymentDueDate: "2026-10-27", paymentStatus: "환불" }),
      req({ paymentDueDate: "2026-10-27", paymentStatus: "미결제" }),
      req({ paymentDueDate: "2026-10-27", paymentStatus: "" }),
    ];
    const r = selectDeadlineCancelTargets(all, OPTS);
    expect(r.candidates).toBe(2);
  });

  test("조건4: 기한 당일은 대상 아님 · 다음 날부터 대상", () => {
    const all = [req({ paymentDueDate: "2026-10-27" })];
    expect(selectDeadlineCancelTargets(all, { ...OPTS, todayYmd: "2026-10-27" }).candidates).toBe(0);
    expect(selectDeadlineCancelTargets(all, { ...OPTS, todayYmd: "2026-10-28" }).candidates).toBe(1);
  });

  test("기한 연장(미래 날짜)하면 제외", () => {
    const all = [req({ paymentDueDate: "2026-11-05" })];
    expect(selectDeadlineCancelTargets(all, OPTS).candidates).toBe(0);
  });
});

describe("selectDeadlineCancelTargets — 보호 장치", () => {
  test("SINCE 이전 기한은 제외", () => {
    const all = [req({ paymentDueDate: "2025-12-31" }), req({ paymentDueDate: "2026-10-27" })];
    const r = selectDeadlineCancelTargets(all, OPTS);
    expect(r.candidates).toBe(1);
    expect(r.targets[0].paymentDueDate).toBe("2026-10-27");
  });

  test("상한: 기한 오름차순으로 maxPerRun까지 · 초과분 skippedOverCap", () => {
    const all = [req({ paymentDueDate: "2026-10-26" }), req({ paymentDueDate: "2026-10-20" }), req({ paymentDueDate: "2026-10-27" })];
    const r = selectDeadlineCancelTargets(all, { ...OPTS, maxPerRun: 2 });
    expect(r.candidates).toBe(3);
    expect(r.targets.map((t) => t.paymentDueDate)).toEqual(["2026-10-20", "2026-10-26"]);
    expect(r.skippedOverCap).toBe(1);
  });

  test("묶음 단위: 승인 2·반려 1 묶음은 1건 · 승인 회차만 approved에", () => {
    const b = { batchId: "B-1", paymentDueDate: "2026-10-27" };
    const all = [req({ ...b, batchSeq: 1 }), req({ ...b, batchSeq: 2, status: "반려" }), req({ ...b, batchSeq: 3 })];
    const r = selectDeadlineCancelTargets(all, OPTS);
    expect(r.candidates).toBe(1);
    expect(r.targets[0].key).toBe("B:B-1");
    expect(r.targets[0].approved).toHaveLength(2);
    expect(r.targets[0].sessions).toHaveLength(3);
  });

  test("멱등: 취소된 뒤(승인 0건·autoCancelledAt)에는 대상이 아니다", () => {
    const before = [req({ paymentDueDate: "2026-10-27" })];
    expect(selectDeadlineCancelTargets(before, OPTS).candidates).toBe(1);
    const after = before.map((r) => ({
      ...r,
      status: "취소" as const,
      decidedBy: AUTO_CANCEL_DECIDED_BY,
      rejectReason: autoCancelReason("2026-10-27"),
      autoCancelledAt: "2026-10-28T00:00:00.000Z",
    }));
    expect(selectDeadlineCancelTargets(after, OPTS).candidates).toBe(0);
    expect(after[0].rejectReason).toBe("결제 기한(2026-10-27) 경과로 자동 취소");
  });
});

describe("selectReminderTargets — D-1", () => {
  test("승인·미결제·링크 있음·기한=내일·미발송 → 대상", () => {
    const all = [req({ paymentDueDate: "2026-10-29", paymentLinkUrl: "https://www.seochowomen.kr/x" })];
    expect(selectReminderTargets(all, "2026-10-28")).toHaveLength(1);
  });
  test("링크 없음 · 이미 발송 · 기한이 내일 아님 · 결제완료 → 제외", () => {
    const all = [
      req({ paymentDueDate: "2026-10-29" }),
      req({ paymentDueDate: "2026-10-29", paymentLinkUrl: "https://www.seochowomen.kr/x", paymentReminderSentAt: "2026-10-28T00:00:00.000Z" }),
      req({ paymentDueDate: "2026-10-30", paymentLinkUrl: "https://www.seochowomen.kr/x" }),
      req({ paymentDueDate: "2026-10-29", paymentLinkUrl: "https://www.seochowomen.kr/x", paymentStatus: "결제완료" }),
    ];
    expect(selectReminderTargets(all, "2026-10-28")).toHaveLength(0);
  });
});
