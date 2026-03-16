import { analyzeBundle, pickFeeBasisSessions } from "@/lib/bundle";
import type { RentalRequest } from "@/lib/types";

function makeReq(status: string, extra?: Partial<RentalRequest>): RentalRequest {
  return {
    requestId: `REQ-${Math.random().toString(36).slice(2, 8)}`,
    roomId: "room4f-1",
    roomName: "4층 강의실1",
    date: "2026-04-01",
    startTime: "10:00",
    endTime: "12:00",
    applicantName: "홍길동",
    birth: "1990-01-01",
    address: "서울시",
    phone: "010-1234-5678",
    email: "test@example.com",
    orgName: "테스트단체",
    headcount: 10,
    equipment: {},
    purpose: "테스트",
    attachments: [],
    status: status as RentalRequest["status"],
    submittedAt: "2026-03-01T00:00:00Z",
    privacyAgree: true,
    pledgeAgree: true,
    pledgeDate: "2026-03-01",
    pledgeName: "홍길동",
    ...extra,
  } as RentalRequest;
}

// ─── analyzeBundle ───

describe("analyzeBundle", () => {
  test("빈 배열 → allPending", () => {
    const result = analyzeBundle([]);
    expect(result.kind).toBe("allPending");
    expect(result.totalCount).toBe(0);
  });

  test("모두 승인 → allApproved", () => {
    const list = [makeReq("승인"), makeReq("승인"), makeReq("승인")];
    const result = analyzeBundle(list);
    expect(result.kind).toBe("allApproved");
    expect(result.displayStatus).toBe("승인");
    expect(result.approvedCount).toBe(3);
    expect(result.isPartial).toBe(false);
  });

  test("모두 반려 → allRejected", () => {
    const list = [makeReq("반려"), makeReq("반려")];
    const result = analyzeBundle(list);
    expect(result.kind).toBe("allRejected");
    expect(result.displayStatus).toBe("반려");
    expect(result.rejectedCount).toBe(2);
  });

  test("모두 접수 → allPending", () => {
    const list = [makeReq("접수"), makeReq("접수")];
    const result = analyzeBundle(list);
    expect(result.kind).toBe("allPending");
    expect(result.pendingCount).toBe(2);
  });

  test("접수 + 승인 → inProgress", () => {
    const list = [makeReq("접수"), makeReq("승인")];
    const result = analyzeBundle(list);
    expect(result.kind).toBe("inProgress");
    expect(result.isPartial).toBe(true);
  });

  test("승인 + 반려 (접수 없음) → partialFinal", () => {
    const list = [makeReq("승인"), makeReq("반려")];
    const result = analyzeBundle(list);
    expect(result.kind).toBe("partialFinal");
    expect(result.displayStatus).toBe("부분처리");
  });

  test("접수 + 반려 → inProgress", () => {
    const list = [makeReq("접수"), makeReq("반려")];
    const result = analyzeBundle(list);
    expect(result.kind).toBe("inProgress");
  });

  test("단건 승인 → allApproved", () => {
    const result = analyzeBundle([makeReq("승인")]);
    expect(result.kind).toBe("allApproved");
    expect(result.totalCount).toBe(1);
  });

  test("statusForFilter: 혼합 상태에서 반려 포함 시 반려 반환", () => {
    const list = [makeReq("승인"), makeReq("반려")];
    const result = analyzeBundle(list);
    expect(result.statusForFilter).toBe("반려");
  });
});

// ─── pickFeeBasisSessions ───

describe("pickFeeBasisSessions", () => {
  test("승인 건이 있으면 승인 건만 반환 (approvedIfAny)", () => {
    const approved = makeReq("승인");
    const pending = makeReq("접수");
    const result = pickFeeBasisSessions([approved, pending]);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("승인");
  });

  test("승인 건이 없으면 전체 반환 (approvedIfAny)", () => {
    const list = [makeReq("접수"), makeReq("접수")];
    const result = pickFeeBasisSessions(list);
    expect(result).toHaveLength(2);
  });

  test("mode=all이면 전체 반환", () => {
    const list = [makeReq("승인"), makeReq("접수")];
    const result = pickFeeBasisSessions(list, "all");
    expect(result).toHaveLength(2);
  });

  test("빈 배열 → 빈 배열", () => {
    expect(pickFeeBasisSessions([])).toHaveLength(0);
  });
});
