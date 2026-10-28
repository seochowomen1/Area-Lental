/**
 * 신청 3단 — 일정 주소(쿼리) 해석·생성 (audit-fix-3 3-4 · 01_spec ⑤ 3-4)
 * 클라이언트·서버·테스트 공용 순수 함수. 개인정보 없음(날짜·시간만).
 *
 * - 강의실·E-스튜디오: `/apply?roomId=sangsang1&s=2026-11-07_1400-1600,2026-11-14_1400-1600`
 * - 예전 주소(계속 동작): `/apply?roomId=sangsang1&date=2026-11-07&start=14:00&end=16:00` → 1회차
 * - 갤러리: `/apply?roomId=gallery&startDate=…&endDate=…(&prepDate=…)`
 * - 2단계로 되돌아갈 때도 같은 `s=`를 쓴다: `/space/sangsang1?s=…`
 */
import { REQUEST_LIMITS } from "@/lib/constants";
import { getRoom } from "@/lib/space";
import { diffDaysInclusive, formatKoDate, isRealYmd } from "@/lib/rules/ymd";

export type ScheduleSession = { date: string; startTime: string; endTime: string };

type Params = { get(name: string): string | null };

const HM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const HM4 = /^([01]\d|2[0-3])([0-5]\d)$/;

function isHm(v: string): boolean {
  return HM.test(v);
}

function hm4ToHm(v: string): string | null {
  const m = HM4.exec(v);
  return m ? `${m[1]}:${m[2]}` : null;
}

/** 회차 정렬(날짜 → 시작) + 같은 회차 중복 제거 */
export function normalizeSessions(list: readonly ScheduleSession[]): ScheduleSession[] {
  const uniq = new Map<string, ScheduleSession>();
  for (const s of list) uniq.set(`${s.date}|${s.startTime}|${s.endTime}`, { date: s.date, startTime: s.startTime, endTime: s.endTime });
  return Array.from(uniq.values()).sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
}

/** "2026-11-07_1400-1600" 1개 → 회차(형식이 틀리면 null) */
export function parseSessionToken(token: string): ScheduleSession | null {
  const m = /^(\d{4}-\d{2}-\d{2})_(\d{4})-(\d{4})$/.exec(token.trim());
  if (!m) return null;
  const date = m[1];
  const startTime = hm4ToHm(m[2]);
  const endTime = hm4ToHm(m[3]);
  if (!isRealYmd(date) || !startTime || !endTime) return null;
  if (startTime >= endTime) return null;
  return { date, startTime, endTime };
}

/** 회차 목록 → `s=` 값 */
export function encodeSessions(list: readonly ScheduleSession[]): string {
  return normalizeSessions(list)
    .map((s) => `${s.date}_${s.startTime.replace(":", "")}-${s.endTime.replace(":", "")}`)
    .join(",");
}

/** `s=` 값 → 회차 목록(하나라도 틀리면 null · 최대 BATCH_MAX_SESSIONS) */
export function decodeSessions(value: string | null | undefined): ScheduleSession[] | null {
  const v = String(value ?? "").trim();
  if (!v) return null;
  const parts = v.split(",").filter(Boolean);
  if (!parts.length || parts.length > REQUEST_LIMITS.BATCH_MAX_SESSIONS) return null;
  const out: ScheduleSession[] = [];
  for (const p of parts) {
    const s = parseSessionToken(p);
    if (!s) return null;
    out.push(s);
  }
  return normalizeSessions(out);
}

export type ParsedApplySchedule =
  | { kind: "lecture"; roomId: string; sessions: ScheduleSession[]; legacy: boolean }
  | { kind: "gallery"; startDate: string; endDate: string; prepDate: string | null }
  | { kind: "invalid"; roomId: string | null; reason: "NO_ROOM" | "UNKNOWN_ROOM" | "BAD_SCHEDULE" | "NO_SCHEDULE" };

/**
 * `/apply` 쿼리 해석 — 새 주소(`s=`)와 예전 주소(`date&start&end`)를 같은 모양으로.
 * 형식만 본다(지난 날짜·운영시간·겹침은 신청서의 planLecture와 서버가 판단).
 */
export function parseApplySchedule(params: Params): ParsedApplySchedule {
  const roomIdRaw = (params.get("roomId") ?? "").trim();
  const category = (params.get("category") ?? "").trim();
  const roomId = roomIdRaw || (category === "gallery" ? "gallery" : "");
  if (!roomId) return { kind: "invalid", roomId: null, reason: "NO_ROOM" };
  const room = getRoom(roomId);
  if (!room) return { kind: "invalid", roomId: null, reason: "UNKNOWN_ROOM" };

  if (room.category === "gallery") {
    const startDate = (params.get("startDate") ?? "").trim();
    const endDate = (params.get("endDate") ?? "").trim();
    const prep = (params.get("prepDate") ?? "").trim();
    // 일정 없이 들어온 예전 주소(/apply?roomId=gallery)는 오류 문구 없이 기간 고르기로(3-4 검수 L-3)
    if (!startDate && !endDate) return { kind: "invalid", roomId, reason: "NO_SCHEDULE" };
    if (!isRealYmd(startDate) || !isRealYmd(endDate) || endDate < startDate) {
      return { kind: "invalid", roomId, reason: "BAD_SCHEDULE" };
    }
    if (diffDaysInclusive(startDate, endDate) > REQUEST_LIMITS.GALLERY_MAX_EXHIBITION_DAYS) {
      return { kind: "invalid", roomId, reason: "BAD_SCHEDULE" };
    }
    const prepDate = isRealYmd(prep) && prep < startDate ? prep : null;
    return { kind: "gallery", startDate, endDate, prepDate };
  }

  const s = params.get("s");
  if (s !== null && s.trim() !== "") {
    const sessions = decodeSessions(s);
    if (!sessions) return { kind: "invalid", roomId, reason: "BAD_SCHEDULE" };
    return { kind: "lecture", roomId, sessions, legacy: false };
  }

  // 예전 주소: date&start&end → 1회차
  const date = (params.get("date") ?? "").trim();
  const start = (params.get("start") ?? "").trim();
  const end = (params.get("end") ?? "").trim();
  if (isRealYmd(date) && isHm(start) && isHm(end) && start < end) {
    return { kind: "lecture", roomId, sessions: [{ date, startTime: start, endTime: end }], legacy: true };
  }
  if (!s && !date && !start && !end) return { kind: "invalid", roomId, reason: "NO_SCHEDULE" };
  return { kind: "invalid", roomId, reason: "BAD_SCHEDULE" };
}

/** 3단계(신청서) 주소 */
export function applyHrefForSessions(roomId: string, sessions: readonly ScheduleSession[]): string {
  const qs = new URLSearchParams({ roomId, s: encodeSessions(sessions) });
  return `/apply?${qs.toString()}`;
}

export function applyHrefForGallery(startDate: string, endDate: string, prepDate?: string | null): string {
  const qs = new URLSearchParams({ roomId: "gallery", startDate, endDate });
  if (prepDate) qs.set("prepDate", prepDate);
  return `/apply?${qs.toString()}`;
}

/** 2단계(날짜 고르기)로 — 고른 일정을 그대로 들고 간다 */
export function spaceHrefWithSessions(roomId: string, sessions: readonly ScheduleSession[]): string {
  if (!sessions.length) return `/space/${encodeURIComponent(roomId)}`;
  return `/space/${encodeURIComponent(roomId)}?${new URLSearchParams({ s: encodeSessions(sessions) }).toString()}`;
}

export function spaceHrefWithPeriod(startDate: string, endDate: string): string {
  return `/space/gallery?${new URLSearchParams({ startDate, endDate }).toString()}`;
}

/** 잘못된 신청서 주소 → 되돌아갈 곳 */
export function fallbackHrefForInvalid(p: Extract<ParsedApplySchedule, { kind: "invalid" }>): string {
  if (!p.roomId) return "/";
  if (p.reason === "NO_SCHEDULE") return `/space/${encodeURIComponent(p.roomId)}`;
  return `/space/${encodeURIComponent(p.roomId)}?err=schedule`;
}

/** "11월 6일(금) 14:00~16:00" */
export function formatSessionLine(s: ScheduleSession): string {
  return `${formatKoDate(s.date)} ${s.startTime}~${s.endTime}`;
}

/** 고정 바 요약 "11월 6일(금) 14:00~16:00 외 2회" */
export function formatSessionsSummary(list: readonly ScheduleSession[]): string {
  if (!list.length) return "";
  const first = formatSessionLine(list[0]);
  return list.length > 1 ? `${first} 외 ${list.length - 1}회` : first;
}

/** "11월 10일(화)~11월 13일(금)" */
export function formatPeriod(startDate: string, endDate: string): string {
  if (!startDate) return "";
  if (!endDate || endDate === startDate) return formatKoDate(startDate);
  return `${formatKoDate(startDate)}~${formatKoDate(endDate)}`;
}

/** 회차 시간 합(분) */
export function sessionMinutes(s: ScheduleSession): number {
  const [sh, sm] = s.startTime.split(":").map((v) => parseInt(v, 10));
  const [eh, em] = s.endTime.split(":").map((v) => parseInt(v, 10));
  const d = eh * 60 + em - (sh * 60 + sm);
  return Number.isFinite(d) && d > 0 ? d : 0;
}

/** "6시간" · "1시간 30분" · "30분" */
export function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m}분`;
  return m ? `${h}시간 ${m}분` : `${h}시간`;
}
