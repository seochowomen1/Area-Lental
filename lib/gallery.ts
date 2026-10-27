import { dayOfWeek, toMinutes } from "@/lib/datetime";
import { isHolidayCached, getHolidayNameCached, loadedHolidaySet } from "@/lib/holidays";
import {
  availablePrepDates,
  defaultPrepDate,
  galleryOperatingWindowFor,
  galleryPrepStartAfterExhibitionFor,
  galleryPrepWindowFor,
  planGallery,
} from "@/lib/galleryPlan";
import { GALLERY_RULES } from "@/lib/constants";
import type { BlockTime, RentalRequest, RequestStatus } from "@/lib/types";

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
// ★ 회차·요금 규칙의 단일 출처는 lib/galleryPlan.ts(순수 함수 · 클라이언트 공용). 여기는 서버 공휴일 캐시를 넘기는 래퍼.
export function galleryOperatingWindow(dateYmd: string): GalleryOperatingWindow | null {
  // 공휴일 체크 (ensureHolidaysLoaded() 선행 필요)
  return galleryOperatingWindowFor(dateYmd, loadedHolidaySet());
}

export function validateGalleryOperatingHours(dateYmd: string, startTime: string, endTime: string) {
  const w = galleryOperatingWindow(dateYmd);
  if (!w) {
    const hName = getHolidayNameCached(dateYmd);
    if (hName) return { ok: false as const, message: `공휴일(${hName})은 휴관일로 신청할 수 없습니다.` };
    return { ok: false as const, message: "일요일은 휴관일로 신청할 수 없습니다." };
  }

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
 * 일요일(휴관)·공휴일은 제외하며, 기본 7개까지 반환합니다.
 */
export function getAvailablePrepDates(startDate: string, count = 7): string[] {
  return availablePrepDates(startDate, loadedHolidaySet(), count);
}

/**
 * 기본(자동) 준비일을 계산합니다: 시작일 이전 1일, 일요일·공휴일이면 더 이전
 */
export function getDefaultPrepDate(startDate: string): string {
  return defaultPrepDate(startDate, loadedHolidaySet());
}

// ─── 준비·철거 규정 (2026-10-19) ───

/** 전시 마지막 날 철거 완료 기한 (평일 16:00 · 토요일 11:00). 일요일·공휴일은 null */
export function galleryTeardownDeadline(dateYmd: string): string | null {
  const dow = dayOfWeek(dateYmd);
  if (dow === 0 || isHolidayCached(dateYmd)) return null;
  return dow === 6 ? GALLERY_RULES.TEARDOWN_DEADLINE.SATURDAY : GALLERY_RULES.TEARDOWN_DEADLINE.WEEKDAY;
}

/** 직전 운영일에 전시가 있을 때 준비 가능 시작 시각 (평일 17:00 · 토요일 11:00) */
export function galleryPrepStartAfterExhibition(dateYmd: string): string {
  return galleryPrepStartAfterExhibitionFor(dateYmd);
}

/**
 * 준비일 회차 시간창
 * - 그날 전시가 없으면 운영시간 전체
 * - 전시가 있으면(앞 전시 철거 후) 평일 17:00~ / 토 11:00~ 운영 종료까지
 */
export function galleryPrepWindow(dateYmd: string, afterExhibition: boolean): GalleryOperatingWindow | null {
  return galleryPrepWindowFor(dateYmd, afterExhibition, loadedHolidaySet());
}

/** 기존 신청(접수·승인)들이 점유한 갤러리 날짜 집합 */
export type GalleryOccupancy = {
  /** 전시일(준비일 제외) */
  exhibitionDates: Set<string>;
  /** 각 전시의 마지막 날(철거일) — 이날은 다음 신청의 준비일로 허용 */
  endDates: Set<string>;
  /** 준비일 — 이날은 앞 신청의 마지막 전시일로만 허용 */
  prepDates: Set<string>;
};

const OCCUPANCY_STATUSES: RequestStatus[] = ["접수", "승인"];

/**
 * 갤러리 신청 목록 → 점유 집합 (1행 형식 startDate~endDate + 구형 batch 개별 행 모두 지원)
 * - blocks: 관리자 날짜 범위 차단(내부 전시 등)도 전시로 취급 — 마지막 날은 철거일로 준비 허용
 */
export function buildGalleryOccupancy(requests: RentalRequest[], blocks: BlockTime[] = [], excludeRequestId?: string): GalleryOccupancy {
  const occ: GalleryOccupancy = { exhibitionDates: new Set(), endDates: new Set(), prepDates: new Set() };
  const batchLast = new Map<string, string>();

  for (const b of blocks) {
    if (b.roomId !== "gallery" && b.roomId !== "all") continue;
    if (!b.endDate) continue; // 시간 단위 단일 차단은 전시로 보지 않음
    let cur = b.date;
    let safety = 0;
    while (cur <= b.endDate && safety++ < 400) {
      if (dayOfWeek(cur) !== 0) occ.exhibitionDates.add(cur);
      cur = addDaysYmd(cur, 1);
    }
    occ.endDates.add(b.endDate);
  }

  for (const r of requests) {
    if (r.roomId !== "gallery") continue;
    if (!OCCUPANCY_STATUSES.includes(r.status)) continue;
    if (excludeRequestId && r.requestId === excludeRequestId) continue;

    if (!r.batchId && r.startDate && r.endDate) {
      let cur = r.startDate;
      let safety = 0;
      while (cur <= r.endDate && safety++ < 400) {
        if (dayOfWeek(cur) !== 0) occ.exhibitionDates.add(cur);
        cur = addDaysYmd(cur, 1);
      }
      occ.endDates.add(r.endDate);
      if (r.galleryPrepDate) occ.prepDates.add(r.galleryPrepDate);
      continue;
    }

    // 구형(batch) 개별 행
    if (r.isPrepDay) {
      occ.prepDates.add(r.date);
      continue;
    }
    occ.exhibitionDates.add(r.date);
    if (r.batchId) {
      const prev = batchLast.get(r.batchId);
      if (!prev || r.date > prev) batchLast.set(r.batchId, r.date);
    } else {
      occ.endDates.add(r.date);
    }
  }
  for (const d of batchLast.values()) occ.endDates.add(d);
  return occ;
}

/**
 * 규정에 따른 날짜 충돌 판정
 * - 준비일: 다른 신청의 준비일과 겹치면 충돌 · 다른 전시 기간 중이면 충돌(단, 그 전시의 마지막 날은 철거 후 준비 허용)
 * - 전시일: 다른 전시일과 겹치면 충돌 · 다른 신청의 준비일과 겹치면 우리 마지막 날일 때만 허용
 */
export function galleryDateConflicts(occ: GalleryOccupancy, date: string, kind: "prep" | "exhibition", ourEndDate?: string): boolean {
  if (kind === "prep") {
    if (occ.prepDates.has(date)) return true;
    return occ.exhibitionDates.has(date) && !occ.endDates.has(date);
  }
  if (occ.exhibitionDates.has(date)) return true;
  if (occ.prepDates.has(date)) return date !== ourEndDate;
  return false;
}

/** 준비일이 "앞 전시 철거 후" 조건(17:00/11:00 이후)에 해당하는지 */
export function isPrepAfterExhibition(occ: GalleryOccupancy, prepDate: string): boolean {
  return occ.exhibitionDates.has(prepDate) && occ.endDates.has(prepDate);
}

// startDate~endDate(포함) 기반으로 갤러리 회차를 서버가 재생성
// - 일요일 제외
// - 운영시간 자동 부여(요일별)
// - customPrepDate: 사용자가 선택한 준비일 (없으면 자동 계산, "" 이면 준비일 없음)
export function buildGallerySessionsFromPeriod(
  startDate: string,
  endDate: string,
  customPrepDate?: string | null,
  options?: { prepAfterExhibition?: boolean }
): GallerySessionInput[] {
  // customPrepDate: undefined = 자동 계산(하위 호환) · ""/null = 준비일 없음 · 문자열 = 사용자 선택
  return planGallery({
    startDate,
    endDate,
    prepDate: customPrepDate,
    prepAfterExhibition: Boolean(options?.prepAfterExhibition),
    holidays: loadedHolidaySet(),
  }).sessions;
}

/**
 * 갤러리 전시 기간의 통계(일수, 요금)를 한번에 계산합니다.
 * - 준비일, 평일, 토요일 카운트
 * - 총 대관료 계산 (평일 20,000원/일, 토 10,000원/일, 준비일 무료)
 */
export function computeGalleryStats(startDate: string, endDate: string, customPrepDate?: string | null, options?: { prepAfterExhibition?: boolean }): {
  prepDate: string | null;
  weekdayCount: number;
  saturdayCount: number;
  exhibitionDayCount: number;
  totalFeeKRW: number;
} {
  const plan = planGallery({
    startDate,
    endDate,
    prepDate: customPrepDate,
    prepAfterExhibition: Boolean(options?.prepAfterExhibition),
    holidays: loadedHolidaySet(),
  });
  return {
    prepDate: plan.prepDate,
    weekdayCount: plan.weekdayCount,
    saturdayCount: plan.saturdayCount,
    exhibitionDayCount: plan.exhibitionDayCount,
    totalFeeKRW: plan.totalFeeKRW,
  };
}
