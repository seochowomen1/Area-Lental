/**
 * 갤러리 이용료 다시 계산 — 서버 전용 (audit-fix-2 R2 · ⑧ Q7 확정)
 *
 * 관리자 상세(서버 렌더)와 서버 액션 recalcGalleryFeeAction이 같은 함수(getGalleryRecalcView)를 쓴다.
 * - 대상: 신청 당시 공휴일 조회가 unavailable(강한 안내) 또는 fallback(약한 안내)인 갤러리 건
 *   (galleryAuditJson.holidayCheck 값 없음 = ok 로 간주 · 소급 없음)
 * - 다시 계산 허용 상태: 접수, 또는 승인이면서 결제 안내 전(paymentNoticeSentAt 없음 · 결제완료/환불 기록 없음)
 * - 일괄 다시 계산은 만들지 않는다(1건 단위).
 */

import type { RentalRequest } from "@/lib/types";
import { dayOfWeek } from "@/lib/datetime";
import { computeBaseTotalKRW } from "@/lib/pricing";
import { planGallery } from "@/lib/galleryPlan";
import {
  ensureHolidaysForRange,
  getHolidayNameCached,
  isHolidayStatus,
  loadedHolidaySet,
  type HolidayStatus,
} from "@/lib/holidays";

const DOW = ["일", "월", "화", "수", "목", "금", "토"] as const;

export type GalleryFeeCounts = {
  weekdayCount: number;
  saturdayCount: number;
  exhibitionDayCount: number;
  feeKRW: number;
};

export type GalleryRecalcBlockReason = "notAllowedStatus" | "holidayUnavailable" | "noChange" | "noBanner";

export type GalleryRecalcView = {
  /** 신청 당시 공휴일 조회 상태(값 없음 = ok) */
  holidayCheck: HolidayStatus;
  /** 상세 맨 위 배너를 보일지 — unavailable 또는 fallback */
  showBanner: boolean;
  /** strong = unavailable(③-F-3) · weak = fallback(내장표로 계산됨 — 임시공휴일 빠졌을 수 있음) · null = 배너 없음 */
  bannerLevel: "strong" | "weak" | null;
  /** 지금 다시 조회한 상태 — unavailable이면 ③-F-6 */
  nowStatus: HolidayStatus;
  /** 전시 기간 중 공휴일(일요일 제외) — label 예: "12/25(금) 기독탄신일" */
  periodHolidays: Array<{ date: string; name: string; label: string }>;
  /** 상태 조건(접수 · 결제 안내 전 승인) 충족 — false면 버튼 대신 ③-F-5 */
  statusAllowed: boolean;
  /** 버튼을 보여도 되는지(= 서버 액션이 성공할 조건) */
  canRecalc: boolean;
  /** canRecalc=false인 이유 */
  blockReason: GalleryRecalcBlockReason | null;
  before: GalleryFeeCounts;
  /** 지금 공휴일로 계산한 값 — nowStatus=unavailable이면 null */
  after: GalleryFeeCounts | null;
  startDate: string;
  endDate: string;
  /** 이미 다시 계산한 건이면 그 시각 */
  recalculatedAt: string | null;
};

/** galleryAuditJson 파싱 — 깨졌으면 {} */
export function parseGalleryAudit(json: string | undefined | null): Record<string, unknown> {
  if (!json) return {};
  try {
    const v = JSON.parse(json);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** 신청 당시 공휴일 조회 상태 — 값 없음·알 수 없는 값 = ok(소급 없음) */
export function galleryHolidayCheckOf(req: Pick<RentalRequest, "galleryAuditJson">): HolidayStatus {
  const v = parseGalleryAudit(req.galleryAuditJson).holidayCheck;
  return isHolidayStatus(v) ? v : "ok";
}

/** ⑧ Q7: 접수, 또는 승인이면서 결제 안내 전 */
export function galleryRecalcStatusAllowed(
  req: Pick<RentalRequest, "status" | "paymentNoticeSentAt" | "paymentStatus">
): boolean {
  if (req.paymentStatus === "결제완료" || req.paymentStatus === "환불") return false;
  if (req.status === "접수") return true;
  if (req.status === "승인") return !String(req.paymentNoticeSentAt ?? "").trim();
  return false;
}

function countsOf(req: RentalRequest, w: number, s: number, e: number): GalleryFeeCounts {
  const feeKRW = computeBaseTotalKRW({ ...req, galleryWeekdayCount: w, gallerySaturdayCount: s, galleryExhibitionDayCount: e }).totalFeeKRW;
  return { weekdayCount: w, saturdayCount: s, exhibitionDayCount: e, feeKRW };
}

function holidayLabel(date: string, name: string): string {
  const [, mm, dd] = date.split("-");
  return `${mm}/${dd}(${DOW[dayOfWeek(date)] ?? ""}) ${name}`;
}

/**
 * 관리자 상세용 보기 + 서버 액션 판단 (갤러리 건이 아니면 null)
 * 공휴일을 지금 시점으로 다시 조회한다(24시간 캐시 · 실패 시 내장표).
 */
export async function getGalleryRecalcView(req: RentalRequest): Promise<GalleryRecalcView | null> {
  if (req.roomId !== "gallery") return null;
  const startDate = req.startDate || req.date;
  const endDate = req.endDate || startDate;
  const audit = parseGalleryAudit(req.galleryAuditJson);
  const holidayCheck = galleryHolidayCheckOf(req);
  const bannerLevel = holidayCheck === "unavailable" ? "strong" : holidayCheck === "fallback" ? "weak" : null;
  const statusAllowed = galleryRecalcStatusAllowed(req);

  const before = countsOf(
    req,
    Number(req.galleryWeekdayCount ?? 0),
    Number(req.gallerySaturdayCount ?? 0),
    Number(req.galleryExhibitionDayCount ?? 0)
  );

  const { status: nowStatus } = await ensureHolidaysForRange(startDate, endDate);
  const holidays = loadedHolidaySet();
  const plan = planGallery({ startDate, endDate, prepDate: null, holidays });
  const periodHolidays = plan.excludedHolidays.map((d) => {
    const name = getHolidayNameCached(d) ?? "공휴일";
    return { date: d, name, label: holidayLabel(d, name) };
  });
  const after = nowStatus === "unavailable" ? null : countsOf(req, plan.weekdayCount, plan.saturdayCount, plan.exhibitionDayCount);

  let blockReason: GalleryRecalcBlockReason | null = null;
  if (!bannerLevel) blockReason = "noBanner";
  else if (!statusAllowed) blockReason = "notAllowedStatus";
  else if (!after) blockReason = "holidayUnavailable";
  else if (
    after.weekdayCount === before.weekdayCount &&
    after.saturdayCount === before.saturdayCount &&
    after.exhibitionDayCount === before.exhibitionDayCount
  ) blockReason = "noChange";

  return {
    holidayCheck,
    showBanner: Boolean(bannerLevel),
    bannerLevel,
    nowStatus,
    periodHolidays,
    statusAllowed,
    canRecalc: blockReason === null,
    blockReason,
    before,
    after,
    startDate,
    endDate,
    recalculatedAt: typeof audit.recalculatedAt === "string" ? audit.recalculatedAt : null,
  };
}
