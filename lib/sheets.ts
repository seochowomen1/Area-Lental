import { getGoogleClient } from "@/lib/google";
import { isMockMode, requireGoogleEnv } from "@/lib/env";
import { nowIsoSeoul, todayYmdSeoul } from "@/lib/datetime";
import type { BlockTime, ClassSchedule, RentalRequest, RequestStatus } from "@/lib/types";
import { ROOMS } from "@/lib/config";
import {
  mock_getAllRequests,
  mock_getRequestById,
  mock_appendRequest,
  mock_updateRequestStatus,
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
const REQUEST_OPTIONAL_HEADERS = [
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

async function ensureRequestOptionalHeaders(): Promise<string[]> {
  const env = requireGoogleEnv();
  const { sheets } = getGoogleClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: env.GOOGLE_SHEET_ID,
    range: `${SHEET_REQUESTS}!1:1`
  });

  const header = ((res.data.values?.[0] ?? []) as string[]).map((v) => String(v).trim());
  if (!header.length) return [];

  const missing = REQUEST_OPTIONAL_HEADERS.filter((h) => !header.includes(h));
  if (!missing.length) return header;

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
  };
}

/**
 * 헤더 배열 순서에 맞춰 레코드 값 배열을 생성합니다.
 * 헤더 순서가 코드와 다르더라도 정확한 컬럼에 값이 배치됩니다.
 */
function buildRowFromHeader(header: string[], record: RentalRequest): string[] {
  const map = buildRecordValueMap(record);
  return header.map((col) => map[col] ?? "");
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

export async function getAllRequests(): Promise<RentalRequest[]> {
  if (isMockMode()) return mock_getAllRequests();

  const env = requireGoogleEnv();

  const { sheets } = getGoogleClient();
  // optional 컬럼이 추가될 수 있으므로 충분히 넓게 읽습니다.
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: env.GOOGLE_SHEET_ID,
    range: `${SHEET_REQUESTS}!A:AZ`
  });

  const rows = (res.data.values ?? []) as string[][];
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

  // optional columns (없으면 -1)
  const opt = (name: string) => {
    const m = new Map<string, number>();
    header.forEach((h, i) => m.set(String(h).trim(), i));
    return m.get(name) ?? -1;
  };
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

  const prefix = `REQ-${todayYmdSeoul().replaceAll("-", "")}-`;
  const all = await getAllRequests();
  const nums = all
    .map(r => r.requestId)
    .filter(v => v.startsWith(prefix))
    .map(v => parseInt(v.slice(prefix.length), 10))
    .filter(n => Number.isFinite(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
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
    range: `${SHEET_REQUESTS}!A:AZ`,
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

  // prefix 기준으로 한 번만 조회하여 연속 ID를 생성합니다.
  const prefix = `REQ-${todayYmdSeoul().replaceAll("-", "")}-`;
  const all = await getAllRequests();
  const nums = all
    .map(r => r.requestId)
    .filter(v => v.startsWith(prefix))
    .map(v => parseInt(v.slice(prefix.length), 10))
    .filter(n => Number.isFinite(n));
  let next = (nums.length ? Math.max(...nums) : 0) + 1;

  const createdAt = nowIsoSeoul();
  const saved: RentalRequest[] = [];
  const values: string[][] = [];

  for (const input of inputs) {
    const requestId = `${prefix}${String(next++).padStart(4, "0")}`;

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
    range: `${SHEET_REQUESTS}!A:AZ`,
    valueInputOption: "RAW",
    requestBody: { values }
  });

  return saved;
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
  const idx0 = all.findIndex(r => r.requestId === args.requestId);
  if (idx0 < 0) throw new Error("해당 신청건을 찾을 수 없습니다.");

  const rowNumber = idx0 + 2; // header + 1

  const status = args.status;

  const current = all[idx0];
  const statusChanged = current.status !== status;
  const decidedAt = statusChanged ? nowIsoSeoul() : (current.decidedAt || "");
  const decidedBy = statusChanged ? args.decidedBy : (current.decidedBy || "");

  // X..AB (status, adminMemo, rejectReason, decidedAt, decidedBy)
  const range = `${SHEET_REQUESTS}!X${rowNumber}:AB${rowNumber}`;
  const values = [[status, args.adminMemo ?? "", args.rejectReason ?? "", decidedAt, decidedBy]];

  await sheets.spreadsheets.values.update({
    spreadsheetId: env.GOOGLE_SHEET_ID,
    range,
    valueInputOption: "RAW",
    requestBody: { values }
  });

  // discount columns (있을 경우에만 업데이트)
  // 할인은 '묶음' 단위로 적용되므로, batchId가 있으면 같은 묶음 전체에 동기화합니다.
  const shouldUpdateDiscount =
    typeof args.discountRatePct === "number" ||
    typeof args.discountAmountKRW === "number" ||
    typeof args.discountReason === "string";

  if (shouldUpdateDiscount) {
    // 헤더를 다시 읽어 컬럼 위치를 찾습니다.
    const headerRes = await sheets.spreadsheets.values.get({
      spreadsheetId: env.GOOGLE_SHEET_ID,
      range: `${SHEET_REQUESTS}!1:1`
    });
    const header = ((headerRes.data.values?.[0] ?? []) as string[]).map((v) => String(v).trim());
    const m = new Map<string, number>();
    header.forEach((h, i) => m.set(h, i));

    const idxRate0 = m.get("discountRatePct");
    const idxAmt0 = m.get("discountAmountKRW");
    const idxReason0 = m.get("discountReason");

    const colRate = idxRate0 === undefined ? null : colToLetter(idxRate0 + 1);
    const colAmt = idxAmt0 === undefined ? null : colToLetter(idxAmt0 + 1);
    const colReason = idxReason0 === undefined ? null : colToLetter(idxReason0 + 1);

    // 현재 행의 batchId를 기반으로 동기화 대상 행을 결정
    const target = all[idx0];
    const batchId = (target.batchId ?? "").trim();
    const rowNumbers = batchId ? all.map((r, i) => ((r.batchId ?? "").trim() == batchId ? i + 2 : 0)).filter(Boolean) : [rowNumber];

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

export async function getClassSchedules(): Promise<ClassSchedule[]> {
  if (isMockMode()) return mock_getClassSchedules();

  const env = requireGoogleEnv();

  const { sheets } = getGoogleClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: env.GOOGLE_SHEET_ID,
    range: `${SHEET_SCHEDULE}!A:H`
  });
  const rows = (res.data.values ?? []) as string[][];
  if (rows.length <= 1) return [];
  const header = rows[0];
  const idx = createHeaderIndex(
    header,
    ["id", "roomId", "dayOfWeek", "startTime", "endTime", "title", "effectiveFrom", "effectiveTo"],
    SHEET_SCHEDULE
  );

  return rows.slice(1).filter(r => r[idx("id")]).map(r => ({
    id: r[idx("id")],
    roomId: r[idx("roomId")],
    dayOfWeek: parseInt(r[idx("dayOfWeek")] || "0", 10),
    startTime: r[idx("startTime")],
    endTime: r[idx("endTime")],
    title: r[idx("title")] || "",
    effectiveFrom: r[idx("effectiveFrom")] || "",
    effectiveTo: r[idx("effectiveTo")] || ""
  }));
}

export async function addClassSchedule(s: Omit<ClassSchedule, "id">): Promise<ClassSchedule> {
  if (isMockMode()) return mock_addClassSchedule(s);

  const env = requireGoogleEnv();

  const { sheets } = getGoogleClient();
  const id = `CS-${Date.now()}`;
  await sheets.spreadsheets.values.append({
    spreadsheetId: env.GOOGLE_SHEET_ID,
    range: `${SHEET_SCHEDULE}!A:H`,
    valueInputOption: "RAW",
    requestBody: {
      values: [[id, s.roomId, String(s.dayOfWeek), s.startTime, s.endTime, s.title, s.effectiveFrom, s.effectiveTo]]
    }
  });

  return { id, ...s };
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
