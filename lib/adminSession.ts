/**
 * 관리자 세션 v2 — 서명 토큰 (audit-fix-1 [7] · 2026-10-26)
 *
 * ⚠️ Edge(middleware)와 Node(라우트·서버 액션) 양쪽에서 쓰므로 Web Crypto(globalThis.crypto.subtle)만 사용한다.
 *    Node 전용 import(crypto·fs·googleapis) 금지.
 *
 * 쿠키
 * - admin_auth          = "v2." + base64url(JSON{sid,iat,exp}) + "." + base64url(HMAC-SHA256(key, "v2." + payload))
 * - admin_last_activity = ts + "." + base64url(HMAC-SHA256(key, "act." + sid + "." + ts))
 *
 * 서명 키: ADMIN_SESSION_SECRET(선택) → 없으면 ADMIN_PASSWORD_HASH(없으면 ADMIN_PASSWORD)에서 파생.
 *   비밀번호를 바꾸면 모든 세션이 끊긴다. 값은 env에만 둔다(레포 PUBLIC).
 * 폐기(로그아웃) 확인은 Node 쪽 lib/adminSessionStore.ts가 한다(Edge는 서명·만료·활동만).
 */

import { ADMIN_INACTIVITY_TIMEOUT_MS, ADMIN_SESSION_MAX_AGE_SEC } from "@/lib/adminConstants";

export type SessionPayload = { sid: string; iat: number; exp: number };

export type SessionCheck =
  | { ok: true; sid: string; exp: number; activityTs: number }
  | { ok: false; reason: "no_secret" | "missing" | "legacy" | "invalid" | "expired" | "activity_missing" | "activity_invalid" | "activity_expired" };

const enc = new TextEncoder();

function subtle(): SubtleCrypto {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c?.subtle) throw new Error("Web Crypto를 사용할 수 없습니다.");
  return c.subtle;
}

function b64urlFromBytes(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function bytesFromB64url(s: string) {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  try {
    const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
    const out = new Uint8Array(new ArrayBuffer(bin.length));
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/** 서명 키 원천 — 없으면 null(관리자 비밀번호 미설정) */
export function sessionKeySource(): string | null {
  const explicit = (process.env.ADMIN_SESSION_SECRET || "").trim();
  if (explicit) return `admin-session-secret::${explicit}`;
  const pw = (process.env.ADMIN_PASSWORD_HASH || process.env.ADMIN_PASSWORD || "").trim();
  if (!pw) return null;
  return `admin-session-v2::${pw}`;
}

const keyCache = new Map<string, Promise<CryptoKey>>();
function hmacKey(source: string): Promise<CryptoKey> {
  let k = keyCache.get(source);
  if (!k) {
    k = subtle().importKey("raw", enc.encode(source), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
    keyCache.set(source, k);
  }
  return k;
}

async function signText(source: string, text: string): Promise<string> {
  const sig = await subtle().sign("HMAC", await hmacKey(source), enc.encode(text));
  return b64urlFromBytes(new Uint8Array(sig));
}

/** 상수 시간 검증(subtle.verify) */
async function verifyText(source: string, text: string, sigB64: string): Promise<boolean> {
  const sig = bytesFromB64url(sigB64);
  if (!sig || sig.length !== 32) return false;
  return subtle().verify("HMAC", await hmacKey(source), sig, enc.encode(text));
}

function randomSid(): string {
  const b = new Uint8Array(16);
  (globalThis as { crypto: Crypto }).crypto.getRandomValues(b);
  return b64urlFromBytes(b);
}

/** 로그인 시 새 세션 발급 — 로그인할 때마다 다른 sid·서명 */
export async function createAdminSession(nowMs: number = Date.now()): Promise<{ token: string; activity: string; sid: string; exp: number }> {
  const source = sessionKeySource();
  if (!source) throw new Error("관리자 비밀번호가 설정되지 않았습니다.");
  const iat = Math.floor(nowMs / 1000);
  const payload: SessionPayload = { sid: randomSid(), iat, exp: iat + ADMIN_SESSION_MAX_AGE_SEC };
  const payloadB64 = b64urlFromBytes(enc.encode(JSON.stringify(payload)));
  const body = `v2.${payloadB64}`;
  const token = `${body}.${await signText(source, body)}`;
  const activity = await signActivity(payload.sid, nowMs);
  return { token, activity, sid: payload.sid, exp: payload.exp };
}

/** 활동 쿠키 값 생성 */
export async function signActivity(sid: string, tsMs: number): Promise<string> {
  const source = sessionKeySource();
  if (!source) throw new Error("관리자 비밀번호가 설정되지 않았습니다.");
  const ts = String(Math.floor(tsMs));
  return `${ts}.${await signText(source, `act.${sid}.${ts}`)}`;
}

/** 구형(v1) 고정 토큰 모양 — sha256 hex 64자 */
export function isLegacySessionCookie(v: string | null | undefined): boolean {
  return !!v && /^[0-9a-f]{64}$/i.test(v);
}

/** 세션 토큰만 검사(서명·만료) */
export async function verifyAdminSessionToken(
  token: string | null | undefined,
  nowMs: number = Date.now()
): Promise<{ ok: true; payload: SessionPayload } | { ok: false; reason: "no_secret" | "missing" | "legacy" | "invalid" | "expired" }> {
  const source = sessionKeySource();
  if (!source) return { ok: false, reason: "no_secret" };
  if (!token) return { ok: false, reason: "missing" };
  if (isLegacySessionCookie(token)) return { ok: false, reason: "legacy" };
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v2") return { ok: false, reason: "invalid" };
  const body = `${parts[0]}.${parts[1]}`;
  if (!(await verifyText(source, body, parts[2]))) return { ok: false, reason: "invalid" };
  const raw = bytesFromB64url(parts[1]);
  if (!raw) return { ok: false, reason: "invalid" };
  let payload: Partial<SessionPayload>;
  try {
    payload = JSON.parse(new TextDecoder().decode(raw)) as Partial<SessionPayload>;
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (typeof payload.sid !== "string" || !payload.sid || !Number.isFinite(payload.exp) || !Number.isFinite(payload.iat)) {
    return { ok: false, reason: "invalid" };
  }
  if ((payload.exp as number) <= Math.floor(nowMs / 1000)) return { ok: false, reason: "expired" };
  return { ok: true, payload: payload as SessionPayload };
}

/** 세션 + 활동 쿠키 함께 검사 (폐기 여부는 제외) */
export async function checkAdminCookies(
  sessionCookie: string | null | undefined,
  activityCookie: string | null | undefined,
  nowMs: number = Date.now()
): Promise<SessionCheck> {
  const s = await verifyAdminSessionToken(sessionCookie, nowMs);
  if (!s.ok) return s;
  const source = sessionKeySource();
  if (!source) return { ok: false, reason: "no_secret" };
  if (!activityCookie) return { ok: false, reason: "activity_missing" };
  const dot = activityCookie.indexOf(".");
  if (dot <= 0) return { ok: false, reason: "activity_invalid" };
  const ts = activityCookie.slice(0, dot);
  const sig = activityCookie.slice(dot + 1);
  if (!/^\d{1,16}$/.test(ts)) return { ok: false, reason: "activity_invalid" };
  if (!(await verifyText(source, `act.${s.payload.sid}.${ts}`, sig))) return { ok: false, reason: "activity_invalid" };
  const tsNum = Number(ts);
  if (tsNum > nowMs + 60_000) return { ok: false, reason: "activity_invalid" }; // 미래 시각 위조 방지(시계 오차 1분 허용)
  if (nowMs - tsNum > ADMIN_INACTIVITY_TIMEOUT_MS) return { ok: false, reason: "activity_expired" };
  return { ok: true, sid: s.payload.sid, exp: s.payload.exp, activityTs: tsNum };
}

/** 쿠키 헤더 문자열에서 값 꺼내기(Request 객체용) */
export function readCookie(cookieHeader: string | null | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) {
      const v = part.slice(i + 1).trim();
      try {
        return decodeURIComponent(v);
      } catch {
        return v;
      }
    }
  }
  return null;
}
