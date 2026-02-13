/**
 * 보안 감사 로그 — 관리자 작업 이력 추적
 *
 * 모든 데이터 변경 작업(생성/수정/삭제)을 구조화된 형태로 기록합니다.
 * - 프로덕션: JSON stdout (로그 수집 도구에서 수집 가능)
 * - 개발: 콘솔에 읽기 쉬운 형태로 출력
 */

export type AuditAction =
  | "BLOCK_CREATE"
  | "BLOCK_DELETE"
  | "SCHEDULE_CREATE"
  | "SCHEDULE_UPDATE"
  | "SCHEDULE_DELETE"
  | "REQUEST_DELETE"
  | "REQUEST_APPROVE"
  | "REQUEST_REJECT"
  | "REQUEST_CANCEL"
  | "EMAIL_SEND"
  | "EMAIL_TEMPLATE_UPDATE"
  | "SHEETS_INIT"
  | "ADMIN_LOGIN"
  | "ADMIN_LOGOUT";

export interface AuditEntry {
  action: AuditAction;
  ip?: string;
  target?: string;
  details?: Record<string, unknown>;
}

const isDev = process.env.NODE_ENV === "development";

export function auditLog(entry: AuditEntry): void {
  const record = {
    _type: "AUDIT",
    timestamp: new Date().toISOString(),
    action: entry.action,
    ip: entry.ip ?? "unknown",
    target: entry.target ?? "",
    ...entry.details,
  };

  if (isDev) {
    console.log(
      `[AUDIT] ${record.action} | target=${record.target} | ip=${record.ip}`,
      entry.details ? JSON.stringify(entry.details) : ""
    );
  } else {
    console.log(JSON.stringify(record));
  }
}
