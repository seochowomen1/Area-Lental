/**
 * audit-fix-2 R2 — 공휴일 조회 상태(ok·stale·fallback·unavailable) · 내장 법정공휴일표 2026~2027 · 설정 화면 상태
 */
import { FALLBACK_HOLIDAYS, fallbackHolidaysForMonth } from "@/lib/holidaysFallback";
import { dayOfWeek } from "@/lib/datetime";
import {
  _clearHolidayCache,
  ensureHolidaysForRange,
  ensureHolidaysLoaded,
  getHolidayHealth,
  getHolidaysWithStatus,
  isHolidayCached,
  monthsBetween,
  worstHolidayStatus,
} from "@/lib/holidays";

const realFetch = global.fetch;
const KEY = "DATA_GO_KR_API_KEY";

function apiResponse(items: Array<{ locdate: number; dateName: string }>) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ response: { body: { items: items.length ? { item: items.map((i) => ({ ...i, isHoliday: "Y" })) } : "" } } }),
  } as unknown as Response;
}

beforeEach(() => {
  _clearHolidayCache();
  delete process.env[KEY];
  delete process.env.HOLIDAY_API_KEY;
  global.fetch = jest.fn(async () => {
    throw new Error("network disabled in test");
  }) as unknown as typeof fetch;
});
afterAll(() => {
  global.fetch = realFetch;
  delete process.env[KEY];
});

describe("내장 법정공휴일표", () => {
  test("날짜가 모두 실제 날짜이고 중복 없음", () => {
    const seen = new Set<string>();
    for (const h of FALLBACK_HOLIDAYS) {
      const [y, m, d] = h.date.split("-").map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d));
      expect(dt.toISOString().slice(0, 10)).toBe(h.date);
      expect(seen.has(h.date)).toBe(false);
      seen.add(h.date);
    }
  });

  test("대체공휴일은 모두 월~금", () => {
    for (const h of FALLBACK_HOLIDAYS.filter((x) => x.name.startsWith("대체공휴일"))) {
      const dow = dayOfWeek(h.date);
      expect(dow).toBeGreaterThanOrEqual(1);
      expect(dow).toBeLessThanOrEqual(5);
    }
  });

  test("2026-12는 성탄절, 2028은 표 밖(null)", () => {
    expect(fallbackHolidaysForMonth(2026, 12)).toEqual([{ date: "2026-12-25", name: "기독탄신일" }]);
    expect(fallbackHolidaysForMonth(2027, 2)?.map((h) => h.date)).toEqual(["2027-02-06", "2027-02-07", "2027-02-08", "2027-02-09"]);
    expect(fallbackHolidaysForMonth(2028, 1)).toBeNull();
  });
});

describe("조회 상태", () => {
  test("키 없음 → 내장표(fallback) · 동기 집합에도 반영 · 외부 호출 없음", async () => {
    const r = await getHolidaysWithStatus(2026, 12);
    expect(r.status).toBe("fallback");
    expect(r.holidays.map((h) => h.date)).toEqual(["2026-12-25"]);
    expect(await ensureHolidaysLoaded(2026, 12)).toBe("fallback");
    expect(isHolidayCached("2026-12-25")).toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("키 없음 + 표 밖 해 → unavailable(빈 목록)", async () => {
    const r = await getHolidaysWithStatus(2028, 1);
    expect(r).toEqual({ holidays: [], status: "unavailable" });
  });

  test("API 성공 → ok · API 결과를 그대로(내장표 섞지 않음)", async () => {
    process.env[KEY] = "test-key";
    (global.fetch as jest.Mock).mockResolvedValueOnce(apiResponse([{ locdate: 20261225, dateName: "기독탄신일" }, { locdate: 20261228, dateName: "임시공휴일" }]));
    const r = await getHolidaysWithStatus(2026, 12);
    expect(r.status).toBe("ok");
    expect(r.holidays.map((h) => h.name)).toEqual(["기독탄신일", "임시공휴일"]);
  });

  test("API 실패 + 이전 결과 없음 → fallback · 5분 안 재요청은 외부 호출 안 함", async () => {
    process.env[KEY] = "test-key";
    const a = await getHolidaysWithStatus(2026, 12);
    expect(a.status).toBe("fallback");
    expect(a.holidays.map((h) => h.date)).toEqual(["2026-12-25"]);
    const b = await getHolidaysWithStatus(2026, 12);
    expect(b.status).toBe("fallback");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test("API 실패 + 24시간 지난 이전 결과 있음 → stale(이전 API 결과)", async () => {
    process.env[KEY] = "test-key";
    const t0 = Date.now();
    const now = jest.spyOn(Date, "now").mockReturnValue(t0);
    (global.fetch as jest.Mock).mockResolvedValueOnce(apiResponse([{ locdate: 20261225, dateName: "기독탄신일" }, { locdate: 20261228, dateName: "임시공휴일" }]));
    expect((await getHolidaysWithStatus(2026, 12)).status).toBe("ok");
    now.mockReturnValue(t0 + 25 * 60 * 60 * 1000);
    const r = await getHolidaysWithStatus(2026, 12);
    expect(r.status).toBe("stale");
    expect(r.holidays.map((h) => h.date)).toEqual(["2026-12-25", "2026-12-28"]);
    now.mockRestore();
  });

  test("API 200인데 형식이 다름(키 오류 등) → 실패로 처리(빈 달로 캐시하지 않음)", async () => {
    process.env[KEY] = "test-key";
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ OpenAPI_ServiceResponse: {} }) });
    expect((await getHolidaysWithStatus(2026, 12)).status).toBe("fallback");
  });

  test("API 실패 + 표 밖 해 → unavailable", async () => {
    process.env[KEY] = "test-key";
    expect((await getHolidaysWithStatus(2028, 3)).status).toBe("unavailable");
  });

  test("기간 상태 = 걸친 달 중 가장 나쁜 값", async () => {
    expect(worstHolidayStatus([])).toBe("ok");
    expect(worstHolidayStatus(["ok", "stale"])).toBe("stale");
    expect(worstHolidayStatus(["stale", "fallback", "ok"])).toBe("fallback");
    expect(worstHolidayStatus(["fallback", "unavailable"])).toBe("unavailable");
    expect(monthsBetween("2026-12-21", "2027-01-05")).toEqual(["2026-12", "2027-01"]);
    expect(monthsBetween("2026-12-21", "2026-12-01")).toEqual([]);
    const r = await ensureHolidaysForRange("2027-12-20", "2028-01-10");
    expect(r).toEqual({ status: "unavailable", months: ["2027-12", "2028-01"] });
  });
});

describe("설정 화면 상태(getHolidayHealth) — 키·URL 노출 없음", () => {
  const OCT_2026 = new Date("2026-10-27T03:00:00Z");

  test("키 없음 → no_key · 내장표 사용 중", async () => {
    const h = await getHolidayHealth(OCT_2026);
    expect(h).toEqual({ status: "no_key", usingFallback: true, checkedAt: null, fallbackYears: [2026, 2027] });
  });

  test("키 있음 + 성공 → ok · 실패 → fallback", async () => {
    process.env[KEY] = "secret-key-value";
    (global.fetch as jest.Mock).mockResolvedValueOnce(apiResponse([{ locdate: 20261003, dateName: "개천절" }]));
    const ok = await getHolidayHealth(OCT_2026);
    expect(ok.status).toBe("ok");
    expect(ok.checkedAt).toEqual(expect.any(String));
    _clearHolidayCache();
    const bad = await getHolidayHealth(OCT_2026);
    expect(bad.status).toBe("fallback");
    expect(JSON.stringify(bad)).not.toContain("secret-key-value");
    expect(JSON.stringify(bad)).not.toContain("data.go.kr");
  });
});
