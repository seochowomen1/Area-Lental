/**
 * audit-fix-3 3-1 — 쓰기 경로 단일화 · 조건부 쓰기(STALE_WRITE)
 * 수용 기준 5(단건 승인 후 메모 유지) · 6(크론 vs 결제 확인) · 7(다른 창 반려 후 원래 창 승인)
 */
import { setupMockEnv, nextIp, todayYmd, addDays } from "../helpers/routeEnv";

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
const prevSince = process.env.PAYMENT_AUTO_CANCEL_SINCE;
beforeAll(() => {
  env = setupMockEnv("stale");
  process.env.PAYMENT_AUTO_CANCEL_SINCE = "2026-01-01";
});
afterAll(() => {
  if (prevSince === undefined) delete process.env.PAYMENT_AUTO_CANCEL_SINCE;
  else process.env.PAYMENT_AUTO_CANCEL_SINCE = prevSince;
  env.restore();
});
afterEach(() => jest.restoreAllMocks());

const actions = () => require("@/app/admin/requests/[id]/actions");
const db = () => require("@/lib/database").getDatabase();

async function signIn() {
  const { createAdminSession } = require("@/lib/adminSession");
  const s = await createAdminSession();
  jar.set("admin_auth", s.token);
  jar.set("admin_last_activity", s.activity);
  return `admin_auth=${encodeURIComponent(s.token)}; admin_last_activity=${encodeURIComponent(s.activity)}`;
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
  const batchId = `BAT-STALE-${Math.random().toString(36).slice(2, 8)}`;
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

function singleForm(status: string, viewed: Record<string, string>, extra: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("status", status);
  fd.set("viewedStatuses", JSON.stringify(viewed));
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  return fd;
}

describe("수용 기준 5 — 단건 처리도 일괄 함수 1회 · 메모 유지", () => {
  test("단건 승인 → updateRequestsStatusBatch 1회 · 메모 칸이 없으면 기존 메모 그대로", async () => {
    await signIn();
    const r = await seedSingle();
    await db().updateRequestsStatusBatch([{ requestId: r.requestId, status: "접수", decidedBy: "관리자", adminMemo: "전화 확인함" }]);
    const spy = jest.spyOn(db(), "updateRequestsStatusBatch");
    const url = await expectRedirect(actions().decideSingleAction(r.requestId, singleForm("승인", { [r.requestId]: "접수" })));
    expect(url).toContain("saved=1");
    expect(spy).toHaveBeenCalledTimes(1);
    const after = await db().getRequestById(r.requestId);
    expect(after.status).toBe("승인");
    expect(after.adminMemo).toBe("전화 확인함");
  });

  test("Database에 단건 updateRequestStatus가 없다", () => {
    expect((db() as Record<string, unknown>).updateRequestStatus).toBeUndefined();
  });
});

describe("수용 기준 7 — 다른 창에서 먼저 반려 → 원래 창 승인은 stale", () => {
  test("단건: formError=stale · 상태는 반려 그대로", async () => {
    await signIn();
    const r = await seedSingle();
    const viewedAtOpen = { [r.requestId]: "접수" }; // 두 창 모두 '접수'일 때 화면을 열었다

    // 다른 창: 반려
    const other = await expectRedirect(actions().decideSingleAction(r.requestId, singleForm("반려", viewedAtOpen, { rejectReason: "센터 행사" })));
    expect(other).toContain("saved=1");

    // 원래 창: 승인
    const audit = require("@/lib/auditLog");
    const auditSpy = jest.spyOn(audit, "recordAudit");
    const mine = await expectRedirect(actions().decideSingleAction(r.requestId, singleForm("승인", viewedAtOpen)));
    expect(mine).toContain("formError=stale");
    expect(auditSpy).not.toHaveBeenCalled();
    const after = await db().getRequestById(r.requestId);
    expect(after.status).toBe("반려");
    expect(after.rejectReason).toBe("센터 행사");
  });

  test("묶음 선택 회차: 한 회차라도 바뀌었으면 아무것도 쓰지 않음", async () => {
    await signIn();
    const rows = await seedBundle(3);
    const viewed = Object.fromEntries(rows.map((r: { requestId: string }) => [r.requestId, "접수"]));
    // 다른 창이 2회차만 반려
    await db().updateRequestsStatusBatch([{ requestId: rows[1].requestId, status: "반려", decidedBy: "관리자", rejectReason: "x" }]);

    const fd = new FormData();
    fd.set("actionStatus", "승인");
    fd.set("selectAll", "1");
    fd.set("viewedStatuses", JSON.stringify(viewed));
    const url = await expectRedirect(actions().decideSelectedSessionsAction(rows[0].requestId, fd));
    expect(url).toContain("formError=stale");
    const after = await db().getRequestsByBatchId(rows[0].batchId);
    expect(after.map((r: { status: string }) => r.status).sort()).toEqual(["반려", "접수", "접수"]);
  });

  test("viewedStatuses가 없으면(예전 화면) 액션 시작 때 읽은 상태로 확인 — 정상 처리", async () => {
    await signIn();
    const rows = await seedBundle(2);
    const fd = new FormData();
    fd.set("actionStatus", "승인");
    fd.set("selectAll", "1");
    expect(await expectRedirect(actions().decideSelectedSessionsAction(rows[0].requestId, fd))).toContain("saved=1");
  });
});

describe("수용 기준 6 — 크론 자동 취소가 읽은 뒤 관리자 결제 확인이 먼저 저장됨", () => {
  test("크론은 그 묶음을 쓰지 않고 skippedStale 1 · 행은 승인·결제완료 그대로", async () => {
    const today = todayYmd();
    const due = addDays(today, -1);
    const rows = await seedBundle(2);
    const ids = rows.map((r: { requestId: string }) => r.requestId);
    await db().updateRequestsStatusBatch(
      ids.map((id: string) => ({ requestId: id, status: "승인" as const, decidedBy: "관리자" })),
      undefined,
      { requestId: ids[0], patch: { paymentDueDate: due, paymentLinkUrl: "https://www.seochowomen.kr/x" } }
    );

    const real = db();
    let interleaved = false;
    const racingDb = Object.create(real);
    racingDb.getAllRequests = async () => {
      const snapshot = JSON.parse(JSON.stringify(await real.getAllRequests()));
      if (!interleaved) {
        interleaved = true;
        // 크론이 읽은 직후, 관리자가 결제 확인을 먼저 저장
        await real.updateRequestPayment({
          requestId: ids[0],
          patch: { paymentStatus: "결제완료", paymentMethod: "현장 카드", paidAt: today, paidAmountKRW: 40000 },
          expect: { paymentStatus: ["", "미결제"], autoCancelledAtEmpty: true },
        });
      }
      return snapshot;
    };

    const mail = require("@/lib/mail");
    const cancelMail = jest.spyOn(mail, "sendApplicantAutoCancelEmail").mockResolvedValue(undefined);
    jest.spyOn(mail, "sendAdminPaymentDeadlineSummaryEmail").mockResolvedValue(undefined);
    const { runPaymentDeadline } = require("@/lib/paymentDeadline");
    const result = await runPaymentDeadline(racingDb, { todayYmd: today });

    expect(result.candidates).toBeGreaterThanOrEqual(1);
    expect(result.skippedStale).toBe(1);
    expect(result.cancelled.find((c: { requestIds: string[] }) => c.requestIds.includes(ids[0]))).toBeUndefined();
    expect(result.errors.filter((e: { stage: string }) => e.stage === "status")).toEqual([]);
    expect(cancelMail).not.toHaveBeenCalled();

    const after = await real.getRequestsByBatchId(rows[0].batchId);
    expect(after.every((r: { status: string; paymentStatus?: string; autoCancelledAt?: string }) => r.status === "승인" && r.paymentStatus === "결제완료" && !r.autoCancelledAt)).toBe(true);
  });

  test("반대 순서: 크론 취소가 먼저 저장되면 관리자 결제 확인은 409 STALE_WRITE · 결제 기록 안 씀", async () => {
    const cookie = await signIn();
    const today = todayYmd();
    const r = await seedSingle();
    await db().updateRequestsStatusBatch([{ requestId: r.requestId, status: "승인", decidedBy: "관리자" }], undefined, {
      requestId: r.requestId,
      patch: { paymentDueDate: addDays(today, -1) },
    });
    const snapshot = JSON.parse(JSON.stringify(await db().getRequestById(r.requestId)));
    // 크론이 먼저 취소
    await db().updateRequestsStatusBatch(
      [{ requestId: r.requestId, status: "취소", decidedBy: "시스템(결제 기한 경과)", rejectReason: "기한 경과" }],
      undefined,
      { requestId: r.requestId, patch: { autoCancelledAt: "2026-10-28T09:00:00+09:00" } },
      { status: ["승인"], paymentStatus: ["", "미결제"], autoCancelledAtEmpty: true }
    );
    // 관리자 화면은 취소 전 상태를 읽은 채로 결제 확인
    jest.spyOn(db(), "getRequestById").mockResolvedValueOnce(snapshot);
    const { POST } = require("@/app/api/admin/requests/[id]/payment/route");
    const res: Response = await POST(
      new Request(`http://localhost/api/admin/requests/${r.requestId}/payment`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json", "x-forwarded-for": nextIp() },
        body: JSON.stringify({ paymentMethod: "현장 카드", paidAt: today, paidAmountKRW: 1, paymentNote: "테스트" }),
      }),
      { params: { id: r.requestId } }
    );
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.code).toBe("STALE_WRITE");
    expect(body.message).toBe(
      "방금 다른 처리(자동 취소 또는 다른 창)가 먼저 저장되어 아무것도 바꾸지 않았습니다. 화면을 새로고침해 지금 상태를 확인한 뒤 다시 눌러 주세요."
    );
    const after = await db().getRequestById(r.requestId);
    expect(after.status).toBe("취소");
    expect(after.paymentStatus ?? "").toBe("");
  });
});
