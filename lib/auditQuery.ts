/**
 * 감사로그 다시 읽기 — 백업 상태·동기화 잠금 판단용 (audit-fix-3 3-1 · 서버 전용)
 * 감사로그 시트(audit_log)의 시각·작업명·대상 3열만 읽는다(요약·상세·IP는 읽지 않음).
 */
import { auditActionLabel, type AuditAction } from "@/lib/auditLog";

export type AuditTailRow = { timestamp: string; action: string; target: string };

/** 감사로그 시각("YYYY-MM-DD HH:mm:ss" KST) → epoch ms (형식이 틀리면 NaN) */
export function auditTsToMs(ts: string): number {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/.exec((ts ?? "").trim());
  if (!m) return NaN;
  return Date.parse(`${m[1]}T${m[2]}+09:00`);
}

export async function readAuditTail(maxRows = 2000): Promise<AuditTailRow[]> {
  const { getAuditTail } = await import("@/lib/sheets");
  return getAuditTail(maxRows);
}

/** 이 작업의 가장 최근 기록 (없으면 null) */
export function lastOf(tail: AuditTailRow[], action: AuditAction): { at: number; row: AuditTailRow } | null {
  const label = auditActionLabel(action);
  let best: { at: number; row: AuditTailRow } | null = null;
  for (const row of tail) {
    if (row.action !== label) continue;
    const at = auditTsToMs(row.timestamp);
    if (!Number.isFinite(at)) continue;
    if (!best || at >= best.at) best = { at, row };
  }
  return best;
}
