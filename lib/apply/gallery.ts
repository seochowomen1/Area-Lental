/**
 * 갤러리 신청서 — 철수 시간 후보 (audit-fix-3 3-4 · 02_ui_apply §3)
 */
import { GALLERY_RULES } from "@/lib/constants";
import { dayOfWeek, isYmd } from "@/lib/rules/ymd";

/** 전시 마지막 날 철거 기한(평일 16:00 · 토요일 11:00) */
export function teardownDeadline(endDate: string): string {
  return dayOfWeek(endDate) === 6 ? GALLERY_RULES.TEARDOWN_DEADLINE.SATURDAY : GALLERY_RULES.TEARDOWN_DEADLINE.WEEKDAY;
}

/** 09:00부터 기한까지 30분 간격 */
export function removalTimeOptions(endDate: string): string[] {
  if (!isYmd(endDate)) return [];
  const [dh, dm] = teardownDeadline(endDate).split(":").map((v) => parseInt(v, 10));
  const out: string[] = [];
  for (let t = 9 * 60; t <= dh * 60 + dm; t += 30) out.push(`${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`);
  return out;
}

