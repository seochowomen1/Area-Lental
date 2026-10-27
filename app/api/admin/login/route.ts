import { NextResponse } from "next/server";

import { ADMIN_COOKIE_NAME, ADMIN_ACTIVITY_COOKIE, ADMIN_SESSION_MAX_AGE_SEC } from "@/lib/adminConstants";
import { createAdminSession, readCookie, verifyAdminSessionToken } from "@/lib/adminSession";
import { revokeAdminSession } from "@/lib/adminSessionStore";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { logger } from "@/lib/logger";
import { handleApiError } from "@/lib/apiResponse";
import { verifyAdminPassword, isAdminPasswordConfigured } from "@/lib/adminPassword";
import { auditLog, recordAudit } from "@/lib/auditLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** 로그인 Rate Limit: IP당 15분 내 5회 시도 제한 */
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

/** 글로벌 Rate Limit: 모든 IP 합산 1분 내 20회 (분산 브루트포스 방지) */
const LOGIN_GLOBAL_MAX = 20;
const LOGIN_GLOBAL_WINDOW_MS = 60 * 1000;

export async function POST(req: Request) {
  try {
  const ip = getClientIp(req);

  // Rate limit 체크 (IP별)
  const rl = rateLimit("login", ip, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS);
  if (!rl.allowed) {
    logger.warn("관리자 로그인 Rate Limit 초과", { ip });
    return NextResponse.json(
      { ok: false, message: `너무 많은 로그인 시도입니다. ${rl.retryAfterSeconds}초 후 다시 시도해주세요.` },
      { status: 429 }
    );
  }

  // 글로벌 Rate limit (분산 브루트포스 방지)
  const rlGlobal = rateLimit("login-global", "all", LOGIN_GLOBAL_MAX, LOGIN_GLOBAL_WINDOW_MS);
  if (!rlGlobal.allowed) {
    logger.warn("관리자 로그인 글로벌 Rate Limit 초과", { ip });
    return NextResponse.json(
      { ok: false, message: `시스템 보호를 위해 잠시 후 다시 시도해주세요.` },
      { status: 429 }
    );
  }

  if (!isAdminPasswordConfigured()) {
    return NextResponse.json(
      { ok: false, message: "서버 설정 오류입니다." },
      { status: 500 }
    );
  }

  // 클라이언트 구현에 따라 JSON 또는 FormData로 올 수 있어 둘 다 지원
  const contentType = req.headers.get("content-type") ?? "";
  let password = "";
  let nextPath = "/admin";

  if (contentType.includes("application/json")) {
    const body = (await req.json().catch(() => null)) as
      | { password?: string; next?: string }
      | null;
    password = (body?.password ?? "").toString();
    nextPath = (body?.next ?? "/admin").toString();
  } else {
    const form = await req.formData().catch(() => null);
    password = (form?.get("password") ?? "").toString();
    nextPath = (form?.get("next") ?? "/admin").toString();
  }

  // Open Redirect 방지: /admin으로 시작하는 경로만 허용
  if (!nextPath.startsWith("/admin")) {
    nextPath = "/admin";
  }

  // bcrypt 또는 평문 비밀번호 검증
  const isValid = await verifyAdminPassword(password);
  if (!isValid) {
    logger.warn("관리자 로그인 실패", { ip });
    auditLog({ action: "ADMIN_LOGIN", ip, details: { success: false } });
    return NextResponse.json(
      { ok: false, message: "비밀번호가 올바르지 않습니다." },
      { status: 401 }
    );
  }

  // ★ v2 서명 세션: 로그인마다 새 sid·서명 (audit-fix-1 [7] — 고정 토큰 폐지)
  const session = await createAdminSession();
  const res = NextResponse.json({ ok: true, redirect: nextPath });
  const isProduction = process.env.NODE_ENV === "production";
  res.cookies.set(ADMIN_COOKIE_NAME, session.token, {
    httpOnly: true,
    sameSite: "strict",
    secure: isProduction,
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE_SEC,
  });
  res.cookies.set(ADMIN_ACTIVITY_COOKIE, session.activity, {
    httpOnly: true,
    sameSite: "strict",
    secure: isProduction,
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE_SEC,
  });

  logger.info("관리자 로그인 성공", { ip });
  auditLog({ action: "ADMIN_LOGIN", ip, details: { success: true } });
  return res;
  } catch (e: unknown) {
    return handleApiError(e, "관리자 로그인");
  }
}

/**
 * 로그아웃 — 이 기기 세션만 폐기 (audit-fix-1 [7])
 * 쿠키 서명이 유효하면 sid를 폐기 목록에 기록하고 감사 기록(await). 결과와 상관없이 쿠키 삭제 후 200.
 */
export async function DELETE(req: Request) {
  const ip = getClientIp(req);
  const verified = await verifyAdminSessionToken(readCookie(req.headers.get("cookie"), ADMIN_COOKIE_NAME));
  if (verified.ok) {
    try {
      await revokeAdminSession(verified.payload.sid, verified.payload.exp);
    } catch (e) {
      logger.error("관리자 세션 폐기 기록 실패", { error: e instanceof Error ? e.message : String(e) });
    }
    await recordAudit({ action: "ADMIN_LOGOUT", ip, summary: "로그아웃(이 기기 세션 폐기)" });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE_NAME, "", { httpOnly: true, sameSite: "strict", path: "/", maxAge: 0 });
  res.cookies.set(ADMIN_ACTIVITY_COOKIE, "", { httpOnly: true, sameSite: "strict", path: "/", maxAge: 0 });
  return res;
}
