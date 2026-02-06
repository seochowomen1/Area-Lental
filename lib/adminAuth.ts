import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "crypto";

import { ADMIN_COOKIE_NAME, ADMIN_SIGN_MESSAGE } from "@/lib/adminConstants";

function adminTokenFor(password: string): string {
  return crypto.createHash("sha256").update(`${password}::${ADMIN_SIGN_MESSAGE}`).digest("hex");
}

/**
 * Server Component/Route Handler에서 사용하는 관리자 인증 가드
 * - middleware에서도 보호되지만, SSR에서 직접 접근되는 페이지의 안정성을 위해 추가로 방어합니다.
 */
export async function assertAdminAuth(): Promise<void> {
  const pw = (process.env.ADMIN_PASSWORD ?? "").trim();
  if (!pw) redirect("/admin/login");

  const expected = adminTokenFor(pw);
  const token = cookies().get(ADMIN_COOKIE_NAME)?.value;
  if (!token || token !== expected) redirect("/admin/login");
}

/** 관리자 처리자 표시(현재는 계정 시스템이 없으므로 고정값) */
export function getDefaultDecidedBy(): string {
  return "관리자";
}
