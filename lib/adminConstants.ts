// Shared constants for admin session
// NOTE: This file must stay compatible with Edge runtime (no Node-only imports).

export const ADMIN_COOKIE_NAME = "admin_auth";
export const ADMIN_ACTIVITY_COOKIE = "admin_last_activity";
export const ADMIN_INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30분
/** 세션 최대 유지(초) — 쿠키 maxAge·토큰 exp 공용 (8시간) */
export const ADMIN_SESSION_MAX_AGE_SEC = 8 * 60 * 60;
/** 미들웨어·API 401 응답 문구 (01_spec ③-J) */
export const ADMIN_UNAUTHORIZED_MESSAGE = "로그인이 필요합니다. 다시 로그인해 주세요.";

/* ── audit-fix-2 R3: 세션 폐기 목록을 확인할 수 없을 때(로그인은 유지) ──
 * 클라이언트(lib/adminFetch·app/admin/error.tsx)도 import 하므로 여기(Edge·클라이언트 안전)에 둔다. */
/** API 503 응답 code · 페이지/서버 액션 오류의 error.digest */
export const AUTH_STORE_BUSY_CODE = "AUTH_STORE_BUSY";
/** API 503 응답 Retry-After(초) */
export const AUTH_STORE_BUSY_RETRY_AFTER_SEC = 30;
/** ③-G-1 관리자 클라이언트 화면(503) 문구 */
export const AUTH_STORE_BUSY_MESSAGE = "접속 확인이 잠시 지연되고 있습니다. 로그인은 유지되어 있으니 30초 뒤 다시 시도해 주세요.";
/** ③-G-2 관리자 페이지·서버 액션 오류 화면 문구 */
export const AUTH_STORE_BUSY_PAGE_TITLE = "잠시 후 다시 시도해 주세요";
export const AUTH_STORE_BUSY_PAGE_BODY = "구글 시트 응답이 늦어 접속 확인을 마치지 못했습니다. 로그인은 그대로입니다.";
