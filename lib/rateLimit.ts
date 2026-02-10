/**
 * 간단한 인메모리 Rate Limiter (Vercel Serverless 환경 호환)
 *
 * Serverless 함수는 인스턴스가 여러 개 뜰 수 있으므로 완벽한 보호는 아니지만,
 * 단일 인스턴스 내에서 반복적인 남용(브루트포스 등)을 효과적으로 차단합니다.
 * 프로덕션에서 더 강력한 보호가 필요하면 Redis 기반으로 교체할 수 있습니다.
 */

type Entry = {
  count: number;
  resetAt: number; // timestamp (ms)
};

const stores = new Map<string, Map<string, Entry>>();

function getStore(namespace: string): Map<string, Entry> {
  let store = stores.get(namespace);
  if (!store) {
    store = new Map();
    stores.set(namespace, store);
  }
  return store;
}

/** 오래된 항목 정리 (메모리 누수 방지) */
function cleanup(store: Map<string, Entry>) {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) {
      store.delete(key);
    }
  }
}

export type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterSeconds: number };

/**
 * Rate Limit 체크 및 카운트 증가
 *
 * @param namespace  - 용도별 분리 키 (예: "login", "send-link")
 * @param key        - 식별자 (예: IP 주소, 이메일)
 * @param maxAttempts - 윈도우 내 최대 허용 횟수
 * @param windowMs   - 윈도우 크기 (밀리초)
 */
export function rateLimit(
  namespace: string,
  key: string,
  maxAttempts: number,
  windowMs: number
): RateLimitResult {
  const store = getStore(namespace);
  const now = Date.now();

  // 주기적 정리 (100회 호출마다)
  if (Math.random() < 0.01) cleanup(store);

  const entry = store.get(key);

  // 윈도우 만료 또는 첫 요청
  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxAttempts - 1 };
  }

  // 윈도우 내 허용 범위
  if (entry.count < maxAttempts) {
    entry.count += 1;
    return { allowed: true, remaining: maxAttempts - entry.count };
  }

  // 초과
  const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);
  return { allowed: false, retryAfterSeconds };
}

/** 요청에서 IP 주소 추출 (Vercel/Cloudflare 호환) */
export function getClientIp(req: Request): string {
  const headers = req.headers;
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    headers.get("cf-connecting-ip") ||
    "unknown"
  );
}
