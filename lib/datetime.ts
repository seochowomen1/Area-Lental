export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(v => parseInt(v, 10));
  return h * 60 + m;
}

export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const a1 = toMinutes(aStart), a2 = toMinutes(aEnd);
  const b1 = toMinutes(bStart), b2 = toMinutes(bEnd);
  return a1 < b2 && b1 < a2;
}

export function dayOfWeek(dateYmd: string): number {
  const [y, m, d] = dateYmd.split("-").map(v => parseInt(v, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCDay();
}

export function nowIsoSeoul(): string {
  const now = new Date();
  const k = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return k.toISOString();
}

export function todayYmdSeoul(): string {
  const now = new Date();
  const k = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return k.toISOString().slice(0, 10);
}

export function inRangeYmd(date: string, from?: string, to?: string): boolean {
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}
