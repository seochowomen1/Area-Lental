/**
 * Rate Limiter (인메모리 + Redis 이중 지원)
 *
 * REDIS_URL 환경변수가 설정되면 Redis를 사용하여 분산 환경에서도 일관된 제한을 적용합니다.
 * 미설정 시 인메모리 폴백으로 동작합니다 (Vercel Serverless 호환).
 */

type Entry = {
  count: number;
  resetAt: number; // timestamp (ms)
};

// ─── 인메모리 백엔드 ────────────────────────────────────────────────

const stores = new Map<string, Map<string, Entry>>();

function getStore(namespace: string): Map<string, Entry> {
  let store = stores.get(namespace);
  if (!store) {
    store = new Map();
    stores.set(namespace, store);
  }
  return store;
}

function cleanup(store: Map<string, Entry>) {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) {
      store.delete(key);
    }
  }
}

function memoryRateLimit(
  namespace: string,
  key: string,
  maxAttempts: number,
  windowMs: number
): RateLimitResult {
  const store = getStore(namespace);
  const now = Date.now();

  if (Math.random() < 0.01) cleanup(store);

  const entry = store.get(key);

  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxAttempts - 1 };
  }

  if (entry.count < maxAttempts) {
    entry.count += 1;
    return { allowed: true, remaining: maxAttempts - entry.count };
  }

  const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);
  return { allowed: false, retryAfterSeconds };
}

// ─── Redis 백엔드 ───────────────────────────────────────────────────

type RedisClient = {
  eval(script: string, numkeys: number, ...args: (string | number)[]): Promise<unknown>;
};

let _redisClient: RedisClient | null = null;
let _redisInitAttempted = false;

async function getRedisClient(): Promise<RedisClient | null> {
  if (_redisInitAttempted) return _redisClient;
  _redisInitAttempted = true;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;

  try {
    const { default: Redis } = await import("ioredis");
    const client = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      lazyConnect: true,
    });
    await client.connect();
    _redisClient = client as unknown as RedisClient;
    console.log("[RateLimit] Redis 연결 성공");
    return _redisClient;
  } catch (err) {
    console.warn("[RateLimit] Redis 연결 실패, 인메모리 폴백 사용:", err instanceof Error ? err.message : err);
    return null;
  }
}

const REDIS_SCRIPT = `
  local key = KEYS[1]
  local max = tonumber(ARGV[1])
  local windowSec = tonumber(ARGV[2])
  local current = tonumber(redis.call('GET', key) or '0')
  if current >= max then
    local ttl = redis.call('TTL', key)
    return {0, ttl}
  end
  local newCount = redis.call('INCR', key)
  if newCount == 1 then
    redis.call('EXPIRE', key, windowSec)
  end
  return {1, max - newCount}
`;

async function redisRateLimit(
  client: RedisClient,
  namespace: string,
  key: string,
  maxAttempts: number,
  windowMs: number
): Promise<RateLimitResult> {
  try {
    const redisKey = `rl:${namespace}:${key}`;
    const windowSec = Math.ceil(windowMs / 1000);
    const result = (await client.eval(REDIS_SCRIPT, 1, redisKey, maxAttempts, windowSec)) as number[];

    if (result[0] === 1) {
      return { allowed: true, remaining: result[1] };
    }
    return { allowed: false, retryAfterSeconds: Math.max(result[1], 1) };
  } catch {
    return memoryRateLimit(namespace, key, maxAttempts, windowMs);
  }
}

// ─── 통합 인터페이스 ────────────────────────────────────────────────

export type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterSeconds: number };

/**
 * Rate Limit 체크 및 카운트 증가 (동기 — 인메모리)
 *
 * 기존 호출 패턴과 호환됩니다. Redis가 필요하면 rateLimitAsync를 사용하세요.
 */
export function rateLimit(
  namespace: string,
  key: string,
  maxAttempts: number,
  windowMs: number
): RateLimitResult {
  // Redis 초기화를 백그라운드에서 시도 (다음 async 호출에서 사용)
  if (!_redisInitAttempted) {
    getRedisClient().catch(() => {});
  }
  return memoryRateLimit(namespace, key, maxAttempts, windowMs);
}

/**
 * Rate Limit 체크 (비동기 — Redis 지원)
 *
 * REDIS_URL이 설정되면 분산 Rate Limit을 적용합니다.
 * 비동기 호출이 가능한 라우트 핸들러에서 사용하세요.
 */
export async function rateLimitAsync(
  namespace: string,
  key: string,
  maxAttempts: number,
  windowMs: number
): Promise<RateLimitResult> {
  const client = await getRedisClient();
  if (client) {
    return redisRateLimit(client, namespace, key, maxAttempts, windowMs);
  }
  return memoryRateLimit(namespace, key, maxAttempts, windowMs);
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
