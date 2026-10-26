/**
 * 결제 안내 블록 · 자동 취소 메일 · 리마인드 메일 본문 (가명 픽스처 · 템플릿은 기본값)
 */
import type { RentalRequest } from "@/lib/types";
import { buildPaymentNoticeBlock, generateAutoCancelEmailContent, generateReminderEmailContent, generateDecisionEmailContent } from "@/lib/mail";
import { AUTO_CANCEL_DECIDED_BY, autoCancelReason } from "@/lib/payment";

jest.mock("@/lib/database", () => ({
  getDatabase: () => ({ getEmailTemplates: async () => [] }),
}));

function req(over: Partial<RentalRequest>): RentalRequest {
  return {
    requestId: "REQ-20261020-7K3M9Q2A",
    createdAt: "2026-10-20T10:00:00.000Z",
    roomId: "gallery",
    roomName: "우리동네 갤러리",
    date: "2026-10-29",
    startTime: "09:00",
    endTime: "18:00",
    applicantName: "이가영",
    birth: "1990-01-01",
    address: "***",
    phone: "010-0000-0000",
    email: "gallery-applicant@example.com",
    orgName: "개인",
    headcount: 1,
    equipment: { laptop: false, projector: false, audio: false },
    purpose: "테스트",
    attachments: [],
    privacyAgree: true,
    pledgeAgree: true,
    pledgeDate: "2026-10-20",
    pledgeName: "이가영",
    status: "승인",
    adminMemo: "",
    rejectReason: "",
    decidedAt: "2026-10-20T14:00:00.000Z",
    decidedBy: "시설총무",
    startDate: "2026-10-29",
    endDate: "2026-11-03",
    galleryPrepDate: "2026-10-28",
    galleryWeekdayCount: 4,
    gallerySaturdayCount: 1,
    galleryExhibitionDayCount: 5,
    ...over,
  };
}

const LINK = "https://www.seochowomen.kr/course/test-1";

describe("buildPaymentNoticeBlock", () => {
  test("승인 + 링크 → spec ③-(나) 원문 · '대관' 단어 없음(강좌명 접두사 제외)", () => {
    const block = buildPaymentNoticeBlock([req({ paymentLinkUrl: LINK, paymentDueDate: "2026-10-27" })]);
    expect(block.split("\n")).toEqual([
      "[결제 안내]",
      "- 결제 방법: 서초여성가족플라자 홈페이지에서 온라인 결제",
      `- 결제 링크: ${LINK}`,
      "- 결제 기한: 2026-10-27(화)까지",
      "- 링크가 열리지 않으면 홈페이지 > 강좌 신청 > 강좌목록(카테고리 '기타')에서",
      '  "[전시]26.10.29.(목)~26.11.3.(화) 우리동네갤러리(이*영)" 를 찾아 신청·결제해 주세요.',
      "- 결제 기한까지 결제가 확인되지 않으면 신청이 자동 취소됩니다.",
    ]);
    expect(block).not.toMatch(/대관/);
  });
  test("링크 없음 또는 승인 0건 → 빈 문자열", () => {
    expect(buildPaymentNoticeBlock([req({})])).toBe("");
    expect(buildPaymentNoticeBlock([req({ status: "접수", paymentLinkUrl: LINK })])).toBe("");
  });
});

describe("승인 메일(단건) 결제 안내 포함", () => {
  test("링크 있으면 [결제 안내]가 요금 블록 뒤에 · paymentGuideIncluded=true · 갤러리 본문에 '대관' 없음", async () => {
    const c = await generateDecisionEmailContent(req({ paymentLinkUrl: LINK, paymentDueDate: "2026-10-27" }));
    expect(c?.paymentGuideIncluded).toBe(true);
    expect(c?.body).toContain("[결제 안내]");
    expect(c?.body.indexOf("[이용 요금]")).toBeLessThan(c!.body.indexOf("[결제 안내]"));
    expect(c?.subject).toContain("전시 신청");
    // 강좌명 접두사 "[전시]"만 허용, 그 외 "대관" 없음
    expect(c?.body.replace(/\[전시\]/g, "")).not.toMatch(/대관/);
  });
  test("링크 없으면 블록 없음 · paymentGuideIncluded=false", async () => {
    const c = await generateDecisionEmailContent(req({}));
    expect(c?.paymentGuideIncluded).toBe(false);
    expect(c?.body).not.toContain("[결제 안내]");
  });
});

describe("자동 취소 메일", () => {
  test("취소 템플릿 + [자동 취소 안내] 블록이 처리상태 줄 뒤 · 갤러리 변환으로 '대관' 없음", async () => {
    const cancelled = req({ status: "취소", decidedBy: AUTO_CANCEL_DECIDED_BY, rejectReason: autoCancelReason("2026-10-27"), paymentDueDate: "2026-10-27" });
    const c = await generateAutoCancelEmailContent([cancelled], "2026-10-27");
    expect(c?.to).toBe("gallery-applicant@example.com");
    expect(c?.subject).toBe("[취소] 우리동네 갤러리 전시 신청 결과 (REQ-20261020-7K3M9Q2A)");
    const lines = c!.body.split("\n");
    const statusIdx = lines.findIndex((l) => l.includes("처리상태"));
    expect(statusIdx).toBeGreaterThan(0);
    expect(lines[statusIdx + 2]).toBe("[자동 취소 안내]");
    expect(lines[statusIdx + 3]).toBe("- 사유: 결제 기한(2026-10-27) 경과로 자동 취소");
    expect(c?.body).toContain("결제 기한까지 결제가 확인되지 않아 신청이 자동 취소되었습니다.");
    expect(c?.body).toContain("이미 결제하셨다면 센터로 연락해 주세요.");
    expect(c?.body).not.toMatch(/대관/);
  });
  test("묶음은 {{일시}}에 취소된 회차 목록", async () => {
    const b = { roomId: "classroom_all", roomName: "모두의교실", batchId: "B-1", startDate: undefined, endDate: undefined, galleryPrepDate: undefined, email: "bundle-applicant@example.com" };
    const list = [
      req({ ...b, requestId: "R1", batchSeq: 1, date: "2026-11-06", startTime: "14:00", endTime: "16:00", status: "취소", decidedBy: AUTO_CANCEL_DECIDED_BY }),
      req({ ...b, requestId: "R3", batchSeq: 3, date: "2026-11-27", startTime: "14:00", endTime: "16:00", status: "취소", decidedBy: AUTO_CANCEL_DECIDED_BY }),
    ];
    const c = await generateAutoCancelEmailContent(list, "2026-11-03");
    expect(c?.subject).toContain("[취소] 강의실 대관 신청 결과 (R1)");
    expect(c?.body).toContain("1. 2026-11-06 14:00-16:00");
    expect(c?.body).toContain("2. 2026-11-27 14:00-16:00");
    expect(c?.body).toContain("결제 기한(2026-11-03) 경과로 자동 취소");
  });
});

describe("D-1 리마인드 메일", () => {
  test("제목·본문 spec 원문 · 갤러리 변환", () => {
    const c = generateReminderEmailContent([req({ paymentLinkUrl: LINK, paymentDueDate: "2026-10-27" })], "2026-10-27");
    expect(c?.subject).toBe("[결제 안내] 내일(2026-10-27)까지 결제해 주세요 (REQ-20261020-7K3M9Q2A)");
    expect(c?.body).toContain("아래 신청의 결제 기한이 내일(2026-10-27)까지입니다.");
    expect(c?.body).toContain(`- 결제 링크: ${LINK}`);
    expect(c?.body).toContain("이미 결제하셨다면 이 메일은 무시하셔도 됩니다.");
    expect(c?.body).not.toMatch(/대관/);
  });
});
