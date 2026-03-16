// Shared constants for admin session
// NOTE: This file must stay compatible with Edge runtime (no Node-only imports).

export const ADMIN_COOKIE_NAME = "admin_auth";
export const ADMIN_SIGN_MESSAGE = "rental-admin-session-v1";
export const ADMIN_ACTIVITY_COOKIE = "admin_last_activity";
export const ADMIN_INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30분
