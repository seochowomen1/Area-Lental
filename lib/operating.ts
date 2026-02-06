import { OPERATING_RULES } from "@/lib/config";
import { dayOfWeek, toMinutes, todayYmdSeoul } from "@/lib/datetime";

export type TimeRange = { start: string; end: string; label?: string };

export type DateAvailabilityReasonCode =
  | "PAST"
  | "SUNDAY_CLOSED"
  | "NO_OPERATING_HOURS"
  | "FULLY_BOOKED_OR_BLOCKED"
  | "UNKNOWN";

export type DateAvailabilityReason = {
  code: DateAvailabilityReasonCode;
  message: string;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/**
 * 운영 가능 시간대(시간 범위)를 날짜에 따라 반환합니다.
 * - 일요일(0): 운영 없음
 * - 토요일(6): 10:00~12:00
 * - 화요일(2): 10:00~17:00 + 18:00~20:00
 * - 그 외 평일: 10:00~17:00
 */
export function operatingRangesForDate(dateYmd: string): TimeRange[] {
  const dow = dayOfWeek(dateYmd); // 0=Sun
  if (dow === 0) return [];
  if (dow === 6) return [{ ...OPERATING_RULES.saturday, label: "토요일" }];
  if (dow === 2) {
    return [
      { ...OPERATING_RULES.weekday, label: "화요일(주간)" },
      { ...OPERATING_RULES.tuesdayNight, label: "화요일(야간)" }
    ];
  }
  return [{ ...OPERATING_RULES.weekday, label: "평일" }];
}

/**
 * 운영 가능 시간대(시간 범위)를 요일(0~6) 기준으로 반환합니다.
 * - 0(일): 운영 없음
 * - 6(토): 10:00~12:00
 * - 2(화): 10:00~17:00 + 18:00~20:00
 * - 그 외: 10:00~17:00
 */
export function operatingRangesForDayOfWeek(dow: number): TimeRange[] {
  if (dow === 0) return [];
  if (dow === 6) return [{ ...OPERATING_RULES.saturday, label: "토요일" }];
  if (dow === 2) {
    return [
      { ...OPERATING_RULES.weekday, label: "화요일(주간)" },
      { ...OPERATING_RULES.tuesdayNight, label: "화요일(야간)" }
    ];
  }
  return [{ ...OPERATING_RULES.weekday, label: "평일" }];
}

export type HourSlot = { start: string; end: string };

function fromMinutes(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

/**
 * 날짜(운영 규칙)에 맞는 30분 단위 기본 슬롯을 생성합니다.
 */
export function buildHourSlotsForDate(dateYmd: string): HourSlot[] {
  const ranges = operatingRangesForDate(dateYmd);
  const out: HourSlot[] = [];

  for (const r of ranges) {
    const start = toMinutes(r.start);
    const end = toMinutes(r.end);
    for (let t = start; t < end; t += 30) {
      if (t + 30 <= end) out.push({ start: fromMinutes(t), end: fromMinutes(t + 30) });
    }
  }

  // 중복 제거 + 정렬(화요일 2개 구간 대비)
  const uniq = new Map<string, HourSlot>();
  for (const s of out) uniq.set(`${s.start}-${s.end}`, s);
  return Array.from(uniq.values()).sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
}

/**
 * 신청 시간(시작~종료)이 운영시간 내인지 검증합니다.
 */
export function validateOperatingHours(dateYmd: string, startTime: string, endTime: string): { ok: true } | { ok: false; message: string } {
  const dow = dayOfWeek(dateYmd);
  if (dow === 0) return { ok: false, message: "일요일은 대관 신청이 불가합니다." };

  const s = toMinutes(startTime);
  const e = toMinutes(endTime);
  if (!(s < e)) return { ok: false, message: "종료 시간이 시작 시간보다 빠를 수 없습니다." };

  const ranges = operatingRangesForDate(dateYmd);
  if (ranges.length === 0) return { ok: false, message: "운영 시간이 없습니다." };

  const inAny = ranges.some(r => toMinutes(r.start) <= s && e <= toMinutes(r.end));
  if (inAny) return { ok: true };

  if (dow === 6) return { ok: false, message: "토요일 운영시간(10:00~12:00) 내에서만 신청 가능합니다." };
  if (dow === 2) return { ok: false, message: "화요일 운영시간(10:00~17:00 또는 18:00~20:00) 내에서만 신청 가능합니다." };
  return { ok: false, message: "평일 운영시간(10:00~17:00) 내에서만 신청 가능합니다." };
}

/**
 * 요일 기반 운영시간 검증(관리자 설정의 정규 수업시간 등에 사용)
 */
export function validateOperatingHoursByDayOfWeek(
  dayOfWeek: number,
  startTime: string,
  endTime: string
): { ok: true } | { ok: false; message: string } {
  if (dayOfWeek === 0) return { ok: false, message: "일요일은 운영하지 않습니다." };

  const s = toMinutes(startTime);
  const e = toMinutes(endTime);
  if (!(s < e)) return { ok: false, message: "종료 시간이 시작 시간보다 빠를 수 없습니다." };

  const ranges = operatingRangesForDayOfWeek(dayOfWeek);
  if (ranges.length === 0) return { ok: false, message: "해당 요일은 운영 시간이 없습니다." };

  const inAny = ranges.some((r) => toMinutes(r.start) <= s && e <= toMinutes(r.end));
  if (inAny) return { ok: true };

  if (dayOfWeek === 6) return { ok: false, message: "토요일 운영시간(10:00~12:00) 내에서만 설정 가능합니다." };
  if (dayOfWeek === 2) return { ok: false, message: "화요일 운영시간(10:00~17:00 또는 18:00~20:00) 내에서만 설정 가능합니다." };
  return { ok: false, message: "평일 운영시간(10:00~17:00) 내에서만 설정 가능합니다." };
}

/**
 * 슬롯이 없을 때(또는 표시할 시간이 없을 때) 사용자에게 보여줄 이유를 반환합니다.
 * - 서버에서 사용(일관된 기준)
 */
export function explainNoAvailability(dateYmd: string, opts?: { todayYmd?: string; fullyBooked?: boolean }): DateAvailabilityReason {
  const today = opts?.todayYmd ?? todayYmdSeoul();
  if (dateYmd < today) {
    return { code: "PAST", message: "지난 날짜는 선택할 수 없습니다." };
  }

  const dow = dayOfWeek(dateYmd);
  if (dow === 0) {
    return { code: "SUNDAY_CLOSED", message: "일요일은 휴관으로 대관이 불가합니다." };
  }

  const ranges = operatingRangesForDate(dateYmd);
  if (ranges.length === 0) {
    return { code: "NO_OPERATING_HOURS", message: "해당 날짜는 운영 시간이 없습니다." };
  }

  if (opts?.fullyBooked) {
    return { code: "FULLY_BOOKED_OR_BLOCKED", message: "해당 날짜는 예약이 마감되었거나 운영 사정으로 신청이 불가합니다." };
  }

  return { code: "UNKNOWN", message: "해당 날짜에 표시할 시간이 없습니다." };
}

function fmtHourToken(t: string) {
  // "10:00" -> "10", "10:30" -> "10:30"
  const [hh, mm] = t.split(":");
  if (mm === "00") return String(parseInt(hh, 10));
  return `${parseInt(hh, 10)}:${mm}`;
}

function fmtRangeShort(start: string, end: string) {
  return `${fmtHourToken(start)}~${fmtHourToken(end)}`;
}

/**
 * 운영시간 안내 문구를 운영 규칙(OPERATING_RULES) 기반으로 자동 생성합니다.
 * 예) "평일 10~17 / 화 18~20 야간 / 토 10~12 (일 휴관)"
 */
export function operatingNoticeText(roomId?: string): string {
  // 갤러리(우리동네 갤러리): 일 단위 전시 대관 운영시간
  // - 평일 09:00~18:00
  // - 화요일 야간 18:00~20:00
  // - 토요일 09:00~13:00
  // - 일요일 및 공휴일 휴관 (공휴일은 실제 차단을 Blocks로 처리)
  if (roomId === "gallery") {
    return "평일 9~18 / 화 야간 18~20 / 토 9~13 (일·공휴일 휴관)";
  }
  const weekday = fmtRangeShort(OPERATING_RULES.weekday.start, OPERATING_RULES.weekday.end);
  const sat = fmtRangeShort(OPERATING_RULES.saturday.start, OPERATING_RULES.saturday.end);
  const tueNight = fmtRangeShort(OPERATING_RULES.tuesdayNight.start, OPERATING_RULES.tuesdayNight.end);
  return `평일 ${weekday} / 화 ${tueNight} 야간 / 토 ${sat} (일 휴관)`;
}

function fmtHourKoreanToken(t: string) {
  // "10:00" -> "10시", "10:30" -> "10시30분"
  const [hh, mm] = t.split(":");
  const h = String(parseInt(hh, 10));
  if (mm === "00") return `${h}시`;
  return `${h}시${mm}분`;
}

function fmtRangeKorean(start: string, end: string) {
  return `${fmtHourKoreanToken(start)}~${fmtHourKoreanToken(end)}`;
}

/**
 * 운영시간 안내를 멀티라인 UI로 렌더링하기 위한 라인 데이터
 * - 운영 규칙(OPERATING_RULES) 기반으로 자동 생성
 */
export function operatingNoticeLines(roomId?: string): Array<{ label: string; text: string }> {
  if (roomId === "gallery") {
    return [
      { label: "평일", text: "9시~18시" },
      { label: "야간", text: "화 18시~20시" },
      { label: "주말", text: "토 9시~13시 (일요일 휴관)" }
    ];
  }

  const weekday = fmtRangeKorean(OPERATING_RULES.weekday.start, OPERATING_RULES.weekday.end);
  const tueNight = fmtRangeKorean(OPERATING_RULES.tuesdayNight.start, OPERATING_RULES.tuesdayNight.end);
  const sat = fmtRangeKorean(OPERATING_RULES.saturday.start, OPERATING_RULES.saturday.end);

  return [
    { label: "평일", text: weekday },
    { label: "야간", text: `화 ${tueNight}` },
    { label: "주말", text: `토 ${sat} (일요일 휴관)` }
  ];
}

/**
 * 화요일 야간(18~20) 운영 구간과 선택한 시간(시작~종료)이 "겹치는지"를 판정합니다.
 * - dateYmd가 화요일이 아니면 false
 * - endTime이 없으면 startTime을 기준으로 판정(점/기본값)
 */
export function isTuesdayNightOverlap(
  dateYmd: string | null | undefined,
  startTime: string | null | undefined,
  endTime: string | null | undefined
): boolean {
  if (!dateYmd || !startTime) return false;
  if (dayOfWeek(dateYmd) !== 2) return false; // Tuesday

  const s = toMinutes(startTime);
  const e = endTime ? toMinutes(endTime) : s;
  if (!Number.isFinite(s) || !Number.isFinite(e)) return false;

  const ns = toMinutes(OPERATING_RULES.tuesdayNight.start);
  const ne = toMinutes(OPERATING_RULES.tuesdayNight.end);

  // overlap: [s,e] with [ns,ne) (end exclusive). If e==s (no end), treat point-in-range.
  if (e === s) return ns <= s && s < ne;
  return s < ne && e > ns;
}
