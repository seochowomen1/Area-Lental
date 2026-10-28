/**
 * audit-fix-3 3-3 — 날짜 유틸 1벌(lib/rules/ymd.ts) 대조 테스트
 * 3-3 이전에 화면·서버에 흩어져 있던 구현(로컬 시간대 Date·UTC·+09:00 파싱 등)과 2024~2028 모든 날짜에서 같은 값인지 확인한다.
 */
import { addDays, addDaysToDate, dayOfWeek, diffDaysInclusive, dowLabel, formatKoDate, isRealYmd, isYmd, kstNow, todayYmdKst } from "@/lib/rules/ymd";
import { addDaysYmd as paymentAddDays, isYmdString, formatDueDateKo } from "@/lib/payment";
import { addDaysYmd as galleryPlanAddDays } from "@/lib/galleryPlan";
import { koMonthDayDow, shortMdDow } from "@/lib/workflow";
import { isYmd as apiIsYmd } from "@/lib/apiResponse";
import { dayOfWeek as datetimeDow, todayYmdSeoul } from "@/lib/datetime";

// ── 3-3 이전 구현 사본 ──
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
/** ApplyGalleryClient (브라우저 로컬 · "T00:00:00" 파싱) */
const oldLocalAddDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const oldLocalDiff = (a: string, b: string) => Math.floor((new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / 86400000) + 1;
const oldLocalDowLabel = (ymd: string) => DOW[new Date(`${ymd}T00:00:00`).getDay()] ?? "";
/** route.ts (+09:00 파싱) */
const oldRouteDiff = (a: string, b: string) => Math.floor((new Date(`${b}T00:00:00+09:00`).getTime() - new Date(`${a}T00:00:00+09:00`).getTime()) / 86400000) + 1;
/** OfflineIntakeForm (로컬 Date(y, m-1, d+n)) */
const oldOifAddDays = (ymd: string, n: number) => {
  const [y, m, d] = ymd.split("-").map((v) => parseInt(v, 10));
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
};
/** route.ts isNonexistentYmd */
const oldNonexistent = (s: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map((v) => parseInt(v, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  return !(dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d);
};

function allDays(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10)); ; t += 86400000) {
    const s = new Date(t).toISOString().slice(0, 10);
    out.push(s);
    if (s >= to) break;
  }
  return out;
}

describe("ymd 대조 — 2024-01-01 ~ 2028-12-31 모든 날짜", () => {
  const days = allDays("2024-01-01", "2028-12-31");
  test("addDays · dowLabel · diffDaysInclusive · dayOfWeek = 예전 구현", () => {
    for (const d of days) {
      for (const n of [-40, -7, -1, 0, 1, 7, 30]) {
        const want = oldLocalAddDays(d, n);
        expect(addDays(d, n)).toBe(want);
        expect(oldOifAddDays(d, n)).toBe(want);
        expect(paymentAddDays(d, n)).toBe(want);
        expect(galleryPlanAddDays(d, n)).toBe(want);
      }
      expect(dowLabel(d)).toBe(oldLocalDowLabel(d));
      expect(dayOfWeek(d)).toBe(new Date(`${d}T00:00:00`).getDay());
      expect(datetimeDow(d)).toBe(dayOfWeek(d));
      const e = addDays(d, 29);
      // 예전 로컬 시간 구현은 서머타임 지역(TZ=LA 등)에서 하루를 덜 셌다 — 새 함수의 30이 맞다(3-3 검수 #2)
      expect(diffDaysInclusive(d, e)).toBe(30);
      expect(diffDaysInclusive(d, e)).toBe(oldRouteDiff(d, e));
      expect(diffDaysInclusive(d, d)).toBe(1);
      expect(isRealYmd(d)).toBe(true);
    }
  });

  test("isYmd·isRealYmd", () => {
    for (const s of ["2026-11-31", "2026-02-29", "2026-13-01", "2026-00-10"]) {
      expect(isYmd(s)).toBe(true);
      expect(isRealYmd(s)).toBe(!oldNonexistent(s));
      expect(isRealYmd(s)).toBe(false);
    }
    expect(isRealYmd("2028-02-29")).toBe(true);
    for (const bad of ["", "2026-1-5", "2026/11/04", "20261104", null, undefined, 20261104]) {
      expect(isYmd(bad)).toBe(false);
      expect(isYmdString(bad)).toBe(false);
      expect(apiIsYmd(bad)).toBe(false);
    }
  });

  test("읽을 수 없는 입력 — addDays '' · dowLabel '' · diff 0 (예전: 예외 또는 NaN 문자열)", () => {
    expect(addDays("", 1)).toBe("");
    expect(addDays("abc", 1)).toBe("");
    expect(dowLabel("")).toBe("");
    expect(diffDaysInclusive("", "2026-11-04")).toBe(0);
  });

  test("표기 함수", () => {
    expect(formatKoDate("2026-11-09")).toBe("11월 9일(월)");
    expect(koMonthDayDow("2026-11-09")).toBe("11월 9일(월)");
    expect(koMonthDayDow("bad")).toBe("bad");
    expect(shortMdDow("2026-11-10")).toBe("11/10(화)");
    expect(formatDueDateKo("2026-10-27")).toBe("2026-10-27(화)");
  });

  test("addDaysToDate = 예전 화면 addDays(Date)", () => {
    const base = new Date(2026, 9, 28);
    for (const n of [-1, 0, 1, 5, 40]) {
      const old = new Date(base.getFullYear(), base.getMonth(), base.getDate() + n);
      expect(addDaysToDate(base, n).getTime()).toBe(old.getTime());
    }
  });

  test("kstNow — UTC 06:00 = KST 15:00 · UTC 15:30 = 다음날 00:30", () => {
    expect(kstNow(new Date("2026-11-04T06:00:00Z"))).toEqual({ ymd: "2026-11-04", hm: "15:00" });
    expect(kstNow(new Date("2026-11-04T15:30:00Z"))).toEqual({ ymd: "2026-11-05", hm: "00:30" });
    expect(todayYmdKst()).toBe(todayYmdSeoul());
  });
});
