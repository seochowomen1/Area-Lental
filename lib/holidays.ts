/**
 * 국가 공휴일 자동 조회 모듈
 *
 * 한국천문연구원 특일정보 API (data.go.kr)를 사용하여
 * 공휴일·대체공휴일·임시공휴일을 자동으로 감지합니다.
 *
 * - 월 단위 인메모리 캐시 (TTL 24시간)
 * - API 키 미설정 시 기능 비활성화 (graceful degradation)
 * - API 장애 시 캐시 데이터 사용 / 없으면 빈 배열 반환
 */

export type HolidayInfo = {
  date: string;       // "2026-01-01"
  name: string;       // "신정"
  isHoliday: boolean; // 공휴일 여부
};

type CacheEntry = {
  data: HolidayInfo[];
  fetchedAt: number;
};

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24시간
const cache = new Map<string, CacheEntry>();

// 동기 조회용 Set (사전 로딩 후 사용)
const holidayDateSet = new Set<string>();
const holidayNameMap = new Map<string, string>();

function getApiKey(): string | null {
  const key = process.env.DATA_GO_KR_API_KEY?.trim();
  return key || null;
}

/**
 * 특정 월의 공휴일 목록을 API에서 조회합니다.
 * 캐시가 유효하면 캐시 데이터를 반환합니다.
 */
export async function getHolidays(year: number, month: number): Promise<HolidayInfo[]> {
  const apiKey = getApiKey();
  if (!apiKey) return [];

  const cacheKey = `${year}-${String(month).padStart(2, "0")}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

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

    if (!res.ok) {
      console.warn(`[holidays] API 응답 오류: ${res.status}`);
      return cached?.data ?? [];
    }

    const json = await res.json();
    const items = json?.response?.body?.items?.item;

    if (!items) {
      // 해당 월에 공휴일이 없는 경우
      const entry: CacheEntry = { data: [], fetchedAt: Date.now() };
      cache.set(cacheKey, entry);
      return [];
    }

    // items가 단일 객체일 수 있음 (공휴일이 1개인 월)
    const itemArray = Array.isArray(items) ? items : [items];

    const holidays: HolidayInfo[] = itemArray
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

    const entry: CacheEntry = { data: holidays, fetchedAt: Date.now() };
    cache.set(cacheKey, entry);
    return holidays;
  } catch (err) {
    console.warn("[holidays] API 호출 실패:", err instanceof Error ? err.message : err);
    return cached?.data ?? [];
  }
}

/**
 * 특정 월의 공휴일을 사전 로딩하여 동기 조회 Set에 등록합니다.
 * operatingRangesForDate() 등 동기 함수에서 사용하기 위해
 * API 호출 전에 반드시 이 함수를 await 해야 합니다.
 */
export async function ensureHolidaysLoaded(year: number, month: number): Promise<void> {
  const holidays = await getHolidays(year, month);
  for (const h of holidays) {
    holidayDateSet.add(h.date);
    holidayNameMap.set(h.date, h.name);
  }
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

/** 테스트용: 캐시 초기화 */
export function _clearHolidayCache(): void {
  cache.clear();
  holidayDateSet.clear();
  holidayNameMap.clear();
}
