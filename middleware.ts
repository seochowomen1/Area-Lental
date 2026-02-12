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

function withSecurityHeaders(res: NextResponse) {
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("X-XSS-Protection", "1; mode=block");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
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

  // 보안 헤더는 모든 라우트에 적용
  if (!pathname.startsWith("/admin") && !pathname.startsWith("/api/admin")) {
    return withSecurityHeaders(NextResponse.next());
  }

  // 로그인 관련 경로는 인증 면제
  if (pathname.startsWith("/admin/login")) return withSecurityHeaders(NextResponse.next());
  if (pathname === "/api/admin/login") return withSecurityHeaders(NextResponse.next());

  const adminPw = process.env.ADMIN_PASSWORD;
  // 환경변수 미설정이면 로그인 페이지로 유도(에러 표시용 쿼리)
  if (!adminPw) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    url.searchParams.set("next", pathname);
    url.searchParams.set("err", "missing_admin_password");
    return NextResponse.redirect(url);
  }

  const cookie = req.cookies.get(ADMIN_COOKIE_NAME)?.value ?? null;
  const expected = await tokenFor(adminPw);

  if (cookie && cookie === expected) return withSecurityHeaders(NextResponse.next());

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
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
