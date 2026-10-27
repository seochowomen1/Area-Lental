/**
 * 관리자 세션 폐기 목록 (Node 전용 · audit-fix-1 [7])
 * - 저장: 시트 admin_sessions / mock .mockdb.json revokedSessions (lib/sheets.ts)
 * - 인스턴스별 15초 캐시. 로그아웃한 인스턴스는 즉시 반영, 다른 인스턴스는 최대 15초 뒤.
 * - 목록을 읽지 못하면 throw → 호출부(가드)가 거부(401)로 처리한다(fail-closed).
 */

const CACHE_TTL_MS = 15_000;
let cache: { at: number; sids: Set<string> } | null = null;

async function loadRevoked(): Promise<Set<string>> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.sids;
  const { getRevokedAdminSessions } = await import("@/lib/sheets");
  const rows = await getRevokedAdminSessions();
  const sids = new Set(rows.map((r) => r.sid));
  cache = { at: Date.now(), sids };
  return sids;
}

export async function isAdminSessionRevoked(sid: string): Promise<boolean> {
  return (await loadRevoked()).has(sid);
}

export async function revokeAdminSession(sid: string, expUnixSec: number): Promise<void> {
  const { addRevokedAdminSession } = await import("@/lib/sheets");
  await addRevokedAdminSession({ sid, exp: new Date(expUnixSec * 1000).toISOString() });
  if (cache) cache.sids.add(sid);
  else cache = { at: Date.now(), sids: new Set([sid]) };
}

/** 테스트용 */
export function _resetRevokedCacheForTest(): void {
  cache = null;
}
