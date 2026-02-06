/**
 * API 응답 표준 형식 정의
 * 
 * 모든 API 엔드포인트는 이 형식을 따라야 합니다.
 */

/**
 * 성공 응답
 */
export type ApiSuccessResponse<T = unknown> = {
  ok: true;
  data?: T;
  message?: string;
};

/**
 * 에러 코드 정의
 */
export type ApiErrorCode =
  | "VALIDATION_ERROR"      // 입력값 검증 실패
  | "OUT_OF_HOURS"          // 운영 시간 외
  | "CONFLICT"              // 예약 충돌
  | "CLASS_CONFLICT"        // 정규 수업 충돌
  | "BLOCKED"               // 차단된 시간대
  | "TOO_MANY_FILES"        // 파일 개수 초과
  | "FILE_TOO_LARGE"        // 파일 크기 초과
  | "FILE_TYPE"             // 허용되지 않는 파일 형식
  | "NOT_FOUND"             // 리소스 없음
  | "UNAUTHORIZED"          // 인증 실패
  | "FORBIDDEN"             // 권한 없음
  | "SERVER_ERROR"          // 서버 오류
  | "UNKNOWN_ERROR";        // 알 수 없는 오류

/**
 * 에러 응답
 */
export type ApiErrorResponse = {
  ok: false;
  code: ApiErrorCode;
  message: string;
  details?: unknown;
};

/**
 * API 응답 (성공 또는 에러)
 */
export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * 성공 응답 생성 헬퍼
 */
export function success<T>(data?: T, message?: string): ApiSuccessResponse<T> {
  return {
    ok: true,
    ...(data !== undefined ? { data } : {}),
    ...(!message ? {} : { message })
  };
}

/**
 * 에러 응답 생성 헬퍼
 */
export function error(
  code: ApiErrorCode,
  message: string,
  details?: unknown
): ApiErrorResponse {
  return {
    ok: false,
    code,
    message,
    ...(details !== undefined ? { details } : {})
  };
}

/**
 * HTTP 상태 코드 매핑
 */
export const HTTP_STATUS: Record<ApiErrorCode | "SUCCESS", number> = {
  SUCCESS: 200,
  VALIDATION_ERROR: 400,
  OUT_OF_HOURS: 400,
  TOO_MANY_FILES: 400,
  FILE_TOO_LARGE: 400,
  FILE_TYPE: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  CLASS_CONFLICT: 409,
  BLOCKED: 409,
  SERVER_ERROR: 500,
  UNKNOWN_ERROR: 500
};
