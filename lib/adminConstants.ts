// Shared constants for admin session
// NOTE: This file must stay compatible with Edge runtime (no Node-only imports).

export const ADMIN_COOKIE_NAME = "admin_auth";
export const ADMIN_ACTIVITY_COOKIE = "admin_last_activity";
export const ADMIN_INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30분
/** 세션 최대 유지(초) — 쿠키 maxAge·토큰 exp 공용 (8시간) */
export const ADMIN_SESSION_MAX_AGE_SEC = 8 * 60 * 60;
/** 미들웨어·API 401 응답 문구 (01_spec ③-J) */
export const ADMIN_UNAUTHORIZED_MESSAGE = "로그인이 필요합니다. 다시 로그인해 주세요.";
