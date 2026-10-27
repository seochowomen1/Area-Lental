import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE_NAME,
  ADMIN_ACTIVITY_COOKIE,
  ADMIN_UNAUTHORIZED_MESSAGE,
  AUTH_STORE_BUSY_CODE,
  AUTH_STORE_BUSY_MESSAGE,
  AUTH_STORE_BUSY_RETRY_AFTER_SEC,
} from "@/lib/adminConstants";
import { checkAdminCookies, readCookie } from "@/lib/adminSession";
import { isAdminSessionRevoked } from "@/lib/adminSessionStore";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { logger } from "@/lib/logger";

/** 관리자 API Rate Limit: IP당 1분 내 60회 */
const ADMIN_API_MAX = 60;
const ADMIN_API_WINDOW_MS = 60 * 1000;

export type AdminApiAuthResult =
  | { ok: true; sid: string; exp: number }
  | { ok: false; reason: string; status?: number };

/**
 * 관리자 API 가드 (audit-fix-1 [7] — v2 서명 세션 + 활동 쿠키 + 로그아웃 폐기 확인)
 * 모든 `/api/admin/*` 핸들러 첫 줄에서 `await assertAdminApiAuth(req)`.
 * - 미들웨어가 서명·만료·활동을 먼저 검사하지만, 폐기(로그아웃) 확인은 여기서만 한다.
 * - 폐기 목록을 읽지 못하면(audit-fix-2 R3): 직전 정상 목록 10분 재사용(lib/adminSessionStore),
 *   그것도 없으면 503 `AUTH_STORE_BUSY`(로그인 유지 · 무검사 통과 없음).
 * - 실패 응답은 `adminApiAuthFailure(auth)`로 만든다(401·429·503 구분).
 */
export async function assertAdminApiAuth(req: Request): Promise<AdminApiAuthResult> {
  const ip = getClientIp(req);
  const rl = rateLimit("admin-api", ip, ADMIN_API_MAX, ADMIN_API_WINDOW_MS);
  if (!rl.allowed) {
    return { ok: false, reason: "rate_limit_exceeded", status: 429 };
  }

  const cookieHeader = req.headers.get("cookie");
  const check = await checkAdminCookies(
    readCookie(cookieHeader, ADMIN_COOKIE_NAME),
    readCookie(cookieHeader, ADMIN_ACTIVITY_COOKIE)
  );
  if (!check.ok) return { ok: false, reason: check.reason, status: 401 };

  try {
    if (await isAdminSessionRevoked(check.sid)) return { ok: false, reason: "revoked", status: 401 };
  } catch (e) {
    // 폐기 여부를 확인할 수 없음 — 거부하되 "다시 로그인"(401)이 아니라 "잠시 후 다시"(503)
    logger.error("관리자 세션 폐기 목록 확인 불가 — 503", { error: e instanceof Error ? e.message : String(e) });
    return { ok: false, reason: "auth_store_busy", status: 503 };
  }
  return { ok: true, sid: check.sid, exp: check.exp };
}

/**
 * 인증 실패 응답 (audit-fix-2 R3)
 * - 503: `{ ok:false, code:"AUTH_STORE_BUSY", message }` + `Retry-After: 30` — 클라이언트는 로그인으로 보내지 않는다
 * - 429: `{ ok:false, code:"RATE_LIMITED", message }`
 * - 그 밖: 401 `{ ok:false, code:"UNAUTHORIZED", message }`
 * 원인(시트·쿼터) 상세는 응답에 넣지 않는다.
 */
export function adminApiAuthFailure(
  auth: { ok: false; reason: string; status?: number },
  opts: { unauthorizedMessage?: string } = {}
): NextResponse {
  if (auth.status === 503) {
    return NextResponse.json(
      { ok: false, code: AUTH_STORE_BUSY_CODE, message: AUTH_STORE_BUSY_MESSAGE },
      { status: 503, headers: { "Retry-After": String(AUTH_STORE_BUSY_RETRY_AFTER_SEC), "Cache-Control": "no-store" } }
    );
  }
  if (auth.status === 429) {
    return NextResponse.json(
      { ok: false, code: "RATE_LIMITED", message: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }
  return NextResponse.json(
    { ok: false, code: "UNAUTHORIZED", message: opts.unauthorizedMessage ?? ADMIN_UNAUTHORIZED_MESSAGE },
    { status: 401 }
  );
}
