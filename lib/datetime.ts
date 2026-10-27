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

/** ISO 날짜 → "YYYY.MM.DD HH:MM" (KST) */
export function fmtCreatedAt(iso: string): string {
  if (!iso) return "-";
  try {
    // createdAt은 nowIsoSeoul()이 이미 KST 시각으로 저장한다 → 시차를 다시 더하지 않는다 (진단 #4)
    const m0 = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
    if (m0) return `${m0[1]}.${m0[2]}.${m0[3]} ${m0[4]}:${m0[5]}`;
    const kst = new Date(iso);
    const y = kst.getUTCFullYear();
    const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
    const d = String(kst.getUTCDate()).padStart(2, "0");
    const h = String(kst.getUTCHours()).padStart(2, "0");
    const min = String(kst.getUTCMinutes()).padStart(2, "0");
    return `${y}.${m}.${d} ${h}:${min}`;
  } catch {
    return iso;
  }
}
