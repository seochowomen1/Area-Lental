/**
 * audit-fix-3 3-1 — 정규 수업 동기화 라우트 동시 실행 거부(409 SYNC_RUNNING) · 무인증 401
 */
import { setupMockEnv, nextIp } from "../helpers/routeEnv";

let env: ReturnType<typeof setupMockEnv>;
beforeAll(() => {
  env = setupMockEnv("sync");
  process.env.CLASSROOM_SYNC_URL = "http://127.0.0.1:9/never-called";
  process.env.CLASSROOM_SYNC_TOKEN = "test-token";
});
afterAll(() => {
  delete process.env.CLASSROOM_SYNC_URL;
  delete process.env.CLASSROOM_SYNC_TOKEN;
  env.restore();
});

async function adminCookie(): Promise<string> {
  const { createAdminSession } = require("@/lib/adminSession");
  const s = await createAdminSession();
  return `admin_auth=${encodeURIComponent(s.token)}; admin_last_activity=${encodeURIComponent(s.activity)}`;
}

async function post(headers: Record<string, string>) {
  const { POST } = require("@/app/api/admin/class-schedules/sync/route");
  const res: Response = await POST(new Request("http://localhost/api/admin/class-schedules/sync", { method: "POST", headers: { "x-forwarded-for": nextIp(), ...headers } }));
  return { status: res.status, body: await res.json() };
}

test("무인증 → 401", async () => {
  expect((await post({})).status).toBe(401);
});

test("다른 실행이 진행 중이면 409 SYNC_RUNNING · 업무 시스템 호출 없음", async () => {
  const { acquireSyncSlot, __resetSyncSlotForTest } = require("@/lib/classroomSync");
  __resetSyncSlotForTest();
  const held = await acquireSyncSlot({ recordStart: async () => undefined, readTail: async () => [] });
  expect(held.ok).toBe(true);
  const fetchSpy = jest.spyOn(global, "fetch");
  const r = await post({ cookie: await adminCookie() });
  expect(r.status).toBe(409);
  expect(r.body).toMatchObject({ ok: false, code: "SYNC_RUNNING", message: "업무 시스템 가져오기가 방금 시작되었습니다. 1분 뒤 다시 눌러 주세요." });
  expect(fetchSpy).not.toHaveBeenCalled();
  fetchSpy.mockRestore();
  held.release();
});
