import fs from "fs";
import path from "path";
import type { BlockTime, ClassSchedule, RentalRequest, RequestStatus } from "@/lib/types";
import { nowIsoSeoul, todayYmdSeoul } from "@/lib/datetime";
import { ROOMS } from "@/lib/config";

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
};

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
      blocks: Array.isArray(data.blocks) ? data.blocks : []
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
  const db = ensureDb();
  const prefix = `REQ-${todayYmdSeoul().replaceAll("-", "")}-`;
  const nums = db.requests
    .map(r => r.requestId)
    .filter(v => v.startsWith(prefix))
    .map(v => parseInt(v.slice(prefix.length), 10))
    .filter(n => Number.isFinite(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
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

export async function mock_updateRequestStatus(args: {
  requestId: string;
  status: RequestStatus;
  adminMemo?: string;
  rejectReason?: string;
  decidedBy: string;
  discountRatePct?: number;
  discountAmountKRW?: number;
  discountReason?: string;
}): Promise<RentalRequest> {
  const db = ensureDb();
  const idx = db.requests.findIndex(r => r.requestId === args.requestId);
  if (idx < 0) throw new Error("해당 신청건을 찾을 수 없습니다.");

  const current = db.requests[idx];
  const statusChanged = current.status !== args.status;
  const decidedAt = statusChanged ? nowIsoSeoul() : (current.decidedAt ?? "");
  const decidedBy = statusChanged ? args.decidedBy : (current.decidedBy ?? "");

  db.requests[idx] = {
    ...current,
    status: args.status,
    adminMemo: args.adminMemo ?? "",
    rejectReason: args.rejectReason ?? "",
    discountRatePct: typeof args.discountRatePct === "number" ? args.discountRatePct : (current.discountRatePct ?? 0),
    discountAmountKRW: typeof args.discountAmountKRW === "number" ? args.discountAmountKRW : (current.discountAmountKRW ?? 0),
    discountReason: typeof args.discountReason === "string" ? args.discountReason : (current.discountReason ?? ""),
    decidedAt,
    decidedBy
  };
    // 할인 정보는 '묶음' 단위로 적용되므로, batchId가 있으면 같은 묶음 전체에 동기화합니다.
  const shouldSyncDiscount =
    (typeof args.discountRatePct === "number") ||
    (typeof args.discountAmountKRW === "number") ||
    (typeof args.discountReason === "string");

  const batchId = db.requests[idx].batchId;
  if (shouldSyncDiscount && batchId) {
    for (let i = 0; i < db.requests.length; i++) {
      if (db.requests[i].batchId === batchId) {
        db.requests[i] = {
          ...db.requests[i],
          discountRatePct: db.requests[idx].discountRatePct ?? 0,
          discountAmountKRW: db.requests[idx].discountAmountKRW ?? 0,
          discountReason: db.requests[idx].discountReason ?? ""
        };
      }
    }
  }

  saveDb(db);
  return db.requests[idx];
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

export async function mock_deleteClassSchedule(id: string): Promise<void> {
  const db = ensureDb();
  db.schedules = db.schedules.filter(s => s.id !== id);
  saveDb(db);
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
