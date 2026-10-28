/**
 * audit-fix-3 3-2 — 관리자 "할 일" 단계 판정 (간소화안 v2 · 02_ui §4)
 * 단계 4개(승인 → 결제 안내 → 결제 확인 → 홈페이지 마감) + 끝남 · 묶음 단위 · 가명 픽스처
 */
import type { RentalRequest } from "@/lib/types";
import { AUTO_CANCEL_DECIDED_BY, groupBundles } from "@/lib/payment";
import {
  WORKFLOW_SINCE,
  buildTodoRow,
  bundleMatchesSearch,
  deriveWorkStage,
  formatSpaceSchedule,
  koMonthDayDow,
  parseSearchQuery,
  shortMdDow,
  sortTodoRows,
} from "@/lib/workflow";

const TODAY = "2026-11-04"; // 수요일
const LINK = "https://www.seochowomen.kr/course/1";

function req(over: Partial<RentalRequest>): RentalRequest {
  return {
    requestId: "REQ-20261101-A0000001",
    createdAt: "2026-11-01T10:00:00.000Z",
    roomId: "sangsang1",
    roomName: "상상교실 1",
    date: "2026-11-20",
    startTime: "10:00",
    endTime: "12:00",
    applicantName: "홍가명",
    birth: "1990-01-01",
    address: "***",
    phone: "010-1111-1234",
    email: "applicant@example.com",
    orgName: "개인",
    headcount: 5,
    equipment: { laptop: false, projector: false, audio: false },
    purpose: "테스트",
    attachments: [],
    privacyAgree: true,
    pledgeAgree: true,
    pledgeDate: "2026-11-01",
    pledgeName: "홍가명",
    status: "접수",
    adminMemo: "",
    rejectReason: "",
    decidedAt: "",
    decidedBy: "",
    ...over,
  };
}

/** 승인된 단건(결제 4단계 이후 승인) */
function approved(over: Partial<RentalRequest> = {}): RentalRequest {
  return req({ status: "승인", decidedAt: "2026-11-02T09:00:00.000Z", decidedBy: "시설총무", ...over });
}

function bundle(n: number, status: (i: number) => RentalRequest["status"], over: Partial<RentalRequest> = {}): RentalRequest[] {
  const batchId = `BAT-${n}-${Math.random().toString(36).slice(2, 7)}`;
  return Array.from({ length: n }, (_, i) =>
    req({
      requestId: `REQ-20261101-B${String(i).padStart(7, "0")}`,
      batchId,
      batchSeq: i + 1,
      batchSize: n,
      date: `2026-11-${String(10 + i).padStart(2, "0")}`,
      status: status(i),
      decidedAt: status(i) === "접수" ? "" : "2026-11-02T09:00:00.000Z",
      ...over,
    })
  );
}

describe("날짜 표기", () => {
  test("shortMdDow · koMonthDayDow", () => {
    expect(shortMdDow("2026-11-10")).toBe("11/10(화)");
    expect(shortMdDow("")).toBe("");
    expect(koMonthDayDow("2026-11-09")).toBe("11월 9일(월)");
  });
});

describe("deriveWorkStage — 판정 표(02_ui §4)", () => {
  test("1. 접수 단건 → 승인", () => {
    const w = deriveWorkStage([req({})], TODAY);
    expect(w.stage).toBe("approve");
    expect(w.nextLabel).toBe("승인하기");
    expect(w.pendingCount).toBe(1);
    expect(w.partial).toBe(false);
    expect(w.chip).toBeNull();
  });

  test("1. 일부만 승인된 묶음(접수 남음) → 승인 · partial", () => {
    const w = deriveWorkStage(bundle(5, (i) => (i < 2 ? "승인" : "접수")), TODAY);
    expect(w.stage).toBe("approve");
    expect(w.partial).toBe(true);
    expect(w.pendingCount).toBe(3);
    expect(w.approvedCount).toBe(2);
  });

  test("2. 결제완료 + 홈페이지 게시중 → 홈페이지 마감(closePaid)", () => {
    const w = deriveWorkStage([approved({ paymentLinkUrl: LINK, paymentDueDate: "2026-11-10", paymentStatus: "결제완료", paidAt: "2026-11-03", paidAmountKRW: 140000, homepagePostedAt: "2026-11-02" })], TODAY);
    expect(w.stage).toBe("close");
    expect(w.sub).toBe("closePaid");
    expect(w.nextLabel).toBe("홈페이지 마감");
  });

  test("2. 반려(전 회차) + 게시중 → 홈페이지 마감(closeEnded)", () => {
    const w = deriveWorkStage([req({ status: "반려", decidedAt: "2026-11-03T10:00:00.000Z", homepagePostedAt: "2026-11-02" })], TODAY);
    expect(w.stage).toBe("close");
    expect(w.sub).toBe("closeEnded");
  });

  test("2. 환불 + 게시중 → 홈페이지 마감(closeEnded)", () => {
    const w = deriveWorkStage([approved({ paymentStatus: "환불", paidAmountKRW: 140000, refundAmountKRW: 140000, refundedAt: "2026-11-03", homepagePostedAt: "2026-11-02", paymentDueDate: "2026-11-10" })], TODAY);
    expect(w.stage).toBe("close");
    expect(w.sub).toBe("closeEnded");
  });

  test("3. 자동 취소 · 게시 체크 없어도 마감 기록 없으면 홈페이지 마감(closeAutoCancelled)", () => {
    const w = deriveWorkStage(
      [req({ status: "취소", decidedBy: AUTO_CANCEL_DECIDED_BY, decidedAt: "2026-11-04T09:00:00.000Z", autoCancelledAt: "2026-11-04T09:00:00.000Z", paymentDueDate: "2026-11-03", paymentLinkUrl: LINK })],
      TODAY
    );
    expect(w.stage).toBe("close");
    expect(w.sub).toBe("closeAutoCancelled");
  });

  test("3. 자동 취소 + 마감 기록 있음 → 끝남", () => {
    const w = deriveWorkStage(
      [req({ status: "취소", decidedBy: AUTO_CANCEL_DECIDED_BY, decidedAt: "2026-11-04T09:00:00.000Z", autoCancelledAt: "2026-11-04T09:00:00.000Z", paymentDueDate: "2026-11-03", homepageClosedAt: "2026-11-04" })],
      TODAY
    );
    expect(w.stage).toBe("done");
    expect(w.doneReason).toBe("자동 취소 11/4 · 홈페이지 마감 11/4");
  });

  test("4. 무료 승인(전액 할인 0원) → 끝남 · 무료 승인", () => {
    const w = deriveWorkStage([approved({ discountRatePct: 100, discountAmountKRW: 140000, discountReason: "센터 협력 단체" })], TODAY);
    expect(w.view.approvedFeeKRW).toBe(0);
    expect(w.stage).toBe("done");
    expect(w.doneReason).toBe("무료 승인 · 결제 없음");
  });

  test("5. 10/20 승인 · 결제 기록 없음 → 끝남(이전 방식) · 할 일에 안 나옴", () => {
    const w = deriveWorkStage([approved({ decidedAt: "2026-10-20T09:00:00.000Z" })], TODAY);
    expect(w.stage).toBe("done");
    expect(w.doneReason).toBe("이전 방식 승인 · 결제 기록 없음");
    expect(WORKFLOW_SINCE).toBe("2026-10-26");
  });

  test("5. 10/20 승인이라도 결제 기록이 있으면 이전 방식 아님", () => {
    const w = deriveWorkStage([approved({ decidedAt: "2026-10-20T09:00:00.000Z", paymentDueDate: "2026-11-10", paymentLinkUrl: LINK })], TODAY);
    expect(w.stage).toBe("notice");
    expect(w.sub).toBe("noticeBeforeMail");
  });

  test("5. 10/26 당일 승인 · 결제 기록 없음 → 결제 안내(이전 방식 아님)", () => {
    const w = deriveWorkStage([approved({ decidedAt: "2026-10-26T09:00:00.000Z" })], TODAY);
    expect(w.stage).toBe("notice");
  });

  test("6. 미결제 · 기한 지남(안내 메일 전이라도) → 결제 확인 · 빨강 칩 · 맨 위", () => {
    const w = deriveWorkStage([approved({ paymentLinkUrl: LINK, paymentDueDate: "2026-11-03" })], TODAY);
    expect(w.stage).toBe("payment");
    expect(w.overdue).toBe(true);
    expect(w.urgentRank).toBe(0);
    expect(w.chip).toEqual({ kind: "overdue", text: "기한 지남 11/3" });
    expect(w.nextLabel).toBe("결제 확인");
  });

  test("7. 승인 · 결제 기한 없음 → 결제 안내(링크 전)", () => {
    const w = deriveWorkStage([approved()], TODAY);
    expect(w.stage).toBe("notice");
    expect(w.sub).toBe("noticeBeforeLink");
    expect(w.nextLabel).toBe("결제 안내 보내기");
  });

  test("7. 링크만 있고 기한 없음(비정상) → 결제 안내(링크 전)", () => {
    expect(deriveWorkStage([approved({ paymentLinkUrl: LINK })], TODAY).sub).toBe("noticeBeforeLink");
  });

  test("7. 링크·기한 저장 · 메일 전 → 결제 안내(메일 전)", () => {
    const w = deriveWorkStage([approved({ paymentLinkUrl: LINK, paymentDueDate: "2026-11-10" })], TODAY);
    expect(w.stage).toBe("notice");
    expect(w.sub).toBe("noticeBeforeMail");
    expect(w.chip).toBeNull();
  });

  test("7. 메일 전인데 내일이 기한 → 결제 안내 + 내일 기한 칩", () => {
    const w = deriveWorkStage([approved({ paymentLinkUrl: LINK, paymentDueDate: "2026-11-05" })], TODAY);
    expect(w.stage).toBe("notice");
    expect(w.dueTomorrow).toBe(true);
    expect(w.chip).toEqual({ kind: "dueTomorrow", text: "내일 기한" });
    expect(w.urgentRank).toBe(2);
  });

  test("8. 안내 메일 보냄 → 결제 확인", () => {
    const w = deriveWorkStage([approved({ paymentLinkUrl: LINK, paymentDueDate: "2026-11-10", paymentNoticeSentAt: "2026-11-02T10:00:00.000Z" })], TODAY);
    expect(w.stage).toBe("payment");
    expect(w.overdue).toBe(false);
    expect(w.urgentRank).toBe(6);
    expect(w.chip).toBeNull();
  });

  test("8. 링크 없이 기한만 저장 → 결제 확인", () => {
    expect(deriveWorkStage([approved({ paymentDueDate: "2026-11-10" })], TODAY).stage).toBe("payment");
  });

  test("8. 내일 기한 · 메일 보냄 → 결제 확인 + 내일 기한 칩", () => {
    const w = deriveWorkStage([approved({ paymentLinkUrl: LINK, paymentDueDate: "2026-11-05", paymentNoticeSentAt: "2026-11-02T10:00:00.000Z" })], TODAY);
    expect(w.stage).toBe("payment");
    expect(w.chip?.kind).toBe("dueTomorrow");
  });

  test("9. 결제완료 + 마감 → 끝남 사유", () => {
    const w = deriveWorkStage([approved({ paymentStatus: "결제완료", paidAt: "2026-11-03", paidAmountKRW: 140000, paymentMethod: "홈페이지 온라인", homepagePostedAt: "2026-11-02", homepageClosedAt: "2026-10-22", paymentDueDate: "2026-11-10" })], TODAY);
    expect(w.stage).toBe("done");
    expect(w.doneReason).toBe("결제 완료 · 홈페이지 마감 10/22");
    expect(w.nextLabel).toBe("결제 완료 · 홈페이지 마감 10/22");
  });

  test("9. 현장 결제 · 홈페이지 게시 안 함 → 끝남", () => {
    const w = deriveWorkStage([approved({ paymentStatus: "결제완료", paidAt: "2026-11-03", paidAmountKRW: 140000, paymentMethod: "현장 카드", paymentDueDate: "2026-11-10" })], TODAY);
    expect(w.stage).toBe("done");
    expect(w.doneReason).toBe("결제 완료(현장) · 홈페이지 게시 안 함");
  });

  test("9. 반려 · 신청자 취소 · 환불 사유", () => {
    expect(deriveWorkStage([req({ status: "반려", decidedAt: "2026-10-20T10:00:00.000Z" })], TODAY).doneReason).toBe("반려 10/20");
    expect(deriveWorkStage([req({ status: "취소", decidedBy: "신청자", decidedAt: "2026-10-21T10:00:00.000Z" })], TODAY).doneReason).toBe("신청자 취소 10/21");
    expect(
      deriveWorkStage([approved({ paymentStatus: "환불", paidAmountKRW: 140000, refundAmountKRW: 140000, refundedAt: "2026-11-02", paymentDueDate: "2026-11-10" })], TODAY).doneReason
    ).toBe("환불 11/2");
  });

  test("묶음 일부 반려 + 나머지 승인 → 승인 회차 기준으로 진행", () => {
    const w = deriveWorkStage(bundle(4, (i) => (i === 0 ? "반려" : "승인")), TODAY);
    expect(w.stage).toBe("notice");
    expect(w.approvedCount).toBe(3);
  });

  test("판정 9줄 묶음을 각각 넣으면 단계가 정확히 1개씩", () => {
    const fixtures: RentalRequest[][] = [
      [req({ requestId: "R1" })],
      [approved({ requestId: "R2", paymentStatus: "결제완료", paidAt: "2026-11-03", paidAmountKRW: 1, homepagePostedAt: "2026-11-02", paymentDueDate: "2026-11-10" })],
      [req({ requestId: "R3", status: "취소", decidedBy: AUTO_CANCEL_DECIDED_BY, autoCancelledAt: "2026-11-04T09:00:00.000Z", paymentDueDate: "2026-11-03" })],
      [approved({ requestId: "R5", decidedAt: "2026-10-20T09:00:00.000Z" })],
      [approved({ requestId: "R6", paymentLinkUrl: LINK, paymentDueDate: "2026-11-03" })],
      [approved({ requestId: "R7" })],
      [approved({ requestId: "R8", paymentLinkUrl: LINK, paymentDueDate: "2026-11-10", paymentNoticeSentAt: "2026-11-02T10:00:00.000Z" })],
      [req({ requestId: "R9", status: "반려", decidedAt: "2026-10-20T10:00:00.000Z" })],
    ];
    const stages = fixtures.map((f) => deriveWorkStage(f, TODAY).stage);
    expect(stages).toEqual(["approve", "close", "close", "done", "payment", "notice", "payment", "done"]);
  });
});

describe("할 일 목록 줄", () => {
  const cat = () => "lecture";

  test("수용 1(v2): 10회 묶음 1건 + 단건 2건(모두 접수) → 3줄(회차 수 12가 아님)", () => {
    const all = [...bundle(10, () => "접수"), req({ requestId: "S1" }), req({ requestId: "S2" })];
    const rows = Array.from(groupBundles(all).values())
      .map((s) => buildTodoRow(s, TODAY, cat))
      .filter((r) => r.stage !== "done");
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.nextLabel === "승인하기")).toBe(true);
  });

  test("공간 · 일정 표기 — 단건 / 묶음 / 갤러리", () => {
    expect(formatSpaceSchedule([req({ roomName: "상상교실 2", date: "2026-11-09", startTime: "19:00", endTime: "21:00" })])).toBe("상상교실 2 · 11월 9일(월) 19:00~21:00");
    expect(formatSpaceSchedule(bundle(4, () => "접수", { roomName: "상상교실 1" }))).toBe("상상교실 1 · 11월 10일(화)부터 4회");
    expect(
      formatSpaceSchedule([req({ roomId: "gallery", roomName: "우리동네 갤러리", date: "2026-11-10", startDate: "2026-11-10", endDate: "2026-11-15" })])
    ).toBe("우리동네 갤러리 · 11월 10일(화)~11월 15일(일) 전시");
    // 반려된 회차는 횟수에서 뺀다
    expect(formatSpaceSchedule(bundle(4, (i) => (i === 0 ? "반려" : "접수"), { roomName: "상상교실 1" }))).toBe("상상교실 1 · 11월 11일(수)부터 3회");
  });

  test("급한 순 — 기한 지남 → 내일 기한 → 홈페이지 마감 → 승인 → 결제 안내 → 결제 확인", () => {
    const rows = [
      buildTodoRow([approved({ requestId: "P", paymentDueDate: "2026-11-10", paymentNoticeSentAt: "x" })], TODAY, cat),
      buildTodoRow([approved({ requestId: "N" })], TODAY, cat),
      buildTodoRow([req({ requestId: "A" })], TODAY, cat),
      buildTodoRow([approved({ requestId: "C", paymentStatus: "결제완료", paidAt: "2026-11-03", paidAmountKRW: 1, homepagePostedAt: "2026-11-02", paymentDueDate: "2026-11-10" })], TODAY, cat),
      buildTodoRow([approved({ requestId: "T", paymentDueDate: "2026-11-05", paymentNoticeSentAt: "x" })], TODAY, cat),
      buildTodoRow([approved({ requestId: "O", paymentDueDate: "2026-11-03", paymentNoticeSentAt: "x" })], TODAY, cat),
    ];
    expect(sortTodoRows(rows).map((r) => r.key)).toEqual(["R:O", "R:T", "R:C", "R:A", "R:N", "R:P"]);
  });

  test("같은 단계 안에서는 이용 시작일 빠른 순", () => {
    const rows = [
      buildTodoRow([req({ requestId: "LATE", date: "2026-12-01" })], TODAY, cat),
      buildTodoRow([req({ requestId: "EARLY", date: "2026-11-06" })], TODAY, cat),
    ];
    expect(sortTodoRows(rows).map((r) => r.key)).toEqual(["R:EARLY", "R:LATE"]);
  });

  test("줄 데이터에 전화번호·이메일이 없다 · 링크는 상세", () => {
    const row = buildTodoRow([req({ requestId: "REQ-X", orgName: "그림책 모임" })], TODAY, cat);
    const json = JSON.stringify(row);
    expect(json).not.toContain("010-1111-1234");
    expect(json).not.toContain("applicant@example.com");
    expect(row.href).toBe("/admin/requests/REQ-X?category=lecture");
    expect(row.orgName).toBe("그림책 모임");
  });

  test("끝난 건(검색 결과) → 다음 할 일 칸 = 끝남 · 사유", () => {
    const row = buildTodoRow([req({ status: "반려", decidedAt: "2026-10-20T10:00:00.000Z" })], TODAY, cat);
    expect(row.stage).toBe("done");
    expect(row.nextLabel).toBe("끝남 · 반려 10/20");
  });
});

describe("검색(서버에서만)", () => {
  test("검색어 해석", () => {
    expect(parseSearchQuery("1234")).toEqual({ kind: "phone4", digits: "1234" });
    expect(parseSearchQuery(" 홍가 ")).toEqual({ kind: "text", text: "홍가" });
    expect(parseSearchQuery("홍")).toEqual({ kind: "tooShort" });
    expect(parseSearchQuery("")).toEqual({ kind: "tooShort" });
  });

  test("수용 9: 전화 뒤 4자리 정확 일치 · 신청번호 속 날짜 숫자에는 걸리지 않음", () => {
    const a = [req({ requestId: "REQ-20261101-AAAA", phone: "010-2222-1234" })];
    const b = [req({ requestId: "REQ-20261101-BBBB", phone: "010-1234-5678" })];
    expect(bundleMatchesSearch(a, parseSearchQuery("1234"))).toBe(true);
    expect(bundleMatchesSearch(b, parseSearchQuery("1234"))).toBe(false);
    expect(bundleMatchesSearch(a, parseSearchQuery("2026"))).toBe(false);
  });

  test("이름·단체명·신청번호 부분 일치(2자 이상) · 1자는 결과 없음", () => {
    const a = [req({ applicantName: "배수아", orgName: "그림책 읽는 엄마들", requestId: "REQ-20261103-7C1A2E90" })];
    expect(bundleMatchesSearch(a, parseSearchQuery("수아"))).toBe(true);
    expect(bundleMatchesSearch(a, parseSearchQuery("그림책"))).toBe(true);
    expect(bundleMatchesSearch(a, parseSearchQuery("7c1a"))).toBe(true);
    expect(bundleMatchesSearch(a, parseSearchQuery("수"))).toBe(false);
  });
});

/* ── 검수 반영(05_review_3-2 M2 · 배포 전 확인 권고 2건) ── */

describe("M2 결제 기한 당일 · 전날 · 지남", () => {
  const SENT = { paymentLinkUrl: LINK, paymentNoticeSentAt: "2026-11-02T10:00:00.000Z" };

  test("전날(내일 기한) → 내일 기한 칩 · 2순위", () => {
    const w = deriveWorkStage([approved({ ...SENT, paymentDueDate: "2026-11-05" })], TODAY);
    expect(w.chip).toEqual({ kind: "dueTomorrow", text: "내일 기한" });
    expect(w.dueToday).toBe(false);
    expect(w.urgentRank).toBe(2);
  });

  test("당일(오늘 기한) → 결제 확인 · 오늘 기한 칩 · 1순위", () => {
    const w = deriveWorkStage([approved({ ...SENT, paymentDueDate: TODAY })], TODAY);
    expect(w.stage).toBe("payment");
    expect(w.overdue).toBe(false);
    expect(w.dueToday).toBe(true);
    expect(w.dueTomorrow).toBe(false);
    expect(w.chip).toEqual({ kind: "dueToday", text: "오늘 기한" });
    expect(w.urgentRank).toBe(1);
  });

  test("당일인데 안내 메일 전 → 결제 안내(메일 전) + 오늘 기한 칩 · 1순위", () => {
    const w = deriveWorkStage([approved({ paymentLinkUrl: LINK, paymentDueDate: TODAY })], TODAY);
    expect(w.stage).toBe("notice");
    expect(w.sub).toBe("noticeBeforeMail");
    expect(w.chip?.kind).toBe("dueToday");
    expect(w.urgentRank).toBe(1);
  });

  test("다음 날(지남) → 기한 지남 칩 · 0순위(오늘 기한 아님)", () => {
    const w = deriveWorkStage([approved({ ...SENT, paymentDueDate: "2026-11-03" })], TODAY);
    expect(w.overdue).toBe(true);
    expect(w.dueToday).toBe(false);
    expect(w.chip?.kind).toBe("overdue");
    expect(w.urgentRank).toBe(0);
  });

  test("정렬: 기한 지남 → 오늘 기한 → 내일 기한 → 홈페이지 마감 → 승인", () => {
    const mk = (id: string, sessions: RentalRequest[]) => buildTodoRow(sessions.map((s) => ({ ...s, requestId: id })), TODAY, () => "lecture");
    const rows = sortTodoRows([
      mk("REQ-A-APPROVE", [req({})]),
      mk("REQ-A-CLOSE", [approved({ ...SENT, paymentDueDate: "2026-11-10", paymentStatus: "결제완료", paidAt: "2026-11-03", homepagePostedAt: "2026-11-02" })]),
      mk("REQ-A-TOMORROW", [approved({ ...SENT, paymentDueDate: "2026-11-05" })]),
      mk("REQ-A-TODAY", [approved({ ...SENT, paymentDueDate: TODAY })]),
      mk("REQ-A-OVERDUE", [approved({ ...SENT, paymentDueDate: "2026-11-03" })]),
    ]);
    expect(rows.map((r) => r.key)).toEqual(["R:REQ-A-OVERDUE", "R:REQ-A-TODAY", "R:REQ-A-TOMORROW", "R:REQ-A-CLOSE", "R:REQ-A-APPROVE"]);
  });
});

describe("승인일(decidedAt)이 빈 옛 승인", () => {
  test("결제 기록 없음 → 이전 방식 끝남(할 일에 안 나옴)", () => {
    const w = deriveWorkStage([approved({ decidedAt: "" })], TODAY);
    expect(w.stage).toBe("done");
    expect(w.doneReason).toBe("이전 방식 승인 · 결제 기록 없음");
  });

  test("묶음 전 회차 승인일 빈칸 · 결제 기록 없음 → 끝남", () => {
    expect(deriveWorkStage(bundle(3, () => "승인", { decidedAt: "" }), TODAY).stage).toBe("done");
  });

  test("결제 링크가 있으면 지금 규칙대로(결제 안내 메일 전)", () => {
    const w = deriveWorkStage([approved({ decidedAt: "", paymentLinkUrl: LINK, paymentDueDate: "2026-11-10" })], TODAY);
    expect(w.stage).toBe("notice");
    expect(w.sub).toBe("noticeBeforeMail");
  });

  test("안내 메일 기록만 있어도 지금 규칙대로", () => {
    const w = deriveWorkStage([approved({ decidedAt: "", paymentDueDate: "2026-11-10", paymentNoticeSentAt: "2026-11-02T10:00:00.000Z" })], TODAY);
    expect(w.stage).toBe("payment");
  });
});

describe("이용일이 지난 미처리(접수)", () => {
  test("단건 이용일이 어제 · 접수 → 승인 단계지만 pastPending · 8순위 · 문구", () => {
    const w = deriveWorkStage([req({ date: "2026-11-03" })], TODAY);
    expect(w.stage).toBe("approve");
    expect(w.sub).toBe("approvePastDate");
    expect(w.pastPending).toBe(true);
    expect(w.urgentRank).toBe(8);
    expect(w.nextLabel).toBe("반려·취소로 정리");
  });

  test("이용일이 오늘이면 아직 승인하기(pastPending 아님)", () => {
    const w = deriveWorkStage([req({ date: TODAY })], TODAY);
    expect(w.pastPending).toBe(false);
    expect(w.nextLabel).toBe("승인하기");
  });

  test("묶음: 한 회차라도 오늘 이후면 승인하기 · 모두 지났으면 pastPending", () => {
    const some = bundle(3, () => "접수", {}).map((s, i) => ({ ...s, date: ["2026-11-01", "2026-11-02", "2026-11-05"][i] }));
    expect(deriveWorkStage(some, TODAY).pastPending).toBe(false);
    const all = some.map((s) => ({ ...s, date: "2026-10-30" }));
    expect(deriveWorkStage(all, TODAY).pastPending).toBe(true);
  });

  test("갤러리: 시작일이 지났어도 전시 종료일이 오늘 이후면 승인하기", () => {
    const g = req({ roomId: "gallery", roomName: "우리동네 갤러리", date: "2026-11-01", startDate: "2026-11-01", endDate: "2026-11-06" });
    expect(deriveWorkStage([g], TODAY).pastPending).toBe(false);
    expect(deriveWorkStage([{ ...g, endDate: "2026-11-03" }], TODAY).pastPending).toBe(true);
  });

  test("목록 행에 pastPending이 실리고 승인 건보다 아래로 정렬", () => {
    const past = buildTodoRow([req({ requestId: "REQ-PAST", date: "2026-11-01" })], TODAY, () => "lecture");
    const live = buildTodoRow([req({ requestId: "REQ-LIVE" })], TODAY, () => "lecture");
    expect(past.pastPending).toBe(true);
    expect(live.pastPending).toBe(false);
    expect(sortTodoRows([past, live]).map((r) => r.key)).toEqual(["R:REQ-LIVE", "R:REQ-PAST"]);
  });
});
