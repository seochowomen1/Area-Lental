/**
 * 날짜 유틸 1벌 (audit-fix-3 3-3 · 2026-10-28)
 *
 * "YYYY-MM-DD" 문자열을 달력 날짜로만 다룬다(시간대 없음 · UTC 달력 계산).
 * 브라우저·서버 어디서 실행해도 같은 결과가 나오도록 로컬 시간대(Date#getDay 등)를 쓰지 않는다.
 * 예전에 화면·서버에 흩어져 있던 isYmd·addDays·dowLabel·diffDaysInclusive 등을 이 파일로 모았다.
 * 서버 전용 import 금지(클라이언트 컴포넌트도 쓴다).
 */

const DOW_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;
const DAY_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** "YYYY-MM-DD" 모양인가 (달력에 실제로 있는지는 isRealYmd) */
export function isYmd(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function parts(ymd: string): [number, number, number] | null {
  if (typeof ymd !== "string") return null;
  const [y, m, d] = ymd.split("-").map((v) => parseInt(v, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  return [y, m, d];
}

/** 모양이 맞고 달력에도 있는 날짜인가 (2026-11-31 → false) */
export function isRealYmd(s: unknown): s is string {
  if (!isYmd(s)) return false;
  const [y, m, d] = parts(s)!;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** 날짜 더하기 — 읽을 수 없는 값이면 "" */
export function addDays(ymd: string, delta: number): string {
  const p = parts(ymd);
  if (!p || !Number.isFinite(delta)) return "";
  const dt = new Date(Date.UTC(p[0], p[1] - 1, p[2] + delta));
  if (!Number.isFinite(dt.getTime())) return "";
  return dt.toISOString().slice(0, 10);
}

/** Date 객체(로컬 달력)에 날짜 더하기 — 달력 화면용 */
export function addDaysToDate(d: Date, delta: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + delta);
}

/** 요일 0(일)~6(토) — 읽을 수 없는 값이면 NaN */
export function dayOfWeek(ymd: string): number {
  const p = parts(ymd);
  if (!p) return NaN;
  return new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay();
}

/** "2026-11-09" → "월" (읽을 수 없으면 "") */
export function dowLabel(ymd: string): string {
  if (!isYmd(ymd)) return "";
  return DOW_KO[dayOfWeek(ymd)] ?? "";
}

/** 시작~끝 날짜 수(양 끝 포함) — 읽을 수 없으면 0 */
export function diffDaysInclusive(startYmd: string, endYmd: string): number {
  const a = parts(startYmd);
  const b = parts(endYmd);
  if (!a || !b) return 0;
  const s = Date.UTC(a[0], a[1] - 1, a[2]);
  const e = Date.UTC(b[0], b[1] - 1, b[2]);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return 0;
  return Math.floor((e - s) / DAY_MS) + 1;
}

/** "2026-11-09" → "11월 9일(월)" (읽을 수 없으면 입력 그대로) */
export function formatKoDate(ymd: string): string {
  if (!isYmd(ymd)) return ymd || "";
  const m = parseInt(ymd.slice(5, 7), 10);
  const d = parseInt(ymd.slice(8, 10), 10);
  return `${m}월 ${d}일(${dowLabel(ymd)})`;
}

/** 지금(KST) 날짜·시:분 */
export function kstNow(now: Date = new Date()): { ymd: string; hm: string } {
  const k = new Date(now.getTime() + KST_OFFSET_MS);
  return { ymd: k.toISOString().slice(0, 10), hm: `${pad2(k.getUTCHours())}:${pad2(k.getUTCMinutes())}` };
}

/** 오늘(KST) "YYYY-MM-DD" */
export function todayYmdKst(now: Date = new Date()): string {
  return kstNow(now).ymd;
}
