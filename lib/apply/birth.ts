/**
 * 생년월일 8자리 한 칸 (01_spec ⑧ Q7 · ③ 3-4)
 * - 입력: 숫자만(하이픈·점·공백은 지움) 최대 8자리
 * - 맞으면 저장 형식 "YYYY-MM-DD"(지금 시트와 같음)와 확인 글자 "1965년 3월 12일"
 */
import { isRealYmd } from "@/lib/rules/ymd";

export const BIRTH8_ERROR = "생년월일 8자리를 입력해 주세요. 예: 19650312";
export const BIRTH8_PLACEHOLDER = "예: 19650312";

/** 입력값에서 숫자만 8자리까지 */
export function cleanBirthDigits(raw: string): string {
  return String(raw ?? "").replace(/\D/g, "").slice(0, 8);
}

export type Birth8Result = { ok: true; ymd: string; label: string } | { ok: false };

/** 8자리 → 날짜(1900년 이후 · 올해까지 · 달력에 있는 날짜만) */
export function parseBirth8(raw: string, now: Date = new Date()): Birth8Result {
  const d = cleanBirthDigits(raw);
  if (d.length !== 8) return { ok: false };
  const ymd = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  if (!isRealYmd(ymd)) return { ok: false };
  const y = parseInt(d.slice(0, 4), 10);
  if (y < 1900 || y > now.getFullYear()) return { ok: false };
  return { ok: true, ymd, label: birthLabel(ymd) };
}

/** "1965-03-12" → "1965년 3월 12일" */
export function birthLabel(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  return `${parseInt(ymd.slice(0, 4), 10)}년 ${parseInt(ymd.slice(5, 7), 10)}월 ${parseInt(ymd.slice(8, 10), 10)}일`;
}

/** "1965-03-12" → "19650312"(되돌아온 화면 채우기용) */
export function ymdToBirthDigits(ymd: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd.replace(/-/g, "") : "";
}
