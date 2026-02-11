import type { RentalRequest } from "@/lib/types";
import { toMinutes, dayOfWeek } from "@/lib/datetime";
import { ROOMS_BY_ID } from "@/lib/space";
import { EQUIPMENT_FEE_KRW, STUDIO_EQUIPMENT_FEE_KRW, LECTURE_EQUIPMENT_LABELS, STUDIO_EQUIPMENT_LABELS } from "@/lib/config";

export type FeeBreakdown = {
  durationHours: number;
  hourlyFeeKRW: number;
  rentalFeeKRW: number;
  equipmentFeeKRW: number;
  totalFeeKRW: number;
  discountRatePct: number;
  discountAmountKRW: number;
  discountReason: string;
  finalFeeKRW: number;
};

export function formatKRW(value: number): string {
  const n = Number.isFinite(value) ? Math.round(value) : 0;
  return `${n.toLocaleString("ko-KR")}원`;
}

export function computeDurationHours(startTime: string, endTime: string): number {
  const diffMin = toMinutes(endTime) - toMinutes(startTime);
  const hours = diffMin / 60;
  if (!Number.isFinite(hours) || hours < 0) return 0;
  return Math.round(hours * 100) / 100;
}

export function computeBaseTotalKRW(
  req: Pick<RentalRequest, "roomId" | "startTime" | "endTime" | "equipment" | "date" | "isPrepDay">
): {
  durationHours: number;
  hourlyFeeKRW: number;
  rentalFeeKRW: number;
  equipmentFeeKRW: number;
  totalFeeKRW: number;
} {
  if (req.roomId === "gallery") {
    // 우리동네 갤러리: 일 단위 과금 (타임존 안전한 dayOfWeek 사용)
    const dow = dayOfWeek(req.date);
    const isSaturday = dow === 6;
    const isSunday = dow === 0;
    const rentalFeeKRW = req.isPrepDay ? 0 : isSunday ? 0 : isSaturday ? 10000 : 20000;
    // 갤러리는 장비/할인 불가 → 장비비 0 고정
    const equipmentFeeKRW = 0;
    const totalFeeKRW = Math.max(0, rentalFeeKRW + equipmentFeeKRW);
    return { durationHours: 0, hourlyFeeKRW: 0, rentalFeeKRW, equipmentFeeKRW, totalFeeKRW };
  }

  const room = ROOMS_BY_ID[req.roomId];
  const hourlyFeeKRW = room?.feeKRW ?? 0;
  const durationHours = computeDurationHours(req.startTime, req.endTime);

  const rentalFeeKRW = Math.round(hourlyFeeKRW * durationHours);

  const isStudio = room?.category === "studio";
  const equipmentFeeKRW = isStudio
    ? (req.equipment?.mirrorless ? STUDIO_EQUIPMENT_FEE_KRW.mirrorless : 0) +
      (req.equipment?.camcorder ? STUDIO_EQUIPMENT_FEE_KRW.camcorder : 0) +
      (req.equipment?.wirelessMic ? STUDIO_EQUIPMENT_FEE_KRW.wirelessMic : 0) +
      (req.equipment?.pinMic ? STUDIO_EQUIPMENT_FEE_KRW.pinMic : 0) +
      (req.equipment?.rodeMic ? STUDIO_EQUIPMENT_FEE_KRW.rodeMic : 0) +
      (req.equipment?.electronicBoard ? STUDIO_EQUIPMENT_FEE_KRW.electronicBoard : 0)
    : (req.equipment?.laptop ? EQUIPMENT_FEE_KRW.laptop : 0) +
      (req.equipment?.projector ? EQUIPMENT_FEE_KRW.projector : 0) +
      (req.equipment?.audio ? EQUIPMENT_FEE_KRW.audio : 0);

  const totalFeeKRW = Math.max(0, rentalFeeKRW + equipmentFeeKRW);
  return { durationHours, hourlyFeeKRW, rentalFeeKRW, equipmentFeeKRW, totalFeeKRW };
}

/**
 * 선택된 장비 상세 목록 (라벨 + 개별 요금)
 */
export function getSelectedEquipmentDetails(
  equipment: RentalRequest["equipment"],
  roomCategory?: "lecture" | "studio" | "gallery"
): { key: string; label: string; feeKRW: number }[] {
  if (!equipment) return [];
  const cat = roomCategory ?? "lecture";
  if (cat === "gallery") return [];

  const result: { key: string; label: string; feeKRW: number }[] = [];

  if (cat === "studio") {
    for (const [key, fee] of Object.entries(STUDIO_EQUIPMENT_FEE_KRW)) {
      if ((equipment as Record<string, boolean | undefined>)[key]) {
        result.push({ key, label: STUDIO_EQUIPMENT_LABELS[key as keyof typeof STUDIO_EQUIPMENT_LABELS], feeKRW: fee });
      }
    }
  } else {
    for (const [key, fee] of Object.entries(EQUIPMENT_FEE_KRW)) {
      if ((equipment as Record<string, boolean | undefined>)[key]) {
        result.push({ key, label: LECTURE_EQUIPMENT_LABELS[key as keyof typeof LECTURE_EQUIPMENT_LABELS], feeKRW: fee });
      }
    }
  }

  return result;
}

/**
 * 선택된 장비 라벨 목록 (요금 없이 이름만)
 */
export function getSelectedEquipmentLabels(
  equipment: RentalRequest["equipment"],
  roomCategory?: "lecture" | "studio" | "gallery"
): string[] {
  return getSelectedEquipmentDetails(equipment, roomCategory).map((e) => e.label);
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function normalizeDiscount(
  totalFeeKRW: number,
  input: { ratePct?: number; amountKRW?: number; mode?: "rate" | "amount" }
): { discountRatePct: number; discountAmountKRW: number } {
  const total = Math.max(0, Math.round(totalFeeKRW));
  const mode =
    input.mode ?? (typeof input.amountKRW === "number" && input.amountKRW > 0 ? "amount" : "rate");

  if (mode === "amount") {
    const amount = clamp(Math.round(Number(input.amountKRW ?? 0)), 0, total);
    const rate = total > 0 ? Math.round((amount / total) * 10000) / 100 : 0;
    return { discountRatePct: rate, discountAmountKRW: amount };
  }

  const rate = clamp(Number(input.ratePct ?? 0), 0, 100);
  const amount = clamp(Math.round((total * rate) / 100), 0, total);
  const fixedRate = total > 0 ? Math.round((amount / total) * 10000) / 100 : 0;
  return { discountRatePct: fixedRate, discountAmountKRW: amount };
}

export function computeFeesForRequest(req: RentalRequest): FeeBreakdown {
  const base = computeBaseTotalKRW(req);

  // 갤러리는 할인/바우처(금액/율) 모두 무시
  const isGallery = req.roomId === "gallery";

  // 묶음 신청(2회차 이상)에서는 할인은 "묶음 총액" 기준으로 적용됩니다.
  // 따라서 회차별 금액 계산에서는 할인 정보를 적용하지 않고, 묶음 합산 계산(computeFeesForBundle)에서만 할인 반영합니다.
  const isBatch = !!req.batchId;
  const ratePct = isBatch || isGallery ? 0 : (req.discountRatePct ?? 0);
  const amountKRW = isBatch || isGallery ? 0 : (req.discountAmountKRW ?? 0);

  const { discountRatePct, discountAmountKRW } = normalizeDiscount(base.totalFeeKRW, {
    ratePct,
    amountKRW,
    mode: amountKRW > 0 ? "amount" : "rate"
  });

  const finalFeeKRW = Math.max(0, base.totalFeeKRW - discountAmountKRW);

  return {
    ...base,
    discountRatePct,
    discountAmountKRW,
    discountReason: isBatch || isGallery ? "" : (req.discountReason ?? ""),
    finalFeeKRW
  };
}

/**
 * 여러 회차(묶음 신청) 요금 계산
 * - 각 회차의 (대관료 + 장비사용료) 합계를 기준으로 할인 적용
 * - 할인 입력값은 첫 번째 요청의 discount 필드를 기준으로 적용
 */
export function computeFeesForBundle(reqs: RentalRequest[]): FeeBreakdown {
  const list = Array.isArray(reqs) ? reqs.filter(Boolean) : [];
  if (list.length === 0) {
    return {
      durationHours: 0,
      hourlyFeeKRW: 0,
      rentalFeeKRW: 0,
      equipmentFeeKRW: 0,
      totalFeeKRW: 0,
      discountRatePct: 0,
      discountAmountKRW: 0,
      discountReason: "",
      finalFeeKRW: 0
    };
  }

  const baseList = list.map((r) => computeBaseTotalKRW(r));
  const totalFeeKRW = baseList.reduce((acc, b) => acc + (b.totalFeeKRW ?? 0), 0);
  const rentalFeeKRW = baseList.reduce((acc, b) => acc + (b.rentalFeeKRW ?? 0), 0);
  const equipmentFeeKRW = baseList.reduce((acc, b) => acc + (b.equipmentFeeKRW ?? 0), 0);
  const durationHours = baseList.reduce((acc, b) => acc + (b.durationHours ?? 0), 0);

  const first = list[0];
  const isGallery = first?.roomId === "gallery";
  const discountSource =
    list.find((r) => (r.discountAmountKRW ?? 0) > 0 || (r.discountRatePct ?? 0) > 0 || String(r.discountReason ?? "").trim() !== "") ??
    first;

  const { discountRatePct, discountAmountKRW } = normalizeDiscount(totalFeeKRW, {
    ratePct: isGallery ? 0 : (discountSource.discountRatePct ?? 0),
    amountKRW: isGallery ? 0 : (discountSource.discountAmountKRW ?? 0),
    mode: isGallery ? "rate" : (discountSource.discountAmountKRW ?? 0) > 0 ? "amount" : "rate"
  });

  const finalFeeKRW = Math.max(0, Math.round(totalFeeKRW) - discountAmountKRW);

  return {
    durationHours: Math.round(durationHours * 100) / 100,
    hourlyFeeKRW: 0,
    rentalFeeKRW: Math.round(rentalFeeKRW),
    equipmentFeeKRW: Math.round(equipmentFeeKRW),
    totalFeeKRW: Math.max(0, Math.round(totalFeeKRW)),
    discountRatePct,
    discountAmountKRW,
    discountReason: isGallery ? "" : (discountSource.discountReason ?? ""),
    finalFeeKRW
  };
}
