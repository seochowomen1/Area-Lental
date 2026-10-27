import { getGoogleClient } from "@/lib/google";
import { isMockMode, requireGoogleEnv } from "@/lib/env";
import { nowIsoSeoul, todayYmdSeoul } from "@/lib/datetime";
import type { BlockTime, ClassSchedule, RentalRequest, RequestStatus, PaymentFields, PaymentPatch, GalleryFeeUpdate } from "@/lib/types";
import { PAYMENT_FIELD_KEYS, PAYMENT_NUMERIC_KEYS } from "@/lib/types";
import { ROOMS } from "@/lib/config";
import {
  mock_getAllRequests,
  mock_getRequestById,
  mock_appendRequest,
  mock_updateRequestStatus,
  mock_updateRequestPayment,
  mock_updateGalleryFee,
  mock_updateRequestsStatusBatch,
  mock_getRevokedAdminSessions,
  mock_addRevokedAdminSession,
  mock_getBlocks,
  mock_addBlock,
  mock_deleteBlock,
  mock_getClassSchedules,
  mock_addClassSchedule,
  mock_deleteClassSchedule
} from "@/lib/mockdb";

const SHEET_REQUESTS = "requests";
const SHEET_SCHEDULE = "class_schedule";
const SHEET_BLOCKS = "blocks";

// 관리자 입력(할인) 필드 - 시트에 컬럼이 없더라도 로컬/Mock 모드가 깨지지 않도록 "옵션"으로 취급
// 기존 운영 시트와의 호환을 위해 '없으면 자동으로 헤더에 추가'하는 optional 컬럼들
// (추가해도 기존 데이터 파싱/업데이트가 깨지지 않도록 끝에 append)
export const REQUEST_OPTIONAL_HEADERS = [
  "discountRatePct",
  "discountAmountKRW",
  "discountReason",
  "batchId",
  "batchSeq",
  "batchSize",

  // 갤러리(B안) 추가 필드 (없으면 자동으로 끝에 추가)
  "isPrepDay",
  "startDate",
  "endDate",
  "exhibitionTitle",
  "exhibitionPurpose",
  "genreContent",
  "awarenessPath",
  "specialNotes",

  // E-스튜디오 촬영장비
  "equipment_mirrorless",
  "equipment_camcorder",
  "equipment_wirelessMic",
  "equipment_pinMic",
  "equipment_rodeMic",
  "equipment_electronicBoard",

  // 갤러리: 서버 생성(감사) 로그
  "galleryGeneratedAt",
  "galleryGenerationVersion",
  "galleryWeekdayCount",
  "gallerySaturdayCount",
  "galleryExhibitionDayCount",
  "galleryPrepDate",
  "galleryAuditJson",
  "galleryRemovalTime",

  // 서면 접수 등록 (2026-10-19)
  "intakeChannel",
  "appliedAt",
  "intakeNote",

  // 결제 링크·결제 확인 기록 (2026-10-26) — 열 이름 = 필드 이름 (lib/types.ts PAYMENT_FIELD_KEYS와 동일 순서)
  "paymentLinkUrl",
  "paymentDueDate",
  "homepagePostedAt",
  "homepageClosedAt",
  "paymentNoticeSentAt",
  "paymentReminderSentAt",
  "autoCancelledAt",
  "paymentStatus",
  "paymentMethod",
  "paidAt",
  "paidAmountKRW",
  "paymentNote",
  "paymentConfirmedAt",
  "paymentConfirmedBy",
  "refundedAt",
  "refundAmountKRW",
  "refundReason",
] as const;

function colToLetter(col1: number): string {
  // 1 -> A, 26 -> Z, 27 -> AA
  let n = col1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** 헤더가 완전한 것을 확인한 기록 — allowCached 호출(일괄 상태 변경)만 5분 동안 재사용(시트 읽기 쿼터 절약 · audit-fix-1 [9])
 *  행 추가(append)는 실제 헤더 순서로 값을 배치하므로 항상 새로 읽는다. */
let requestHeaderCache: { at: number; header: string[] } | null = null;
const REQUEST_HEADERS_RECHECK_MS = 5 * 60 * 1000;

async function ensureRequestOptionalHeaders(opts?: { allowCached?: boolean }): Promise<string[]> {
  if (opts?.allowCached && requestHeaderCache && Date.now() - requestHeaderCache.at < REQUEST_HEADERS_RECHECK_MS) return requestHeaderCache.header;
  const env = requireGoogleEnv();
  const { sheets } = getGoogleClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: env.GOOGLE_SHEET_ID,
    range: `${SHEET_REQUESTS}!1:1`
  });

  const header = ((res.data.values?.[0] ?? []) as string[]).map((v) => String(v).trim());
  if (!header.length) return [];

  const missing = REQUEST_OPTIONAL_HEADERS.filter((h) => !header.includes(h));
  if (!missing.length) {
    requestHeaderCache = { at: Date.now(), header };
    return header;
  }

  const nextHeader = [...header, ...missing];
  const endCol = colToLetter(nextHeader.length);

  await sheets.spreadsheets.values.update({
    spreadsheetId: env.GOOGLE_SHEET_ID,
    range: `${SHEET_REQUESTS}!A1:${endCol}1`,
    valueInputOption: "RAW",
    requestBody: { values: [nextHeader] }
  });

  return nextHeader;
}

/**
 * RentalRequest → 헤더명:값 맵핑
 * 시트 헤더 순서에 의존하지 않고 정확한 컬럼에 데이터를 기록합니다.
 */
function buildRecordValueMap(record: RentalRequest): Record<string, string> {
  return {
    requestId: record.requestId,
    createdAt: record.createdAt,
    roomId: record.roomId,
    roomName: record.roomName,
    date: record.date,
    startTime: record.startTime,
    endTime: record.endTime,
    applicantName: record.applicantName,
    birth: record.birth,
    address: record.address,
    phone: record.phone,
    email: record.email,
    orgName: record.orgName,
    headcount: String(record.headcount),
    equipment_laptop: record.equipment.laptop ? "TRUE" : "FALSE",
    equipment_projector: record.equipment.projector ? "TRUE" : "FALSE",
    equipment_audio: record.equipment.audio ? "TRUE" : "FALSE",
    purpose: record.purpose,
    attachments: (record.attachments ?? []).join("|"),
    privacyAgree: record.privacyAgree ? "TRUE" : "FALSE",
    pledgeAgree: record.pledgeAgree ? "TRUE" : "FALSE",
    pledgeDate: record.pledgeDate,
    pledgeName: record.pledgeName,
    status: record.status,
    adminMemo: record.adminMemo,
    rejectReason: record.rejectReason,
    decidedAt: record.decidedAt,
    decidedBy: record.decidedBy,
    discountRatePct: String(record.discountRatePct ?? 0),
    discountAmountKRW: String(record.discountAmountKRW ?? 0),
    discountReason: record.discountReason ?? "",
    batchId: record.batchId ?? "",
    batchSeq: String(record.batchSeq ?? 0),
    batchSize: String(record.batchSize ?? 0),
    isPrepDay: record.isPrepDay ? "TRUE" : "FALSE",
    startDate: record.startDate ?? "",
    endDate: record.endDate ?? "",
    exhibitionTitle: record.exhibitionTitle ?? "",
    exhibitionPurpose: record.exhibitionPurpose ?? "",
    genreContent: record.genreContent ?? "",
    awarenessPath: record.awarenessPath ?? "",
    specialNotes: record.specialNotes ?? "",
    equipment_mirrorless: record.equipment.mirrorless ? "TRUE" : "FALSE",
    equipment_camcorder: record.equipment.camcorder ? "TRUE" : "FALSE",
    equipment_wirelessMic: record.equipment.wirelessMic ? "TRUE" : "FALSE",
    equipment_pinMic: record.equipment.pinMic ? "TRUE" : "FALSE",
    equipment_rodeMic: record.equipment.rodeMic ? "TRUE" : "FALSE",
    equipment_electronicBoard: record.equipment.electronicBoard ? "TRUE" : "FALSE",
    galleryGeneratedAt: record.galleryGeneratedAt ?? "",
    galleryGenerationVersion: record.galleryGenerationVersion ?? "",
    galleryWeekdayCount: String(record.galleryWeekdayCount ?? 0),
    gallerySaturdayCount: String(record.gallerySaturdayCount ?? 0),
    galleryExhibitionDayCount: String(record.galleryExhibitionDayCount ?? 0),
    galleryPrepDate: record.galleryPrepDate ?? "",
    galleryAuditJson: record.galleryAuditJson ?? "",
    galleryRemovalTime: record.galleryRemovalTime ?? "",
    intakeChannel: record.intakeChannel ?? "",
    appliedAt: record.appliedAt ?? "",
    intakeNote: record.intakeNote ?? "",
    // 결제 기록 (2026-10-26)
    ...paymentValueMap(record),
  };
}

/** 결제 필드 → 시트 문자열 값 (숫자는 "0" 대신 빈칸 유지 → 미기록과 0원을 구분) */
function paymentValueMap(record: Partial<PaymentFields>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of PAYMENT_FIELD_KEYS) {
    const v = record[k];
    if (v === undefined || v === null) { out[k] = ""; continue; }
    out[k] = typeof v === "number" ? String(v) : String(v);
  }
  return out;
}

/** 시트 행 → 결제 필드 (헤더 이름으로 찾음 · 없으면 undefined) */
function parsePaymentFields(r: string[], opt: (name: string) => number): PaymentFields {
  const out: PaymentFields = {};
  for (const k of PAYMENT_FIELD_KEYS) {
    const i = opt(k);
    if (i < 0) continue;
    const raw = String(r[i] ?? "").trim();
    if (!raw) continue;
    if (PAYMENT_NUMERIC_KEYS.has(k)) {
      const n = parseInt(raw, 10);
      if (Number.isFinite(n)) (out as Record<string, unknown>)[k] = n;
    } else {
      (out as Record<string, unknown>)[k] = raw;
    }
  }
  return out;
}

/**
 * Google Sheets 수식 인젝션 방어
 * =, +, -, @, \t, \r 로 시작하는 값은 Sheets에서 수식으로 해석될 수 있음
 */
function sanitizeForSheets(value: string): string {
  if (!value) return value;
  const first = value.charAt(0);
  if (first === "=" || first === "+" || first === "-" || first === "@" || first === "\t" || first === "\r") {
    return "'" + value;
  }
  return value;
}

/** 수식 인젝션 방어 대상 (사용자 입력 필드) */
const USER_INPUT_COLUMNS = new Set([
  "applicantName", "address", "orgName", "purpose",
  "exhibitionTitle", "exhibitionPurpose", "genreContent",
  "awarenessPath", "specialNotes", "adminMemo", "rejectReason", "discountReason",
]);

/**
 * 헤더 배열 순서에 맞춰 레코드 값 배열을 생성합니다.
 * 헤더 순서가 코드와 다르더라도 정확한 컬럼에 값이 배치됩니다.
 */
function buildRowFromHeader(header: string[], record: RentalRequest): string[] {
  const map = buildRecordValueMap(record);
  return header.map((col) => {
    const val = map[col] ?? "";
    return USER_INPUT_COLUMNS.has(col) ? sanitizeForSheets(val) : val;
  });
}

function roomName(roomId: string): string {
  return ROOMS.find(r => r.id === roomId)?.name ?? roomId;
}

function createHeaderIndex(header: string[], required: string[], sheetName: string) {
  const map = new Map<string, number>();
  header.forEach((h, i) => map.set(String(h).trim(), i));

  const missing = required.filter((col) => !map.has(col));
  if (missing.length) {
    throw new Error(
      `[Sheets] ${sheetName} 시트의 헤더가 누락되었습니다: ${missing.join(", ")}`
    );
  }

  return (name: string) => {
    const idx = map.get(name);
    if (idx === undefined) {
      throw new Error(`[Sheets] ${sheetName} 시트에서 '${name}' 헤더를 찾을 수 없습니다.`);
    }
    return idx;
  };
}

/** requests 시트 원본(A:ZZ) 1회 읽기 */
async function readRequestsSheet(): Promise<string[][]> {
  const env = requireGoogleEnv();
  const { sheets } = getGoogleClient();
  // optional 컬럼이 추가될 수 있으므로 충분히 넓게 읽습니다.
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: env.GOOGLE_SHEET_ID,
    range: `${SHEET_REQUESTS}!A:ZZ`
  });
  return (res.data.values ?? []) as string[][];
}

export async function getAllRequests(): Promise<RentalRequest[]> {
  if (isMockMode()) return mock_getAllRequests();
  return parseRequestRows(await readRequestsSheet());
}

/** 시트 원본 행 → RentalRequest[] (시트 행 순서 유지 · 빈 행 제외) */
function parseRequestRows(rows: string[][]): RentalRequest[] {
  if (rows.length <= 1) return [];
  const header = rows[0];
  const idx = createHeaderIndex(
    header,
    [
      "requestId",
      "createdAt",
      "roomId",
      "roomName",
      "date",
      "startTime",
      "endTime",
      "applicantName",
      "birth",
      "address",
      "phone",
      "email",
      "orgName",
      "headcount",
      "equipment_laptop",
      "equipment_projector",
      "equipment_audio",
      "purpose",
      "attachments",
      "privacyAgree",
      "pledgeAgree",
      "pledgeDate",
      "pledgeName",
      "status",
      "adminMemo",
      "rejectReason",
      "decidedAt",
      "decidedBy"
    ],
    SHEET_REQUESTS
  );

  // optional columns (없으면 -1) — 인덱스 맵은 한 번만 생성
  const optMap = new Map<string, number>();
  header.forEach((h, i) => optMap.set(String(h).trim(), i));
  const opt = (name: string) => optMap.get(name) ?? -1;
  const iDiscountRate = opt("discountRatePct");
  const iDiscountAmount = opt("discountAmountKRW");
  const iDiscountReason = opt("discountReason");
  const iBatchId = opt("batchId");
  const iBatchSeq = opt("batchSeq");
  const iBatchSize = opt("batchSize");
  const iIsPrepDay = opt("isPrepDay");
  const iStartDate = opt("startDate");
  const iEndDate = opt("endDate");
  const iExhibitionTitle = opt("exhibitionTitle");
  const iExhibitionPurpose = opt("exhibitionPurpose");
  const iGenreContent = opt("genreContent");
  const iAwarenessPath = opt("awarenessPath");
  const iSpecialNotes = opt("specialNotes");

  const iMirrorless = opt("equipment_mirrorless");
  const iCamcorder = opt("equipment_camcorder");
  const iWirelessMic = opt("equipment_wirelessMic");
  const iPinMic = opt("equipment_pinMic");
  const iRodeMic = opt("equipment_rodeMic");
  const iElectronicBoard = opt("equipment_electronicBoard");

  const iGalleryGeneratedAt = opt("galleryGeneratedAt");
  const iGalleryGenerationVersion = opt("galleryGenerationVersion");
  const iGalleryWeekdayCount = opt("galleryWeekdayCount");
  const iGallerySaturdayCount = opt("gallerySaturdayCount");
  const iGalleryExhibitionDayCount = opt("galleryExhibitionDayCount");
  const iGalleryPrepDate = opt("galleryPrepDate");
  const iGalleryAuditJson = opt("galleryAuditJson");
  const iGalleryRemovalTime = opt("galleryRemovalTime");
  const iIntakeChannel = opt("intakeChannel");
  const iAppliedAt = opt("appliedAt");
  const iIntakeNote = opt("intakeNote");

  return rows
    .slice(1)
    .filter(r => r.length > 0 && r[idx("requestId")])
    .map((r) => ({
      requestId: r[idx("requestId")],
      createdAt: r[idx("createdAt")],

      batchId: iBatchId >= 0 ? (String(r[iBatchId] ?? "").trim() || undefined) : undefined,
      batchSeq: iBatchSeq >= 0 ? (parseInt(String(r[iBatchSeq] ?? "0"), 10) || undefined) : undefined,
      batchSize: iBatchSize >= 0 ? (parseInt(String(r[iBatchSize] ?? "0"), 10) || undefined) : undefined,


      roomId: r[idx("roomId")],
      roomName: r[idx("roomName")],

      date: r[idx("date")],
      startTime: r[idx("startTime")],
      endTime: r[idx("endTime")],

      isPrepDay: iIsPrepDay >= 0 ? (String(r[iIsPrepDay] ?? "").trim().toUpperCase() === "TRUE") : undefined,
      startDate: iStartDate >= 0 ? (String(r[iStartDate] ?? "").trim() || undefined) : undefined,
      endDate: iEndDate >= 0 ? (String(r[iEndDate] ?? "").trim() || undefined) : undefined,
      exhibitionTitle: iExhibitionTitle >= 0 ? (String(r[iExhibitionTitle] ?? "").trim() || undefined) : undefined,
      exhibitionPurpose: iExhibitionPurpose >= 0 ? (String(r[iExhibitionPurpose] ?? "").trim() || undefined) : undefined,
      genreContent: iGenreContent >= 0 ? (String(r[iGenreContent] ?? "").trim() || undefined) : undefined,
      awarenessPath: iAwarenessPath >= 0 ? (String(r[iAwarenessPath] ?? "").trim() || undefined) : undefined,
      specialNotes: iSpecialNotes >= 0 ? (String(r[iSpecialNotes] ?? "").trim() || undefined) : undefined,

      galleryGeneratedAt: iGalleryGeneratedAt >= 0 ? (String(r[iGalleryGeneratedAt] ?? "").trim() || undefined) : undefined,
      galleryGenerationVersion: iGalleryGenerationVersion >= 0 ? (String(r[iGalleryGenerationVersion] ?? "").trim() || undefined) : undefined,
      galleryWeekdayCount: iGalleryWeekdayCount >= 0 ? (parseInt(String(r[iGalleryWeekdayCount] ?? "0"), 10) || 0) : undefined,
      gallerySaturdayCount: iGallerySaturdayCount >= 0 ? (parseInt(String(r[iGallerySaturdayCount] ?? "0"), 10) || 0) : undefined,
      galleryExhibitionDayCount: iGalleryExhibitionDayCount >= 0 ? (parseInt(String(r[iGalleryExhibitionDayCount] ?? "0"), 10) || 0) : undefined,
      galleryPrepDate: iGalleryPrepDate >= 0 ? (String(r[iGalleryPrepDate] ?? "").trim() || undefined) : undefined,
      galleryAuditJson: iGalleryAuditJson >= 0 ? (String(r[iGalleryAuditJson] ?? "").trim() || undefined) : undefined,
      galleryRemovalTime: iGalleryRemovalTime >= 0 ? (String(r[iGalleryRemovalTime] ?? "").trim() || undefined) : undefined,
      intakeChannel: iIntakeChannel >= 0 ? ((String(r[iIntakeChannel] ?? "").trim() || undefined) as RentalRequest["intakeChannel"]) : undefined,
      appliedAt: iAppliedAt >= 0 ? (String(r[iAppliedAt] ?? "").trim() || undefined) : undefined,
      intakeNote: iIntakeNote >= 0 ? (String(r[iIntakeNote] ?? "").trim() || undefined) : undefined,

      // 결제 기록 (2026-10-26) — 헤더 이름으로 찾음
      ...parsePaymentFields(r, opt),

      applicantName: r[idx("applicantName")],
      birth: r[idx("birth")],
      address: r[idx("address")],
      phone: r[idx("phone")],
      email: r[idx("email")],

      orgName: r[idx("orgName")],
      headcount: parseInt(r[idx("headcount")] || "0", 10),

      equipment: {
        laptop: r[idx("equipment_laptop")] === "TRUE",
        projector: r[idx("equipment_projector")] === "TRUE",
        audio: r[idx("equipment_audio")] === "TRUE",
        mirrorless: iMirrorless >= 0 ? (String(r[iMirrorless] ?? "").trim().toUpperCase() === "TRUE") : false,
        camcorder: iCamcorder >= 0 ? (String(r[iCamcorder] ?? "").trim().toUpperCase() === "TRUE") : false,
        wirelessMic: iWirelessMic >= 0 ? (String(r[iWirelessMic] ?? "").trim().toUpperCase() === "TRUE") : false,
        pinMic: iPinMic >= 0 ? (String(r[iPinMic] ?? "").trim().toUpperCase() === "TRUE") : false,
        rodeMic: iRodeMic >= 0 ? (String(r[iRodeMic] ?? "").trim().toUpperCase() === "TRUE") : false,
        electronicBoard: iElectronicBoard >= 0 ? (String(r[iElectronicBoard] ?? "").trim().toUpperCase() === "TRUE") : false,
      },

      purpose: r[idx("purpose")],

      attachments: (r[idx("attachments")] || "").split("|").filter(Boolean),

      privacyAgree: r[idx("privacyAgree")] === "TRUE",
      pledgeAgree: r[idx("pledgeAgree")] === "TRUE",
      pledgeDate: r[idx("pledgeDate")],
      pledgeName: r[idx("pledgeName")],

      discountRatePct: iDiscountRate >= 0 ? parseFloat(r[iDiscountRate] || "0") : 0,
      discountAmountKRW: iDiscountAmount >= 0 ? parseInt(r[iDiscountAmount] || "0", 10) : 0,
      discountReason: iDiscountReason >= 0 ? (r[iDiscountReason] || "") : "",

      status: (r[idx("status")] as RequestStatus) || "접수",
      adminMemo: r[idx("adminMemo")] || "",
      rejectReason: r[idx("rejectReason")] || "",
      decidedAt: r[idx("decidedAt")] || "",
      decidedBy: r[idx("decidedBy")] || ""
    }));
}

export async function getRequestById(id: string): Promise<RentalRequest | null> {
  if (isMockMode()) return mock_getRequestById(id);
  const all = await getAllRequests();
  return all.find(r => r.requestId === id) ?? null;
}

export async function nextRequestId(): Promise<string> {
  if (isMockMode()) {
    // mockdb 내부에서 계산
    const { mock_nextRequestId } = await import("./mockdb");
    return mock_nextRequestId();
  }

  const { randomBytes } = await import("crypto");
  const prefix = `REQ-${todayYmdSeoul().replaceAll("-", "")}-`;
  const all = await getAllRequests();
  const existingIds = new Set(all.map(r => r.requestId));
  let candidate: string;
  do {
    candidate = `${prefix}${randomBytes(4).toString("hex").toUpperCase()}`;
  } while (existingIds.has(candidate));
  return candidate;
}

export async function appendRequest(
  input: Omit<RentalRequest, "requestId" | "createdAt" | "status" | "adminMemo" | "rejectReason" | "decidedAt" | "decidedBy" | "roomName">
): Promise<RentalRequest> {
  if (isMockMode()) return mock_appendRequest(input);

  const env = requireGoogleEnv();

  // optional 컬럼이 없다면 헤더에 자동 추가 + 현재 헤더 반환
  const header = await ensureRequestOptionalHeaders();

  const { sheets } = getGoogleClient();

  const requestId = await nextRequestId();
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

    attachments: input.attachments,

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

  // 헤더 순서 기반 값 배열 생성 (컬럼 순서 불일치 방지)
  const values = [buildRowFromHeader(header, record)];

  await sheets.spreadsheets.values.append({
    spreadsheetId: env.GOOGLE_SHEET_ID,
    range: `${SHEET_REQUESTS}!A:ZZ`,
    valueInputOption: "RAW",
    requestBody: { values }
  });

  return record;
}

export async function appendRequestsBatch(
  inputs: Array<Omit<RentalRequest, "requestId" | "createdAt" | "status" | "adminMemo" | "rejectReason" | "decidedAt" | "decidedBy" | "roomName">>
): Promise<RentalRequest[]> {
  if (isMockMode()) {
    const { mock_appendRequestsBatch } = await import("./mockdb");
    return mock_appendRequestsBatch(inputs);
  }

  const env = requireGoogleEnv();

  // optional 컬럼이 없다면 헤더에 자동 추가 + 현재 헤더 반환
  const header = await ensureRequestOptionalHeaders();

  const { sheets } = getGoogleClient();

  // ★ 묶음 회차 ID도 단건과 같은 랜덤 접미사 방식 (진단 렌즈4-1 — 동시 접수 시 '최댓값+1' 중복 방지)
  const { randomBytes } = await import("crypto");
  const prefix = `REQ-${todayYmdSeoul().replaceAll("-", "")}-`;
  const all = await getAllRequests();
  const usedIds = new Set(all.map(r => r.requestId));
  const newId = () => {
    let c: string;
    do { c = `${prefix}${randomBytes(4).toString("hex").toUpperCase()}`; } while (usedIds.has(c));
    usedIds.add(c);
    return c;
  };

  const createdAt = nowIsoSeoul();
  const saved: RentalRequest[] = [];
  const values: string[][] = [];

  for (const input of inputs) {
    const requestId = newId();

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

      attachments: input.attachments,

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

    saved.push(record);
    // 헤더 순서 기반 값 배열 생성 (컬럼 순서 불일치 방지)
    values.push(buildRowFromHeader(header, record));
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: env.GOOGLE_SHEET_ID,
    range: `${SHEET_REQUESTS}!A:ZZ`,
    valueInputOption: "RAW",
    requestBody: { values }
  });

  return saved;
}

/**
 * requests 시트 원본을 읽어 requestId → 실제 행 번호(1-based)와 헤더명 → 열 인덱스(0-based)를 만든다.
 * 빈 행·정렬 변경이 있어도 정확한 행에 쓰기 위한 매핑.
 */
async function locateRequestRows(): Promise<{ rowOf: Map<string, number>; col: Map<string, number> }> {
  const env = requireGoogleEnv();
  const { sheets } = getGoogleClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: env.GOOGLE_SHEET_ID,
    range: `${SHEET_REQUESTS}!A:ZZ`
  });
  const rows = (res.data.values ?? []) as string[][];
  const header = (rows[0] ?? []).map((v) => String(v ?? "").trim());
  const col = new Map<string, number>();
  header.forEach((h, i) => { if (h && !col.has(h)) col.set(h, i); });
  const idCol = col.get("requestId");
  if (idCol === undefined) throw new Error("requests 시트에 'requestId' 헤더가 없습니다.");
  const rowOf = new Map<string, number>();
  for (let i = 1; i < rows.length; i++) {
    const id = String(rows[i]?.[idCol] ?? "").trim();
    if (id && !rowOf.has(id)) rowOf.set(id, i + 1);
  }
  return { rowOf, col };
}

export async function updateRequestStatus(args: {
  requestId: string;
  status: RequestStatus;
  adminMemo?: string;
  rejectReason?: string;
  decidedBy: string;
  discountRatePct?: number;
  discountAmountKRW?: number;
  discountReason?: string;
}): Promise<RentalRequest> {
  if (isMockMode()) return mock_updateRequestStatus(args);

  const env = requireGoogleEnv();

  // optional 할인 컬럼이 없다면 헤더에 자동 추가
  await ensureRequestOptionalHeaders();

  const { sheets } = getGoogleClient();
  const all = await getAllRequests();
  const current = all.find(r => r.requestId === args.requestId);
  if (!current) throw new Error("해당 신청건을 찾을 수 없습니다.");

  // ★ 행 번호는 '필터링된 배열 인덱스'가 아니라 시트 원본에서 실측한다 (2026-10-07 진단 #1)
  //   빈 행이 끼어 있으면 인덱스+2 방식은 다른 신청자 행에 덮어쓴다.
  const loc = await locateRequestRows();
  const rowNumber = loc.rowOf.get(args.requestId);
  if (!rowNumber) throw new Error("시트에서 해당 신청건의 행을 찾지 못했습니다.");

  const status = args.status;
  const statusChanged = current.status !== status;
  const decidedAt = statusChanged ? nowIsoSeoul() : (current.decidedAt || "");
  const decidedBy = statusChanged ? args.decidedBy : (current.decidedBy || "");

  // 상태·메모·사유·처리일·처리자: 헤더 이름으로 열을 찾아 갱신 (고정 X..AB 금지)
  const statusCells: Array<[string, string]> = [
    ["status", status],
    ["adminMemo", args.adminMemo ?? ""],
    ["rejectReason", args.rejectReason ?? ""],
    ["decidedAt", decidedAt],
    ["decidedBy", decidedBy],
  ];
  const statusData = statusCells.map(([name, value]) => {
    const ci = loc.col.get(name);
    if (ci === undefined) throw new Error(`requests 시트에 '${name}' 헤더가 없습니다.`);
    const letter = colToLetter(ci + 1);
    return { range: `${SHEET_REQUESTS}!${letter}${rowNumber}:${letter}${rowNumber}`, values: [[value]] };
  });

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: env.GOOGLE_SHEET_ID,
    requestBody: { valueInputOption: "RAW", data: statusData }
  });

  // discount columns (있을 경우에만 업데이트)
  // 할인은 '묶음' 단위로 적용되므로, batchId가 있으면 같은 묶음 전체에 동기화합니다.
  const shouldUpdateDiscount =
    typeof args.discountRatePct === "number" ||
    typeof args.discountAmountKRW === "number" ||
    typeof args.discountReason === "string";

  if (shouldUpdateDiscount) {
    const m = loc.col;

    const idxRate0 = m.get("discountRatePct");
    const idxAmt0 = m.get("discountAmountKRW");
    const idxReason0 = m.get("discountReason");

    const colRate = idxRate0 === undefined ? null : colToLetter(idxRate0 + 1);
    const colAmt = idxAmt0 === undefined ? null : colToLetter(idxAmt0 + 1);
    const colReason = idxReason0 === undefined ? null : colToLetter(idxReason0 + 1);

    // 현재 행의 batchId를 기반으로 동기화 대상 행을 결정 (행 번호는 실측 매핑 사용)
    const target = current;
    const batchId = (target.batchId ?? "").trim();
    const rowNumbers = batchId
      ? all
          .filter((r) => (r.batchId ?? "").trim() === batchId)
          .map((r) => loc.rowOf.get(r.requestId) ?? 0)
          .filter((n) => n > 0)
      : [rowNumber];

    const rateVal = typeof args.discountRatePct === "number" ? args.discountRatePct : (target.discountRatePct ?? 0);
    const amtVal = typeof args.discountAmountKRW === "number" ? args.discountAmountKRW : (target.discountAmountKRW ?? 0);
    const reasonVal = typeof args.discountReason === "string" ? args.discountReason : (target.discountReason ?? "");

    const data: any[] = [];
    for (const rn of rowNumbers) {
      if (colRate && typeof args.discountRatePct === "number") {
        data.push({ range: `${SHEET_REQUESTS}!${colRate}${rn}:${colRate}${rn}`, values: [[String(rateVal)]] });
      }
      if (colAmt && typeof args.discountAmountKRW === "number") {
        data.push({ range: `${SHEET_REQUESTS}!${colAmt}${rn}:${colAmt}${rn}`, values: [[String(amtVal)]] });
      }
      if (colReason && typeof args.discountReason === "string") {
        data.push({ range: `${SHEET_REQUESTS}!${colReason}${rn}:${colReason}${rn}`, values: [[reasonVal]] });
      }
    }

    if (data.length) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: env.GOOGLE_SHEET_ID,
        requestBody: { valueInputOption: "RAW", data }
      });
    }
  }


  const updated = await getRequestById(args.requestId);
  if (!updated) throw new Error("업데이트 후 데이터를 다시 불러오지 못했습니다.");
  return updated;
}

export type StatusUpdate = {
  requestId: string;
  status: RequestStatus;
  /** 생략하면 기존 값 유지(단건 updateRequestStatus는 빈칸으로 덮는 것과 다름) */
  adminMemo?: string;
  /** 생략하면 기존 값 유지 */
  rejectReason?: string;
  decidedBy: string;
};

export type BatchDiscount = {
  batchId: string;
  discountRatePct: number;
  discountAmountKRW: number;
  discountReason: string;
};

/**
 * 여러 행 상태 일괄 변경 (audit-fix-1 [9])
 * - 시트 호출: 헤더 확인 get 1 + A:ZZ get 1 + values.batchUpdate 1 (재조회 없음)
 * - 대상 행을 전부 먼저 확인하고 하나라도 없으면 아무것도 쓰지 않고 throw
 * - batchUpdate는 한 번의 요청이라 실패(429 등)하면 시트는 바뀌지 않는다(부분 반영 없음)
 * - discount가 있으면 그 batchId 전 행의 할인 3열도 같은 요청에서 갱신
 * - decidedAt/decidedBy는 상태가 바뀐 행만 갱신(단건과 같은 규칙)
 */
export async function updateRequestsStatusBatch(
  updates: StatusUpdate[],
  discount?: BatchDiscount,
  payment?: { requestId: string; patch: PaymentPatch }
): Promise<RentalRequest[]> {
  if (isMockMode()) return mock_updateRequestsStatusBatch(updates, discount, payment);
  if (!updates.length && !discount && !payment) return [];

  const env = requireGoogleEnv();
  // 열 위치는 아래 A:ZZ 읽기의 실제 헤더로 찾으므로, 헤더 확인은 최근 확인 기록을 재사용해도 안전
  await ensureRequestOptionalHeaders({ allowCached: true });
  const { sheets } = getGoogleClient();

  const rows = await readRequestsSheet();
  const all = parseRequestRows(rows);
  const header = (rows[0] ?? []).map((v) => String(v ?? "").trim());
  const col = new Map<string, number>();
  header.forEach((h, i) => { if (h && !col.has(h)) col.set(h, i); });
  const idCol = col.get("requestId");
  if (idCol === undefined) throw new Error("requests 시트에 'requestId' 헤더가 없습니다.");
  const rowOf = new Map<string, number>();
  for (let i = 1; i < rows.length; i++) {
    const id = String(rows[i]?.[idCol] ?? "").trim();
    if (id && !rowOf.has(id)) rowOf.set(id, i + 1);
  }
  const byId = new Map(all.map((r) => [r.requestId, r]));

  // 1) 전부 확인 먼저 (하나라도 없으면 쓰지 않음)
  for (const u of updates) {
    if (!byId.has(u.requestId)) throw new Error(`해당 신청건을 찾을 수 없습니다: ${u.requestId}`);
    if (!rowOf.get(u.requestId)) throw new Error(`시트에서 해당 신청건의 행을 찾지 못했습니다: ${u.requestId}`);
  }
  const cellRange = (name: string, rn: number) => {
    const ci = col.get(name);
    if (ci === undefined) throw new Error(`requests 시트에 '${name}' 헤더가 없습니다.`);
    const letter = colToLetter(ci + 1);
    return `${SHEET_REQUESTS}!${letter}${rn}:${letter}${rn}`;
  };

  const now = nowIsoSeoul();
  const data: Array<{ range: string; values: string[][] }> = [];
  const next = new Map<string, RentalRequest>();

  for (const u of updates) {
    const current = next.get(u.requestId) ?? byId.get(u.requestId)!;
    const rn = rowOf.get(u.requestId)!;
    const statusChanged = current.status !== u.status;
    const merged: RentalRequest = {
      ...current,
      status: u.status,
      adminMemo: u.adminMemo ?? current.adminMemo ?? "",
      rejectReason: u.rejectReason ?? current.rejectReason ?? "",
      decidedAt: statusChanged ? now : (current.decidedAt || ""),
      decidedBy: statusChanged ? u.decidedBy : (current.decidedBy || ""),
    };
    next.set(u.requestId, merged);
    data.push(
      { range: cellRange("status", rn), values: [[merged.status]] },
      { range: cellRange("adminMemo", rn), values: [[merged.adminMemo ?? ""]] },
      { range: cellRange("rejectReason", rn), values: [[merged.rejectReason ?? ""]] },
      { range: cellRange("decidedAt", rn), values: [[merged.decidedAt ?? ""]] },
      { range: cellRange("decidedBy", rn), values: [[merged.decidedBy ?? ""]] },
    );
  }

  if (discount && discount.batchId.trim()) {
    const bid = discount.batchId.trim();
    for (const r of all.filter((x) => (x.batchId ?? "").trim() === bid)) {
      const rn = rowOf.get(r.requestId);
      if (!rn) continue;
      data.push(
        { range: cellRange("discountRatePct", rn), values: [[String(discount.discountRatePct)]] },
        { range: cellRange("discountAmountKRW", rn), values: [[String(discount.discountAmountKRW)]] },
        { range: cellRange("discountReason", rn), values: [[discount.discountReason]] },
      );
      next.set(r.requestId, {
        ...(next.get(r.requestId) ?? r),
        discountRatePct: discount.discountRatePct,
        discountAmountKRW: discount.discountAmountKRW,
        discountReason: discount.discountReason,
      });
    }
  }

  // 결제 기록 필드(묶음 전 행 동일 값) — updateRequestPayment와 같은 규칙을 같은 요청에 합친다
  if (payment) {
    const cur = byId.get(payment.requestId);
    if (!cur) throw new Error(`해당 신청건을 찾을 수 없습니다: ${payment.requestId}`);
    const bid = (cur.batchId ?? "").trim();
    const targets = bid ? all.filter((r) => (r.batchId ?? "").trim() === bid) : [cur];
    for (const r of targets) {
      const rn = rowOf.get(r.requestId);
      if (!rn) continue;
      const merged: Record<string, unknown> = { ...(next.get(r.requestId) ?? r) };
      for (const k of PAYMENT_FIELD_KEYS) {
        if (!(k in payment.patch)) continue;
        const v = payment.patch[k];
        if (v === undefined) continue;
        data.push({ range: cellRange(k, rn), values: [[v === null ? "" : String(v)]] });
        if (v === null || v === "") delete merged[k];
        else merged[k] = PAYMENT_NUMERIC_KEYS.has(k) ? Number(v) : v;
      }
      next.set(r.requestId, merged as RentalRequest);
    }
  }

  if (data.length) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: env.GOOGLE_SHEET_ID,
      requestBody: { valueInputOption: "RAW", data },
    });
  }
  return [...next.values()];
}

/* ── 관리자 세션 폐기 목록 (audit-fix-1 [7]) ──
 * 시트 admin_sessions: sid · revokedAt(KST ISO) · exp(ISO). 추가만 한다(만료 행은 읽을 때 무시).
 * IP 등 개인정보는 저장하지 않는다. */
const SHEET_ADMIN_SESSIONS = "admin_sessions";
export const ADMIN_SESSION_HEADERS = ["sid", "revokedAt", "exp"] as const;
let adminSessionSheetReady = false;

async function ensureAdminSessionSheet(): Promise<void> {
  if (adminSessionSheetReady) return;
  const env = requireGoogleEnv();
  const { sheets } = getGoogleClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: env.GOOGLE_SHEET_ID });
  const exists = (meta.data.sheets ?? []).some((s) => s.properties?.title === SHEET_ADMIN_SESSIONS);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: env.GOOGLE_SHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: SHEET_ADMIN_SESSIONS } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: env.GOOGLE_SHEET_ID,
      range: `${SHEET_ADMIN_SESSIONS}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [[...ADMIN_SESSION_HEADERS]] },
    });
  }
  adminSessionSheetReady = true;
}

/** 폐기된 sid 목록 (만료 전 것만). 탭이 없으면 빈 목록 — 읽기 오류는 throw(호출부가 거부 처리) */
export async function getRevokedAdminSessions(): Promise<Array<{ sid: string; exp: string }>> {
  if (isMockMode()) return mock_getRevokedAdminSessions();
  const env = requireGoogleEnv();
  const { sheets } = getGoogleClient();
  let rows: string[][] = [];
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: env.GOOGLE_SHEET_ID,
      range: `${SHEET_ADMIN_SESSIONS}!A:C`,
    });
    rows = (res.data.values ?? []) as string[][];
  } catch (e) {
    // 탭이 아직 없음(아무도 로그아웃하지 않음) → 폐기 0건
    const msg = e instanceof Error ? e.message : String(e);
    if (/Unable to parse range|not found/i.test(msg)) return [];
    throw e;
  }
  const nowIso = new Date().toISOString();
  return rows
    .slice(1)
    .map((r) => ({ sid: String(r?.[0] ?? "").trim(), exp: String(r?.[2] ?? "").trim() }))
    .filter((r) => r.sid && (!r.exp || r.exp > nowIso));
}

export async function addRevokedAdminSession(entry: { sid: string; exp: string }): Promise<void> {
  if (isMockMode()) return mock_addRevokedAdminSession(entry);
  await ensureAdminSessionSheet();
  const env = requireGoogleEnv();
  const { sheets } = getGoogleClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: env.GOOGLE_SHEET_ID,
    range: `${SHEET_ADMIN_SESSIONS}!A:C`,
    valueInputOption: "RAW",
    requestBody: { values: [[entry.sid, nowIsoSeoul(), entry.exp]] },
  });
}

/**
 * 결제 기록 필드 갱신 (2026-10-26)
 * - 묶음(batchId)이면 같은 묶음 전 행에 동일 값 기록(할인 필드와 같은 규칙)
 * - 열은 헤더 이름으로 찾는다(고정 열 금지). 없는 열은 ensureRequestOptionalHeaders가 끝에 추가.
 * - patch 값 null/"" → 빈칸(비움). undefined → 건드리지 않음.
 */
export async function updateRequestPayment(args: { requestId: string; patch: PaymentPatch }): Promise<RentalRequest[]> {
  if (isMockMode()) return mock_updateRequestPayment(args);

  const env = requireGoogleEnv();
  await ensureRequestOptionalHeaders();

  const { sheets } = getGoogleClient();
  const all = await getAllRequests();
  const current = all.find((r) => r.requestId === args.requestId);
  if (!current) throw new Error("해당 신청건을 찾을 수 없습니다.");

  const loc = await locateRequestRows();
  const batchId = (current.batchId ?? "").trim();
  const targets = batchId ? all.filter((r) => (r.batchId ?? "").trim() === batchId) : [current];
  const rowNumbers = targets.map((r) => loc.rowOf.get(r.requestId) ?? 0).filter((n) => n > 0);
  if (!rowNumbers.length) throw new Error("시트에서 해당 신청건의 행을 찾지 못했습니다.");

  const data: Array<{ range: string; values: string[][] }> = [];
  for (const k of PAYMENT_FIELD_KEYS) {
    if (!(k in args.patch)) continue;
    const v = args.patch[k];
    if (v === undefined) continue;
    const ci = loc.col.get(k);
    if (ci === undefined) throw new Error(`requests 시트에 '${k}' 헤더가 없습니다.`);
    const letter = colToLetter(ci + 1);
    const value = v === null ? "" : String(v);
    for (const rn of rowNumbers) {
      data.push({ range: `${SHEET_REQUESTS}!${letter}${rn}:${letter}${rn}`, values: [[value]] });
    }
  }

  if (data.length) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: env.GOOGLE_SHEET_ID,
      requestBody: { valueInputOption: "RAW", data },
    });
  }

  const refreshed = await getAllRequests();
  const ids = new Set(targets.map((t) => t.requestId));
  return refreshed.filter((r) => ids.has(r.requestId));
}

/**
 * 갤러리 이용료 다시 계산 (audit-fix-2 R2)
 * - 이 1행의 galleryWeekdayCount·gallerySaturdayCount·galleryExhibitionDayCount·galleryAuditJson 4칸만 갱신
 * - 시트 호출: 헤더 확인 + A:ZZ 읽기 + values.batchUpdate 1회(한 요청 → 부분 반영 없음)
 */
export async function updateGalleryFee(args: GalleryFeeUpdate): Promise<RentalRequest> {
  if (isMockMode()) return mock_updateGalleryFee(args);

  const env = requireGoogleEnv();
  await ensureRequestOptionalHeaders({ allowCached: true });
  const { sheets } = getGoogleClient();

  const rows = await readRequestsSheet();
  const all = parseRequestRows(rows);
  const current = all.find((r) => r.requestId === args.requestId);
  if (!current) throw new Error("해당 신청건을 찾을 수 없습니다.");
  if (current.roomId !== "gallery") throw new Error("갤러리 신청만 다시 계산할 수 있습니다.");

  const header = (rows[0] ?? []).map((v) => String(v ?? "").trim());
  const col = new Map<string, number>();
  header.forEach((h, i) => { if (h && !col.has(h)) col.set(h, i); });
  const idCol = col.get("requestId");
  if (idCol === undefined) throw new Error("requests 시트에 'requestId' 헤더가 없습니다.");
  let rn = 0;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i]?.[idCol] ?? "").trim() === args.requestId) { rn = i + 1; break; }
  }
  if (!rn) throw new Error("시트에서 해당 신청건의 행을 찾지 못했습니다.");

  const cells: Array<[string, string]> = [
    ["galleryWeekdayCount", String(args.weekdayCount)],
    ["gallerySaturdayCount", String(args.saturdayCount)],
    ["galleryExhibitionDayCount", String(args.exhibitionDayCount)],
    ["galleryAuditJson", args.galleryAuditJson],
  ];
  const data = cells.map(([name, value]) => {
    const ci = col.get(name);
    if (ci === undefined) throw new Error(`requests 시트에 '${name}' 헤더가 없습니다.`);
    const letter = colToLetter(ci + 1);
    return { range: `${SHEET_REQUESTS}!${letter}${rn}:${letter}${rn}`, values: [[value]] };
  });
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: env.GOOGLE_SHEET_ID,
    requestBody: { valueInputOption: "RAW", data },
  });

  return {
    ...current,
    galleryWeekdayCount: args.weekdayCount,
    gallerySaturdayCount: args.saturdayCount,
    galleryExhibitionDayCount: args.exhibitionDayCount,
    galleryAuditJson: args.galleryAuditJson,
  };
}

// class_schedule 시트의 선택 컬럼(없으면 헤더 끝에 자동 추가) — 업무 시스템 동기화 표식
export const SCHEDULE_OPTIONAL_HEADERS = ["source", "sourceId", "syncedAt"] as const;
const SCHEDULE_REQUIRED_HEADERS = ["id", "roomId", "dayOfWeek", "startTime", "endTime", "title", "effectiveFrom", "effectiveTo"];

async function ensureScheduleHeaders(): Promise<string[]> {
  const env = requireGoogleEnv();
  const { sheets } = getGoogleClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: env.GOOGLE_SHEET_ID,
    range: `${SHEET_SCHEDULE}!1:1`
  });
  const existing = ((res.data.values?.[0] ?? []) as string[]).map((v) => String(v).trim());
  const header = existing.length ? existing : [...SCHEDULE_REQUIRED_HEADERS];
  const missing = SCHEDULE_OPTIONAL_HEADERS.filter((h) => !header.includes(h));
  if (!missing.length && existing.length) return header;
  const nextHeader = [...header, ...missing];
  await sheets.spreadsheets.values.update({
    spreadsheetId: env.GOOGLE_SHEET_ID,
    range: `${SHEET_SCHEDULE}!A1:${colToLetter(nextHeader.length)}1`,
    valueInputOption: "RAW",
    requestBody: { values: [nextHeader] }
  });
  return nextHeader;
}

function scheduleToRow(header: string[], s: ClassSchedule): string[] {
  const map: Record<string, string> = {
    id: s.id,
    roomId: s.roomId,
    dayOfWeek: String(s.dayOfWeek),
    startTime: s.startTime,
    endTime: s.endTime,
    title: s.title,
    effectiveFrom: s.effectiveFrom,
    effectiveTo: s.effectiveTo,
    source: s.source ?? "",
    sourceId: s.sourceId ?? "",
    syncedAt: s.syncedAt ?? "",
  };
  return header.map((h) => map[h] ?? "");
}

export async function getClassSchedules(): Promise<ClassSchedule[]> {
  if (isMockMode()) return mock_getClassSchedules();

  const env = requireGoogleEnv();

  const { sheets } = getGoogleClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: env.GOOGLE_SHEET_ID,
    range: `${SHEET_SCHEDULE}!A:Z`
  });
  const rows = (res.data.values ?? []) as string[][];
  if (rows.length <= 1) return [];
  const header = rows[0].map((v) => String(v).trim());
  const idx = createHeaderIndex(header, SCHEDULE_REQUIRED_HEADERS, SHEET_SCHEDULE);
  const opt = (r: string[], name: string) => {
    const i = header.indexOf(name);
    return i >= 0 ? (r[i] || "") : "";
  };

  return rows.slice(1).filter(r => r[idx("id")]).map(r => {
    const item: ClassSchedule = {
      id: r[idx("id")],
      roomId: r[idx("roomId")],
      dayOfWeek: parseInt(r[idx("dayOfWeek")] || "0", 10),
      startTime: r[idx("startTime")],
      endTime: r[idx("endTime")],
      title: r[idx("title")] || "",
      effectiveFrom: r[idx("effectiveFrom")] || "",
      effectiveTo: r[idx("effectiveTo")] || ""
    };
    const source = opt(r, "source");
    if (source) {
      item.source = source;
      item.sourceId = opt(r, "sourceId");
      item.syncedAt = opt(r, "syncedAt");
    }
    return item;
  });
}

export async function addClassSchedule(s: Omit<ClassSchedule, "id">): Promise<ClassSchedule> {
  if (isMockMode()) return mock_addClassSchedule(s);

  const env = requireGoogleEnv();

  const { sheets } = getGoogleClient();
  const header = await ensureScheduleHeaders();
  const id = `CS-${Date.now()}`;
  const created: ClassSchedule = { id, ...s };
  await sheets.spreadsheets.values.append({
    spreadsheetId: env.GOOGLE_SHEET_ID,
    range: `${SHEET_SCHEDULE}!A:${colToLetter(header.length)}`,
    valueInputOption: "RAW",
    requestBody: {
      values: [scheduleToRow(header, created)]
    }
  });

  return created;
}

export async function updateClassSchedule(id: string, updates: Partial<Omit<ClassSchedule, "id">>): Promise<ClassSchedule> {
  if (isMockMode()) {
    const { mock_updateClassSchedule } = await import("./mockdb");
    return mock_updateClassSchedule(id, updates);
  }

  const env = requireGoogleEnv();
  const { sheets } = getGoogleClient();

  // 현재 스케줄 조회
  const schedules = await getClassSchedules();
  const existing = schedules.find(s => s.id === id);
  if (!existing) throw new Error("수정할 수업시간을 찾을 수 없습니다.");

  const updated: ClassSchedule = { ...existing, ...updates };
  const header = await ensureScheduleHeaders();

  // 행 위치 찾기
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: env.GOOGLE_SHEET_ID,
    range: `${SHEET_SCHEDULE}!A:A`
  });
  const col = (res.data.values ?? []) as string[][];
  const rowIndex = col.findIndex((r) => r[0] === id);
  if (rowIndex < 0) throw new Error("시트에서 해당 행을 찾을 수 없습니다.");

  const rowNumber = rowIndex + 1; // 1-based
  await sheets.spreadsheets.values.update({
    spreadsheetId: env.GOOGLE_SHEET_ID,
    range: `${SHEET_SCHEDULE}!A${rowNumber}:${colToLetter(header.length)}${rowNumber}`,
    valueInputOption: "RAW",
    requestBody: {
      values: [scheduleToRow(header, updated)]
    }
  });

  return updated;
}

/**
 * 출처(source)가 같은 행을 모두 지우고 새 항목을 한 번에 추가한다 — 업무 시스템 동기화용.
 * 수동 등록 행(source 빈칸)은 건드리지 않는다.
 */
export async function replaceClassSchedulesBySource(
  source: string,
  items: Omit<ClassSchedule, "id">[]
): Promise<{ deleted: number; added: number }> {
  if (isMockMode()) {
    const { mock_replaceClassSchedulesBySource } = await import("./mockdb");
    return mock_replaceClassSchedulesBySource(source, items);
  }

  const env = requireGoogleEnv();
  const { sheets } = getGoogleClient();
  const header = await ensureScheduleHeaders();
  const sourceCol = header.indexOf("source");

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: env.GOOGLE_SHEET_ID,
    range: `${SHEET_SCHEDULE}!A:${colToLetter(header.length)}`
  });
  const rows = (res.data.values ?? []) as string[][];
  const targets = rows
    .map((r, i) => ({ i, src: String(r[sourceCol] ?? "").trim() }))
    .filter((x) => x.i > 0 && x.src === source)
    .map((x) => x.i)
    .sort((a, b) => b - a); // 아래 행부터 지워야 인덱스가 밀리지 않음

  if (targets.length) {
    const sheetId = await getSheetIdByTitle(SHEET_SCHEDULE);
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: env.GOOGLE_SHEET_ID,
      requestBody: {
        requests: targets.map((rowIndex) => ({
          deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: rowIndex, endIndex: rowIndex + 1 } }
        }))
      }
    });
  }

  if (items.length) {
    const stamp = Date.now();
    const values = items.map((s, i) => scheduleToRow(header, { id: `CS-${stamp}-${String(i).padStart(3, "0")}`, ...s, source }));
    await sheets.spreadsheets.values.append({
      spreadsheetId: env.GOOGLE_SHEET_ID,
      range: `${SHEET_SCHEDULE}!A:${colToLetter(header.length)}`,
      valueInputOption: "RAW",
      requestBody: { values }
    });
  }

  return { deleted: targets.length, added: items.length };
}

async function getSheetIdByTitle(title: string): Promise<number> {
  if (isMockMode()) throw new Error("MOCK_MODE에서는 시트ID 조회가 필요 없습니다.");

  const env = requireGoogleEnv();

  const { sheets } = getGoogleClient();
  const sheetInfo = await sheets.spreadsheets.get({ spreadsheetId: env.GOOGLE_SHEET_ID });
  const sheetId = sheetInfo.data.sheets?.find(s => s.properties?.title === title)?.properties?.sheetId;
  if (sheetId == null) throw new Error(`${title} 시트를 찾을 수 없습니다.`);
  return sheetId;
}

export async function deleteClassSchedule(id: string): Promise<void> {
  if (isMockMode()) return mock_deleteClassSchedule(id);

  const env = requireGoogleEnv();

  const { sheets } = getGoogleClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: env.GOOGLE_SHEET_ID, range: `${SHEET_SCHEDULE}!A:A` });
  const col = (res.data.values ?? []) as string[][];
  const rowIndex = col.findIndex((r) => r[0] === id);
  if (rowIndex < 0) return;

  const sheetId = await getSheetIdByTitle(SHEET_SCHEDULE);
  const deleteRow = rowIndex; // 0=header
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: env.GOOGLE_SHEET_ID,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: { sheetId, dimension: "ROWS", startIndex: deleteRow, endIndex: deleteRow + 1 }
        }
      }]
    }
  });
}

export async function getBlocks(): Promise<BlockTime[]> {
  if (isMockMode()) return mock_getBlocks();

  const env = requireGoogleEnv();

  const { sheets } = getGoogleClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: env.GOOGLE_SHEET_ID,
    range: `${SHEET_BLOCKS}!A:G`
  });
  const rows = (res.data.values ?? []) as string[][];
  if (rows.length <= 1) return [];
  const header = rows[0];
  const idx = createHeaderIndex(
    header,
    ["id", "roomId", "date", "startTime", "endTime", "reason"],
    SHEET_BLOCKS
  );
  // endDate 컬럼은 선택적 (기존 시트에 없을 수 있음)
  const endDateIdx = header.indexOf("endDate");

  return rows.slice(1).filter(r => r[idx("id")]).map(r => ({
    id: r[idx("id")],
    roomId: r[idx("roomId")],
    date: r[idx("date")],
    ...(endDateIdx >= 0 && r[endDateIdx] ? { endDate: r[endDateIdx] } : {}),
    startTime: r[idx("startTime")],
    endTime: r[idx("endTime")],
    reason: r[idx("reason")] || ""
  }));
}

export async function addBlock(b: Omit<BlockTime, "id">): Promise<BlockTime> {
  if (isMockMode()) return mock_addBlock(b);

  const env = requireGoogleEnv();

  const { sheets } = getGoogleClient();
  const id = `BL-${Date.now()}`;
  await sheets.spreadsheets.values.append({
    spreadsheetId: env.GOOGLE_SHEET_ID,
    range: `${SHEET_BLOCKS}!A:G`,
    valueInputOption: "RAW",
    requestBody: { values: [[id, b.roomId, b.date, b.startTime, b.endTime, b.reason, b.endDate || ""]] }
  });

  return { id, ...b };
}

export async function deleteBlock(id: string): Promise<void> {
  if (isMockMode()) return mock_deleteBlock(id);

  const env = requireGoogleEnv();

  const { sheets } = getGoogleClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: env.GOOGLE_SHEET_ID, range: `${SHEET_BLOCKS}!A:A` });
  const col = (res.data.values ?? []) as string[][];
  const rowIndex = col.findIndex((r) => r[0] === id);
  if (rowIndex < 0) return;

  const sheetId = await getSheetIdByTitle(SHEET_BLOCKS);
  const deleteRow = rowIndex;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: env.GOOGLE_SHEET_ID,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: { sheetId, dimension: "ROWS", startIndex: deleteRow, endIndex: deleteRow + 1 }
        }
      }]
    }
  });
}

/* ── 신청 삭제 ── */

export async function deleteRequests(requestIds: string[]): Promise<void> {
  if (isMockMode()) {
    const { mock_deleteRequests } = await import("./mockdb");
    return mock_deleteRequests(requestIds);
  }

  if (!requestIds.length) return;

  const env = requireGoogleEnv();
  const { sheets } = getGoogleClient();

  // requestId 컬럼(A열) 조회
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: env.GOOGLE_SHEET_ID,
    range: `${SHEET_REQUESTS}!A:A`,
  });
  const col = (res.data.values ?? []) as string[][];

  const idsSet = new Set(requestIds);
  const rowIndicesToDelete: number[] = [];
  for (let i = 1; i < col.length; i++) {
    if (idsSet.has(col[i]?.[0])) {
      rowIndicesToDelete.push(i);
    }
  }

  if (!rowIndicesToDelete.length) return;

  const sheetId = await getSheetIdByTitle(SHEET_REQUESTS);

  // 아래에서 위로 삭제해야 인덱스가 밀리지 않음
  rowIndicesToDelete.sort((a, b) => b - a);

  const requests = rowIndicesToDelete.map((rowIndex) => ({
    deleteDimension: {
      range: {
        sheetId,
        dimension: "ROWS" as const,
        startIndex: rowIndex,
        endIndex: rowIndex + 1,
      },
    },
  }));

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: env.GOOGLE_SHEET_ID,
    requestBody: { requests },
  });
}

/* ── 이메일 템플릿 (Google Sheets 저장) ── */

const SHEET_EMAIL_TEMPLATES = "email_templates";

type EmailTemplateRow = {
  category: string;
  status: string;
  subject: string;
  body: string;
};

/**
 * email_templates 시트가 없으면 자동으로 생성(헤더 포함)합니다.
 */
async function ensureEmailTemplatesSheet(): Promise<void> {
  const env = requireGoogleEnv();
  const { sheets } = getGoogleClient();

  const meta = await sheets.spreadsheets.get({ spreadsheetId: env.GOOGLE_SHEET_ID });
  const exists = meta.data.sheets?.some(
    (s) => s.properties?.title === SHEET_EMAIL_TEMPLATES
  );
  if (exists) return;

  // 시트 생성
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: env.GOOGLE_SHEET_ID,
    requestBody: {
      requests: [
        { addSheet: { properties: { title: SHEET_EMAIL_TEMPLATES } } },
      ],
    },
  });

  // 헤더 작성
  await sheets.spreadsheets.values.update({
    spreadsheetId: env.GOOGLE_SHEET_ID,
    range: `${SHEET_EMAIL_TEMPLATES}!A1:D1`,
    valueInputOption: "RAW",
    requestBody: { values: [["category", "status", "subject", "body"]] },
  });
}

/**
 * 이메일 템플릿 전체를 Google Sheets에서 읽어옵니다.
 */
export async function getEmailTemplates(): Promise<EmailTemplateRow[]> {
  if (isMockMode()) {
    const { mock_getEmailTemplates } = await import("./mockdb");
    return mock_getEmailTemplates();
  }

  const env = requireGoogleEnv();
  await ensureEmailTemplatesSheet();

  const { sheets } = getGoogleClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: env.GOOGLE_SHEET_ID,
    range: `${SHEET_EMAIL_TEMPLATES}!A:D`,
  });

  const rows = (res.data.values ?? []) as string[][];
  if (rows.length <= 1) return [];

  return rows.slice(1).filter((r) => r[0] && r[1]).map((r) => ({
    category: r[0],
    status: r[1],
    subject: r[2] ?? "",
    body: r[3] ?? "",
  }));
}

/**
 * 특정 카테고리+상태의 이메일 템플릿을 저장(있으면 업데이트, 없으면 추가)합니다.
 */
export async function saveEmailTemplate(
  category: string,
  status: string,
  subject: string,
  body: string,
): Promise<void> {
  if (isMockMode()) {
    const { mock_saveEmailTemplate } = await import("./mockdb");
    return mock_saveEmailTemplate(category, status, subject, body);
  }

  const env = requireGoogleEnv();
  await ensureEmailTemplatesSheet();

  const { sheets } = getGoogleClient();

  // 기존 행 검색
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: env.GOOGLE_SHEET_ID,
    range: `${SHEET_EMAIL_TEMPLATES}!A:D`,
  });
  const rows = (res.data.values ?? []) as string[][];

  const rowIndex = rows.findIndex(
    (r, i) => i > 0 && r[0] === category && r[1] === status,
  );

  if (rowIndex >= 0) {
    // 기존 행 업데이트
    const rowNumber = rowIndex + 1;
    await sheets.spreadsheets.values.update({
      spreadsheetId: env.GOOGLE_SHEET_ID,
      range: `${SHEET_EMAIL_TEMPLATES}!A${rowNumber}:D${rowNumber}`,
      valueInputOption: "RAW",
      requestBody: { values: [[category, status, subject, body]] },
    });
  } else {
    // 새 행 추가
    await sheets.spreadsheets.values.append({
      spreadsheetId: env.GOOGLE_SHEET_ID,
      range: `${SHEET_EMAIL_TEMPLATES}!A:D`,
      valueInputOption: "RAW",
      requestBody: { values: [[category, status, subject, body]] },
    });
  }
}

// ─────────────────────────────────────────────
// 감사로그 시트 (audit_log) — 2026-10 행정감사 후속
// 시트가 없으면 자동 생성 후 헤더를 채웁니다.
// ─────────────────────────────────────────────
const SHEET_AUDIT = "audit_log";
export const AUDIT_HEADERS = ["timestamp", "action", "target", "actor", "summary", "details", "ip"] as const;
let auditSheetReady = false;

async function ensureAuditSheet(): Promise<void> {
  if (auditSheetReady) return;
  const env = requireGoogleEnv();
  const { sheets } = getGoogleClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: env.GOOGLE_SHEET_ID });
  const exists = (meta.data.sheets ?? []).some((s) => s.properties?.title === SHEET_AUDIT);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: env.GOOGLE_SHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: SHEET_AUDIT } } }] },
    });
  }
  const head = await sheets.spreadsheets.values.get({
    spreadsheetId: env.GOOGLE_SHEET_ID,
    range: `${SHEET_AUDIT}!1:1`,
  });
  if (!(head.data.values?.[0]?.length)) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: env.GOOGLE_SHEET_ID,
      range: `${SHEET_AUDIT}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [[...AUDIT_HEADERS]] },
    });
  }
  auditSheetReady = true;
}

export async function appendAuditRow(row: {
  timestamp: string;
  action: string;
  target: string;
  actor: string;
  summary: string;
  details: string;
  ip: string;
}): Promise<void> {
  if (isMockMode()) return;
  await ensureAuditSheet();
  const env = requireGoogleEnv();
  const { sheets } = getGoogleClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: env.GOOGLE_SHEET_ID,
    range: `${SHEET_AUDIT}!A:G`,
    valueInputOption: "RAW",
    requestBody: { values: [[row.timestamp, row.action, row.target, row.actor, row.summary, row.details, row.ip]] },
  });
}
