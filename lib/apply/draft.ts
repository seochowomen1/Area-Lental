/**
 * 작성 중 내용 지키기 — sessionStorage 임시 저장(개인정보 제외 · 01_spec ⑤·⑦ 3-4)
 * - 키 `applyDraft:v1:{roomId}` · 탭을 닫으면 사라짐 · 신청 성공 시 삭제
 * - 저장하는 칸(화이트리스트): 인원 · 사용 목적 · 장비 · 전시 이름 · 철수 시간 · 장르·전시 내용 · 전시 목적 · 알게 된 경로 · 특이사항 · 일정
 * - 저장하지 않는 칸: 이름 · 휴대폰 번호 · 이메일 · 생년월일 · 주소 · 단체 이름(개인 이름일 수 있음) · 동의
 */
import { ALL_EQUIP_KEYS, type ApplyFormValues, type EquipKey } from "@/lib/apply/form";
import type { ScheduleSession } from "@/lib/apply/schedule";

export const DRAFT_VERSION = "v1";
export const DRAFT_TEXT_FIELDS = [
  "headcount",
  "purpose",
  "exhibitionTitle",
  "galleryRemovalTime",
  "genreContent",
  "exhibitionPurpose",
  "awarenessPath",
  "specialNotes",
] as const;
export type DraftTextField = (typeof DRAFT_TEXT_FIELDS)[number];

/** 개인정보 — 어떤 경우에도 저장하지 않는다(테스트로 확인) */
export const DRAFT_EXCLUDED_FIELDS = ["applicantName", "birthDigits", "phone", "email", "address", "orgName", "privacyAgree", "pledgeAgree"] as const;

export type ApplyDraft = {
  v: typeof DRAFT_VERSION;
  roomId: string;
  savedAt: number;
  fields: Partial<Record<DraftTextField, string>>;
  equipment: Partial<Record<EquipKey, boolean>>;
  /** 참고용(복원은 주소의 일정이 우선) */
  sessions?: ScheduleSession[];
  period?: { startDate: string; endDate: string };
};

export function draftKey(roomId: string): string {
  return `applyDraft:${DRAFT_VERSION}:${roomId}`;
}

/** 값 → 저장할 것만(화이트리스트) */
export function pickDraft(
  roomId: string,
  v: ApplyFormValues,
  extra?: { sessions?: readonly ScheduleSession[]; period?: { startDate: string; endDate: string } },
  now: number = Date.now()
): ApplyDraft {
  const fields: ApplyDraft["fields"] = {};
  for (const k of DRAFT_TEXT_FIELDS) {
    const val = v[k];
    if (typeof val === "string" && val.trim() !== "") fields[k] = val.slice(0, 2000);
  }
  const equipment: ApplyDraft["equipment"] = {};
  for (const k of ALL_EQUIP_KEYS) if (v.equipment[k]) equipment[k] = true;
  const d: ApplyDraft = { v: DRAFT_VERSION, roomId, savedAt: now, fields, equipment };
  if (extra?.sessions?.length) d.sessions = extra.sessions.map((s) => ({ date: s.date, startTime: s.startTime, endTime: s.endTime }));
  if (extra?.period) d.period = { startDate: extra.period.startDate, endDate: extra.period.endDate };
  return d;
}

/** 기본값과 다른(사람이 쓴) 칸이 있는가 — 기본 인원은 내용으로 치지 않는다 */
export function draftHasContent(d: ApplyDraft | null, defaults: ApplyFormValues): boolean {
  if (!d) return false;
  for (const k of DRAFT_TEXT_FIELDS) {
    const val = d.fields[k];
    if (val !== undefined && val.trim() !== "" && val !== defaults[k]) return true;
  }
  return Object.values(d.equipment).some(Boolean);
}

/** 저장된 문자열 → 초안(형식이 다르거나 다른 공간이면 null · 화이트리스트 밖 키는 버림) */
export function parseDraft(rawText: string | null, roomId: string): ApplyDraft | null {
  if (!rawText) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(rawText);
  } catch {
    return null;
  }
  const o = obj as Partial<ApplyDraft> | null;
  if (!o || o.v !== DRAFT_VERSION || o.roomId !== roomId || typeof o.fields !== "object" || !o.fields) return null;
  const fields: ApplyDraft["fields"] = {};
  for (const k of DRAFT_TEXT_FIELDS) {
    const val = (o.fields as Record<string, unknown>)[k];
    if (typeof val === "string") fields[k] = val.slice(0, 2000);
  }
  const equipment: ApplyDraft["equipment"] = {};
  const eq = (o.equipment ?? {}) as Record<string, unknown>;
  for (const k of ALL_EQUIP_KEYS) if (eq[k] === true) equipment[k] = true;
  return { v: DRAFT_VERSION, roomId, savedAt: Number(o.savedAt) || 0, fields, equipment, sessions: o.sessions, period: o.period };
}

/** 초안을 값에 덮기(개인정보 칸은 건드리지 않음) */
export function applyDraftToValues(base: ApplyFormValues, d: ApplyDraft): ApplyFormValues {
  const next: ApplyFormValues = { ...base, equipment: { ...base.equipment } };
  for (const k of DRAFT_TEXT_FIELDS) {
    const val = d.fields[k];
    if (val !== undefined) next[k] = val;
  }
  for (const k of ALL_EQUIP_KEYS) if (d.equipment[k]) next.equipment[k] = true;
  return next;
}

/* ───────── 브라우저 저장소(sessionStorage) ───────── */

function store(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

export function loadDraft(roomId: string): ApplyDraft | null {
  return parseDraft(store()?.getItem(draftKey(roomId)) ?? null, roomId);
}

export function saveDraft(d: ApplyDraft): void {
  try {
    store()?.setItem(draftKey(d.roomId), JSON.stringify(d));
  } catch {
    /* 저장 공간 부족 등은 무시(신청에는 영향 없음) */
  }
}

export function clearDraft(roomId: string): void {
  try {
    store()?.removeItem(draftKey(roomId));
  } catch {
    /* 무시 */
  }
}

/* ───────── 화면 사이 이동 중 기억(메모리 · 저장소 아님) ─────────
 * "날짜·시간 바꾸기"로 2단계에 갔다 돌아오면 쓴 칸(개인정보 포함)이 그대로여야 한다(수용 4).
 * 브라우저 저장소에는 개인정보를 쓰지 않으므로, 같은 탭의 화면 이동(클라이언트 이동) 동안만 JS 메모리에 둔다.
 * 새로고침·탭 닫기·신청 성공 시 사라진다.
 */
const memory = new Map<string, ApplyFormValues>();

export function rememberValues(roomId: string, v: ApplyFormValues): void {
  memory.set(roomId, { ...v, equipment: { ...v.equipment } });
}

export function takeRememberedValues(roomId: string): ApplyFormValues | null {
  const v = memory.get(roomId) ?? null;
  memory.delete(roomId);
  return v;
}

export function forgetValues(roomId: string): void {
  memory.delete(roomId);
}
