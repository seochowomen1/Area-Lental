/**
 * 신청자 조회 권한(토큰) 브라우저 보관 — 클라이언트 전용 (audit-fix-1 [1][10])
 *
 * - sessionStorage["applicantAccess"] = { token, s, g?, exp } — 탭을 닫으면 사라지고, exp(서버 토큰 만료)가 지나면 읽지 않는다.
 * - localStorage는 쓰지 않는다. 구형 localStorage["applicantToken"]은 공개 조회 화면이 열릴 때마다 지운다.
 * - 주소창에 토큰을 남기지 않는다: 메일 링크(?token=)로 들어오면 sessionStorage로 옮기고 history.replaceState로 뺀다.
 * - 토큰 해석·인가는 서버만 한다. 여기서는 payload의 s·exp를 표시·만료 판단용으로만 읽는다(서명 검증 없음).
 */

export const APPLICANT_ACCESS_KEY = "applicantAccess";
const LEGACY_LOCAL_KEY = "applicantToken";

export type ApplicantAccess = {
  token: string;
  s: "email" | "req" | "";
  g?: string;
  /** unix seconds */
  exp: number;
};

/** 토큰 payload(base64url JSON)에서 s·g·exp만 읽는다 — 실패하면 null */
function peekPayload(token: string): { s: "email" | "req" | ""; g?: string; exp: number } | null {
  try {
    const b64 = token.split(".")[0] ?? "";
    if (!b64) return null;
    const norm = b64.replace(/-/g, "+").replace(/_/g, "/");
    const pad = norm + "===".slice((norm.length + 3) % 4);
    const json = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(pad), (c) => c.charCodeAt(0)))) as { s?: string; g?: string; exp?: number };
    const s = json.s === "email" || json.s === "req" ? json.s : "";
    const exp = Number(json.exp ?? 0);
    return { s, g: typeof json.g === "string" ? json.g : undefined, exp: Number.isFinite(exp) ? exp : 0 };
  } catch {
    return null;
  }
}

/** 구형 localStorage 토큰 삭제(공개 조회 화면 진입 시마다) */
export function purgeLegacyApplicantToken() {
  try {
    localStorage.removeItem(LEGACY_LOCAL_KEY);
  } catch {
    /* 무시 */
  }
}

/** 토큰 저장 — exp를 모르면 payload에서 읽고, 그것도 없으면 60분 */
export function saveApplicantAccess(token: string, expSeconds?: number) {
  const t = (token ?? "").trim();
  if (!t) return;
  const peek = peekPayload(t);
  const exp = expSeconds && expSeconds > 0 ? expSeconds : peek?.exp && peek.exp > 0 ? peek.exp : Math.floor(Date.now() / 1000) + 60 * 60;
  const value: ApplicantAccess = { token: t, s: peek?.s ?? "", ...(peek?.g ? { g: peek.g } : {}), exp };
  try {
    sessionStorage.setItem(APPLICANT_ACCESS_KEY, JSON.stringify(value));
  } catch {
    /* 저장 불가(사파리 개인 모드 등) — 이번 화면에서만 쓴다 */
  }
}

/** 저장된 조회 권한 — 없거나 만료면 null(만료분은 지움) */
export function readApplicantAccess(): ApplicantAccess | null {
  try {
    const raw = sessionStorage.getItem(APPLICANT_ACCESS_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as ApplicantAccess;
    if (!v?.token) return null;
    if (!v.exp || v.exp <= Math.floor(Date.now() / 1000)) {
      sessionStorage.removeItem(APPLICANT_ACCESS_KEY);
      return null;
    }
    return v;
  } catch {
    return null;
  }
}

/** "이 기기에서 조회 기록 지우기" — sessionStorage + 구형 localStorage */
export function clearApplicantAccess() {
  try {
    sessionStorage.removeItem(APPLICANT_ACCESS_KEY);
  } catch {
    /* 무시 */
  }
  purgeLegacyApplicantToken();
}

/**
 * 주소창의 ?token= 을 sessionStorage로 옮기고 주소에서 뺀다(메일 링크 진입).
 * 옮긴 토큰을 돌려준다(없으면 "").
 */
export function adoptTokenFromUrl(): string {
  if (typeof window === "undefined") return "";
  try {
    const url = new URL(window.location.href);
    const token = (url.searchParams.get("token") ?? "").trim();
    if (!token) return "";
    saveApplicantAccess(token);
    url.searchParams.delete("token");
    const qs = url.searchParams.toString();
    window.history.replaceState(window.history.state, "", `${url.pathname}${qs ? `?${qs}` : ""}${url.hash}`);
    return token;
  } catch {
    return "";
  }
}
