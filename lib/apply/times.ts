/**
 * 2단계 시간 고르기 — 시작·끝 후보 (audit-fix-3 3-4 · 02_ui_apply §2-3 · P-11)
 * /api/availability 30분 칸(slots)에서: 연속 60분 이상 비어야 시작 가능 · 공간 최대 시간까지 · 오늘 지난 시각은 비활성
 */
import type { ScheduleSession } from "@/lib/apply/schedule";

export type Slot = { start: string; end: string; available: boolean };

export function toMin(hm: string): number {
  const [h, m] = hm.split(":").map((v) => parseInt(v, 10));
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : NaN;
}
export function fromMin(n: number): string {
  return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
}
export function isComplete(s: ScheduleSession): boolean {
  return Boolean(s.date && s.startTime && s.endTime);
}

/** 시작 시각 후보(연속 60분 이상 비어 있어야 · 오늘 지난 시각 비활성) */
export function startOptionsFor(slots: Slot[], maxMinutes: number, nowMin: number | null) {
  const map = new Map(slots.map((s) => [s.start, s]));
  const starts = Array.from(new Set(slots.map((s) => s.start))).sort((a, b) => toMin(a) - toMin(b));
  return starts.map((start) => {
    if (nowMin !== null && toMin(start) < nowMin) return { value: start, disabled: true, past: true };
    let total = 0;
    let cur = start;
    for (let g = 0; g < 200; g++) {
      const s = map.get(cur);
      if (!s || !s.available) break;
      total += 30;
      cur = s.end;
      if (total >= maxMinutes) break;
    }
    return { value: start, disabled: total < 60, past: false };
  });
}

export function endOptionsFor(slots: Slot[], start: string, maxMinutes: number): string[] {
  if (!start) return [];
  const map = new Map(slots.map((s) => [s.start, s]));
  let total = 0;
  let cur = start;
  for (let g = 0; g < 200; g++) {
    const s = map.get(cur);
    if (!s || !s.available) break;
    total += 30;
    cur = s.end;
    if (total >= maxMinutes) break;
  }
  const out: string[] = [];
  for (let m = 60; m <= Math.min(total, maxMinutes); m += 30) out.push(fromMin(toMin(start) + m));
  return out;
}

