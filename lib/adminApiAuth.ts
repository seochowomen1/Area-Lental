import crypto from "crypto";
import { cookies } from "next/headers";
import { ADMIN_COOKIE_NAME, ADMIN_SIGN_MESSAGE } from "@/lib/adminConstants";
import { rateLimit, getClientIp } from "@/lib/rateLimit";

function tokenFor(adminPassword: string) {
  return crypto
    .createHash("sha256")
    .update(`${adminPassword}::${ADMIN_SIGN_MESSAGE}`)
    .digest("hex");
}

/** 타이밍 공격 방어: 일정한 비교 시간 보장 */
function constantTimeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a.padEnd(256, "\0"));
  const bufB = Buffer.from(b.padEnd(256, "\0"));
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

/** 관리자 API Rate Limit: IP당 1분 내 60회 */
const ADMIN_API_MAX = 60;
const ADMIN_API_WINDOW_MS = 60 * 1000;

/**
 * Admin API routes are NOT protected by middleware because they live under `/api`.
 * Call this at the top of any `/api/admin/*` handler that must be admin-only.
 */
export function assertAdminApiAuth(req?: Request): { ok: true } | { ok: false; reason: string; status?: number } {
  // Rate limiting (req가 전달된 경우)
  if (req) {
    const ip = getClientIp(req);
    const rl = rateLimit("admin-api", ip, ADMIN_API_MAX, ADMIN_API_WINDOW_MS);
    if (!rl.allowed) {
      return { ok: false, reason: "rate_limit_exceeded", status: 429 };
    }
  }

  const adminPw = process.env.ADMIN_PASSWORD;
  if (!adminPw) return { ok: false, reason: "missing_admin_password" };

  const cookie = cookies().get(ADMIN_COOKIE_NAME)?.value ?? null;
  if (!cookie) return { ok: false, reason: "missing_cookie" };

  const expected = tokenFor(adminPw);
  if (!constantTimeCompare(cookie, expected)) return { ok: false, reason: "invalid_cookie" };

  return { ok: true };
}
