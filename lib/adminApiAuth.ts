import { ADMIN_COOKIE_NAME, ADMIN_ACTIVITY_COOKIE } from "@/lib/adminConstants";
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
 * - 폐기 목록을 읽지 못하면 거부(fail-closed).
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
    logger.error("관리자 세션 폐기 목록 조회 실패 — 거부 처리", { error: e instanceof Error ? e.message : String(e) });
    return { ok: false, reason: "revocation_unavailable", status: 401 };
  }
  return { ok: true, sid: check.sid, exp: check.exp };
}
