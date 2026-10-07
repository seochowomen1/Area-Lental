/**
 * 보안 감사 로그 — 관리자 작업 이력 추적
 *
 * 모든 데이터 변경 작업(생성/수정/삭제)을 구조화된 형태로 기록합니다.
 * - 프로덕션: JSON stdout + Google Sheets `audit_log` 탭에 영구 저장 (2026-10 행정감사 후속)
 * - 개발: 콘솔에 읽기 쉬운 형태로 출력
 *
 * 데이터 변경(승인·반려·취소·할인·묶음 메모 등)은 `await recordAudit(...)`로 시트 저장 완료를 보장하고,
 * 조회성 기록은 기존 `auditLog(...)`(시트 저장은 best-effort)를 그대로 사용합니다.
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
  | "REQUEST_STATUS_UPDATE"
  | "REQUEST_CANCEL_BY_USER"
  | "DISCOUNT_UPDATE"
  | "BUNDLE_META_UPDATE"
  | "EMAIL_SEND"
  | "EMAIL_TEMPLATE_UPDATE"
  | "SHEETS_INIT"
  | "ADMIN_LOGIN"
  | "ADMIN_LOGOUT"
  | "STATS_VIEW"
  | "EXPORT_LIST"
  | "EXPORT_FORM"
  | "PI_ACCESS"
  | "DATA_RETENTION_CHECK"
  | "DATA_RETENTION_PURGE";

/** 시트에 영구 저장할 작업(데이터 변경). 조회성 작업(PI_ACCESS·STATS_VIEW·EXPORT_*)은 로그 폭증 방지를 위해 제외 */
const PERSISTED_ACTIONS: ReadonlySet<AuditAction> = new Set<AuditAction>([
  "BLOCK_CREATE",
  "BLOCK_DELETE",
  "SCHEDULE_CREATE",
  "SCHEDULE_UPDATE",
  "SCHEDULE_DELETE",
  "REQUEST_DELETE",
  "REQUEST_APPROVE",
  "REQUEST_REJECT",
  "REQUEST_CANCEL",
  "REQUEST_STATUS_UPDATE",
  "REQUEST_CANCEL_BY_USER",
  "DISCOUNT_UPDATE",
  "BUNDLE_META_UPDATE",
  "EMAIL_SEND",
  "EMAIL_TEMPLATE_UPDATE",
  "SHEETS_INIT",
  "DATA_RETENTION_PURGE",
]);

/** 감사로그 시트의 작업명 한글 표기 */
const ACTION_LABEL: Partial<Record<AuditAction, string>> = {
  BLOCK_CREATE: "차단 등록",
  BLOCK_DELETE: "차단 삭제",
  SCHEDULE_CREATE: "수업시간 등록",
  SCHEDULE_UPDATE: "수업시간 수정",
  SCHEDULE_DELETE: "수업시간 삭제",
  REQUEST_DELETE: "신청 삭제",
  REQUEST_APPROVE: "승인",
  REQUEST_REJECT: "반려",
  REQUEST_CANCEL: "취소(관리자)",
  REQUEST_STATUS_UPDATE: "상태 변경",
  REQUEST_CANCEL_BY_USER: "취소(신청자)",
  DISCOUNT_UPDATE: "할인 변경",
  BUNDLE_META_UPDATE: "묶음 메모·할인 저장",
  EMAIL_SEND: "메일 발송",
  EMAIL_TEMPLATE_UPDATE: "메일 템플릿 수정",
  SHEETS_INIT: "시트 초기화",
  DATA_RETENTION_PURGE: "개인정보 파기",
};

export interface AuditEntry {
  action: AuditAction;
  ip?: string;
  target?: string;
  /** 처리자 (기본 "시설총무" — 신청자 본인 작업은 "신청자") */
  actor?: string;
  /** 사람이 읽는 한 줄 요약 (예: "할인 0% → 50% · 근거: 기관 협약") */
  summary?: string;
  details?: Record<string, unknown>;
}

const isDev = process.env.NODE_ENV === "development";
const isTest = process.env.NODE_ENV === "test";

function nowKstIso(): string {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return d.toISOString().replace("T", " ").slice(0, 19);
}

function writeConsole(entry: AuditEntry): void {
  const record = {
    _type: "AUDIT",
    timestamp: new Date().toISOString(),
    action: entry.action,
    ip: entry.ip ?? "unknown",
    target: entry.target ?? "",
    ...(entry.actor ? { actor: entry.actor } : {}),
    ...(entry.summary ? { summary: entry.summary } : {}),
    ...(entry.details ? { details: entry.details } : {}),
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

async function persist(entry: AuditEntry): Promise<void> {
  if (isTest || !PERSISTED_ACTIONS.has(entry.action)) return;
  try {
    const { appendAuditRow } = await import("@/lib/sheets");
    await appendAuditRow({
      timestamp: nowKstIso(),
      action: ACTION_LABEL[entry.action] ?? entry.action,
      target: entry.target ?? "",
      actor: entry.actor ?? "시설총무",
      summary: entry.summary ?? "",
      details: entry.details ? JSON.stringify(entry.details) : "",
      ip: entry.ip ?? "unknown",
    });
  } catch (e) {
    // 감사로그 저장 실패가 업무 처리를 막지 않도록 콘솔에만 남긴다
    console.error("[AUDIT] 시트 저장 실패", e instanceof Error ? e.message : e);
  }
}

/** 조회·일반 기록 (시트 저장은 best-effort, 기다리지 않음) */
export function auditLog(entry: AuditEntry): void {
  writeConsole(entry);
  void persist(entry);
}

/** 데이터 변경 기록 — 시트 저장까지 기다린다 (redirect 전에 await 할 것) */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  writeConsole(entry);
  await persist(entry);
}
