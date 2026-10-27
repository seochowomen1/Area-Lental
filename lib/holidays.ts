/**
 * 국가 공휴일 자동 조회 모듈
 *
 * 한국천문연구원 특일정보 API (data.go.kr)를 사용하여
 * 공휴일·대체공휴일·임시공휴일을 자동으로 감지합니다.
 *
 * - 월 단위 인메모리 캐시 (TTL 24시간)
 * - API 키 미설정·장애 시: 이전 API 결과(stale) → 내장 법정공휴일표 2026~2027(fallback) → 없음(unavailable)
 *   (audit-fix-2 R2 · 상태는 getHolidaysWithStatus / ensureHolidaysLoaded 반환값)
 * - 응답·로그에 키 값이나 요청 URL을 남기지 않는다(PUBLIC 레포·공개 API 응답).
 */

import { FALLBACK_HOLIDAY_YEARS, fallbackCoversYear, fallbackHolidaysForMonth } from "@/lib/holidaysFallback";

export type HolidayInfo = {
  date: string;       // "2026-01-01"
  name: string;       // "신정"
  isHoliday: boolean; // 공휴일 여부
};

/**
 * 월별 공휴일 조회 상태 (audit-fix-2 R2)
 * - ok: API 성공(또는 24시간 캐시)
 * - stale: API 실패 → 이전에 받아 둔 API 결과 사용
 * - fallback: API 실패·키 없음 → 내장 법정공휴일표(lib/holidaysFallback.ts) 사용(임시공휴일 빠질 수 있음)
 * - unavailable: 쓸 수 있는 공휴일 정보가 없음(공휴일이 평일로 계산됨)
 */
export type HolidayStatus = "ok" | "stale" | "fallback" | "unavailable";

const STATUS_RANK: Record<HolidayStatus, number> = { ok: 0, stale: 1, fallback: 2, unavailable: 3 };

/** 여러 달 상태 중 가장 나쁜 값 (빈 배열 = ok) */
export function worstHolidayStatus(list: readonly HolidayStatus[]): HolidayStatus {
  let worst: HolidayStatus = "ok";
  for (const s of list) if (STATUS_RANK[s] > STATUS_RANK[worst]) worst = s;
  return worst;
}

export function isHolidayStatus(v: unknown): v is HolidayStatus {
  return v === "ok" || v === "stale" || v === "fallback" || v === "unavailable";
}

type CacheEntry = {
  data: HolidayInfo[];
  fetchedAt: number;
};

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24시간
/** API 실패 뒤 같은 달을 다시 부르지 않는 시간 — 장애 중 매 요청마다 5초 타임아웃을 기다리지 않게 */
const FAIL_RETRY_MS = 5 * 60 * 1000;
const cache = new Map<string, CacheEntry>();
const failedAt = new Map<string, number>();
/** 최근 API 호출 결과 — 설정 화면 상태 줄용(키·오류 원문은 담지 않는다) */
let lastAttempt: { ok: boolean; at: number } | null = null;

// 동기 조회용 Set (사전 로딩 후 사용)
const holidayDateSet = new Set<string>();
const holidayNameMap = new Map<string, string>();

function getApiKey(): string | null {
  const key = process.env.DATA_GO_KR_API_KEY?.trim();
  return key || null;
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** API를 쓸 수 없을 때: 이전 API 결과 → 내장표 → 없음 순 */
function degraded(year: number, month: number, cached: CacheEntry | undefined): { holidays: HolidayInfo[]; status: HolidayStatus } {
  if (cached) return { holidays: cached.data, status: "stale" };
  const fb = fallbackHolidaysForMonth(year, month);
  if (fb) return { holidays: fb.map((h) => ({ date: h.date, name: h.name, isHoliday: true })), status: "fallback" };
  return { holidays: [], status: "unavailable" };
}

/**
 * 특정 월의 공휴일 목록 + 조회 상태 (audit-fix-2 R2)
 */
export async function getHolidaysWithStatus(year: number, month: number): Promise<{ holidays: HolidayInfo[]; status: HolidayStatus }> {
  const key = monthKey(year, month);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return { holidays: cached.data, status: "ok" };
  }

  const apiKey = getApiKey();
  if (!apiKey) return degraded(year, month, cached);

  const lastFail = failedAt.get(key);
  if (lastFail !== undefined && Date.now() - lastFail < FAIL_RETRY_MS) return degraded(year, month, cached);

  const fail = (why: string) => {
    failedAt.set(key, Date.now());
    lastAttempt = { ok: false, at: Date.now() };
    console.warn(`[holidays] 공휴일 조회 실패(${key}): ${why}`);
    return degraded(year, month, cached);
  };

  try {
    // ServiceKey는 이미 인코딩된 키일 수 있으므로 URLSearchParams로 이중 인코딩하지 않음
    const params = new URLSearchParams({
      solYear: String(year),
      solMonth: String(month).padStart(2, "0"),
      _type: "json",
      numOfRows: "50",
    });

    const url = `https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo?ServiceKey=${apiKey}&${params}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });

    if (!res.ok) return fail(`HTTP ${res.status}`);

    const json = await res.json();
    const body = json?.response?.body;
    // 키 오류 등은 200 + 다른 형식으로 오므로, body가 없으면 실패로 본다(빈 달로 캐시하지 않음)
    if (!body || typeof body !== "object") return fail("응답 형식 오류");
    const items = body.items?.item;

    let holidays: HolidayInfo[] = [];
    if (items) {
      // items가 단일 객체일 수 있음 (공휴일이 1개인 월)
      const itemArray = Array.isArray(items) ? items : [items];
      holidays = itemArray
        .filter((item: Record<string, unknown>) => item.isHoliday === "Y")
        .map((item: Record<string, unknown>) => {
          const locdate = String(item.locdate);
          const dateStr = `${locdate.slice(0, 4)}-${locdate.slice(4, 6)}-${locdate.slice(6, 8)}`;
          return {
            date: dateStr,
            name: String(item.dateName),
            isHoliday: true,
          };
        });
    }

    cache.set(key, { data: holidays, fetchedAt: Date.now() });
    failedAt.delete(key);
    lastAttempt = { ok: true, at: Date.now() };
    return { holidays, status: "ok" };
  } catch (err) {
    return fail(err instanceof Error ? err.name : "알 수 없는 오류");
  }
}

/**
 * 특정 월의 공휴일 목록을 조회합니다(상태가 필요 없을 때).
 * API를 쓸 수 없으면 이전 결과 → 내장표(2026~2027) → 빈 배열 순으로 대신합니다.
 */
export async function getHolidays(year: number, month: number): Promise<HolidayInfo[]> {
  return (await getHolidaysWithStatus(year, month)).holidays;
}

/**
 * 특정 월의 공휴일을 사전 로딩하여 동기 조회 Set에 등록합니다.
 * operatingRangesForDate() 등 동기 함수에서 사용하기 위해
 * API 호출 전에 반드시 이 함수를 await 해야 합니다.
 * @returns 그 달의 조회 상태
 */
export async function ensureHolidaysLoaded(year: number, month: number): Promise<HolidayStatus> {
  const { holidays, status } = await getHolidaysWithStatus(year, month);
  for (const h of holidays) {
    holidayDateSet.add(h.date);
    holidayNameMap.set(h.date, h.name);
  }
  return status;
}

/** "YYYY-MM-DD" 두 날짜가 걸친 달 목록(YYYY-MM, 오름차순) — 형식이 틀리거나 끝<시작이면 [] */
export function monthsBetween(startYmd: string, endYmd: string): string[] {
  const out: string[] = [];
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(startYmd ?? "") || !re.test(endYmd ?? "") || endYmd < startYmd) return out;
  let y = parseInt(startYmd.slice(0, 4), 10);
  let m = parseInt(startYmd.slice(5, 7), 10);
  const last = endYmd.slice(0, 7);
  for (let guard = 0; guard < 36; guard++) {
    const k = monthKey(y, m);
    out.push(k);
    if (k >= last) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/** 기간에 걸친 달을 모두 로딩하고 가장 나쁜 상태를 돌려준다 (갤러리 신청 저장·다시 계산용) */
export async function ensureHolidaysForRange(startYmd: string, endYmd: string): Promise<{ status: HolidayStatus; months: string[] }> {
  const months = monthsBetween(startYmd, endYmd);
  const statuses = await Promise.all(
    months.map((k) => ensureHolidaysLoaded(parseInt(k.slice(0, 4), 10), parseInt(k.slice(5, 7), 10)))
  );
  return { status: worstHolidayStatus(statuses), months };
}

/** 설정 화면 상태 줄 (01_spec 5-5 · ③-F-7) — 키 값·URL·오류 원문은 담지 않는다 */
export type HolidayHealth = {
  /** ok=정상 · no_key=키 없음 · error=최근 조회 실패(이전 결과 사용 또는 정보 없음) · fallback=최근 조회 실패, 내장표로 대신 */
  status: "ok" | "no_key" | "error" | "fallback";
  /** 이번 달을 내장표로 계산 중인지 (no_key이면서 true면 "평일로 계산" 문구 대신 내장표 문구) */
  usingFallback: boolean;
  /** 최근 API 호출 시각(ISO) — 키 없음·호출 전이면 null */
  checkedAt: string | null;
  /** 내장표가 다루는 해 */
  fallbackYears: number[];
};

export async function getHolidayHealth(now: Date = new Date()): Promise<HolidayHealth> {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth() + 1;
  const fallbackYears = [...FALLBACK_HOLIDAY_YEARS];
  if (!getApiKey()) {
    return { status: "no_key", usingFallback: fallbackCoversYear(y), checkedAt: null, fallbackYears };
  }
  const { status } = await getHolidaysWithStatus(y, m);
  const checkedAt = lastAttempt ? new Date(lastAttempt.at).toISOString() : null;
  if (status === "ok") return { status: "ok", usingFallback: false, checkedAt, fallbackYears };
  if (status === "fallback") return { status: "fallback", usingFallback: true, checkedAt, fallbackYears };
  return { status: "error", usingFallback: false, checkedAt, fallbackYears };
}

/**
 * 동기 캐시 조회: 해당 날짜가 공휴일인지 확인합니다.
 * ensureHolidaysLoaded()가 선행되어야 정확한 결과를 반환합니다.
 * 로딩되지 않은 월의 날짜는 false를 반환합니다 (안전 방향).
 */
export function isHolidayCached(dateYmd: string): boolean {
  return holidayDateSet.has(dateYmd);
}

/**
 * 동기 캐시 조회: 공휴일 이름을 반환합니다.
 */
export function getHolidayNameCached(dateYmd: string): string | null {
  return holidayNameMap.get(dateYmd) ?? null;
}

/**
 * 특정 날짜가 공휴일인지 비동기로 확인합니다.
 * (단일 날짜 조회용 — 내부적으로 해당 월을 로딩)
 */
export async function isHoliday(dateYmd: string): Promise<boolean> {
  const [yearStr, monthStr] = dateYmd.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  await ensureHolidaysLoaded(year, month);
  return holidayDateSet.has(dateYmd);
}

/**
 * 지금까지 로딩된 공휴일 집합(읽기 전용 뷰) — lib/galleryPlan.ts 순수 함수에 넘기는 용도
 * ensureHolidaysLoaded()로 필요한 달을 먼저 로딩할 것.
 */
export function loadedHolidaySet(): ReadonlySet<string> {
  return holidayDateSet;
}

/** 테스트용: 공휴일을 API 없이 직접 등록 */
export function _primeHolidaysForTest(items: Array<{ date: string; name: string }>): void {
  for (const h of items) {
    holidayDateSet.add(h.date);
    holidayNameMap.set(h.date, h.name);
  }
}

/** 테스트용: 캐시 초기화 */
export function _clearHolidayCache(): void {
  cache.clear();
  failedAt.clear();
  lastAttempt = null;
  holidayDateSet.clear();
  holidayNameMap.clear();
}
