import crypto from "crypto";

import { ADMIN_COOKIE_NAME, ADMIN_SIGN_MESSAGE } from "@/lib/adminConstants";

/**
 * Node runtime용 관리자 인증 헬퍼
 * - /api/admin/login 과 동일한 토큰 규칙을 사용
 */
export function adminTokenFor(adminPassword: string) {
  return crypto
    .createHash("sha256")
    .update(`${adminPassword}::${ADMIN_SIGN_MESSAGE}`)
    .digest("hex");
}

export function isAdminRequest(req: Request) {
  const adminPw = process.env.ADMIN_PASSWORD;
  if (!adminPw) return false;

  const cookie = req.headers.get("cookie") ?? "";
  const token = cookie
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${ADMIN_COOKIE_NAME}=`))
    ?.split("=")
    ?.slice(1)
    .join("=");

  if (!token) return false;
  return token === adminTokenFor(adminPw);
}
