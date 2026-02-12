import { dayOfWeek, toMinutes } from "@/lib/datetime";

export type GalleryOperatingWindow = { startTime: string; endTime: string };
export type GallerySessionInput = {
  date: string;
  startTime: string;
  endTime: string;
  isPrepDay?: boolean;
};

// 우리동네 갤러리 운영시간(서버 기준)
// - 평일: 09:00~18:00
// - 화요일: 09:00~18:00 + 야간 18:00~20:00 → 통합 09:00~20:00
// - 토요일: 09:00~13:00
// - 일요일: 휴관
export function galleryOperatingWindow(dateYmd: string): GalleryOperatingWindow | null {
  const dow = dayOfWeek(dateYmd); // 0 Sun ... 6 Sat
  if (dow === 0) return null;
  if (dow === 2) return { startTime: "09:00", endTime: "20:00" };
  if (dow === 6) return { startTime: "09:00", endTime: "13:00" };
  return { startTime: "09:00", endTime: "18:00" };
}

export function validateGalleryOperatingHours(dateYmd: string, startTime: string, endTime: string) {
  const w = galleryOperatingWindow(dateYmd);
  if (!w) return { ok: false as const, message: "일요일은 휴관일로 신청할 수 없습니다." };

  const s = toMinutes(startTime);
  const e = toMinutes(endTime);
  if (!Number.isFinite(s) || !Number.isFinite(e) || !(s < e)) {
    return { ok: false as const, message: "시작/종료 시간이 올바르지 않습니다." };
  }

  const ws = toMinutes(w.startTime);
  const we = toMinutes(w.endTime);
  if (ws <= s && e <= we) return { ok: true as const };

  const dow = dayOfWeek(dateYmd);
  if (dow === 2) return { ok: false as const, message: "화요일 운영시간(09:00~20:00) 내에서만 신청 가능합니다." };
  if (dow === 6) return { ok: false as const, message: "토요일 운영시간(09:00~13:00) 내에서만 신청 가능합니다." };
  return { ok: false as const, message: "평일 운영시간(09:00~18:00) 내에서만 신청 가능합니다." };
}

function addDaysYmd(dateYmd: string, deltaDays: number): string {
  const [y, m, d] = dateYmd.split("-").map((v) => parseInt(v, 10));
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return dt.toISOString().slice(0, 10);
}

/**
 * 전시 시작일 기준으로 선택 가능한 준비일 후보를 반환합니다.
 * 일요일(휴관)은 제외하며, 기본 3개까지 반환합니다.
 */
export function getAvailablePrepDates(startDate: string, count = 3): string[] {
  const dates: string[] = [];
  let cur = addDaysYmd(startDate, -1);
  let safety = 0;
  while (dates.length < count && safety++ < 30) {
    if (dayOfWeek(cur) !== 0) {
      dates.push(cur);
    }
    cur = addDaysYmd(cur, -1);
  }
  return dates;
}

/**
 * 기본(자동) 준비일을 계산합니다: 시작일 이전 1일, 일요일이면 더 이전
 */
export function getDefaultPrepDate(startDate: string): string {
  let prep = addDaysYmd(startDate, -1);
  while (dayOfWeek(prep) === 0) prep = addDaysYmd(prep, -1);
  return prep;
}

// startDate~endDate(포함) 기반으로 갤러리 회차를 서버가 재생성
// - 일요일 제외
// - 운영시간 자동 부여(요일별)
// - customPrepDate: 사용자가 선택한 준비일 (없으면 자동 계산, "" 이면 준비일 없음)
export function buildGallerySessionsFromPeriod(startDate: string, endDate: string, customPrepDate?: string | null): GallerySessionInput[] {
  const sessions: GallerySessionInput[] = [];

  // 준비(세팅)일 결정
  let prep: string | null = null;
  if (customPrepDate === undefined) {
    // 미지정 시 자동 계산 (하위 호환)
    prep = getDefaultPrepDate(startDate);
  } else if (customPrepDate) {
    // 사용자 선택
    prep = customPrepDate;
  }
  // customPrepDate === "" 또는 null → 준비일 없음

  if (prep) {
    const prepWin = galleryOperatingWindow(prep);
    if (prepWin) {
      sessions.push({ date: prep, startTime: prepWin.startTime, endTime: prepWin.endTime, isPrepDay: true });
    }
  }

  // 전시 기간
  let cur = startDate;
  let safety = 0;
  while (cur <= endDate) {
    const win = galleryOperatingWindow(cur);
    if (win) {
      sessions.push({ date: cur, startTime: win.startTime, endTime: win.endTime });
    }
    cur = addDaysYmd(cur, 1);
    safety += 1;
    if (safety > 5000) break; // 기술 안전장치
  }

  // 전시일이 없는 케이스 방지(준비일만 남는 케이스)
  const hasExhibitionDay = sessions.some((s) => !s.isPrepDay);
  if (!hasExhibitionDay) return [];

  return sessions;
}

/**
 * 갤러리 전시 기간의 통계(일수, 요금)를 한번에 계산합니다.
 * - 준비일, 평일, 토요일 카운트
 * - 총 대관료 계산 (평일 20,000원/일, 토 10,000원/일, 준비일 무료)
 */
export function computeGalleryStats(startDate: string, endDate: string, customPrepDate?: string | null): {
  prepDate: string | null;
  weekdayCount: number;
  saturdayCount: number;
  exhibitionDayCount: number;
  totalFeeKRW: number;
} {
  const sessions = buildGallerySessionsFromPeriod(startDate, endDate, customPrepDate);
  const prep = sessions.find((s) => s.isPrepDay);
  const exhibition = sessions.filter((s) => !s.isPrepDay);

  let weekdayCount = 0;
  let saturdayCount = 0;
  for (const s of exhibition) {
    const dow = dayOfWeek(s.date);
    if (dow === 6) saturdayCount++;
    else if (dow >= 1 && dow <= 5) weekdayCount++;
  }

  const totalFeeKRW = weekdayCount * 20000 + saturdayCount * 10000;

  return {
    prepDate: prep?.date ?? null,
    weekdayCount,
    saturdayCount,
    exhibitionDayCount: exhibition.length,
    totalFeeKRW,
  };
}
