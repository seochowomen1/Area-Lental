import fs from "fs";
import path from "path";
import type { BlockTime, ClassSchedule, RentalRequest, RequestStatus, PaymentPatch, GalleryFeeUpdate } from "@/lib/types";
import { PAYMENT_FIELD_KEYS, PAYMENT_NUMERIC_KEYS } from "@/lib/types";
import { nowIsoSeoul, todayYmdSeoul } from "@/lib/datetime";
import { ROOMS } from "@/lib/config";
import { assertWriteExpect, type WriteExpect } from "@/lib/writeExpect";

type EmailTemplateRow = {
  category: string;
  status: string;
  subject: string;
  body: string;
};

type MockDB = {
  requests: RentalRequest[];
  schedules: ClassSchedule[];
  blocks: BlockTime[];
  emailTemplates?: EmailTemplateRow[];
  /** 로그아웃으로 폐기된 관리자 세션 (audit-fix-1 [7]) */
  revokedSessions?: Array<{ sid: string; revokedAt: string; exp: string }>;
  /** 감사로그(모의 · audit-fix-3 3-1) — 최근 2,000행만 보관 */
  auditLog?: MockAuditRow[];
};

export type MockAuditRow = { timestamp: string; action: string; target: string; actor: string; summary: string; details: string; ip: string };

// Vercel 서버리스에서는 process.cwd()가 읽기 전용이므로 /tmp 사용
const DB_PATH = process.env.VERCEL
  ? path.join("/tmp", ".mockdb.json")
  : path.join(process.cwd(), ".mockdb.json");

/**
 * 모듈 레벨 인메모리 캐시 — Vercel 서버리스에서 warm instance 내에서
 * 여러 함수 호출(API route + page SSR)이 같은 데이터를 보도록 합니다.
 */
let memCache: MockDB | null = null;

function ensureDb(): MockDB {
  // 메모리 캐시가 있으면 그대로 반환
  if (memCache) return memCache;

  if (!fs.existsSync(DB_PATH)) {
    const empty: MockDB = { requests: [], schedules: [], blocks: [] };
    fs.writeFileSync(DB_PATH, JSON.stringify(empty, null, 2), "utf-8");
    memCache = empty;
    return empty;
  }
  try {
    const raw = fs.readFileSync(DB_PATH, "utf-8");
    const data = JSON.parse(raw) as MockDB;
    const db: MockDB = {
      requests: Array.isArray(data.requests) ? data.requests : [],
      schedules: Array.isArray(data.schedules) ? data.schedules : [],
      blocks: Array.isArray(data.blocks) ? data.blocks : [],
      // 재시작 시 이메일 템플릿·폐기 세션이 사라지지 않도록 보존
      ...(Array.isArray(data.emailTemplates) ? { emailTemplates: data.emailTemplates } : {}),
      ...(Array.isArray(data.revokedSessions) ? { revokedSessions: data.revokedSessions } : {}),
      ...(Array.isArray(data.auditLog) ? { auditLog: data.auditLog } : {}),
    };
    memCache = db;
    return db;
  } catch {
    const empty: MockDB = { requests: [], schedules: [], blocks: [] };
    fs.writeFileSync(DB_PATH, JSON.stringify(empty, null, 2), "utf-8");
    memCache = empty;
    return empty;
  }
}

function saveDb(db: MockDB) {
  memCache = db;
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
}

function roomName(roomId: string) {
  return ROOMS.find(r => r.id === roomId)?.name ?? roomId;
}

export async function mock_getAllRequests(): Promise<RentalRequest[]> {
  return ensureDb().requests;
}

export async function mock_getRequestById(id: string): Promise<RentalRequest | null> {
  const db = ensureDb();
  return db.requests.find(r => r.requestId === id) ?? null;
}

export async function mock_nextRequestId(): Promise<string> {
  const { randomBytes } = await import("crypto");
  const db = ensureDb();
  const prefix = `REQ-${todayYmdSeoul().replaceAll("-", "")}-`;
  const existingIds = new Set(db.requests.map(r => r.requestId));
  let candidate: string;
  do {
    candidate = `${prefix}${randomBytes(4).toString("hex").toUpperCase()}`;
  } while (existingIds.has(candidate));
  return candidate;
}

export async function mock_appendRequest(input: Omit<RentalRequest, "requestId" | "createdAt" | "status" | "adminMemo" | "rejectReason" | "decidedAt" | "decidedBy" | "roomName">): Promise<RentalRequest> {
  const db = ensureDb();
  const requestId = await mock_nextRequestId();
  const createdAt = nowIsoSeoul();

  const record: RentalRequest = {
    requestId,
    createdAt,

    batchId: input.batchId,
    batchSeq: input.batchSeq,
    batchSize: input.batchSize,

    roomId: input.roomId,
    roomName: roomName(input.roomId),

    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,

    isPrepDay: input.isPrepDay,
    startDate: input.startDate,
    endDate: input.endDate,
    exhibitionTitle: input.exhibitionTitle,
    exhibitionPurpose: input.exhibitionPurpose,
    genreContent: input.genreContent,
    awarenessPath: input.awarenessPath,
    specialNotes: input.specialNotes,

    galleryGeneratedAt: input.galleryGeneratedAt,
    galleryGenerationVersion: input.galleryGenerationVersion,
    galleryWeekdayCount: input.galleryWeekdayCount,
    gallerySaturdayCount: input.gallerySaturdayCount,
    galleryExhibitionDayCount: input.galleryExhibitionDayCount,
    galleryPrepDate: input.galleryPrepDate,
    galleryAuditJson: input.galleryAuditJson,
    galleryRemovalTime: input.galleryRemovalTime,
    intakeChannel: input.intakeChannel,
    appliedAt: input.appliedAt,
    intakeNote: input.intakeNote,

    applicantName: input.applicantName,
    birth: input.birth,
    address: input.address,
    phone: input.phone,
    email: input.email,

    orgName: input.orgName,
    headcount: input.headcount,

    equipment: input.equipment,
    purpose: input.purpose,

    attachments: input.attachments ?? [],

    privacyAgree: input.privacyAgree,
    pledgeAgree: input.pledgeAgree,
    pledgeDate: input.pledgeDate,
    pledgeName: input.pledgeName,

    discountRatePct: 0,
    discountAmountKRW: 0,
    discountReason: "",

    status: "접수",
    adminMemo: "",
    rejectReason: "",
    decidedAt: "",
    decidedBy: ""
  };

  db.requests.push(record);
  saveDb(db);
  return record;
}

export async function mock_appendRequestsBatch(
  inputs: Array<Omit<RentalRequest, "requestId" | "createdAt" | "status" | "adminMemo" | "rejectReason" | "decidedAt" | "decidedBy" | "roomName">>
): Promise<RentalRequest[]> {
  const db = ensureDb();
  const createdAt = nowIsoSeoul();

  // 하루 단위로 다건 저장 시, 파일 I/O를 1회로 줄입니다.
  const saved: RentalRequest[] = [];
  for (const input of inputs) {
    const requestId = await mock_nextRequestId();
    const record: RentalRequest = {
      requestId,
      createdAt,

      batchId: input.batchId,
      batchSeq: input.batchSeq,
      batchSize: input.batchSize,

      roomId: input.roomId,
      roomName: roomName(input.roomId),

      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime,

      isPrepDay: input.isPrepDay,
      startDate: input.startDate,
      endDate: input.endDate,
      exhibitionTitle: input.exhibitionTitle,
      exhibitionPurpose: input.exhibitionPurpose,
      genreContent: input.genreContent,
      awarenessPath: input.awarenessPath,
      specialNotes: input.specialNotes,

      galleryGeneratedAt: input.galleryGeneratedAt,
      galleryGenerationVersion: input.galleryGenerationVersion,
      galleryWeekdayCount: input.galleryWeekdayCount,
      gallerySaturdayCount: input.gallerySaturdayCount,
      galleryExhibitionDayCount: input.galleryExhibitionDayCount,
      galleryPrepDate: input.galleryPrepDate,
      galleryAuditJson: input.galleryAuditJson,
      galleryRemovalTime: input.galleryRemovalTime,
      intakeChannel: input.intakeChannel,
      appliedAt: input.appliedAt,
      intakeNote: input.intakeNote,

      applicantName: input.applicantName,
      birth: input.birth,
      address: input.address,
      phone: input.phone,
      email: input.email,

      orgName: input.orgName,
      headcount: input.headcount,

      equipment: input.equipment,
      purpose: input.purpose,

      attachments: input.attachments ?? [],

      privacyAgree: input.privacyAgree,
      pledgeAgree: input.pledgeAgree,
      pledgeDate: input.pledgeDate,
      pledgeName: input.pledgeName,

      discountRatePct: 0,
      discountAmountKRW: 0,
      discountReason: "",

      status: "접수",
      adminMemo: "",
      rejectReason: "",
      decidedAt: "",
      decidedBy: ""
    };

    db.requests.push(record);
    saved.push(record)
  }

  saveDb(db);
  return saved;
}

/**
 * 여러 행 상태 일괄 변경 (Mock) — sheets.updateRequestsStatusBatch와 같은 규칙
 * 전부 확인 후 한 번에 반영 · 파일 저장 1회
 */
export async function mock_updateRequestsStatusBatch(
  updates: Array<{ requestId: string; status: RequestStatus; adminMemo?: string; rejectReason?: string; decidedBy: string }>,
  discount?: { batchId: string; requestId?: string; discountRatePct: number; discountAmountKRW: number; discountReason: string },
  payment?: { requestId: string; patch: PaymentPatch },
  expect?: WriteExpect
): Promise<RentalRequest[]> {
  const db = ensureDb();
  const idxOf = new Map(db.requests.map((r, i) => [r.requestId, i]));
  for (const u of updates) {
    if (!idxOf.has(u.requestId)) throw new Error(`해당 신청건을 찾을 수 없습니다: ${u.requestId}`);
  }
  if (payment && !idxOf.has(payment.requestId)) throw new Error(`해당 신청건을 찾을 수 없습니다: ${payment.requestId}`);
  // 저장 직전 상태 재확인 (조건부 쓰기 · audit-fix-3 3-1) — 어긋나면 아무것도 바꾸지 않음
  assertWriteExpect(db.requests, updates.map((u) => u.requestId), payment?.requestId ?? updates[0]?.requestId, expect);
  const now = nowIsoSeoul();
  const next = db.requests.slice();
  const touched = new Set<number>();
  for (const u of updates) {
    const i = idxOf.get(u.requestId)!;
    const cur = next[i];
    const changed = cur.status !== u.status;
    next[i] = {
      ...cur,
      status: u.status,
      adminMemo: u.adminMemo ?? cur.adminMemo ?? "",
      rejectReason: u.rejectReason ?? cur.rejectReason ?? "",
      decidedAt: changed ? now : (cur.decidedAt ?? ""),
      decidedBy: changed ? u.decidedBy : (cur.decidedBy ?? ""),
    };
    touched.add(i);
  }
  if (discount && (discount.batchId.trim() || discount.requestId)) {
    const bid = discount.batchId.trim();
    next.forEach((r, i) => {
      if (bid ? (r.batchId ?? "").trim() !== bid : r.requestId !== discount.requestId) return;
      next[i] = { ...r, discountRatePct: discount.discountRatePct, discountAmountKRW: discount.discountAmountKRW, discountReason: discount.discountReason };
      touched.add(i);
    });
  }
  if (payment) {
    const cur = next[idxOf.get(payment.requestId)!];
    const bid = (cur.batchId ?? "").trim();
    next.forEach((r, i) => {
      if (bid ? (r.batchId ?? "").trim() !== bid : r.requestId !== cur.requestId) return;
      const merged: Record<string, unknown> = { ...r };
      for (const k of PAYMENT_FIELD_KEYS) {
        if (!(k in payment.patch)) continue;
        const v = payment.patch[k];
        if (v === undefined) continue;
        if (v === null || v === "") delete merged[k];
        else merged[k] = PAYMENT_NUMERIC_KEYS.has(k) ? Number(v) : v;
      }
      next[i] = merged as RentalRequest;
      touched.add(i);
    });
  }
  db.requests = next;
  saveDb(db);
  return [...touched].sort((a, b) => a - b).map((i) => db.requests[i]);
}

/* ── 관리자 세션 폐기 목록 (Mock) ── */

export async function mock_getRevokedAdminSessions(): Promise<Array<{ sid: string; exp: string }>> {
  const nowIso = new Date().toISOString();
  return (ensureDb().revokedSessions ?? [])
    .filter((r) => r.sid && (!r.exp || r.exp > nowIso))
    .map((r) => ({ sid: r.sid, exp: r.exp }));
}

export async function mock_addRevokedAdminSession(entry: { sid: string; exp: string }): Promise<void> {
  const db = ensureDb();
  const nowIso = new Date().toISOString();
  // 만료된 행은 이때 정리
  const kept = (db.revokedSessions ?? []).filter((r) => !r.exp || r.exp > nowIso);
  kept.push({ sid: entry.sid, revokedAt: nowIsoSeoul(), exp: entry.exp });
  db.revokedSessions = kept;
  saveDb(db);
}

/**
 * 결제 기록 필드 갱신 (Mock) — 묶음이면 같은 batchId 전 행 동기화
 * patch 값 null/"" → 필드 제거(비움), undefined → 유지 · audit-fix-3 3-1: 일괄 함수로 통일(expect 지원)
 */
export async function mock_updateRequestPayment(args: { requestId: string; patch: PaymentPatch; expect?: WriteExpect }): Promise<RentalRequest[]> {
  if (!ensureDb().requests.some((r) => r.requestId === args.requestId)) throw new Error("해당 신청건을 찾을 수 없습니다.");
  return mock_updateRequestsStatusBatch([], undefined, { requestId: args.requestId, patch: args.patch }, args.expect);
}

/** 갤러리 이용료 다시 계산 (Mock · audit-fix-2 R2) — 갤러리 1행만 */
export async function mock_updateGalleryFee(args: GalleryFeeUpdate): Promise<RentalRequest> {
  const db = ensureDb();
  const i = db.requests.findIndex((r) => r.requestId === args.requestId);
  if (i < 0) throw new Error("해당 신청건을 찾을 수 없습니다.");
  if (db.requests[i].roomId !== "gallery") throw new Error("갤러리 신청만 다시 계산할 수 있습니다.");
  db.requests[i] = {
    ...db.requests[i],
    galleryWeekdayCount: args.weekdayCount,
    gallerySaturdayCount: args.saturdayCount,
    galleryExhibitionDayCount: args.exhibitionDayCount,
    galleryAuditJson: args.galleryAuditJson,
  };
  saveDb(db);
  return db.requests[i];
}

export async function mock_getClassSchedules(): Promise<ClassSchedule[]> {
  return ensureDb().schedules;
}

export async function mock_addClassSchedule(s: Omit<ClassSchedule, "id">): Promise<ClassSchedule> {
  const db = ensureDb();
  const id = `CS-${Date.now()}`;
  const created: ClassSchedule = { id, ...s };
  db.schedules.push(created);
  saveDb(db);
  return created;
}

export async function mock_updateClassSchedule(id: string, updates: Partial<Omit<ClassSchedule, "id">>): Promise<ClassSchedule> {
  const db = ensureDb();
  const idx = db.schedules.findIndex(s => s.id === id);
  if (idx < 0) throw new Error("수정할 수업시간을 찾을 수 없습니다.");
  db.schedules[idx] = { ...db.schedules[idx], ...updates };
  saveDb(db);
  return db.schedules[idx];
}

export async function mock_deleteClassSchedule(id: string): Promise<void> {
  const db = ensureDb();
  db.schedules = db.schedules.filter(s => s.id !== id);
  saveDb(db);
}

/**
 * 출처(source)가 같은 항목을 새 항목으로 갈아끼운다(동기화용 · audit-fix-3 3-1 "추가하고 지움")
 * 새 목록을 먼저 만든 뒤 한 번에 바꿔 끼우므로, 중간에 실패하면 기존 목록이 그대로 남는다.
 */
export async function mock_replaceClassSchedulesBySource(
  source: string,
  items: Omit<ClassSchedule, "id">[]
): Promise<{ deleted: number; added: number }> {
  const db = ensureDb();
  const stamp = Date.now();
  // 1) 추가할 행 먼저 생성
  const created: ClassSchedule[] = items.map((s, i) => ({ id: `CS-${stamp}-${i}`, ...s, source }));
  // 2) 옛 행 제외 + 새 행 추가를 한 번에 반영
  const kept = db.schedules.filter((s) => s.source !== source);
  const deleted = db.schedules.length - kept.length;
  db.schedules = [...kept, ...created];
  saveDb(db);
  return { deleted, added: created.length };
}

export async function mock_getBlocks(): Promise<BlockTime[]> {
  return ensureDb().blocks;
}

export async function mock_addBlock(b: Omit<BlockTime, "id">): Promise<BlockTime> {
  const db = ensureDb();
  const id = `BL-${Date.now()}`;
  const created: BlockTime = { id, ...b };
  db.blocks.push(created);
  saveDb(db);
  return created;
}

export async function mock_deleteBlock(id: string): Promise<void> {
  const db = ensureDb();
  db.blocks = db.blocks.filter(b => b.id !== id);
  saveDb(db);
}

/* ── 삭제 (Mock) ── */

export async function mock_deleteRequests(requestIds: string[]): Promise<void> {
  const db = ensureDb();
  const idsSet = new Set(requestIds);
  db.requests = db.requests.filter(r => !idsSet.has(r.requestId));
  saveDb(db);
}

/* ── 이메일 템플릿 (Mock) ── */

export async function mock_getEmailTemplates(): Promise<EmailTemplateRow[]> {
  const db = ensureDb();
  return db.emailTemplates ?? [];
}

export async function mock_saveEmailTemplate(
  category: string,
  status: string,
  subject: string,
  body: string,
): Promise<void> {
  const db = ensureDb();
  if (!db.emailTemplates) db.emailTemplates = [];
  const idx = db.emailTemplates.findIndex(
    (t) => t.category === category && t.status === status,
  );
  if (idx >= 0) {
    db.emailTemplates[idx] = { category, status, subject, body };
  } else {
    db.emailTemplates.push({ category, status, subject, body });
  }
  saveDb(db);
}

/* ── 감사로그·백업 (Mock · audit-fix-3 3-1) ── */

const MOCK_AUDIT_KEEP = 2000;

export async function mock_appendAuditRow(row: MockAuditRow): Promise<void> {
  const db = ensureDb();
  const list = db.auditLog ?? [];
  list.push(row);
  db.auditLog = list.slice(-MOCK_AUDIT_KEEP);
  saveDb(db);
}

export async function mock_getAuditRows(): Promise<MockAuditRow[]> {
  return ensureDb().auditLog ?? [];
}

function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function objectsToRows(items: Array<Record<string, unknown>>, fixedHeader?: readonly string[]): string[][] {
  const header: string[] = fixedHeader ? [...fixedHeader] : [];
  for (const it of items) for (const k of Object.keys(it)) if (!header.includes(k)) header.push(k);
  return [header, ...items.map((it) => header.map((h) => cellText(it[h])))];
}

/** 시트 탭 이름과 같은 이름으로 모의 DB 전체를 표로 내보낸다(백업 파일 생성용) */
export async function mock_exportTabs(): Promise<Array<{ title: string; rows: string[][] }>> {
  const db = ensureDb();
  return [
    { title: "requests", rows: objectsToRows(db.requests as unknown as Array<Record<string, unknown>>, ["requestId", "createdAt"]) },
    { title: "class_schedule", rows: objectsToRows(db.schedules as unknown as Array<Record<string, unknown>>, ["id", "roomId", "dayOfWeek", "startTime", "endTime", "title", "effectiveFrom", "effectiveTo"]) },
    { title: "blocks", rows: objectsToRows(db.blocks as unknown as Array<Record<string, unknown>>, ["id", "roomId", "date", "startTime", "endTime", "reason", "endDate"]) },
    { title: "email_templates", rows: objectsToRows((db.emailTemplates ?? []) as unknown as Array<Record<string, unknown>>, ["category", "status", "subject", "body"]) },
    { title: "audit_log", rows: objectsToRows((db.auditLog ?? []) as unknown as Array<Record<string, unknown>>, ["timestamp", "action", "target", "actor", "summary", "details", "ip"]) },
    { title: "admin_sessions", rows: objectsToRows((db.revokedSessions ?? []) as unknown as Array<Record<string, unknown>>, ["sid", "revokedAt", "exp"]) },
  ];
}
