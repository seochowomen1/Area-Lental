import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ADMIN_COOKIE_NAME, ADMIN_ACTIVITY_COOKIE } from "@/lib/adminConstants";
import { checkAdminCookies } from "@/lib/adminSession";
import { isAdminSessionRevoked } from "@/lib/adminSessionStore";

/**
 * Server Component·서버 액션용 관리자 인증 가드 (audit-fix-1 [7])
 * - v2 서명 세션 + 활동 쿠키(30분) + 로그아웃 폐기 확인. 하나라도 실패하면 /admin/login으로 redirect.
 * - 관리자 페이지·서버 액션 첫 줄에서 `await assertAdminAuth()`.
 */
export async function assertAdminAuth(): Promise<{ sid: string; exp: number }> {
  const jar = cookies();
  const check = await checkAdminCookies(
    jar.get(ADMIN_COOKIE_NAME)?.value ?? null,
    jar.get(ADMIN_ACTIVITY_COOKIE)?.value ?? null
  );
  if (!check.ok) redirect("/admin/login");

  let revoked = true;
  try {
    revoked = await isAdminSessionRevoked(check.sid);
  } catch {
    revoked = true; // 폐기 목록을 읽지 못하면 거부(fail-closed)
  }
  if (revoked) redirect("/admin/login");
  return { sid: check.sid, exp: check.exp };
}

/** 관리자 처리자 표시 — 관리자는 시설총무 담당 1인 운영이므로 직책명 고정값 (2026-10 행정감사 후속) */
export const ADMIN_DECIDED_BY = "시설총무";

export function getDefaultDecidedBy(): string {
  return ADMIN_DECIDED_BY;
}
