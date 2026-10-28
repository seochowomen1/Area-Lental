import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { isStaleWriteError, STALE_WRITE_CODE, STALE_WRITE_MESSAGE } from "@/lib/writeExpect";

/**
 * API 라우트 공통 응답/에러 유틸리티
 *
 * 모든 API 라우트에서 동일한 응답 형식과 에러 핸들링 패턴을 사용하도록 합니다.
 *
 * 응답 형식:
 *   성공: { ok: true, ...payload }
 *   실패: { ok: false, message: string, code?: string }
 */

/** 에러 응답 축약 함수 */
export function jsonError(
  message: string,
  status: number,
  code?: string,
): NextResponse {
  return NextResponse.json(
    { ok: false, ...(code ? { code } : {}), message },
    { status },
  );
}

/** 성공 응답 축약 함수 */
export function jsonOk<T extends Record<string, unknown>>(data?: T): NextResponse {
  return NextResponse.json({ ok: true, ...data });
}

/**
 * API 라우트 catch 블록용 에러 핸들러
 *
 * - 구조화된 로깅 (logger.error)
 * - Google API / 네트워크 에러 분류
 * - 일관된 응답 형식
 */
export function handleApiError(e: unknown, context: string): NextResponse {
  // audit-fix-3 3-1: 조건부 쓰기 불일치 — 아무것도 쓰지 않았음을 알리는 409 (오류 로그 아님)
  if (isStaleWriteError(e)) {
    logger.warn(`${context}: 저장 직전 상태가 달라 쓰지 않음(STALE_WRITE)`, { mismatches: e.mismatches?.slice(0, 5) });
    return jsonError(STALE_WRITE_MESSAGE, 409, STALE_WRITE_CODE);
  }
  const err = e instanceof Error ? e : new Error(String(e));
  const errWithCode = e as { code?: string };

  logger.error(`${context} 중 오류 발생`, {
    error: err.message,
    code: errWithCode.code,
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });

  if (err.message?.includes("Google") || errWithCode.code === "EAUTH") {
    return jsonError("Google API 연동 오류가 발생했습니다.", 503, "GOOGLE_API_ERROR");
  }

  if (errWithCode.code === "ECONNREFUSED" || errWithCode.code === "ETIMEDOUT") {
    return jsonError("네트워크 연결 오류가 발생했습니다.", 503, "NETWORK_ERROR");
  }

  return jsonError("서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.", 500, "SERVER_ERROR");
}

/** YYYY-MM-DD 형식 검증 — lib/rules/ymd.ts isYmd 재수출(기존 import 호환 · 3-3) */
export { isYmd } from "@/lib/rules/ymd";

/** 이메일 정규화 (여러 라우트에서 중복 사용) */
export function normalizeEmail(email: string): string {
  return (email ?? "").toString().toLowerCase().trim();
}
