/**
 * audit-fix-1 [7] 관리자 세션 v2 · 로그아웃 무효화 · [8] 삭제 409
 */
import fs from "fs";
import path from "path";
import { setupMockEnv, nextIp } from "../helpers/routeEnv";

let env: ReturnType<typeof setupMockEnv>;
beforeAll(() => {
  env = setupMockEnv("admin");
});
afterAll(() => env.restore());

function cookiesFrom(res: Response): Record<string, string> {
  const out: Record<string, string> = {};
  const raw = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  for (const line of raw) {
    const [kv] = line.split(";");
    const i = kv.indexOf("=");
    out[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1));
  }
  return out;
}
const cookieHeader = (c: Record<string, string>) => Object.entries(c).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("; ");

async function login(password = "test-admin-password") {
  const { POST } = require("@/app/api/admin/login/route");
  const res: Response = await POST(new Request("http://localhost/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": nextIp() },
    body: JSON.stringify({ password }),
  }));
  return { status: res.status, cookies: cookiesFrom(res) };
}

async function adminGet(cookie: string) {
  const { GET } = require("@/app/api/admin/blocks/route");
  const res: Response = await GET(new Request("http://localhost/api/admin/blocks", { headers: { cookie, "x-forwarded-for": nextIp() } }));
  return res.status;
}

describe("[7] 관리자 세션", () => {
  test("로그인마다 다른 서명 세션 · 활동 쿠키도 서명", async () => {
    const a = await login();
    const b = await login();
    expect(a.status).toBe(200);
    expect(a.cookies.admin_auth).toMatch(/^v2\./);
    expect(a.cookies.admin_auth).not.toBe(b.cookies.admin_auth);
    expect(a.cookies.admin_last_activity).toMatch(/^\d+\./);
  });

  test("비밀번호 틀림 → 401 · 쿠키 없음", async () => {
    const r = await login("wrong");
    expect(r.status).toBe(401);
    expect(r.cookies.admin_auth).toBeUndefined();
  });

  test("무인증·위조 쿠키·구형 고정 토큰·활동 쿠키 위조 → API 401", async () => {
    const ok = await login();
    expect(await adminGet(cookieHeader(ok.cookies))).toBe(200);
    expect(await adminGet("")).toBe(401);
    expect(await adminGet(cookieHeader({ ...ok.cookies, admin_auth: ok.cookies.admin_auth.slice(0, -4) + "AAAA" }))).toBe(401);
    expect(await adminGet(cookieHeader({ admin_auth: "a".repeat(64), admin_last_activity: String(Date.now()) }))).toBe(401);
    expect(await adminGet(cookieHeader({ ...ok.cookies, admin_last_activity: `${Date.now()}.forged` }))).toBe(401);
    expect(await adminGet(cookieHeader({ admin_auth: ok.cookies.admin_auth }))).toBe(401);
  });

  test("로그아웃 → 그 세션 쿠키는 재사용 불가(401) · 다른 기기 세션은 유지", async () => {
    const mine = await login();
    const other = await login();
    const { DELETE } = require("@/app/api/admin/login/route");
    const res: Response = await DELETE(new Request("http://localhost/api/admin/login", { method: "DELETE", headers: { cookie: cookieHeader(mine.cookies), "x-forwarded-for": nextIp() } }));
    expect(res.status).toBe(200);
    require("@/lib/adminSessionStore")._resetRevokedCacheForTest();
    expect(await adminGet(cookieHeader(mine.cookies))).toBe(401);
    expect(await adminGet(cookieHeader(other.cookies))).toBe(200);
  });

  test("미들웨어: 무인증 API 401 JSON · 페이지는 로그인으로 · 구형 쿠키는 session_upgraded", async () => {
    const { NextRequest } = require("next/server");
    const { middleware } = require("@/middleware");
    const api: Response = await middleware(new NextRequest("http://localhost/api/admin/requests", { headers: { "x-forwarded-for": nextIp() } }));
    expect(api.status).toBe(401);
    expect((await api.json()).code).toBe("UNAUTHORIZED");

    const page: Response = await middleware(new NextRequest("http://localhost/admin/requests", { headers: { cookie: `admin_auth=${"a".repeat(64)}`, "x-forwarded-for": nextIp() } }));
    expect([302, 307]).toContain(page.status);
    expect(page.headers.get("location")).toContain("err=session_upgraded");

    const ok = await login();
    const pass: Response = await middleware(new NextRequest("http://localhost/admin/requests", { headers: { cookie: cookieHeader(ok.cookies), "x-forwarded-for": nextIp() } }));
    expect(pass.status).toBe(200);
    expect(cookiesFrom(pass).admin_last_activity).toMatch(/^\d+\./);
  });
});

describe("[8] 삭제 API — 결제·환불·홈페이지 미마감 포함 시 전체 거부 409", () => {
  /** DB 함수로 행을 만든다(mockdb는 메모리 캐시라 파일 직접 수정은 반영되지 않음) */
  async function seed(rows: Array<{ status: "반려" | "취소"; patch?: Record<string, string> }>) {
    const db = require("@/lib/database").getDatabase();
    const ids: string[] = [];
    for (const r of rows) {
      const saved = await db.appendRequest({
        roomId: "sangsang1", date: "2026-12-01", startTime: "10:00", endTime: "12:00",
        applicantName: "홍가명", birth: "1990-01-01", address: "서울", phone: "01000000000", email: "a@example.com",
        orgName: "가명", headcount: 5, equipment: { laptop: false, projector: false, audio: false }, purpose: "테스트",
        attachments: [], privacyAgree: true, pledgeAgree: true, pledgeDate: "2026-10-26", pledgeName: "홍가명",
      });
      await db.updateRequestStatus({ requestId: saved.requestId, status: r.status, decidedBy: "관리자" });
      if (r.patch) await db.updateRequestPayment({ requestId: saved.requestId, patch: r.patch });
      ids.push(saved.requestId);
    }
    return ids;
  }
  async function del(ids: string[], cookie: string) {
    const { DELETE } = require("@/app/api/admin/requests/route");
    const res: Response = await DELETE(new Request("http://localhost/api/admin/requests", { method: "DELETE", headers: { cookie, "content-type": "application/json", "x-forwarded-for": nextIp() }, body: JSON.stringify({ requestIds: ids }) }));
    return { status: res.status, body: await res.json() };
  }

  test("결제 기록 + 일반 섞임 → 409 PROTECTED_RECORDS, 아무것도 지우지 않음 · 일반만 → 200", async () => {
    const [PAID, HP, OK] = await seed([
      { status: "취소", patch: { paymentStatus: "환불", refundedAt: "2026-10-20" } },
      { status: "취소", patch: { homepagePostedAt: "2026-10-20" } },
      { status: "반려" },
    ]);
    const c = cookieHeader((await login()).cookies);
    const mixed = await del([PAID, HP, OK], c);
    expect(mixed.status).toBe(409);
    expect(mixed.body.code).toBe("PROTECTED_RECORDS");
    expect(JSON.stringify(mixed.body)).toContain(PAID);
    expect(JSON.stringify(mixed.body)).toContain(HP);
    const db = require("@/lib/database").getDatabase();
    expect(await db.getRequestById(OK)).toBeTruthy();
    expect(await db.getRequestById(PAID)).toBeTruthy();

    const plain = await del([OK], c);
    expect(plain.status).toBe(200);
    expect(await db.getRequestById(OK)).toBeFalsy();
  });

  test("무인증 삭제 → 401", async () => {
    const r = await del(["REQ-DEL-PAID"], "");
    expect(r.status).toBe(401);
  });
});
