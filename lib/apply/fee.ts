/**
 * 예상 이용료 내역 줄 (audit-fix-3 3-4 · 02_ui_apply §2-5 6 · §3)
 * 금액은 planLecture / planGallery 결과 그대로(여기서 다시 계산하지 않음 — 장비는 회차마다 같은 금액이라 n회 × 단가).
 */
import { GALLERY_FEE_KRW } from "@/lib/constants";
import { formatKoDate } from "@/lib/rules/ymd";
import type { LecturePlan } from "@/lib/rules/lecturePlan";
import type { GalleryPlan } from "@/lib/galleryPlan";
import { equipFee, PUBLIC_EQUIP_LABELS, type ApplyFormValues, type EquipKey } from "@/lib/apply/form";
import { formatMinutes } from "@/lib/apply/schedule";
import { getRoom } from "@/lib/space";

export type FeeLine = { label: string; amount: number | null };

/** 강의실·E-스튜디오 내역 줄 */
export function lectureFeeLines(roomId: string, plan: LecturePlan, values: ApplyFormValues, equipKeys: EquipKey[]): FeeLine[] {
  const n = plan.sessions.length;
  if (!n) return [];
  const room = getRoom(roomId);
  const isStudio = room?.category === "studio";
  const time = formatMinutes(plan.totalDurationMin);
  const lines: FeeLine[] = [];
  if (isStudio) {
    const base = room?.baseHeadcount ?? 2;
    const hc = parseInt(values.headcount, 10);
    const head = Number.isFinite(hc) && hc > 0 ? Math.min(hc, base) : base;
    lines.push({ label: `${n > 1 ? `${n}회 · ` : ""}${time} · ${head}명`, amount: plan.rentalFeeKRW - plan.extraHeadcountFeeKRW });
    if (plan.extraHeadcountFeeKRW > 0 && Number.isFinite(hc)) {
      lines.push({ label: `추가 인원 ${hc - base}명 × ${time}`, amount: plan.extraHeadcountFeeKRW });
    }
  } else {
    lines.push({ label: `강의실 ${n}회 · ${time}`, amount: plan.rentalFeeKRW });
  }
  for (const k of equipKeys) {
    if (!values.equipment[k]) continue;
    lines.push({ label: `${PUBLIC_EQUIP_LABELS[k]} ${n}회`, amount: equipFee(k) * n });
  }
  return lines;
}

/** 갤러리 내역 줄 */
export function galleryFeeLines(plan: GalleryPlan): FeeLine[] {
  const lines: FeeLine[] = [];
  if (plan.weekdayCount) lines.push({ label: `평일 ${plan.weekdayCount}일 × ${GALLERY_FEE_KRW.WEEKDAY.toLocaleString()}원`, amount: plan.weekdayCount * GALLERY_FEE_KRW.WEEKDAY });
  if (plan.saturdayCount) lines.push({ label: `토요일 ${plan.saturdayCount}일 × ${GALLERY_FEE_KRW.SATURDAY.toLocaleString()}원`, amount: plan.saturdayCount * GALLERY_FEE_KRW.SATURDAY });
  if (plan.prepDate) lines.push({ label: `준비일 ${formatKoDate(plan.prepDate)}`, amount: null });
  return lines;
}

