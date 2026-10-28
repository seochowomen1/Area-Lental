/**
 * 신청서 값 모양·검증·전송 데이터 만들기 (audit-fix-3 3-4)
 * - 화면 블록(components/apply/*)은 이 값 모양 하나를 같이 쓴다(강의실·E-스튜디오·갤러리·서면 등록).
 * - 서버로 보내는 FormData의 키·값 형식은 3-4 전과 같다(되돌려도 저장 데이터 안전).
 * - 검증은 서버와 같은 Zod 스키마(RequestInputSchema / GalleryRequestInputSchema)로 하고,
 *   화면 문구만 칸 이름(이름·휴대폰 번호·단체 이름·전시 이름)에 맞춰 바꾼다(02_ui §6-3).
 */
import { RequestInputSchema, GalleryRequestInputSchema } from "@/lib/schema";
import { EQUIPMENT_FEE_KRW, STUDIO_EQUIPMENT_FEE_KRW } from "@/lib/config";
import { getRoom } from "@/lib/space";
import { dayOfWeek } from "@/lib/rules/ymd";
import { parseBirth8, BIRTH8_ERROR } from "@/lib/apply/birth";
import type { ScheduleSession } from "@/lib/apply/schedule";

export type LectureEquipKey = keyof typeof EQUIPMENT_FEE_KRW;
export type StudioEquipKey = keyof typeof STUDIO_EQUIPMENT_FEE_KRW;
export type EquipKey = LectureEquipKey | StudioEquipKey;
export const LECTURE_EQUIP_KEYS = Object.keys(EQUIPMENT_FEE_KRW) as LectureEquipKey[];
export const STUDIO_EQUIP_KEYS = Object.keys(STUDIO_EQUIPMENT_FEE_KRW) as StudioEquipKey[];
export const ALL_EQUIP_KEYS: EquipKey[] = [...LECTURE_EQUIP_KEYS, ...STUDIO_EQUIP_KEYS];

/** 공개 신청서용 짧은 장비 이름(02_mockup E1 · 관리자 화면 라벨은 lib/config 그대로) */
export const PUBLIC_EQUIP_LABELS: Record<EquipKey, string> = {
  laptop: "노트북",
  projector: "프로젝터",
  audio: "음향",
  mirrorless: "미러리스 카메라",
  camcorder: "캠코더",
  wirelessMic: "무선 마이크 5개",
  pinMic: "핀 마이크 1개",
  rodeMic: "비디오 마이크·스탠드",
  electronicBoard: "전자칠판·모니터·노트북",
};

export function equipFee(key: EquipKey): number {
  return (key in EQUIPMENT_FEE_KRW ? EQUIPMENT_FEE_KRW[key as LectureEquipKey] : STUDIO_EQUIPMENT_FEE_KRW[key as StudioEquipKey]) ?? 0;
}

export type ApplyFormValues = {
  applicantName: string;
  /** 생년월일 8자리(숫자) — 전송 때 YYYY-MM-DD */
  birthDigits: string;
  phone: string;
  email: string;
  address: string;
  orgName: string;
  /** 입력칸 그대로(문자) — 전송 때 숫자 */
  headcount: string;
  purpose: string;
  equipment: Record<EquipKey, boolean>;
  // 갤러리
  exhibitionTitle: string;
  galleryRemovalTime: string;
  genreContent: string;
  exhibitionPurpose: string;
  awarenessPath: string;
  specialNotes: string;
  // 동의(온라인 = 팝업 [동의합니다] · 서면 = 종이 확인 체크)
  privacyAgree: boolean;
  pledgeAgree: boolean;
};

export type ApplyFieldKey = Exclude<keyof ApplyFormValues, "equipment">;
export type ApplyErrors = Partial<Record<ApplyFieldKey, string>>;

export function emptyEquipment(): Record<EquipKey, boolean> {
  return Object.fromEntries(ALL_EQUIP_KEYS.map((k) => [k, false])) as Record<EquipKey, boolean>;
}

export function defaultApplyValues(roomId: string): ApplyFormValues {
  const room = getRoom(roomId);
  const isStudio = room?.category === "studio";
  const isGallery = room?.category === "gallery";
  return {
    applicantName: "",
    birthDigits: "",
    phone: "",
    email: "",
    address: "",
    orgName: "",
    headcount: isGallery ? "1" : isStudio ? String(room?.baseHeadcount ?? 2) : "",
    purpose: "",
    equipment: emptyEquipment(),
    exhibitionTitle: "",
    galleryRemovalTime: "",
    genreContent: "",
    exhibitionPurpose: "",
    awarenessPath: "",
    specialNotes: "",
    privacyAgree: false,
    pledgeAgree: false,
  };
}

/** 휴대폰 번호 자동 하이픈(기존 formatPhoneKR 그대로) */
export function formatPhoneKR(input: string): string {
  const digits = input.replace(/\D/g, "").slice(0, 11);
  if (!digits) return "";
  if (digits.startsWith("02")) {
    const rest = digits.slice(2);
    if (rest.length <= 3) return `02-${rest}`;
    if (rest.length <= 7) return `02-${rest.slice(0, 3)}-${rest.slice(3)}`;
    return `02-${rest.slice(0, 4)}-${rest.slice(4, 8)}`;
  }
  const a = digits.slice(0, 3);
  const b = digits.slice(3);
  if (b.length <= 4) return `${a}-${b}`;
  if (b.length <= 7) return `${a}-${b.slice(0, 3)}-${b.slice(3)}`;
  return `${a}-${b.slice(0, 4)}-${b.slice(4, 8)}`;
}

/** 화면 칸 이름(빠진 항목 요약·오류 줄) — 02_ui §6-0 (라)·§6-3 */
export const FIELD_LABELS: Record<ApplyFieldKey, string> = {
  applicantName: "이름",
  birthDigits: "생년월일",
  phone: "휴대폰 번호",
  email: "이메일",
  address: "주소",
  orgName: "단체 이름",
  headcount: "인원",
  purpose: "사용 목적",
  exhibitionTitle: "전시 이름",
  galleryRemovalTime: "철수 시간",
  genreContent: "장르·전시 내용",
  exhibitionPurpose: "전시 목적",
  awarenessPath: "알게 된 경로",
  specialNotes: "특이사항",
  privacyAgree: "개인정보 동의",
  pledgeAgree: "서약 동의",
};

/** 빈 칸 문구 */
const EMPTY_MESSAGES: Partial<Record<ApplyFieldKey, string>> = {
  applicantName: "이름을 입력해 주세요.",
  phone: "휴대폰 번호를 입력해 주세요.",
  email: "이메일을 입력해 주세요.",
  address: "주소를 입력해 주세요.",
  orgName: "단체 이름을 입력해 주세요.",
  headcount: "인원을 입력해 주세요.",
  purpose: "사용 목적을 입력해 주세요.",
  exhibitionTitle: "전시 이름을 입력해 주세요.",
  galleryRemovalTime: "철수 시간을 골라 주세요.",
};

/** 서버 스키마 문구 → 화면 칸 이름에 맞춘 문구(서버 응답 문구는 그대로 · 화면 메시지 맵만) */
function screenMessage(field: ApplyFieldKey, schemaMessage: string): string {
  if (field === "applicantName" && schemaMessage.startsWith("성명은 2자")) return "이름을 2자 이상 입력해 주세요.";
  if (field === "applicantName" && schemaMessage.startsWith("성명은 30자")) return "이름은 30자 이내로 입력해 주세요.";
  if (field === "phone") return "휴대폰 번호를 다시 확인해 주세요.";
  if (field === "orgName") return "단체 이름을 입력해 주세요.";
  if (field === "exhibitionTitle") return "전시 이름을 입력해 주세요.";
  if (field === "headcount" && /인원 수를|Expected number/.test(schemaMessage)) return "인원을 입력해 주세요.";
  return schemaMessage;
}

export type ApplyKind = "lecture" | "studio" | "gallery";

export function applyKindOf(roomId: string): ApplyKind {
  const c = getRoom(roomId)?.category ?? "lecture";
  return c === "gallery" ? "gallery" : c === "studio" ? "studio" : "lecture";
}

/** 갤러리 purpose 합치기(기존 composePurpose 그대로 — 저장 형식 동일) */
export function composeGalleryPurpose(fields: {
  exhibitionPurpose?: string;
  genreContent?: string;
  awarenessPath?: string;
  specialNotes?: string;
  galleryRemovalTime?: string;
  galleryPrepDate?: string;
}): string {
  const lines: string[] = [];
  if (fields.exhibitionPurpose?.trim()) lines.push(`전시 목적: ${fields.exhibitionPurpose.trim()}`);
  if (fields.genreContent?.trim()) lines.push(`장르·내용: ${fields.genreContent.trim()}`);
  if (fields.awarenessPath?.trim()) lines.push(`인지 경로: ${fields.awarenessPath.trim()}`);
  if (fields.galleryPrepDate?.trim()) lines.push(`준비일: ${fields.galleryPrepDate.trim()}`);
  if (fields.galleryRemovalTime?.trim()) lines.push(`철수 예정: 종료일 ${fields.galleryRemovalTime.trim()}`);
  if (fields.specialNotes?.trim()) lines.push(`특이사항: ${fields.specialNotes.trim()}`);
  const joined = lines.join("\n").trim();
  return joined.length >= 5 ? joined : "전시 신청";
}

export type LectureSubmitContext = {
  roomId: string;
  sessions: readonly ScheduleSession[];
  pledgeDate: string;
};

export type GallerySubmitContext = {
  startDate: string;
  endDate: string;
  prepDate: string;
  /** planGallery 회차(서버는 기간으로 다시 만든다) */
  sessions: readonly ScheduleSession[];
  pledgeDate: string;
};

/** 서버 raw 값(문자) — 3-4 전 ApplyClient가 보내던 키 그대로 */
export function buildLectureRaw(v: ApplyFormValues, ctx: LectureSubmitContext): Record<string, string> {
  const first = [...ctx.sessions].sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))[0];
  const birth = parseBirth8(v.birthDigits);
  const raw: Record<string, string> = {
    roomId: ctx.roomId,
    date: first?.date ?? "",
    startTime: first?.startTime ?? "",
    endTime: first?.endTime ?? "",
    orgName: v.orgName.trim(),
    headcount: v.headcount.trim(),
    purpose: v.purpose.trim(),
    privacyAgree: v.privacyAgree ? "true" : "false",
    pledgeAgree: v.pledgeAgree ? "true" : "false",
    applicantName: v.applicantName.trim(),
    birth: birth.ok ? birth.ymd : "",
    address: v.address.trim(),
    phone: v.phone.trim(),
    email: v.email.trim(),
    pledgeDate: ctx.pledgeDate,
    // 서약자 성명 = 신청자 이름(신청서 칸을 줄이면서 자동 · 기존에도 기본값이 신청자 이름)
    pledgeName: v.applicantName.trim(),
  };
  const isStudio = applyKindOf(ctx.roomId) === "studio";
  for (const k of ALL_EQUIP_KEYS) {
    const allowed = isStudio ? (STUDIO_EQUIP_KEYS as string[]).includes(k) : (LECTURE_EQUIP_KEYS as string[]).includes(k);
    raw[k] = allowed && v.equipment[k] ? "true" : "false";
  }
  return raw;
}

export function buildGalleryRaw(v: ApplyFormValues, ctx: GallerySubmitContext): Record<string, string> {
  const birth = parseBirth8(v.birthDigits);
  const dow = dayOfWeek(ctx.startDate);
  const endTime = dow === 6 ? "13:00" : dow === 2 ? "20:00" : "18:00";
  return {
    roomId: "gallery",
    date: ctx.startDate,
    startTime: "09:00",
    endTime,
    headcount: "1",
    laptop: "false",
    projector: "false",
    audio: "false",
    pledgeDate: ctx.pledgeDate,
    privacyAgree: v.privacyAgree ? "true" : "false",
    pledgeAgree: v.pledgeAgree ? "true" : "false",
    startDate: ctx.startDate,
    endDate: ctx.endDate,
    galleryRemovalTime: v.galleryRemovalTime,
    galleryPrepDate: ctx.prepDate,
    exhibitionTitle: v.exhibitionTitle.trim(),
    exhibitionPurpose: v.exhibitionPurpose.trim(),
    genreContent: v.genreContent.trim(),
    awarenessPath: v.awarenessPath.trim(),
    specialNotes: v.specialNotes.trim(),
    purpose: composeGalleryPurpose({
      exhibitionPurpose: v.exhibitionPurpose,
      genreContent: v.genreContent,
      awarenessPath: v.awarenessPath,
      specialNotes: v.specialNotes,
      galleryRemovalTime: v.galleryRemovalTime,
      galleryPrepDate: ctx.prepDate,
    }),
    applicantName: v.applicantName.trim(),
    birth: birth.ok ? birth.ymd : "",
    address: v.address.trim(),
    phone: v.phone.trim(),
    email: v.email.trim(),
    orgName: v.orgName.trim(),
    pledgeName: v.applicantName.trim(),
  };
}

/** raw → FormData(+ sessions JSON) */
export function rawToFormData(raw: Record<string, string>, sessions: readonly ScheduleSession[]): FormData {
  const fd = new FormData();
  for (const [k, val] of Object.entries(raw)) fd.set(k, val);
  fd.set("sessions", JSON.stringify(sessions.map((s) => ({ date: s.date, startTime: s.startTime, endTime: s.endTime }))));
  return fd;
}

const SCHEMA_PATH_TO_FIELD: Record<string, ApplyFieldKey> = {
  applicantName: "applicantName",
  birth: "birthDigits",
  phone: "phone",
  email: "email",
  address: "address",
  orgName: "orgName",
  headcount: "headcount",
  purpose: "purpose",
  exhibitionTitle: "exhibitionTitle",
  galleryRemovalTime: "galleryRemovalTime",
  exhibitionPurpose: "exhibitionPurpose",
  genreContent: "genreContent",
  awarenessPath: "awarenessPath",
  specialNotes: "specialNotes",
  privacyAgree: "privacyAgree",
  pledgeAgree: "pledgeAgree",
  // 서약자 성명 = 이름이라 이름 칸으로
  pledgeName: "applicantName",
};

/** 화면 순서(빠진 항목 요약 순서 = 화면 순서) */
export const FIELD_ORDER: ApplyFieldKey[] = [
  "applicantName",
  "birthDigits",
  "phone",
  "email",
  "address",
  "exhibitionTitle",
  "galleryRemovalTime",
  "orgName",
  "headcount",
  "purpose",
  "genreContent",
  "exhibitionPurpose",
  "awarenessPath",
  "specialNotes",
  "privacyAgree",
  "pledgeAgree",
];

/**
 * 칸 검증 — 서버와 같은 스키마 + 생년월일 8자리 + 빈 칸 문구
 * @returns 칸별 첫 오류(화면 순서는 FIELD_ORDER로 정렬해서 쓴다)
 */
export function validateApply(kind: ApplyKind, v: ApplyFormValues, raw: Record<string, string>): ApplyErrors {
  const errors: ApplyErrors = {};
  const schema = kind === "gallery" ? GalleryRequestInputSchema : RequestInputSchema;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = SCHEMA_PATH_TO_FIELD[String(issue.path[0] ?? "")];
      if (!field || errors[field]) continue;
      errors[field] = screenMessage(field, issue.message);
    }
  }
  // 생년월일 8자리(빈칸·7자리·없는 날짜) — 만 14세 미만 문구는 스키마 문구 그대로
  if (!parseBirth8(v.birthDigits).ok) errors.birthDigits = BIRTH8_ERROR;
  // 빈 칸은 "…을 입력해 주세요."
  for (const [field, msg] of Object.entries(EMPTY_MESSAGES) as Array<[ApplyFieldKey, string]>) {
    const val = v[field];
    if (typeof val === "string" && val.trim() === "" && errors[field]) errors[field] = msg;
  }
  // E-스튜디오 정원(01_spec ③-E · 서버도 다시 검사)
  if (kind === "studio") {
    const cap = getRoom(raw.roomId)?.capacity ?? 12;
    const n = Number(v.headcount);
    if (Number.isFinite(n) && n > cap) errors.headcount = `E-스튜디오 최대 인원은 ${cap}명입니다.`;
  }
  if (!v.privacyAgree) errors.privacyAgree = "개인정보 수집·이용 동의는 필수입니다.";
  if (!v.pledgeAgree) errors.pledgeAgree = kind === "gallery" ? "전시 운영 규정 서약 동의는 필수입니다." : "대관 규정 서약 동의는 필수입니다.";
  return errors;
}

export function orderedErrorKeys(errors: ApplyErrors): ApplyFieldKey[] {
  return FIELD_ORDER.filter((k) => errors[k]);
}
