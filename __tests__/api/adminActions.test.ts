/**
 * audit-fix-1 [7] 서버 액션 4개 첫 줄 인증 · 메일 수신자 고정 · [9] 묶음 쓰기 실패 배너
 */
import { setupMockEnv } from "../helpers/routeEnv";

const jar = new Map<string, string>();
jest.mock("next/headers", () => ({
  cookies: () => ({ get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n) } : undefined) }),
  headers: () => new Headers({ "x-forwarded-for": "10.1.1.1" }),
}));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

let env: ReturnType<typeof setupMockEnv>;
beforeAll(() => {
  env = setupMockEnv("actions");
});
afterAll(() => env.restore());

const actions = () => require("@/app/admin/requests/[id]/actions");
const db = () => require("@/lib/database").getDatabase();

async function signIn() {
  const { createAdminSession } = require("@/lib/adminSession");
  const s = await createAdminSession();
  jar.set("admin_auth", s.token);
  jar.set("admin_last_activity", s.activity);
}

async function seedBundle(n = 2) {
  const base = {
    roomId: "sangsang1", startTime: "10:00", endTime: "12:00",
    applicantName: "홍가명", birth: "1990-01-01", address: "서울", phone: "01000000000", email: "owner@example.com",
    orgName: "가명", headcount: 5, equipment: { laptop: false, projector: false, audio: false }, purpose: "테스트",
    attachments: [], privacyAgree: true, pledgeAgree: true, pledgeDate: "2026-10-26", pledgeName: "홍가명",
    batchId: `BAT-ACT-${Math.random().toString(36).slice(2, 8)}`, batchSize: n,
  };
  return db().appendRequestsBatch(Array.from({ length: n }, (_, i) => ({ ...base, date: `2026-12-0${i + 1}`, batchSeq: i + 1 })));
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

describe("서버 액션 첫 줄 인증", () => {
  test.each(["decideSingleAction", "saveBundleMetaAction", "decideSelectedSessionsAction", "sendConfirmedEmailAction"])(
    "%s: 세션 없으면 /admin/login · DB 쓰기 없음",
    async (name) => {
      jar.clear();
      const spy = jest.spyOn(db(), "getRequestById");
      const fd = new FormData();
      fd.set("status", "승인");
      fd.set("to", "attacker@example.com");
      fd.set("subject", "s");
      fd.set("body", "b");
      expect(await expectRedirect(actions()[name]("REQ-X", fd))).toBe("/admin/login");
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    }
  );

  test("위조 쿠키도 /admin/login", async () => {
    jar.set("admin_auth", "v2.eyJzaWQiOiJ4In0.forged");
    jar.set("admin_last_activity", `${Date.now()}.forged`);
    expect(await expectRedirect(actions().decideSingleAction("REQ-X", new FormData()))).toBe("/admin/login");
  });
});

describe("메일 수신자 고정", () => {
  test("폼의 to 값은 무시하고 신청자 저장 이메일로 발송", async () => {
    await signIn();
    const [r] = await seedBundle(1);
    const mail = require("@/lib/mail");
    const spy = jest.spyOn(mail, "sendCustomDecisionEmail").mockResolvedValue(undefined);
    const fd = new FormData();
    fd.set("to", "attacker@example.com");
    fd.set("subject", "안내");
    fd.set("body", "본문");
    const url = await expectRedirect(actions().sendConfirmedEmailAction(r.requestId, fd));
    expect(url).toContain("mailed=1");
    expect(spy).toHaveBeenCalledWith("owner@example.com", "안내", "본문");
    spy.mockRestore();
  });
});

describe("[9] 묶음 처리 일괄 쓰기", () => {
  test("선택 회차 승인 → updateRequestsStatusBatch 1회 · 단건 쓰기 0회", async () => {
    await signIn();
    const rows = await seedBundle(3);
    const d = db();
    const batchSpy = jest.spyOn(d, "updateRequestsStatusBatch");
    const singleSpy = jest.spyOn(d, "updateRequestStatus");
    const fd = new FormData();
    fd.set("actionStatus", "승인");
    fd.set("selectAll", "1");
    const url = await expectRedirect(actions().decideSelectedSessionsAction(rows[0].requestId, fd));
    expect(url).toContain("saved=1");
    expect(batchSpy).toHaveBeenCalledTimes(1);
    expect(singleSpy).not.toHaveBeenCalled();
    const after = await d.getRequestsByBatchId(rows[0].batchId);
    expect(after.every((r: { status: string }) => r.status === "승인")).toBe(true);
    batchSpy.mockRestore();
    singleSpy.mockRestore();
  });

  test("0개 선택 → formError=noSelection", async () => {
    await signIn();
    const rows = await seedBundle(2);
    const fd = new FormData();
    fd.set("actionStatus", "승인");
    const url = await expectRedirect(actions().decideSelectedSessionsAction(rows[0].requestId, fd));
    expect(url).toContain("formError=noSelection");
  });

  test("시트 쓰기 실패 → formError=sheetBusy · 감사 기록 없음 · 상태 그대로", async () => {
    await signIn();
    const rows = await seedBundle(2);
    const d = db();
    const fail = jest.spyOn(d, "updateRequestsStatusBatch").mockRejectedValue(new Error("Quota exceeded"));
    const audit = require("@/lib/auditLog");
    const auditSpy = jest.spyOn(audit, "recordAudit");
    const fd = new FormData();
    fd.set("actionStatus", "승인");
    fd.set("selectAll", "1");
    expect(await expectRedirect(actions().decideSelectedSessionsAction(rows[0].requestId, fd))).toContain("formError=sheetBusy");
    const fd2 = new FormData();
    fd2.set("adminMemo", "메모");
    expect(await expectRedirect(actions().saveBundleMetaAction(rows[0].requestId, fd2))).toContain("formError=sheetBusy");
    expect(auditSpy).not.toHaveBeenCalled();
    fail.mockRestore();
    auditSpy.mockRestore();
    const after = await d.getRequestsByBatchId(rows[0].batchId);
    expect(after.every((r: { status: string }) => r.status === "접수")).toBe(true);
  });
});
