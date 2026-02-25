import crypto from "crypto";
import bcrypt from "bcryptjs";
import { ADMIN_SIGN_MESSAGE } from "@/lib/adminConstants";

/**
 * 관리자 비밀번호 검증 및 세션 토큰 관리
 *
 * 지원 방식:
 * 1. ADMIN_PASSWORD_HASH (bcrypt) — 권장: GPU 브루트포스 방어
 * 2. ADMIN_PASSWORD (평문) — 레거시 호환, 개발용
 *
 * 해시 생성:
 *   node -e "require('bcryptjs').hash('your-password', 12, (e,h) => console.log(h))"
 */

let _warnedLegacy = false;

/** 설정된 비밀번호 소스 반환 */
function getPasswordConfig(): {
  mode: "bcrypt" | "plaintext";
  hash?: string;
  plaintext?: string;
  tokenSource: string;
} {
  const hash = process.env.ADMIN_PASSWORD_HASH;
  const plain = process.env.ADMIN_PASSWORD;

  if (hash) {
    return { mode: "bcrypt", hash, tokenSource: hash };
  }

  if (plain) {
    if (process.env.NODE_ENV === "production" && !_warnedLegacy) {
      console.warn(
        "[SECURITY] ADMIN_PASSWORD_HASH 미설정 — 평문 비밀번호 사용 중.\n" +
        "bcrypt 해시로 전환을 권장합니다:\n" +
        "  node -e \"require('bcryptjs').hash('비밀번호', 12, (e,h) => console.log(h))\""
      );
      _warnedLegacy = true;
    }
    return { mode: "plaintext", plaintext: plain, tokenSource: plain };
  }

  return { mode: "plaintext", tokenSource: "" };
}

/** 비밀번호 검증 (bcrypt 또는 평문 비교) */
export async function verifyAdminPassword(input: string): Promise<boolean> {
  const config = getPasswordConfig();

  if (!config.hash && !config.plaintext) return false;

  if (config.mode === "bcrypt" && config.hash) {
    return bcrypt.compare(input, config.hash);
  }

  // 평문 비교 (타이밍 안전)
  if (config.plaintext) {
    const bufA = Buffer.from(input.padEnd(256, "\0"));
    const bufB = Buffer.from(config.plaintext.padEnd(256, "\0"));
    return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
  }

  return false;
}

/** 세션 쿠키에 저장할 토큰 생성 */
export function generateSessionToken(): string {
  const config = getPasswordConfig();
  return crypto
    .createHash("sha256")
    .update(`${config.tokenSource}::${ADMIN_SIGN_MESSAGE}`)
    .digest("hex");
}

/** 비밀번호 설정 여부 */
export function isAdminPasswordConfigured(): boolean {
  return !!(process.env.ADMIN_PASSWORD_HASH || process.env.ADMIN_PASSWORD);
}

/** bcrypt 해시 생성 유틸 (CLI/설정용) */
export async function hashPassword(password: string, rounds = 12): Promise<string> {
  return bcrypt.hash(password, rounds);
}
