import crypto from "crypto";
import { cookies } from "next/headers";
import { ADMIN_COOKIE_NAME, ADMIN_SIGN_MESSAGE } from "@/lib/adminConstants";

function tokenFor(adminPassword: string) {
  return crypto
    .createHash("sha256")
    .update(`${adminPassword}::${ADMIN_SIGN_MESSAGE}`)
    .digest("hex");
}

/**
 * Admin API routes are NOT protected by middleware because they live under `/api`.
 * Call this at the top of any `/api/admin/*` handler that must be admin-only.
 */
export function assertAdminApiAuth(): { ok: true } | { ok: false; reason: string } {
  const adminPw = process.env.ADMIN_PASSWORD;
  if (!adminPw) return { ok: false, reason: "missing_admin_password" };

  const cookie = cookies().get(ADMIN_COOKIE_NAME)?.value ?? null;
  if (!cookie) return { ok: false, reason: "missing_cookie" };

  const expected = tokenFor(adminPw);
  if (cookie !== expected) return { ok: false, reason: "invalid_cookie" };

  return { ok: true };
}
