/**
 * 강의실·E-스튜디오 회차 규칙·요금 — 순수 함수 1벌 (audit-fix-3 3-3 · 2026-10-28)
 *
 * 신청서(ApplyClient)와 서버(POST /api/requests)가 이 함수를 같이 쓴다. (갤러리는 lib/galleryPlan.ts)
 * - 서버 전용 모듈(holidays 캐시·DB) import 금지 → 공휴일은 인자(ReadonlySet<"YYYY-MM-DD">)로 받는다.
 * - 요금 공식은 lib/pricing.ts(computeBaseTotalKRW)에만 있다. 여기는 규칙 검사 + pricing 호출을 묶는다.
 * - 문제 문구는 서버가 내보내던 문구와 글자 하나까지 같다(__tests__/lib/lecturePlan.test.ts 대조 테스트).
 *   새로 생긴 것은 "오늘 이미 지난 시각"(nowHm을 넘길 때만) 하나뿐이다.
 */

import { OPERATING_RULES } from "@/lib/config";
import { TIME_CONSTANTS } from "@/lib/constants";
import { overlaps, toMinutes } from "@/lib/datetime";
import { computeBaseTotalKRW } from "@/lib/pricing";
import { getRoom } from "@/lib/space";
import type { RentalRequest } from "@/lib/types";
import { dayOfWeek, isRealYmd, isYmd } from "@/lib/rules/ymd";

export type LectureSessionInput = { date: string; startTime: string; endTime: string };

export type LectureIssueCode =
  /** 날짜 모양이 아니거나 달력에 없는 날짜 */
  | "INVALID_DATE"
  /** 시간 규칙(형식·시작<종료·30분 단위·최소 1시간·최대 N시간) · 오늘 이미 지난 시각 */
  | "SESSION_INVALID"
  /** 오늘(KST) 이전 날짜 */
  | "PAST_DATE"
  /** 일요일·공휴일 휴관 */
  | "CLOSED_DAY"
  /** 운영시간 밖 */
  | "OUT_OF_HOURS"
  /** 같은 날 회차끼리 겹침 */
  | "OVERLAP";

export type LecturePlanIssue = {
  /** 입력 sessions의 위치 */
  index: number;
  date: string;
  startTime: string;
  endTime: string;
  code: LectureIssueCode;
  message: string;
};

export type LecturePlanSession = {
  date: string;
  startTime: string;
  endTime: string;
  /** 0 이상 정수 분(잘못된 시간 = 0) */
  durationMin: number;
  /** 소수 2자리 시간(pricing.computeDurationHours) */
  durationHours: number;
  /** 대관료 — 초과 인원 가산 포함 */
  rentalFeeKRW: number;
  extraHeadcountFeeKRW: number;
  equipmentFeeKRW: number;
  /** 회차 합계 = computeBaseTotalKRW(회차).totalFeeKRW */
  feeKRW: number;
  /** 이 회차의 문제 문구 */
  issues: string[];
};

export type LecturePlan = {
  sessions: LecturePlanSession[];
  /** = computeFeesForBundle(같은 회차들 · 할인 0).totalFeeKRW */
  totalFeeKRW: number;
  rentalFeeKRW: number;
  extraHeadcountFeeKRW: number;
  equipmentFeeKRW: number;
  totalDurationMin: number;
  issues: LecturePlanIssue[];
};

export type LectureOperatingResult =
  | { ok: true }
  | { ok: false; code: "CLOSED_DAY" | "OUT_OF_HOURS"; message: string };

export const SUNDAY_CLOSED_MESSAGE = "일요일은 휴관일로 신청할 수 없습니다.";

export function pastDateMessage(date: string): string {
  return `지난 날짜(${date})는 신청할 수 없습니다.`;
}

export function overlapMessage(date: string): string {
  return `같은 날짜(${date})에 겹치는 시간이 포함되어 있습니다.`;
}

export function invalidDateMessage(date: string): string {
  return isYmd(date) ? `존재하지 않는 날짜입니다(${date}). 날짜를 다시 선택해 주세요.` : "이용일자 형식이 올바르지 않습니다.";
}

function sessionLabel(s: LectureSessionInput): string {
  return `${s.date} ${s.startTime}-${s.endTime}`;
}

export function pastTimeMessage(s: LectureSessionInput): string {
  return `${sessionLabel(s)}: 이미 지난 시간입니다. 다른 시간을 골라 주세요.`;
}

function isHm(s: string): boolean {
  return /^\d{2}:\d{2}$/.test(s);
}

/**
 * 운영 가능 시간대 — 일요일·공휴일 [] · 토 10~12 · 화 10~20 · 그 외 평일 10~17
 */
export function lectureOperatingRanges(
  dateYmd: string,
  holidays: ReadonlySet<string>
): Array<{ start: string; end: string; label: string }> {
  const dow = dayOfWeek(dateYmd);
  if (dow === 0) return [];
  if (holidays.has(dateYmd)) return [];
  if (dow === 6) return [{ ...OPERATING_RULES.saturday, label: "토요일" }];
  if (dow === 2) return [{ ...OPERATING_RULES.tuesday, label: "화요일" }];
  return [{ ...OPERATING_RULES.weekday, label: "평일" }];
}

/**
 * 신청 시간이 운영시간 안인가 (lib/operating.ts validateOperatingHours의 순수 본체 · 문구 동일)
 */
export function lectureOperatingCheck(
  dateYmd: string,
  startTime: string,
  endTime: string,
  holidays: ReadonlySet<string>,
  holidayNames?: ReadonlyMap<string, string>
): LectureOperatingResult {
  const dow = dayOfWeek(dateYmd);
  if (dow === 0) return { ok: false, code: "CLOSED_DAY", message: "일요일은 대관 신청이 불가합니다." };
  if (holidays.has(dateYmd)) {
    const hName = holidayNames?.get(dateYmd) ?? null;
    return { ok: false, code: "CLOSED_DAY", message: hName ? `공휴일(${hName})은 대관 신청이 불가합니다.` : "공휴일은 대관 신청이 불가합니다." };
  }

  const s = toMinutes(startTime);
  const e = toMinutes(endTime);
  if (!(s < e)) return { ok: false, code: "OUT_OF_HOURS", message: "종료 시간이 시작 시간보다 빠를 수 없습니다." };

  const ranges = lectureOperatingRanges(dateYmd, holidays);
  if (ranges.length === 0) return { ok: false, code: "OUT_OF_HOURS", message: "운영 시간이 없습니다." };

  const inAny = ranges.some((r) => toMinutes(r.start) <= s && e <= toMinutes(r.end));
  if (inAny) return { ok: true };

  if (dow === 6) return { ok: false, code: "OUT_OF_HOURS", message: "토요일 운영시간(10:00~12:00) 내에서만 신청 가능합니다." };
  if (dow === 2) return { ok: false, code: "OUT_OF_HOURS", message: "화요일 운영시간(10:00~20:00) 내에서만 신청 가능합니다." };
  return { ok: false, code: "OUT_OF_HOURS", message: "평일 운영시간(10:00~17:00) 내에서만 신청 가능합니다." };
}

/**
 * 회차 시간 규칙(30분 단위·최소 1시간·공간 최대 시간) — 예전 route.ts sessionRuleIssues 그대로
 * @param maxHours 공간 최대 시간(0이면 TIME_CONSTANTS.MAX_RENTAL_MINUTES)
 */
export function sessionRuleIssues(s: LectureSessionInput, maxHours: number): string[] {
  const label = sessionLabel(s);
  if (!isHm(s.startTime) || !isHm(s.endTime)) {
    return [`${label}: 시작/종료 시간이 올바르지 않습니다.`];
  }
  const sMin = toMinutes(s.startTime);
  const eMin = toMinutes(s.endTime);
  if (sMin >= eMin) return [`${label}: 종료 시간은 시작 시간보다 늦어야 합니다.`];
  const out: string[] = [];
  const step = TIME_CONSTANTS.TIME_SLOT_INTERVAL;
  if (sMin % step !== 0 || eMin % step !== 0) out.push(`${label}: 시간은 30분 단위로만 선택할 수 있습니다.`);
  const diff = eMin - sMin;
  if (diff < TIME_CONSTANTS.MIN_RENTAL_MINUTES) out.push(`${label}: 최소 1시간 이상 선택해야 합니다.`);
  const limitHours = maxHours > 0 ? maxHours : TIME_CONSTANTS.MAX_RENTAL_MINUTES / 60;
  if (diff > limitHours * 60) out.push(`${label}: 한 회차는 최대 ${limitHours}시간까지 신청할 수 있습니다.`);
  return out;
}

/**
 * 같은 날짜 회차끼리 겹침 — 날짜가 처음 나온 순서대로, 날짜마다 시작 시각 순 첫 겹침(뒤 회차) 1건
 * (예전 route.ts "같은 날짜 내 회차끼리 겹침 방지" 루프 그대로 · 갤러리 회차에도 서버가 쓴다)
 */
export function selfOverlaps(list: readonly LectureSessionInput[]): Array<LectureSessionInput & { index: number }> {
  const byDate = new Map<string, number[]>();
  list.forEach((s, i) => {
    const arr = byDate.get(s.date) ?? [];
    arr.push(i);
    byDate.set(s.date, arr);
  });
  const out: Array<LectureSessionInput & { index: number }> = [];
  for (const idxs of byDate.values()) {
    const sorted = idxs.slice().sort((a, b) => list[a].startTime.localeCompare(list[b].startTime));
    for (let k = 1; k < sorted.length; k++) {
      const prev = list[sorted[k - 1]];
      const cur = list[sorted[k]];
      if (overlaps(prev.startTime, prev.endTime, cur.startTime, cur.endTime)) {
        out.push({ date: cur.date, startTime: cur.startTime, endTime: cur.endTime, index: sorted[k] });
        break;
      }
    }
  }
  return out;
}

/**
 * 강의실·E-스튜디오 회차들 →회차별 {시간·요금·문제} · 합계 · 전체 문제
 *
 * 문제 검사(회차마다, 위에서 아래로):
 *  1) INVALID_DATE — 이후 검사 생략
 *  2) SESSION_INVALID — 시간 규칙. 형식 오류·시작≥종료가 아니면 nowHm이 있을 때 "오늘 지난 시각"도
 *  3) PAST_DATE — 오늘 이전 날짜
 *  4) CLOSED_DAY(일요일·공휴일) / OUT_OF_HOURS — 시간 규칙 문제가 없는 회차만
 *  5) OVERLAP — 같은 날 회차끼리(날짜마다 첫 겹침 1건 · 맨 뒤에 붙음)
 */
export function planLecture(args: {
  roomId: string;
  sessions: readonly LectureSessionInput[];
  headcount?: number;
  equipment?: Partial<RentalRequest["equipment"]>;
  holidays: ReadonlySet<string>;
  holidayNames?: ReadonlyMap<string, string>;
  todayYmd: string;
  nowHm?: string;
}): LecturePlan {
  const { roomId, holidays, holidayNames, todayYmd } = args;
  const room = getRoom(roomId);
  const maxHours = room?.durationLimitHours ?? 0;
  const nowMin = args.nowHm && isHm(args.nowHm) ? toMinutes(args.nowHm) : null;
  const equipment: RentalRequest["equipment"] = {
    laptop: false,
    projector: false,
    audio: false,
    ...(args.equipment ?? {}),
  } as RentalRequest["equipment"];

  const issues: LecturePlanIssue[] = [];
  const sessions: LecturePlanSession[] = args.sessions.map((s0, index) => {
    const s: LectureSessionInput = { date: s0.date, startTime: s0.startTime, endTime: s0.endTime };
    const mine: LecturePlanIssue[] = [];
    const push = (code: LectureIssueCode, message: string) =>
      mine.push({ index, date: s.date, startTime: s.startTime, endTime: s.endTime, code, message });

    if (!isRealYmd(s.date)) {
      push("INVALID_DATE", invalidDateMessage(s.date));
    } else {
      const rule = sessionRuleIssues(s, maxHours);
      for (const m of rule) push("SESSION_INVALID", m);
      const timesUsable = isHm(s.startTime) && isHm(s.endTime) && toMinutes(s.startTime) < toMinutes(s.endTime);
      if (timesUsable && nowMin !== null && s.date === todayYmd && toMinutes(s.startTime) < nowMin) {
        push("SESSION_INVALID", pastTimeMessage(s));
      }
      if (s.date < todayYmd) push("PAST_DATE", pastDateMessage(s.date));
      if (rule.length === 0) {
        if (dayOfWeek(s.date) === 0) {
          push("CLOSED_DAY", SUNDAY_CLOSED_MESSAGE);
        } else {
          const op = lectureOperatingCheck(s.date, s.startTime, s.endTime, holidays, holidayNames);
          if (!op.ok) push(op.code, op.message);
        }
      }
    }
    issues.push(...mine);

    // 요금 — 공식은 lib/pricing.ts 한 곳
    const fee = computeBaseTotalKRW({
      roomId,
      date: s.date,
      startTime: s.startTime,
      endTime: s.endTime,
      equipment,
      headcount: args.headcount,
    });
    // 예전 신청서 화면과 같은 방식(toMinutes 차이 · "9:00"처럼 형식이 느슨해도 계산)
    const rawMin = toMinutes(s.endTime) - toMinutes(s.startTime);
    return {
      ...s,
      durationMin: Number.isFinite(rawMin) && rawMin > 0 ? rawMin : 0,
      durationHours: fee.durationHours,
      rentalFeeKRW: fee.rentalFeeKRW,
      extraHeadcountFeeKRW: fee.extraHeadcountFeeKRW,
      equipmentFeeKRW: fee.equipmentFeeKRW,
      feeKRW: fee.totalFeeKRW,
      issues: mine.map((i) => i.message),
    };
  });

  // 같은 날 회차끼리 겹침 — 날짜가 처음 나온 순서대로, 날짜마다 시작 시각 순 첫 겹침 1건
  const usable = args.sessions
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => isRealYmd(s.date) && isHm(s.startTime) && isHm(s.endTime));
  for (const hit of selfOverlaps(usable.map(({ s }) => s))) {
    const index = usable[hit.index].i;
    const message = overlapMessage(hit.date);
    issues.push({ index, date: hit.date, startTime: hit.startTime, endTime: hit.endTime, code: "OVERLAP", message });
    sessions[index].issues.push(message);
  }

  const sum = (pick: (s: LecturePlanSession) => number) => sessions.reduce((acc, s) => acc + pick(s), 0);
  return {
    sessions,
    totalFeeKRW: Math.max(0, Math.round(sum((s) => s.feeKRW))),
    rentalFeeKRW: Math.round(sum((s) => s.rentalFeeKRW)),
    extraHeadcountFeeKRW: Math.round(sum((s) => s.extraHeadcountFeeKRW)),
    equipmentFeeKRW: Math.round(sum((s) => s.equipmentFeeKRW)),
    totalDurationMin: sum((s) => s.durationMin),
    issues,
  };
}
