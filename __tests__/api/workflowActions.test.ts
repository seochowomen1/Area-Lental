/**
 * audit-fix-3 3-2 — 상세 "다음 할 일" 카드의 승인·회차표 반려가 쓰는 서버 액션(decideSelectedSessionsAction)
 * - 카드 승인 = 남은(접수) 회차 전부 + viewedStatuses · 단건도 같은 액션 · 성공 시 done=approve
 * - 시트 쓰기 1회 · 화면을 연 뒤 다른 처리가 끼면 stale(3-1 계약 그대로)
 */
import { setupMockEnv } from "../helpers/routeEnv";

const jar = new Map<string, string>();
jest.mock("next/headers", () => ({
  cookies: () => ({ get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n) } : undefined) }),
  headers: () => new Headers({ "x-forwarded-for": "10.2.2.2" }),
}));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

let env: ReturnType<typeof setupMockEnv>;
beforeAll(() => {
  env = setupMockEnv("workflow");
});
afterAll(() => env.restore());
afterEach(() => {
  jest.restoreAllMocks();
  jar.clear();
});

const actions = () => require("@/app/admin/requests/[id]/actions");
const db = () => require("@/lib/database").getDatabase();

async function signIn() {
  const { createAdminSession } = require("@/lib/adminSession");
  const s = await createAdminSession();
  jar.set("admin_auth", s.token);
  jar.set("admin_last_activity", s.activity);
}

const BASE = {
  roomId: "sangsang1", startTime: "10:00", endTime: "12:00",
  applicantName: "홍가명", birth: "1990-01-01", address: "서울", phone: "01000000000", email: "owner@example.com",
  orgName: "가명", headcount: 5, equipment: { laptop: false, projector: false, audio: false }, purpose: "테스트",
  attachments: [], privacyAgree: true, pledgeAgree: true, pledgeDate: "2026-10-26", pledgeName: "홍가명",
};

async function seedSingle() {
  return db().appendRequest({ ...BASE, date: "2026-12-10" });
}
async function seedBundle(n: number) {
  const batchId = `BAT-WF-${Math.random().toString(36).slice(2, 8)}`;
  return db().appendRequestsBatch(Array.from({ length: n }, (_, i) => ({ ...BASE, date: `2026-12-1${i + 1}`, batchId, batchSeq: i + 1, batchSize: n })));
}

async function expectRedirect(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    const m = /^REDIRECT:(.*)$/.exec((e as Error).message);
    if (m) return m[1];
    throw e;
  }
  throw new Error("redirect 되지 않음");
}

/** 카드 승인 폼과 같은 값 */
function cardApproveForm(ids: string[], viewed: Record<string, string>) {
  const fd = new FormData();
  fd.set("actionStatus", "승인");
  fd.set("viewedStatuses", JSON.stringify(viewed));
  for (const id of ids) fd.append("selectedIds", id);
  return fd;
}

describe("카드 승인 — 단건", () => {
  test("단건도 같은 액션 · 쓰기 1회 · done=approve · 메모 유지", async () => {
    await signIn();
    const r = await seedSingle();
    await db().updateRequestsStatusBatch([{ requestId: r.requestId, status: "접수", decidedBy: "관리자", adminMemo: "전화 확인함" }]);
    const spy = jest.spyOn(db(), "updateRequestsStatusBatch");
    const url = await expectRedirect(actions().decideSelectedSessionsAction(r.requestId, cardApproveForm([r.requestId], { [r.requestId]: "접수" })));
    expect(url).toContain("done=approve");
    expect(url).toContain("category=lecture");
    expect(spy).toHaveBeenCalledTimes(1);
    const after = await db().getRequestById(r.requestId);
    expect(after.status).toBe("승인");
    expect(after.adminMemo).toBe("전화 확인함");
  });

  test("단건 반려(회차표) — 사유 없으면 formError=rejectReason · 쓰기 0", async () => {
    await signIn();
    const r = await seedSingle();
    const spy = jest.spyOn(db(), "updateRequestsStatusBatch");
    const fd = new FormData();
    fd.set("actionStatus", "반려");
    fd.append("selectedIds", r.requestId);
    fd.set("viewedStatuses", JSON.stringify({ [r.requestId]: "접수" }));
    expect(await expectRedirect(actions().decideSelectedSessionsAction(r.requestId, fd))).toContain("formError=rejectReason");
    expect(spy).not.toHaveBeenCalled();

    fd.set("rejectReason", "같은 시간에 센터 행사");
    expect(await expectRedirect(actions().decideSelectedSessionsAction(r.requestId, fd))).toContain("done=reject");
    const after = await db().getRequestById(r.requestId);
    expect(after.status).toBe("반려");
    expect(after.rejectReason).toBe("같은 시간에 센터 행사");
  });

  test("다른 창이 먼저 반려 → 카드 승인은 stale · 상태 그대로", async () => {
    await signIn();
    const r = await seedSingle();
    await db().updateRequestsStatusBatch([{ requestId: r.requestId, status: "반려", decidedBy: "관리자", rejectReason: "x" }]);
    const url = await expectRedirect(actions().decideSelectedSessionsAction(r.requestId, cardApproveForm([r.requestId], { [r.requestId]: "접수" })));
    expect(url).toContain("formError=stale");
    expect((await db().getRequestById(r.requestId)).status).toBe("반려");
  });

  test("무인증이면 로그인으로 · 쓰기 0", async () => {
    const r = await seedSingle();
    const spy = jest.spyOn(db(), "updateRequestsStatusBatch");
    expect(await expectRedirect(actions().decideSelectedSessionsAction(r.requestId, cardApproveForm([r.requestId], { [r.requestId]: "접수" })))).toBe("/admin/login");
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("카드 승인 — 묶음", () => {
  test("수용 4: 전체 5회 승인 → 5회 모두 승인 · 쓰기 1회 · done=approve", async () => {
    await signIn();
    const rows = await seedBundle(5);
    const ids = rows.map((r: { requestId: string }) => r.requestId);
    const viewed = Object.fromEntries(ids.map((id: string) => [id, "접수"]));
    const spy = jest.spyOn(db(), "updateRequestsStatusBatch");
    const url = await expectRedirect(actions().decideSelectedSessionsAction(ids[0], cardApproveForm(ids, viewed)));
    expect(url).toContain("done=approve");
    expect(spy).toHaveBeenCalledTimes(1);
    const after = await db().getRequestsByBatchId(rows[0].batchId);
    expect(after.every((r: { status: string }) => r.status === "승인")).toBe(true);
  });

  test("일부 처리된 묶음: 남은 3회만 승인 · 반려 회차는 그대로", async () => {
    await signIn();
    const rows = await seedBundle(4);
    const ids: string[] = rows.map((r: { requestId: string }) => r.requestId);
    await db().updateRequestsStatusBatch([{ requestId: ids[0], status: "반려", decidedBy: "관리자", rejectReason: "x" }]);
    const viewed = { [ids[0]]: "반려", [ids[1]]: "접수", [ids[2]]: "접수", [ids[3]]: "접수" };
    const url = await expectRedirect(actions().decideSelectedSessionsAction(ids[1], cardApproveForm(ids.slice(1), viewed)));
    expect(url).toContain("done=approve");
    const after = await db().getRequestsByBatchId(rows[0].batchId);
    const byId = Object.fromEntries(after.map((r: { requestId: string; status: string }) => [r.requestId, r.status]));
    expect(byId[ids[0]]).toBe("반려");
    expect([byId[ids[1]], byId[ids[2]], byId[ids[3]]]).toEqual(["승인", "승인", "승인"]);
  });

  test("승인 뒤 단계 판정 = 결제 안내(링크 전)", async () => {
    await signIn();
    const rows = await seedBundle(2);
    const ids = rows.map((r: { requestId: string }) => r.requestId);
    await expectRedirect(actions().decideSelectedSessionsAction(ids[0], cardApproveForm(ids, Object.fromEntries(ids.map((id: string) => [id, "접수"])))));
    const { deriveWorkStage } = require("@/lib/workflow");
    const { todayYmdSeoul } = require("@/lib/datetime");
    const w = deriveWorkStage(await db().getRequestsByBatchId(rows[0].batchId), todayYmdSeoul());
    expect(w.stage).toBe("notice");
    expect(w.sub).toBe("noticeBeforeLink");
  });
});

/* ── 검수 반영(05_review_3-2 M1·M3·L1) ── */

function form(status: string, ids: string[], viewed: Record<string, string>, reason?: string) {
  const fd = new FormData();
  fd.set("actionStatus", status);
  fd.set("viewedStatuses", JSON.stringify(viewed));
  for (const id of ids) fd.append("selectedIds", id);
  if (reason !== undefined) fd.set("rejectReason", reason);
  return fd;
}

describe("M1 취소(신청자 요청) — 회차별 현황", () => {
  test("승인된 단건 → 취소 · 사유 비우면 '신청자 요청' · done=cancel · 감사 REQUEST_CANCEL", async () => {
    await signIn();
    const r = await seedSingle();
    await db().updateRequestsStatusBatch([{ requestId: r.requestId, status: "승인", decidedBy: "관리자" }]);
    const audit = jest.spyOn(require("@/lib/auditLog"), "recordAudit");
    const url = await expectRedirect(actions().decideSelectedSessionsAction(r.requestId, form("취소", [r.requestId], { [r.requestId]: "승인" }, "")));
    expect(url).toContain("done=cancel");
    const after = await db().getRequestById(r.requestId);
    expect(after.status).toBe("취소");
    expect(after.rejectReason).toBe("신청자 요청");
    expect(audit.mock.calls.some((c) => (c[0] as { action: string }).action === "REQUEST_CANCEL")).toBe(true);
  });

  test("사유를 적으면 그 사유로 저장(취소 메일 {{취소사유}})", async () => {
    await signIn();
    const r = await seedSingle();
    await db().updateRequestsStatusBatch([{ requestId: r.requestId, status: "승인", decidedBy: "관리자" }]);
    await expectRedirect(actions().decideSelectedSessionsAction(r.requestId, form("취소", [r.requestId], { [r.requestId]: "승인" }, "신청자 전화 요청(10/28)")));
    expect((await db().getRequestById(r.requestId)).rejectReason).toBe("신청자 전화 요청(10/28)");
  });

  test("묶음 선택 회차만 취소 · 나머지 그대로 · 쓰기 1회", async () => {
    await signIn();
    const rows = await seedBundle(3);
    const ids: string[] = rows.map((r: { requestId: string }) => r.requestId);
    await db().updateRequestsStatusBatch(ids.map((id) => ({ requestId: id, status: "승인", decidedBy: "관리자" })));
    const spy = jest.spyOn(db(), "updateRequestsStatusBatch");
    const viewed = Object.fromEntries(ids.map((id) => [id, "승인"]));
    expect(await expectRedirect(actions().decideSelectedSessionsAction(ids[0], form("취소", [ids[2]], viewed, "")))).toContain("done=cancel");
    expect(spy).toHaveBeenCalledTimes(1);
    const byId = Object.fromEntries((await db().getRequestsByBatchId(rows[0].batchId)).map((r: { requestId: string; status: string }) => [r.requestId, r.status]));
    expect([byId[ids[0]], byId[ids[1]], byId[ids[2]]]).toEqual(["승인", "승인", "취소"]);
  });

  test("다른 창이 먼저 반려 → 취소는 stale · 상태 그대로(3-1 연결 유지)", async () => {
    await signIn();
    const r = await seedSingle();
    await db().updateRequestsStatusBatch([{ requestId: r.requestId, status: "반려", decidedBy: "관리자", rejectReason: "x" }]);
    const url = await expectRedirect(actions().decideSelectedSessionsAction(r.requestId, form("취소", [r.requestId], { [r.requestId]: "승인" }, "")));
    expect(url).toContain("formError=stale");
    expect((await db().getRequestById(r.requestId)).status).toBe("반려");
  });
});

describe("L1 바뀌는 회차가 없으면 쓰기·감사·초록 알림 없음", () => {
  test("이미 승인된 단건을 다시 승인 → nochange=1 · 쓰기 0 · 감사 0", async () => {
    await signIn();
    const r = await seedSingle();
    await db().updateRequestsStatusBatch([{ requestId: r.requestId, status: "승인", decidedBy: "관리자" }]);
    const spy = jest.spyOn(db(), "updateRequestsStatusBatch");
    const audit = jest.spyOn(require("@/lib/auditLog"), "recordAudit");
    const url = await expectRedirect(actions().decideSelectedSessionsAction(r.requestId, form("승인", [r.requestId], { [r.requestId]: "승인" })));
    expect(url).toContain("nochange=1");
    expect(url).not.toContain("done=");
    expect(spy).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  test("묶음 일부만 바뀌면 바뀐 회차만 쓰고 done=approve", async () => {
    await signIn();
    const rows = await seedBundle(3);
    const ids: string[] = rows.map((r: { requestId: string }) => r.requestId);
    await db().updateRequestsStatusBatch([{ requestId: ids[0], status: "승인", decidedBy: "관리자" }]);
    const spy = jest.spyOn(db(), "updateRequestsStatusBatch");
    const viewed = { [ids[0]]: "승인", [ids[1]]: "접수", [ids[2]]: "접수" };
    expect(await expectRedirect(actions().decideSelectedSessionsAction(ids[0], form("승인", ids, viewed)))).toContain("done=approve");
    expect(spy).toHaveBeenCalledTimes(1);
    expect((spy.mock.calls[0][0] as { requestId: string }[]).map((u) => u.requestId)).toEqual([ids[1], ids[2]]);
  });

  test("화면을 연 뒤 다른 창이 먼저 승인 → 다시 승인은 '바뀐 내용 없음'이 아니라 stale", async () => {
    await signIn();
    const r = await seedSingle();
    await db().updateRequestsStatusBatch([{ requestId: r.requestId, status: "승인", decidedBy: "관리자" }]);
    const url = await expectRedirect(actions().decideSelectedSessionsAction(r.requestId, cardApproveForm([r.requestId], { [r.requestId]: "접수" })));
    expect(url).toContain("formError=stale");
  });
});

describe("M3 단건 할인/메모 저장은 반려·취소 사유를 지우지 않는다", () => {
  function memoForm(status: string, reasonHidden: string, viewed: Record<string, string>) {
    const fd = new FormData();
    fd.set("status", status);
    fd.set("rejectReason", reasonHidden);
    fd.set("viewedStatuses", JSON.stringify(viewed));
    fd.set("adminMemo", "메모만 고침");
    fd.set("discountRatePct", "0");
    fd.set("discountAmountKRW", "0");
    return fd;
  }

  test("취소(자동 취소 사유) 건 메모 저장 → 사유·상태·decidedAt 유지", async () => {
    await signIn();
    const r = await seedSingle();
    await db().updateRequestsStatusBatch([{ requestId: r.requestId, status: "취소", decidedBy: "시스템(자동 취소)", rejectReason: "결제 기한 경과 자동 취소" }]);
    const before = await db().getRequestById(r.requestId);
    // hidden 사유가 비어 와도(옛 화면) 기존 사유 유지
    expect(await expectRedirect(actions().decideSingleAction(r.requestId, memoForm("취소", "", { [r.requestId]: "취소" })))).toContain("saved=1");
    const after = await db().getRequestById(r.requestId);
    expect(after.status).toBe("취소");
    expect(after.rejectReason).toBe("결제 기한 경과 자동 취소");
    expect(after.decidedAt).toBe(before.decidedAt);
    expect(after.adminMemo).toBe("메모만 고침");
  });

  test("반려 건 메모 저장 → 사유 유지 · 사유 다시 요구하지 않음", async () => {
    await signIn();
    const r = await seedSingle();
    await db().updateRequestsStatusBatch([{ requestId: r.requestId, status: "반려", decidedBy: "관리자", rejectReason: "같은 시간에 센터 행사" }]);
    expect(await expectRedirect(actions().decideSingleAction(r.requestId, memoForm("반려", "", { [r.requestId]: "반려" })))).toContain("saved=1");
    expect((await db().getRequestById(r.requestId)).rejectReason).toBe("같은 시간에 센터 행사");
  });
});
