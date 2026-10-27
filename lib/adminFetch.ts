"use client";

import { AUTH_STORE_BUSY_CODE, AUTH_STORE_BUSY_MESSAGE } from "@/lib/adminConstants";

/**
 * 관리자 클라이언트 fetch 공통 처리 (audit-fix-2 ⑤-5-4 · R3)
 * - 401 → /admin/login?next=현재경로 로 이동(세션 만료·로그아웃)
 * - 503 AUTH_STORE_BUSY → 로그인으로 보내지 않고 AdminFetchError(busy=true, ③-G-1 문구)
 * - 그 밖 실패 → 서버 message(없으면 기본 문구)로 AdminFetchError
 * 성공이면 Response를 그대로 돌려준다(본문은 호출부가 읽음).
 */
export class AdminFetchError extends Error {
  readonly status: number;
  readonly busy: boolean;
  readonly code?: string;
  constructor(message: string, status: number, opts?: { busy?: boolean; code?: string }) {
    super(message);
    this.name = "AdminFetchError";
    this.status = status;
    this.busy = opts?.busy ?? false;
    this.code = opts?.code;
  }
}

export function isAuthBusyError(e: unknown): boolean {
  return e instanceof AdminFetchError && e.busy;
}

function goLogin() {
  if (typeof window === "undefined") return;
  const next = window.location.pathname + window.location.search;
  window.location.assign(`/admin/login?next=${encodeURIComponent(next)}`);
}

export async function adminFetch(input: RequestInfo | URL, init?: RequestInit & { fallbackMessage?: string }): Promise<Response> {
  const { fallbackMessage, ...rest } = init ?? {};
  const res = await fetch(input, rest);
  if (res.ok) return res;

  let body: { code?: string; message?: string; error?: string } | null = null;
  try {
    body = await res.clone().json();
  } catch {
    body = null;
  }

  if (res.status === 401) {
    goLogin();
    throw new AdminFetchError(body?.message || "로그인이 필요합니다. 다시 로그인해 주세요.", 401, { code: body?.code });
  }
  if (res.status === 503 && body?.code === AUTH_STORE_BUSY_CODE) {
    throw new AdminFetchError(AUTH_STORE_BUSY_MESSAGE, 503, { busy: true, code: AUTH_STORE_BUSY_CODE });
  }
  throw new AdminFetchError(
    body?.message || body?.error || fallbackMessage || "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    res.status,
    { code: body?.code }
  );
}

/** 오류를 화면 문구로 — busy면 G-1, 아니면 fallback(③-D 실패 문구)을 우선 */
export function adminErrorText(e: unknown, fallback: string): string {
  if (isAuthBusyError(e)) return AUTH_STORE_BUSY_MESSAGE;
  return fallback;
}
