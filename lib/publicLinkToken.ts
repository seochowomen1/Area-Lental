import crypto from "crypto";

/**
 * 신청자 조회·취소 토큰 v2 (audit-fix-1 · 2026-10-26)
 * - DB 저장 없이 검증 가능한 (payload + HMAC 서명) 방식
 * - payload: { v:2, s:"email"|"req", e:email(lowercase), g?:묶음 키, exp:unixSeconds }
 *   · s="email" — 메일로 받은 /my 링크(이메일 소유 증명) → 그 이메일의 신청 전체
 *   · s="req"   — 특정 신청(묶음) 전용 → g(= lib/payment.ts bundleKey: "B:<batchId>" | "R:<requestId>")만
 * - token: base64url(payloadJSON) + "." + base64url(hmacSHA256(payloadB64))
 * - v 필드가 없는 구형(v1 · 이메일 7일) 토큰은 전부 거부한다.
 */

export type ApplicantTokenScope = "email" | "req";

type TokenPayloadV2 = {
  v: 2;
  s: ApplicantTokenScope;
  e: string;
  g?: string;
  exp: number;
};

/** 용도별 유효 시간(초) — 01_spec ④ */
export const APPLICANT_TOKEN_TTL = {
  /** 신청 직후 응답 토큰 */
  APPLY: 60 * 60,
  /** /my 조회 링크 메일 */
  EMAIL_LINK: 30 * 60,
  /** /result 조회 링크 메일(신청번호+이메일로 요청) */
  RESULT_LINK: 30 * 60,
  /** 신청자 결과·자동취소 메일 속 링크 */
  MAIL_RESULT: 7 * 24 * 60 * 60,
} as const;

export type TokenErrorCode = "TOKEN_INVALID" | "TOKEN_EXPIRED";

export const TOKEN_MESSAGES = {
  TOKEN_INVALID: "조회 링크가 올바르지 않거나 이전 방식의 링크입니다. 조회 링크를 다시 받아 주세요.",
  TOKEN_EXPIRED: "조회 링크 유효 시간이 지났습니다. 조회 링크를 다시 받아 주세요.",
  TOKEN_SCOPE: "이 링크로는 해당 신청을 볼 수 없습니다.",
  LINK_REQUIRED: "이메일로 받은 조회 링크로 확인해 주세요.",
} as const;

function timingSafeEqualString(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/** 로그 중복 방지 플래그 */
let _warnedLinkSecretFallback = false;

function getTokenSecret(): string {
  if (process.env.PUBLIC_LINK_SECRET) {
    return process.env.PUBLIC_LINK_SECRET;
  }

  // 운영 환경에서는 반드시 별도 시크릿 필요 (ADMIN_PASSWORD 공유 금지)
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "[SECURITY] PUBLIC_LINK_SECRET이 설정되지 않았습니다. " +
      "운영 환경에서는 ADMIN_PASSWORD와 다른 별도 시크릿을 반드시 설정해 주세요. " +
      "생성: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }

  // 개발 환경 전용 폴백 (ADMIN_PASSWORD와 분리된 파생 키 사용)
  if (process.env.ADMIN_PASSWORD) {
    if (!_warnedLinkSecretFallback) {
      console.warn("[DEV] PUBLIC_LINK_SECRET 미설정 — ADMIN_PASSWORD 기반 파생 키를 사용합니다.");
      _warnedLinkSecretFallback = true;
    }
    return `link-token-dev::${process.env.ADMIN_PASSWORD}`;
  }
  return "dev-local-only-insecure";
}

function sign(payloadB64: string): string {
  return crypto.createHmac("sha256", getTokenSecret()).update(payloadB64).digest("base64url");
}

export function createApplicantLinkToken(args: {
  email: string;
  scope: ApplicantTokenScope;
  /** scope="req"일 때 필수 — bundleKey 형식 */
  group?: string;
  ttlSeconds: number;
  /** 테스트용 현재 시각(ms) */
  nowMs?: number;
}): { token: string; exp: number } {
  const email = (args.email ?? "").toLowerCase().trim();
  if (!email || !email.includes("@")) throw new Error("Invalid email");
  if (args.scope !== "email" && args.scope !== "req") throw new Error("Invalid scope");
  const group = (args.group ?? "").trim();
  if (args.scope === "req" && !group) throw new Error("req 토큰에는 group이 필요합니다.");
  const ttl = Number.isFinite(args.ttlSeconds) && args.ttlSeconds > 0 ? Math.floor(args.ttlSeconds) : APPLICANT_TOKEN_TTL.EMAIL_LINK;
  const now = Math.floor((args.nowMs ?? Date.now()) / 1000);

  const payload: TokenPayloadV2 = {
    v: 2,
    s: args.scope,
    e: email,
    ...(args.scope === "req" ? { g: group } : {}),
    exp: now + ttl,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return { token: `${payloadB64}.${sign(payloadB64)}`, exp: payload.exp };
}

export type VerifiedApplicantToken = {
  ok: true;
  scope: ApplicantTokenScope;
  email: string;
  /** scope="req"일 때만 */
  group: string;
  exp: number;
};

export function verifyApplicantLinkToken(
  token: string,
  nowMs: number = Date.now()
): VerifiedApplicantToken | { ok: false; code: TokenErrorCode; message: string } {
  const invalid = { ok: false as const, code: "TOKEN_INVALID" as const, message: TOKEN_MESSAGES.TOKEN_INVALID };
  const t = (token ?? "").toString().trim();
  const parts = t.split(".");
  if (parts.length !== 2) return invalid;
  const [payloadB64, sig] = parts;
  if (!payloadB64 || !sig) return invalid;
  if (!timingSafeEqualString(sig, sign(payloadB64))) return invalid;

  let payload: Partial<TokenPayloadV2> | null = null;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as Partial<TokenPayloadV2>;
  } catch {
    return invalid;
  }
  // 구형(v1: 이메일 7일 · v 없음)은 서명이 맞아도 거부
  if (!payload || payload.v !== 2) return invalid;
  const scope = payload.s;
  const email = (payload.e ?? "").toString().toLowerCase().trim();
  const group = (payload.g ?? "").toString().trim();
  const exp = Number(payload.exp ?? 0);
  if (scope !== "email" && scope !== "req") return invalid;
  if (!email || !email.includes("@") || !Number.isFinite(exp) || exp <= 0) return invalid;
  if (scope === "req" && !group) return invalid;

  if (exp < Math.floor(nowMs / 1000)) {
    return { ok: false, code: "TOKEN_EXPIRED", message: TOKEN_MESSAGES.TOKEN_EXPIRED };
  }
  return { ok: true, scope, email, group: scope === "req" ? group : "", exp };
}

/**
 * 토큰이 특정 신청(묶음)에 접근할 수 있는지
 * - "ok": 허용 · "scope": req 토큰인데 다른 묶음 · "email": 이메일 불일치
 */
export function authorizeApplicantAccess(
  v: VerifiedApplicantToken,
  target: { email: string; bundleKey: string }
): "ok" | "scope" | "email" {
  const targetEmail = (target.email ?? "").toLowerCase().trim();
  if (v.scope === "req" && v.group !== target.bundleKey) return "scope";
  if (targetEmail !== v.email) return v.scope === "req" ? "scope" : "email";
  return "ok";
}
