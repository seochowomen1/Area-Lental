/**
 * 관리자 세션 폐기 목록 (Node 전용 · audit-fix-1 [7] · audit-fix-2 R3)
 * - 저장: 시트 admin_sessions / mock .mockdb.json revokedSessions (lib/sheets.ts)
 * - 인스턴스별 15초 캐시. 로그아웃한 인스턴스는 즉시 반영, 다른 인스턴스는 최대 15초 뒤.
 * - 목록 읽기 실패(시트 429 등) 시 (⑧ Q5 확정):
 *   · 마지막으로 정상 읽은 목록이 10분 이내면 그 목록을 재사용(stale · warn 로그)
 *   · 실패 직후 5초 동안은 시트를 다시 부르지 않는다(429를 키우지 않게)
 *   · 재사용할 목록이 없거나 10분이 지났으면 AdminAuthStoreBusyError throw → 가드가 503(로그인 유지)으로 처리
 *   · 확인 없이 통과(fail-open)는 하지 않는다.
 * - 이 인스턴스에서 로그아웃한 세션은 localRevoked에 따로 들고 있어 목록 상태와 관계없이 항상 거부된다.
 */

import { logger } from "@/lib/logger";

const CACHE_TTL_MS = 15_000;
/** 읽기 실패 시 직전 정상 목록을 재사용하는 최대 시간 */
export const REVOKED_STALE_MAX_MS = 10 * 60_000;
/** 읽기 실패 직후 다시 부르지 않는 시간 */
export const REVOKED_FAIL_BACKOFF_MS = 5_000;

/** 폐기 목록 저장소를 지금 확인할 수 없음(로그인은 유효할 수 있음) — API 503 / 페이지 오류 화면 */
export class AdminAuthStoreBusyError extends Error {
  readonly code = "AUTH_STORE_BUSY";
  constructor() {
    super("AUTH_STORE_BUSY");
    this.name = "AdminAuthStoreBusyError";
  }
}

/** 마지막 정상 읽기 결과(at = 읽은 시각) */
let cache: { at: number; sids: Set<string> } | null = null;
/** 마지막 읽기 실패 시각 */
let lastFailAt = 0;
/** 이 인스턴스에서 폐기한 세션 sid → 만료(ms) */
const localRevoked = new Map<string, number>();

function pruneLocal(now: number) {
  localRevoked.forEach((exp, sid) => {
    if (exp <= now) localRevoked.delete(sid);
  });
}

function staleOrThrow(now: number, error?: unknown): Set<string> {
  if (cache && now - cache.at <= REVOKED_STALE_MAX_MS) {
    logger.warn("관리자 세션 폐기 목록 읽기 실패 — 직전 정상 목록 재사용", {
      ageSec: Math.round((now - cache.at) / 1000),
      ...(error ? { error: error instanceof Error ? error.message : String(error) } : {}),
    });
    return cache.sids;
  }
  logger.error("관리자 세션 폐기 목록 읽기 실패 — 재사용할 목록 없음(503)", {
    hasCache: Boolean(cache),
    ...(error ? { error: error instanceof Error ? error.message : String(error) } : {}),
  });
  throw new AdminAuthStoreBusyError();
}

async function loadRevoked(): Promise<Set<string>> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.sids;
  if (lastFailAt && now - lastFailAt < REVOKED_FAIL_BACKOFF_MS) return staleOrThrow(now);
  try {
    const { getRevokedAdminSessions } = await import("@/lib/sheets");
    const rows = await getRevokedAdminSessions();
    const sids = new Set(rows.map((r) => r.sid));
    cache = { at: Date.now(), sids };
    lastFailAt = 0;
    return sids;
  } catch (e) {
    lastFailAt = Date.now();
    return staleOrThrow(lastFailAt, e);
  }
}

/**
 * 폐기 여부. 목록을 확인할 수 없으면 AdminAuthStoreBusyError를 throw 한다(다른 오류는 던지지 않음).
 */
export async function isAdminSessionRevoked(sid: string): Promise<boolean> {
  const now = Date.now();
  pruneLocal(now);
  if (localRevoked.has(sid)) return true;
  return (await loadRevoked()).has(sid);
}

export async function revokeAdminSession(sid: string, expUnixSec: number): Promise<void> {
  const { addRevokedAdminSession } = await import("@/lib/sheets");
  await addRevokedAdminSession({ sid, exp: new Date(expUnixSec * 1000).toISOString() });
  // 정상 읽기 결과(cache)와 섞지 않는다 — 콜드 인스턴스에서 "이 sid 하나뿐인 목록"이 정상 목록처럼 쓰이지 않게
  localRevoked.set(sid, expUnixSec * 1000);
  if (cache) cache.sids.add(sid);
}

/** 테스트용 */
export function _resetRevokedCacheForTest(): void {
  cache = null;
  lastFailAt = 0;
  localRevoked.clear();
}
