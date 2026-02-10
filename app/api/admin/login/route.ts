import { NextResponse } from "next/server";
import crypto from "crypto";

import { ADMIN_COOKIE_NAME, ADMIN_SIGN_MESSAGE } from "@/lib/adminConstants";
import { rateLimit, getClientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** 로그인: IP당 15분 내 5회 시도 제한 */
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

function tokenFor(adminPassword: string) {
  return crypto
    .createHash("sha256")
    .update(`${adminPassword}::${ADMIN_SIGN_MESSAGE}`)
    .digest("hex");
}

export async function POST(req: Request) {
  try {
  // Rate limit 체크
  const ip = getClientIp(req);
  const rl = rateLimit("login", ip, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, message: `너무 많은 로그인 시도입니다. ${rl.retryAfterSeconds}초 후 다시 시도해주세요.` },
      { status: 429 }
    );
  }

  const adminPw = process.env.ADMIN_PASSWORD;
  if (!adminPw) {
    return NextResponse.json(
      { ok: false, message: "ADMIN_PASSWORD 환경변수가 설정되지 않았습니다." },
      { status: 500 }
    );
  }

  // ✅ 클라이언트 구현에 따라 JSON 또는 FormData로 올 수 있어 둘 다 지원
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

  if (password !== adminPw) {
    return NextResponse.json(
      { ok: false, message: "비밀번호가 올바르지 않습니다." },
      { status: 401 }
    );
  }

  const token = tokenFor(adminPw);
  const res = NextResponse.json({ ok: true, redirect: nextPath });
  const isProduction = process.env.NODE_ENV === "production";
  res.cookies.set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
  });
  return res;
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "요청 처리 중 오류가 발생했습니다.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE_NAME, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
