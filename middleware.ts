import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME, ADMIN_ACTIVITY_COOKIE, ADMIN_SESSION_MAX_AGE_SEC, ADMIN_UNAUTHORIZED_MESSAGE } from "@/lib/adminConstants";
import { checkAdminCookies, sessionKeySource, signActivity } from "@/lib/adminSession";

/* ── 페이지뷰 남용 방지용 Edge Rate Limiter ──────────────────────── */
type RLEntry = { count: number; resetAt: number };
const pageRLStore = new Map<string, RLEntry>();
const PAGE_RL_MAX = 120;          // IP당 최대 요청 수
const PAGE_RL_WINDOW = 60_000;    // 1분 윈도우
const PAGE_RL_MAX_ENTRIES = 10_000; // 맵 최대 크기
let pageRLCleanupCounter = 0;

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

  // 100회마다 또는 맵이 상한에 도달하면 만료 엔트리 정리
  pageRLCleanupCounter++;
  if (pageRLCleanupCounter >= 100 || pageRLStore.size > PAGE_RL_MAX_ENTRIES) {
    pageRLCleanupCounter = 0;
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
  // Note: 'unsafe-inline'은 Next.js 14 App Router가 인라인 스크립트/스타일을 사용하므로 필수.
  // Next.js가 nonce 기반 CSP를 안정적으로 지원하면 전환 예정.
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
      "object-src 'none'",
      "upgrade-insecure-requests",
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

  // ── CSRF 보호: 변경 요청(POST/PUT/PATCH/DELETE)의 Origin 검증 ──
  const method = req.method.toUpperCase();
  if (
    pathname.startsWith("/api/") &&
    method !== "GET" &&
    method !== "HEAD" &&
    method !== "OPTIONS"
  ) {
    const origin = req.headers.get("origin") ?? "";
    const host = req.headers.get("host") ?? "";
    if (origin) {
      let originHost: string;
      try {
        originHost = new URL(origin).host;
      } catch {
        return withSecurityHeaders(
          NextResponse.json({ ok: false, message: "Invalid Origin" }, { status: 403 })
        );
      }
      if (originHost !== host) {
        return withSecurityHeaders(
          NextResponse.json({ ok: false, message: "Cross-origin request blocked" }, { status: 403 })
        );
      }
    }
  }

  // 보안 헤더는 모든 라우트에 적용
  if (!pathname.startsWith("/admin") && !pathname.startsWith("/api/admin")) {
    return withSecurityHeaders(NextResponse.next());
  }

  // 로그인 관련 경로는 인증 면제
  if (pathname.startsWith("/admin/login")) return withSecurityHeaders(NextResponse.next());
  if (pathname === "/api/admin/login") return withSecurityHeaders(NextResponse.next());

  // 크론 라우트(GET + Authorization: Bearer CRON_SECRET)는 라우트가 직접 검증한다(lib/cronAuth.ts).
  // 토큰이 틀리면 라우트가 관리자 쿠키 검사로 넘어가 401을 돌려준다.
  // - 업무 시스템 동기화: /api/admin/class-schedules/sync
  // - 결제 기한 경과 자동 취소: /api/admin/payment-deadline/run (2026-10-26)
  if (
    (pathname === "/api/admin/class-schedules/sync" || pathname === "/api/admin/payment-deadline/run") &&
    req.method === "GET" &&
    (req.headers.get("authorization") || "").startsWith("Bearer ")
  ) {
    return withSecurityHeaders(NextResponse.next());
  }

  // ADMIN_PASSWORD_HASH (bcrypt) 또는 ADMIN_PASSWORD (레거시) — 세션 서명 키 원천이 없으면 로그인 불가
  if (!sessionKeySource()) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    url.searchParams.set("next", pathname);
    url.searchParams.set("err", "missing_admin_password");
    return NextResponse.redirect(url);
  }

  // ★ v2 서명 세션 + 서명된 활동 쿠키 (audit-fix-1 [7])
  //   - 세션: 서명·만료(8h) / 활동: 서명·30분 — 활동 쿠키를 빼거나 ts만 바꾸면 거부
  //   - 로그아웃 폐기 확인은 Edge에서 불가 → Node 가드(assertAdminApiAuth·assertAdminAuth)가 수행
  const check = await checkAdminCookies(
    req.cookies.get(ADMIN_COOKIE_NAME)?.value ?? null,
    req.cookies.get(ADMIN_ACTIVITY_COOKIE)?.value ?? null
  );

  if (check.ok) {
    const isProduction = process.env.NODE_ENV === "production";
    const res = NextResponse.next();
    res.cookies.set(ADMIN_ACTIVITY_COOKIE, await signActivity(check.sid, Date.now()), {
      httpOnly: true,
      sameSite: "strict",
      secure: isProduction,
      path: "/",
      maxAge: ADMIN_SESSION_MAX_AGE_SEC,
    });
    return withSecurityHeaders(res);
  }

  const hadCookie = check.reason !== "missing";
  const clearCookies = (res: NextResponse) => {
    if (hadCookie) {
      res.cookies.set(ADMIN_COOKIE_NAME, "", { httpOnly: true, sameSite: "strict", path: "/", maxAge: 0 });
      res.cookies.set(ADMIN_ACTIVITY_COOKIE, "", { httpOnly: true, sameSite: "strict", path: "/", maxAge: 0 });
    }
    return res;
  };

  // API 라우트는 JSON 401 응답
  if (pathname.startsWith("/api/admin")) {
    return withSecurityHeaders(
      clearCookies(NextResponse.json({ ok: false, code: "UNAUTHORIZED", message: ADMIN_UNAUTHORIZED_MESSAGE }, { status: 401 }))
    );
  }

  // 관리자 페이지는 로그인 리다이렉트 (구형 쿠키·비활동 만료는 안내 키를 붙인다)
  const url = req.nextUrl.clone();
  url.pathname = "/admin/login";
  url.searchParams.set("next", pathname);
  if (check.reason === "legacy") url.searchParams.set("err", "session_upgraded");
  else if (check.reason === "activity_expired" || check.reason === "activity_missing") url.searchParams.set("err", "session_expired");
  return clearCookies(NextResponse.redirect(url));
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
