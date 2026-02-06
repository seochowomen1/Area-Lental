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
// - 화요일: 09:00~18:00 + 18:00~21:00
// - 토요일: 09:00~13:00
// - 일요일: 휴관
export function galleryOperatingWindows(dateYmd: string): GalleryOperatingWindow[] {
  const dow = dayOfWeek(dateYmd); // 0 Sun ... 6 Sat
  if (dow === 0) return [];
  if (dow === 2) return [{ startTime: "09:00", endTime: "18:00" }, { startTime: "18:00", endTime: "21:00" }];
  if (dow === 6) return [{ startTime: "09:00", endTime: "13:00" }];
  return [{ startTime: "09:00", endTime: "18:00" }];
}

/** @deprecated Use galleryOperatingWindows instead (returns array for Tuesday support) */
export function galleryOperatingWindow(dateYmd: string): GalleryOperatingWindow | null {
  const windows = galleryOperatingWindows(dateYmd);
  return windows[0] ?? null;
}

export function validateGalleryOperatingHours(dateYmd: string, startTime: string, endTime: string) {
  const windows = galleryOperatingWindows(dateYmd);
  if (windows.length === 0) return { ok: false as const, message: "일요일은 휴관일로 신청할 수 없습니다." };

  const s = toMinutes(startTime);
  const e = toMinutes(endTime);
  if (!Number.isFinite(s) || !Number.isFinite(e) || !(s < e)) {
    return { ok: false as const, message: "시작/종료 시간이 올바르지 않습니다." };
  }

  const inAny = windows.some((w) => {
    const ws = toMinutes(w.startTime);
    const we = toMinutes(w.endTime);
    return ws <= s && e <= we;
  });
  if (inAny) return { ok: true as const };

  const dow = dayOfWeek(dateYmd);
  if (dow === 2) return { ok: false as const, message: "화요일 운영시간(09:00~18:00, 18:00~21:00) 내에서만 신청 가능합니다." };
  if (dow === 6) return { ok: false as const, message: "토요일 운영시간(09:00~13:00) 내에서만 신청 가능합니다." };
  return { ok: false as const, message: "평일 운영시간(09:00~18:00) 내에서만 신청 가능합니다." };
}

function addDaysYmd(dateYmd: string, deltaDays: number): string {
  const [y, m, d] = dateYmd.split("-").map((v) => parseInt(v, 10));
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return dt.toISOString().slice(0, 10);
}

// startDate~endDate(포함) 기반으로 갤러리 회차를 서버가 재생성
// - 일요일 제외
// - 운영시간 자동 부여(요일별, 화요일은 주간+야간 2개 세션)
// - 준비(세팅)일 1일 무료: 시작일 이전 1일, 일요일이면 더 이전
export function buildGallerySessionsFromPeriod(startDate: string, endDate: string): GallerySessionInput[] {
  const sessions: GallerySessionInput[] = [];

  // 준비(세팅)일
  let prep = addDaysYmd(startDate, -1);
  while (dayOfWeek(prep) === 0) prep = addDaysYmd(prep, -1);

  const prepWindows = galleryOperatingWindows(prep);
  for (const w of prepWindows) {
    sessions.push({ date: prep, startTime: w.startTime, endTime: w.endTime, isPrepDay: true });
  }

  // 전시 기간
  let cur = startDate;
  let safety = 0;
  while (cur <= endDate) {
    const windows = galleryOperatingWindows(cur);
    for (const w of windows) {
      sessions.push({ date: cur, startTime: w.startTime, endTime: w.endTime });
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
