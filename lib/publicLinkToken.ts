import crypto from "crypto";

/**
 * 신청자용 "내 예약 조회" 매직링크 토큰
 * - DB 저장 없이 검증 가능하도록 (payload + HMAC 서명) 방식 사용
 * - payload: { e: email(lowercase), exp: unixSeconds }
 * - token: base64url(payloadJSON) + "." + base64url(hmacSHA256(signatureOverPayloadB64))
 */

type TokenPayload = {
  e: string;
  exp: number;
};

const DEFAULT_TTL_SECONDS = 30 * 60; // 30분

function base64UrlEncode(buf: Buffer) {
  return buf.toString("base64url");
}

function base64UrlDecodeToBuffer(s: string) {
  return Buffer.from(s, "base64url");
}

function timingSafeEqualString(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function getTokenSecret(): string {
  // 운영에서는 반드시 별도 secret을 설정하는 것을 권장합니다.
  // 로컬 개발 편의: 없으면 ADMIN_PASSWORD 또는 fallback 사용
  return (
    process.env.PUBLIC_LINK_SECRET ||
    process.env.ADMIN_PASSWORD ||
    "dev-secret-change-me"
  ).toString();
}

export function createApplicantLinkToken(args: {
  email: string;
  ttlSeconds?: number;
}): string {
  const email = (args.email ?? "").toLowerCase().trim();
  if (!email || !email.includes("@")) {
    throw new Error("Invalid email");
  }

  const ttl = Number.isFinite(args.ttlSeconds) && (args.ttlSeconds as number) > 0
    ? Math.floor(args.ttlSeconds as number)
    : DEFAULT_TTL_SECONDS;

  const payload: TokenPayload = {
    e: email,
    exp: Math.floor(Date.now() / 1000) + ttl,
  };

  const payloadB64 = base64UrlEncode(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = crypto.createHmac("sha256", getTokenSecret()).update(payloadB64).digest("base64url");
  return `${payloadB64}.${sig}`;
}

export function verifyApplicantLinkToken(token: string):
  | { ok: true; email: string; exp: number }
  | { ok: false; message: string } {
  const t = (token ?? "").toString().trim();
  const parts = t.split(".");
  if (parts.length !== 2) return { ok: false, message: "토큰 형식이 올바르지 않습니다." };

  const [payloadB64, sig] = parts;
  if (!payloadB64 || !sig) return { ok: false, message: "토큰 형식이 올바르지 않습니다." };

  const expected = crypto.createHmac("sha256", getTokenSecret()).update(payloadB64).digest("base64url");
  if (!timingSafeEqualString(sig, expected)) {
    return { ok: false, message: "토큰 검증에 실패했습니다." };
  }

  let payload: TokenPayload | null = null;
  try {
    payload = JSON.parse(base64UrlDecodeToBuffer(payloadB64).toString("utf8")) as TokenPayload;
  } catch {
    return { ok: false, message: "토큰 payload가 올바르지 않습니다." };
  }

  const email = (payload?.e ?? "").toString().toLowerCase().trim();
  const exp = Number(payload?.exp ?? 0);
  if (!email || !email.includes("@") || !Number.isFinite(exp) || exp <= 0) {
    return { ok: false, message: "토큰 payload가 올바르지 않습니다." };
  }

  const now = Math.floor(Date.now() / 1000);
  if (exp < now) {
    return { ok: false, message: "토큰이 만료되었습니다. 다시 링크를 요청해 주세요." };
  }

  return { ok: true, email, exp };
}
