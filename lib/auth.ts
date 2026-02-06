import crypto from "crypto";
import { cookies } from "next/headers";
import { requireAdminEnv } from "@/lib/env";

const COOKIE_NAME = "admin_auth";

function tokenFor(password: string) {
  const env = requireAdminEnv();
  const secret = env.ADMIN_PASSWORD;
  return crypto.createHmac("sha256", secret).update(password).digest("hex");
}

export function setAdminSession() {
  const env = requireAdminEnv();
  const token = tokenFor(env.ADMIN_PASSWORD);

  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/"
  });
}

export function clearAdminSession() {
  cookies().set(COOKIE_NAME, "", { httpOnly: true, path: "/", maxAge: 0 });
}

export function isAdminAuthedFromCookie(cookieValue?: string | null): boolean {
  if (!cookieValue) return false;
  const env = requireAdminEnv();
  return cookieValue === tokenFor(env.ADMIN_PASSWORD);
}

export { COOKIE_NAME };
