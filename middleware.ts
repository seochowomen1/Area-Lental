import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME, ADMIN_SIGN_MESSAGE } from "@/lib/adminConstants";

function toHex(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

async function tokenFor(adminPassword: string) {
  const enc = new TextEncoder();
  const data = enc.encode(`${adminPassword}::${ADMIN_SIGN_MESSAGE}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toHex(digest);
}

/* ── 페이지뷰 남용 방지용 Edge Rate Limiter ──────────────────────── */
type RLEntry = { count: number; resetAt: number };
const pageRLStore = new Map<string, RLEntry>();
const PAGE_RL_MAX = 120;          // IP당 최대 요청 수
const PAGE_RL_WINDOW = 60_000;    // 1분 윈도우

function getIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    req.ip ||
    "unknown"
  );
}

function pageRateLimit(ip: string): { ok: boolean; retryAfter?: number } {
  const now = Date.now();

  // 주기적 정리 (1% 확률)
  if (Math.random() < 0.01) {
    for (const [k, v] of pageRLStore) {
      if (v.resetAt <= now) pageRLStore.delete(k);
    }
  }

  const entry = pageRLStore.get(ip);
  if (!entry || entry.resetAt <= now) {
    pageRLStore.set(ip, { count: 1, resetAt: now + PAGE_RL_WINDOW });
    return { ok: true };
  }
  if (entry.count < PAGE_RL_MAX) {
    entry.count += 1;
    return { ok: true };
  }
  return { ok: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
}
/* ────────────────────────────────────────────────────────────────── */

function withSecurityHeaders(res: NextResponse) {
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("X-XSS-Protection", "1; mode=block");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  res.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ")
  );
  return res;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── 페이지뷰 남용 방지: 모든 페이지/API 요청에 IP rate limit 적용 ──
  const ip = getIp(req);
  const rl = pageRateLimit(ip);
  if (!rl.ok) {
    return withSecurityHeaders(
      new NextResponse("요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfter ?? 60) },
      })
    );
  }

  // 보안 헤더는 모든 라우트에 적용
  if (!pathname.startsWith("/admin") && !pathname.startsWith("/api/admin")) {
    return withSecurityHeaders(NextResponse.next());
  }

  // 로그인 관련 경로는 인증 면제
  if (pathname.startsWith("/admin/login")) return withSecurityHeaders(NextResponse.next());
  if (pathname === "/api/admin/login") return withSecurityHeaders(NextResponse.next());

  // ADMIN_PASSWORD_HASH (bcrypt) 또는 ADMIN_PASSWORD (레거시) 지원
  const tokenSource = process.env.ADMIN_PASSWORD_HASH || process.env.ADMIN_PASSWORD;
  if (!tokenSource) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    url.searchParams.set("next", pathname);
    url.searchParams.set("err", "missing_admin_password");
    return NextResponse.redirect(url);
  }

  const cookie = req.cookies.get(ADMIN_COOKIE_NAME)?.value ?? null;
  const expected = await tokenFor(tokenSource);

  // 타이밍 공격 방어: 일정한 비교 시간 보장
  if (cookie) {
    const enc = new TextEncoder();
    const a = enc.encode(cookie.padEnd(128, "\0"));
    const b = enc.encode(expected.padEnd(128, "\0"));
    let match = a.length === b.length;
    for (let i = 0; i < a.length && i < b.length; i++) {
      match = match && a[i] === b[i];
    }
    if (match) return withSecurityHeaders(NextResponse.next());
  }

  // API 라우트는 JSON 401 응답
  if (pathname.startsWith("/api/admin")) {
    return withSecurityHeaders(
      NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 })
    );
  }

  // 관리자 페이지는 로그인 리다이렉트
  const url = req.nextUrl.clone();
  url.pathname = "/admin/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    /*
     * 정적 에셋(_next, favicon 등)을 제외한 모든 페이지/API에 적용
     * → 보안 헤더 + 페이지뷰 rate limit
     */
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
