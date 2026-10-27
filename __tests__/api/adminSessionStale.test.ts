/**
 * audit-fix-2 R3 — 세션 폐기 목록 읽기 실패 시: 직전 정상 목록 10분 재사용 · 실패 직후 5초 재호출 안 함 · 그 밖 503(로그인 유지)
 * 01_spec ⑥ 6-8 ~ 6-11
 */
import { setupMockEnv, nextIp } from "../helpers/routeEnv";

const jar = new Map<string, string>();
jest.mock("next/headers", () => ({
  cookies: () => ({ get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n) } : undefined) }),
  headers: () => new Headers({ "x-forwarded-for": "10.9.9.9" }),
}));
jest.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

let env: ReturnType<typeof setupMockEnv>;
beforeAll(() => {
  env = setupMockEnv("r3");
});
afterAll(() => env.restore());

const store = () => require("@/lib/adminSessionStore");
const sheets = () => require("@/lib/sheets");

type Session = { token: string; activity: string; sid: string; exp: number };

async function newSession(): Promise<Session> {
  const { createAdminSession } = require("@/lib/adminSession");
  return createAdminSession(Date.now());
}

function cookieOf(s: Session) {
  return `admin_auth=${encodeURIComponent(s.token)}; admin_last_activity=${encodeURIComponent(s.activity)}`;
}

async function apiGet(s: Session) {
  const { GET } = require("@/app/api/admin/blocks/route");
  const res: Response = await GET(new Request("http://localhost/api/admin/blocks", { headers: { cookie: cookieOf(s), "x-forwarded-for": nextIp() } }));
  return res;
}

let t = 1_900_000_000_000;
let nowSpy: jest.SpyInstance;
beforeEach(() => {
  store()._resetRevokedCacheForTest();
  t += 24 * 60 * 60 * 1000;
  nowSpy = jest.spyOn(Date, "now").mockImplementation(() => t);
});
afterEach(() => {
  nowSpy.mockRestore();
  jest.restoreAllMocks();
});

describe("API 가드(assertAdminApiAuth)", () => {
  test("6-8: 1회 성공 뒤 읽기 실패 → 10분 안은 통과, 폐기된 sid는 계속 401 · 10분 넘으면 503", async () => {
    const live = await newSession();
    const revoked = await newSession();
    await sheets().addRevokedAdminSession({ sid: revoked.sid, exp: new Date((revoked.exp + 3600) * 1000).toISOString() });

    expect((await apiGet(live)).status).toBe(200); // 정상 읽기 → 캐시
    const spy = jest.spyOn(sheets(), "getRevokedAdminSessions").mockRejectedValue(new Error("Quota exceeded"));

    t += 60_000; // 15초 캐시 지남 → 읽기 실패 → 직전 목록 재사용
    expect((await apiGet(live)).status).toBe(200);
    expect((await apiGet(revoked)).status).toBe(401);

    t += 9 * 60_000; // 성공 후 10분 이내
    expect((await apiGet(live)).status).toBe(200);

    t += 2 * 60_000; // 성공 후 12분 → 재사용 불가
    const res = await apiGet(live);
    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("30");
    const body = await res.json();
    expect(body).toEqual({ ok: false, code: "AUTH_STORE_BUSY", message: expect.stringContaining("로그인은 유지") });
    expect(JSON.stringify(body)).not.toMatch(/quota|sheet|시트/i);
    expect(spy).toHaveBeenCalled();
  });

  test("6-9: 성공 이력 없이 실패 → 503 AUTH_STORE_BUSY + Retry-After: 30 (무검사 통과 없음)", async () => {
    const live = await newSession();
    jest.spyOn(sheets(), "getRevokedAdminSessions").mockRejectedValue(new Error("429"));
    const res = await apiGet(live);
    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("30");
    expect((await res.json()).code).toBe("AUTH_STORE_BUSY");
  });

  test("6-10: 실패 직후 5초 안 재요청은 시트를 다시 부르지 않는다 · 5초 뒤엔 다시 부름", async () => {
    const live = await newSession();
    const spy = jest.spyOn(sheets(), "getRevokedAdminSessions").mockRejectedValue(new Error("429"));
    expect((await apiGet(live)).status).toBe(503);
    t += 2_000;
    expect((await apiGet(live)).status).toBe(503);
    expect((await apiGet(live)).status).toBe(503);
    expect(spy).toHaveBeenCalledTimes(1);
    t += 4_000;
    spy.mockResolvedValue([]);
    expect((await apiGet(live)).status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  test("6-11: 정상 경로 회귀 — 로그아웃한 쿠키는 401(이 인스턴스는 목록 읽기 실패와 무관하게 즉시)", async () => {
    const s = await newSession();
    await store().revokeAdminSession(s.sid, s.exp);
    expect((await apiGet(s)).status).toBe(401);
    // 시트가 죽어도 이 인스턴스가 폐기한 세션은 통과하지 않는다
    store()._resetRevokedCacheForTest();
    await store().revokeAdminSession(s.sid, s.exp);
    jest.spyOn(sheets(), "getRevokedAdminSessions").mockRejectedValue(new Error("429"));
    expect((await apiGet(s)).status).toBe(401);
  });

  test("콜드 인스턴스 로그아웃 직후에도 다른 폐기 세션을 놓치지 않는다(로컬 폐기분을 정상 목록으로 취급하지 않음)", async () => {
    const other = await newSession();
    await sheets().addRevokedAdminSession({ sid: other.sid, exp: new Date((other.exp + 3600) * 1000).toISOString() });
    const mine = await newSession();
    await store().revokeAdminSession(mine.sid, mine.exp);
    expect((await apiGet(other)).status).toBe(401);
  });

  test("무인증·위조 쿠키는 여전히 401 UNAUTHORIZED", async () => {
    const { GET } = require("@/app/api/admin/blocks/route");
    const res: Response = await GET(new Request("http://localhost/api/admin/blocks", { headers: { "x-forwarded-for": nextIp() } }));
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("UNAUTHORIZED");
  });
});

describe("페이지·서버 액션 가드(assertAdminAuth)", () => {
  test("6-9: 성공 이력 없이 실패 → redirect가 아니라 AdminAuthBusyError(digest AUTH_STORE_BUSY)", async () => {
    const s = await newSession();
    jar.set("admin_auth", s.token);
    jar.set("admin_last_activity", s.activity);
    jest.spyOn(sheets(), "getRevokedAdminSessions").mockRejectedValue(new Error("429"));
    const { assertAdminAuth, AdminAuthBusyError } = require("@/lib/adminAuth");
    let caught: unknown;
    try {
      await assertAdminAuth();
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AdminAuthBusyError);
    expect((caught as { digest?: string }).digest).toBe("AUTH_STORE_BUSY");
    expect((caught as Error).message).not.toMatch(/^REDIRECT:/);
  });

  test("직전 정상 목록이 있으면 통과 · 폐기 세션은 로그인 redirect", async () => {
    const s = await newSession();
    jar.set("admin_auth", s.token);
    jar.set("admin_last_activity", s.activity);
    const { assertAdminAuth } = require("@/lib/adminAuth");
    await expect(assertAdminAuth()).resolves.toEqual({ sid: s.sid, exp: s.exp });
    jest.spyOn(sheets(), "getRevokedAdminSessions").mockRejectedValue(new Error("429"));
    t += 60_000;
    await expect(assertAdminAuth()).resolves.toEqual({ sid: s.sid, exp: s.exp });
    await store().revokeAdminSession(s.sid, s.exp);
    await expect(assertAdminAuth()).rejects.toThrow("REDIRECT:/admin/login");
  });
});
