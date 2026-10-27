import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ADMIN_COOKIE_NAME, ADMIN_ACTIVITY_COOKIE, AUTH_STORE_BUSY_CODE } from "@/lib/adminConstants";
import { checkAdminCookies } from "@/lib/adminSession";
import { isAdminSessionRevoked } from "@/lib/adminSessionStore";

/**
 * Server Component·서버 액션용 관리자 인증 가드 (audit-fix-1 [7])
 * - v2 서명 세션 + 활동 쿠키(30분) + 로그아웃 폐기 확인. 하나라도 실패하면 /admin/login으로 redirect.
 * - 관리자 페이지·서버 액션 첫 줄에서 `await assertAdminAuth()`.
 * - 폐기 목록을 확인할 수 없으면(audit-fix-2 R3) 로그인 redirect가 아니라 AdminAuthBusyError를 throw →
 *   app/admin/error.tsx가 `error.digest === "AUTH_STORE_BUSY"`로 ③-G-2 화면을 보여 준다(로그인 유지).
 */
export async function assertAdminAuth(): Promise<{ sid: string; exp: number }> {
  const jar = cookies();
  const check = await checkAdminCookies(
    jar.get(ADMIN_COOKIE_NAME)?.value ?? null,
    jar.get(ADMIN_ACTIVITY_COOKIE)?.value ?? null
  );
  if (!check.ok) redirect("/admin/login");

  let revoked: boolean;
  try {
    revoked = await isAdminSessionRevoked(check.sid);
  } catch {
    // 폐기 목록을 확인할 수 없음 — 통과시키지 않되(fail-closed) 로그인으로 보내지도 않는다
    throw new AdminAuthBusyError();
  }
  if (revoked) redirect("/admin/login");
  return { sid: check.sid, exp: check.exp };
}

/**
 * 세션 확인 지연 오류 (audit-fix-2 R3)
 * Next.js는 이미 digest가 있는 오류의 digest를 그대로 클라이언트 error 경계에 넘긴다(운영 빌드에서 message는 가려짐).
 * → 화면은 message가 아니라 `error.digest === AUTH_STORE_BUSY_CODE`로 판별한다.
 */
export class AdminAuthBusyError extends Error {
  readonly digest = AUTH_STORE_BUSY_CODE;
  constructor() {
    super(AUTH_STORE_BUSY_CODE);
    this.name = "AdminAuthBusyError";
  }
}

/** 관리자 처리자 표시 — 관리자는 시설총무 담당 1인 운영이므로 직책명 고정값 (2026-10 행정감사 후속) */
export const ADMIN_DECIDED_BY = "시설총무";

export function getDefaultDecidedBy(): string {
  return ADMIN_DECIDED_BY;
}
