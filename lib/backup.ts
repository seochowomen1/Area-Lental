/**
 * 시트 백업 (audit-fix-3 3-1 · 서버 전용)
 *
 * - 매일 04:00 KST(크론) 또는 관리자 [지금 백업]: 시트 전체 탭 → 엑셀 1개 → 드라이브 "대관앱 백업" 폴더
 * - 드라이브 쓰기는 첨부 업로드와 같은 OAuth(드라이브 소유자 · drive.file 범위 · 앱이 만든 폴더만 보임)
 * - 개인정보 포함 파일: 공유하지 않음 · 파일명에 개인정보 없음 · 30일 지나면 "정리 안내"만(자동 삭제 없음)
 * - 삭제는 관리자가 목록·건수를 확인한 파일만(DELETE /api/admin/backup) — 서버가 폴더·이름 형식·30일을 다시 검사
 * - 로컬 MOCK_MODE: 드라이브 대신 프로젝트 `.mock-backups/` 폴더(gitignore)에 저장 (운영 드라이브 접근 없음)
 *
 * PUBLIC 레포: 폴더 ID·링크는 코드에 쓰지 않는다(폴더는 이름으로 찾고, 링크는 실행 중에만 만든다).
 */
import fs from "fs";
import path from "path";
import { Readable } from "stream";
import * as XLSX from "xlsx";
import { isMockMode, getGoogleOAuthEnvOptional } from "@/lib/env";
import { recordAudit } from "@/lib/auditLog";
import { lastOf, readAuditTail, type AuditTailRow } from "@/lib/auditQuery";

export const BACKUP_FOLDER_DEFAULT = "대관앱 백업";
export const BACKUP_NAME_RE = /^대관앱백업_\d{4}-\d{2}-\d{2}_\d{4}\.xlsx$/;
export const BACKUP_RETENTION_DAYS = 30;
export const BACKUP_DELETE_MAX = 31;
/** 관리자 홈 노란 띠 기준(마지막 성공 후 시간) */
export const BACKUP_STALE_HOURS = 36;
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
/** 엑셀 셀 최대 글자 수 */
const XLSX_CELL_MAX = 32767;

export const BACKUP_MSG = {
  notConfigured: "드라이브 연결 설정이 없어 백업할 수 없습니다.",
  sheetBusy: "시트 읽기 한도에 걸렸습니다. 1분 뒤 다시 시도해 주세요.",
  failed: "백업하지 못했습니다.",
  countMismatch: "확인한 개수와 삭제할 개수가 다릅니다. 목록을 다시 열어 주세요.",
  notDeletable: "삭제할 수 없는 파일이 섞여 있어 아무것도 지우지 않았습니다. 목록을 다시 열어 30일 지난 백업만 골라 주세요.",
  tooMany: `한 번에 ${BACKUP_DELETE_MAX}개까지 삭제할 수 있습니다.`,
  invalid: "삭제할 백업을 골라 주세요.",
} as const;

export type BackupErrorCode = "BACKUP_DRIVE_NOT_CONFIGURED" | "SHEET_BUSY" | "BACKUP_FAILED";

export class BackupError extends Error {
  readonly code: BackupErrorCode;
  readonly status: number;
  constructor(code: BackupErrorCode) {
    super(code === "BACKUP_DRIVE_NOT_CONFIGURED" ? BACKUP_MSG.notConfigured : code === "SHEET_BUSY" ? BACKUP_MSG.sheetBusy : BACKUP_MSG.failed);
    this.name = "BackupError";
    this.code = code;
    this.status = code === "BACKUP_FAILED" ? 500 : 503;
  }
}

/* ───────────────────────── 파일 이름·엑셀 ───────────────────────── */

/** KST 기준 `대관앱백업_YYYY-MM-DD_HHmm.xlsx` */
export function backupFileName(now: Date = new Date()): string {
  const k = new Date(now.getTime() + 9 * 3600 * 1000).toISOString(); // 2026-10-28T04:00:00.000Z (KST 숫자)
  return `대관앱백업_${k.slice(0, 10)}_${k.slice(11, 13)}${k.slice(14, 16)}.xlsx`;
}

/** 엑셀 시트 이름 규칙(31자 · 금지 문자) */
function safeSheetName(title: string, used: Set<string>): string {
  const base = title.replace(/[\\/?*[\]:]/g, "_").slice(0, 31) || "sheet";
  let name = base;
  for (let i = 2; used.has(name); i++) {
    const suffix = `_${i}`;
    name = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(name);
  return name;
}

/** 탭 목록 → xlsx Buffer (탭마다 같은 이름의 시트 · 첫 행 = 시트 헤더 그대로) */
export function buildBackupWorkbook(tabs: Array<{ title: string; rows: string[][] }>): Buffer {
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  for (const t of tabs) {
    const rows = t.rows.map((r) => r.map((v) => (v.length > XLSX_CELL_MAX ? v.slice(0, XLSX_CELL_MAX) : v)));
    const ws = XLSX.utils.aoa_to_sheet(rows.length ? rows : [[]]);
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(t.title, used));
  }
  if (!tabs.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[]]), "empty");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/** 탭별 데이터 행 수(헤더 제외) */
export function countTabRows(tabs: Array<{ title: string; rows: string[][] }>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of tabs) out[t.title] = Math.max(0, t.rows.length - 1);
  return out;
}

/* ───────────────────────── 저장소(드라이브 / 로컬 모의) ───────────────────────── */

export type StoredFile = { fileId: string; name: string; createdAt: string };

export interface BackupStore {
  readonly kind: "drive" | "local";
  list(): Promise<StoredFile[]>;
  upload(name: string, data: Buffer): Promise<StoredFile>;
  /** 폴더 안 파일 1개 영구 삭제 — 호출 전에 validateBackupDeletion을 통과해야 한다 */
  remove(fileId: string): Promise<void>;
  /** [백업 폴더 열기] 주소(없으면 null) */
  folderUrl(): Promise<string | null>;
}

function backupFolderName(): string {
  return (process.env.GOOGLE_DRIVE_BACKUP_FOLDER_NAME ?? "").trim() || BACKUP_FOLDER_DEFAULT;
}

/** 로컬 모의 저장소 — `.mock-backups/`(Vercel이면 /tmp) */
class LocalBackupStore implements BackupStore {
  readonly kind = "local" as const;
  private dir = process.env.VERCEL ? path.join("/tmp", ".mock-backups") : path.join(process.cwd(), ".mock-backups");

  private ensure() {
    if (!fs.existsSync(this.dir)) fs.mkdirSync(this.dir, { recursive: true });
  }
  async list(): Promise<StoredFile[]> {
    this.ensure();
    return fs
      .readdirSync(this.dir)
      .filter((n) => n.endsWith(".xlsx"))
      .map((n) => ({ fileId: n, name: n, createdAt: fs.statSync(path.join(this.dir, n)).mtime.toISOString() }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async upload(name: string, data: Buffer): Promise<StoredFile> {
    this.ensure();
    const p = path.join(this.dir, path.basename(name));
    fs.writeFileSync(p, data);
    return { fileId: path.basename(name), name: path.basename(name), createdAt: fs.statSync(p).mtime.toISOString() };
  }
  async remove(fileId: string): Promise<void> {
    // fileId는 list()에서 나온 이름만 들어온다(검증 후 호출) — 경로 이동 방지로 basename만 사용
    fs.unlinkSync(path.join(this.dir, path.basename(fileId)));
  }
  async folderUrl(): Promise<string | null> {
    return null;
  }
}

type DriveClient = ReturnType<typeof import("googleapis").google.drive>;

/** 드라이브 저장소 — OAuth(drive.file)만. 서비스 계정은 내 드라이브에 파일을 만들 수 없어(용량 0) 쓰지 않는다 */
class DriveBackupStore implements BackupStore {
  readonly kind = "drive" as const;
  private folderId: string | null = null;
  constructor(private drive: DriveClient) {}

  private async folder(): Promise<string> {
    if (this.folderId) return this.folderId;
    const name = backupFolderName();
    const q = `name = '${name.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const found = await this.drive.files.list({ q, fields: "files(id,name)", pageSize: 5, spaces: "drive" });
    let id = found.data.files?.[0]?.id ?? null;
    if (!id) {
      const created = await this.drive.files.create({
        requestBody: { name, mimeType: "application/vnd.google-apps.folder" },
        fields: "id",
      });
      id = created.data.id ?? null;
    }
    if (!id) throw new Error("백업 폴더를 만들 수 없습니다.");
    this.folderId = id;
    return id;
  }

  async list(): Promise<StoredFile[]> {
    const folderId = await this.folder();
    const out: StoredFile[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < 10; page++) {
      const res = await this.drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: "nextPageToken, files(id,name,createdTime)",
        orderBy: "createdTime desc",
        pageSize: 100,
        spaces: "drive",
        pageToken,
      });
      for (const f of res.data.files ?? []) {
        if (f.id && f.name) out.push({ fileId: f.id, name: f.name, createdAt: f.createdTime ?? "" });
      }
      pageToken = res.data.nextPageToken ?? undefined;
      if (!pageToken) break;
    }
    return out;
  }

  async upload(name: string, data: Buffer): Promise<StoredFile> {
    const folderId = await this.folder();
    const res = await this.drive.files.create({
      requestBody: { name, parents: [folderId], mimeType: XLSX_MIME },
      media: { mimeType: XLSX_MIME, body: Readable.from(data) },
      fields: "id,name,createdTime",
    });
    if (!res.data.id) throw new Error("드라이브 업로드 응답에 파일 ID가 없습니다.");
    return { fileId: res.data.id, name: res.data.name ?? name, createdAt: res.data.createdTime ?? new Date().toISOString() };
  }

  async remove(fileId: string): Promise<void> {
    // ★ 백업 삭제의 유일한 드라이브 삭제 호출 — DELETE /api/admin/backup 에서만 부른다(자동 삭제 없음)
    await this.drive.files.delete({ fileId });
  }

  async folderUrl(): Promise<string | null> {
    return `https://drive.google.com/drive/folders/${await this.folder()}`;
  }
}

let _storeOverride: BackupStore | null | undefined;

/** 테스트 전용 — 저장소 바꿔 끼우기(undefined면 원래대로) */
export function __setBackupStoreForTest(store: BackupStore | null | undefined) {
  _storeOverride = store;
}

/**
 * 백업 저장소 — 없으면 null(= BACKUP_DRIVE_NOT_CONFIGURED)
 * - MOCK_MODE: 로컬 폴더 (MOCK_BACKUP_STORE=off 이면 null — "설정 없음" 화면 확인용)
 * - 운영: GOOGLE_OAUTH_* 3종이 있을 때만 드라이브
 */
export async function getBackupStore(): Promise<BackupStore | null> {
  if (_storeOverride !== undefined) return _storeOverride;
  if (isMockMode()) {
    return (process.env.MOCK_BACKUP_STORE ?? "").trim().toLowerCase() === "off" ? null : new LocalBackupStore();
  }
  let oauth: ReturnType<typeof getGoogleOAuthEnvOptional> = null;
  try {
    oauth = getGoogleOAuthEnvOptional();
  } catch {
    oauth = null;
  }
  if (!oauth) return null;
  const { getDriveUploadClient } = await import("@/lib/google");
  const { drive, mode } = getDriveUploadClient();
  if (mode !== "oauth") return null;
  return new DriveBackupStore(drive);
}

/* ───────────────────────── 실행 ───────────────────────── */

export type BackupRunResult = {
  fileName: string;
  tabs: Record<string, number>;
  durationMs: number;
};

function isQuotaError(e: unknown): boolean {
  const code = (e as { code?: unknown; status?: unknown })?.code ?? (e as { status?: unknown })?.status;
  if (code === 429 || code === "429") return true;
  const msg = e instanceof Error ? e.message : String(e);
  return /quota|rate limit|too many requests/i.test(msg);
}

function errName(e: unknown): string {
  const code = (e as { code?: unknown })?.code;
  return `${e instanceof Error ? e.name : typeof e}${code !== undefined ? `(${String(code)})` : ""}`;
}

function kstLabel(ms: number): string {
  return new Date(ms + 9 * 3600 * 1000).toISOString().replace("T", " ").slice(0, 16);
}

/**
 * 백업 1회 실행
 * - 성공: 감사 SHEET_BACKUP(await) · 결과 반환
 * - 실패: 감사 SHEET_BACKUP_FAIL(await) · 크론이면 관리자 알림 메일 1통 · BackupError throw
 * 로그에는 오류 이름·코드만(셀 값 없음).
 */
export async function runSheetBackup(opts: {
  trigger: "cron" | "admin";
  ip?: string;
  now?: Date;
  readTabs?: () => Promise<Array<{ title: string; rows: string[][] }>>;
}): Promise<BackupRunResult> {
  const started = Date.now();
  const now = opts.now ?? new Date();
  const actor = opts.trigger === "cron" ? "시스템" : undefined;
  const ip = opts.ip ?? (opts.trigger === "cron" ? "cron" : "unknown");

  const fail = async (code: BackupErrorCode, cause?: unknown): Promise<never> => {
    if (cause) console.error("[backup] 실패", code, errName(cause));
    try {
      await recordAudit({ action: "SHEET_BACKUP_FAIL", ip, actor, target: backupFileName(now), summary: `시트 백업 실패 · ${code}`, details: { code, trigger: opts.trigger } });
    } catch {
      /* 감사 실패는 무시(콘솔에 이미 남김) */
    }
    if (opts.trigger === "cron") {
      try {
        let lastSuccessAt: string | null = null;
        try {
          const last = lastOf(await readAuditTail(), "SHEET_BACKUP");
          lastSuccessAt = last ? kstLabel(last.at) : null;
        } catch {
          lastSuccessAt = null;
        }
        const { sendAdminBackupFailEmail } = await import("@/lib/mail");
        await sendAdminBackupFailEmail({ at: kstLabel(now.getTime()), code, lastSuccessAt });
      } catch (e) {
        console.warn("[backup] 관리자 알림 메일 실패", errName(e));
      }
    }
    throw new BackupError(code);
  };

  const store = await getBackupStore().catch(() => null);
  if (!store) return fail("BACKUP_DRIVE_NOT_CONFIGURED");

  let tabs: Array<{ title: string; rows: string[][] }>;
  try {
    const read = opts.readTabs ?? (async () => (await import("@/lib/sheets")).readAllTabsForBackup());
    tabs = await read();
  } catch (e) {
    return fail(isQuotaError(e) ? "SHEET_BUSY" : "BACKUP_FAILED", e);
  }

  const fileName = backupFileName(now);
  try {
    const buf = buildBackupWorkbook(tabs);
    await store.upload(fileName, buf);
  } catch (e) {
    return fail("BACKUP_FAILED", e);
  }

  const counts = countTabRows(tabs);
  const durationMs = Date.now() - started;
  await recordAudit({
    action: "SHEET_BACKUP",
    ip,
    actor,
    target: fileName,
    summary: [fileName, ...Object.entries(counts).map(([k, v]) => `${k} ${v}행`)].join(" · "),
    details: { trigger: opts.trigger, tabs: counts, durationMs, store: store.kind },
  });
  _healthCache = null;
  return { fileName, tabs: counts, durationMs };
}

/* ───────────────────────── 목록·정리 ───────────────────────── */

export type BackupItem = { fileId: string; name: string; createdAt: string; olderThan30d: boolean };

export function isOlderThanRetention(createdAt: string, nowMs: number): boolean {
  const t = Date.parse(createdAt);
  return Number.isFinite(t) && nowMs - t > BACKUP_RETENTION_DAYS * 24 * 3600 * 1000;
}

export function toBackupItems(files: StoredFile[], nowMs: number): BackupItem[] {
  return files
    .filter((f) => BACKUP_NAME_RE.test(f.name))
    .map((f) => ({ ...f, olderThan30d: isOlderThanRetention(f.createdAt, nowMs) }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export type DeletionCheck =
  | { ok: true; targets: StoredFile[] }
  | { ok: false; status: number; code: "VALIDATION" | "COUNT_MISMATCH" | "NOT_DELETABLE"; message: string };

/**
 * 삭제 요청 검사 — 하나라도 어긋나면 아무것도 지우지 않는다
 * - fileIds 1~31개 · 중복 없음 · 문자열
 * - fileIds 개수 = confirmCount
 * - 전부 백업 폴더 안 파일(목록에 있음) · 이름 형식 일치 · 30일 지남
 */
export function validateBackupDeletion(folderFiles: StoredFile[], fileIds: unknown, confirmCount: unknown, nowMs: number): DeletionCheck {
  if (!Array.isArray(fileIds) || fileIds.length === 0 || !fileIds.every((x) => typeof x === "string" && x.trim() !== "")) {
    return { ok: false, status: 400, code: "VALIDATION", message: BACKUP_MSG.invalid };
  }
  const ids = fileIds as string[];
  if (new Set(ids).size !== ids.length) return { ok: false, status: 400, code: "VALIDATION", message: BACKUP_MSG.invalid };
  if (typeof confirmCount !== "number" || !Number.isInteger(confirmCount) || ids.length !== confirmCount) {
    return { ok: false, status: 400, code: "COUNT_MISMATCH", message: BACKUP_MSG.countMismatch };
  }
  if (ids.length > BACKUP_DELETE_MAX) return { ok: false, status: 400, code: "VALIDATION", message: BACKUP_MSG.tooMany };
  const byId = new Map(folderFiles.map((f) => [f.fileId, f]));
  const targets: StoredFile[] = [];
  for (const id of ids) {
    const f = byId.get(id);
    if (!f || !BACKUP_NAME_RE.test(f.name) || !isOlderThanRetention(f.createdAt, nowMs)) {
      return { ok: false, status: 409, code: "NOT_DELETABLE", message: BACKUP_MSG.notDeletable };
    }
    targets.push(f);
  }
  return { ok: true, targets };
}

/* ───────────────────────── 상태(설정 줄·홈 띠) ───────────────────────── */

export type BackupOverview = {
  configured: boolean;
  /** epoch ms */
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  /** 실패가 마지막 성공보다 나중 */
  failedSinceSuccess: boolean;
  count: number;
  old: Array<{ fileId: string; name: string; createdAt: string }>;
  folderUrl: string | null;
  /** 목록을 읽지 못함(드라이브 오류) */
  listError: boolean;
};

/** 설정 화면 상태 줄 · GET /api/admin/backup/list 공용 */
export async function getBackupOverview(nowMs: number = Date.now()): Promise<BackupOverview & { items: BackupItem[] }> {
  let tail: AuditTailRow[] = [];
  try {
    tail = await readAuditTail();
  } catch (e) {
    console.warn("[backup] 감사로그를 읽지 못함", errName(e));
  }
  const auditSuccess = lastOf(tail, "SHEET_BACKUP")?.at ?? null;
  const lastFailureAt = lastOf(tail, "SHEET_BACKUP_FAIL")?.at ?? null;

  const store = await getBackupStore().catch(() => null);
  let items: BackupItem[] = [];
  let folderUrl: string | null = null;
  let listError = false;
  if (store) {
    try {
      items = toBackupItems(await store.list(), nowMs);
      folderUrl = await store.folderUrl();
    } catch (e) {
      listError = true;
      console.warn("[backup] 백업 목록을 읽지 못함", errName(e));
    }
  }
  const newestFile = items.length ? Date.parse(items[0].createdAt) : NaN;
  const candidates = [auditSuccess, Number.isFinite(newestFile) ? newestFile : null].filter((x): x is number => x !== null);
  const lastSuccessAt = candidates.length ? Math.max(...candidates) : null;
  return {
    configured: !!store,
    lastSuccessAt,
    lastFailureAt,
    failedSinceSuccess: lastFailureAt !== null && (lastSuccessAt === null || lastFailureAt > lastSuccessAt),
    count: items.length,
    old: items.filter((i) => i.olderThan30d).map(({ fileId, name, createdAt }) => ({ fileId, name, createdAt })),
    folderUrl,
    listError,
    items,
  };
}

export type BackupHealth = { show: false } | { show: true; kind: "stale" | "never" };

let _healthCache: { at: number; value: BackupHealth } | null = null;
const HEALTH_TTL_MS = 5 * 60 * 1000;

/** 관리자 홈 노란 띠 판단(감사로그만 읽음 · 5분 캐시 · 읽기 실패면 띠 없음) */
export async function getBackupHealth(nowMs: number = Date.now()): Promise<BackupHealth> {
  if (_healthCache && nowMs - _healthCache.at < HEALTH_TTL_MS) return _healthCache.value;
  let value: BackupHealth;
  try {
    const last = lastOf(await readAuditTail(), "SHEET_BACKUP");
    if (!last) value = { show: true, kind: "never" };
    else value = nowMs - last.at > BACKUP_STALE_HOURS * 3600 * 1000 ? { show: true, kind: "stale" } : { show: false };
  } catch {
    value = { show: false };
  }
  _healthCache = { at: nowMs, value };
  return value;
}

/** 테스트 전용 */
export function __resetBackupHealthCache() {
  _healthCache = null;
}

/* ───────────────────────── 저장소 재검토 기준 (01_spec 범위 밖 Postgres → 기준만 표시) ───────────────────────── */

/**
 * 설정 화면 재검토 기준 줄 — 신청 행 수 · 동시 신청 자동 취소 누적(묶음 수)
 * 동시 신청 자동 취소 = decidedBy "시스템" + 사유 "동시 신청 중복 …"(app/api/requests 저장 직후 재확인)
 */
export function storageReviewStats(
  all: Array<{ requestId: string; batchId?: string; decidedBy?: string; rejectReason?: string; status: string }>,
  marks: { decidedBy: string; reason: string }
): { requestRows: number; duplicateCancelled: number } {
  const keys = new Set<string>();
  for (const r of all) {
    if (r.status === "취소" && r.decidedBy === marks.decidedBy && r.rejectReason === marks.reason) {
      keys.add((r.batchId ?? "").trim() || r.requestId);
    }
  }
  return { requestRows: all.length, duplicateCancelled: keys.size };
}
