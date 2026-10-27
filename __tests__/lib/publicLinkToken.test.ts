import crypto from "crypto";
import {
  APPLICANT_TOKEN_TTL,
  authorizeApplicantAccess,
  createApplicantLinkToken,
  verifyApplicantLinkToken,
} from "@/lib/publicLinkToken";

// 테스트 환경에서는 PUBLIC_LINK_SECRET 설정 없이 dev 폴백 사용 (audit-fix-1 v2 토큰)

describe("createApplicantLinkToken (v2)", () => {
  test("email 범위 토큰 생성·검증", () => {
    const { token, exp } = createApplicantLinkToken({ email: "Test@EXAMPLE.com", scope: "email", ttlSeconds: 300 });
    expect(token.split(".")).toHaveLength(2);
    const v = verifyApplicantLinkToken(token);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.scope).toBe("email");
      expect(v.email).toBe("test@example.com");
      expect(v.group).toBe("");
      expect(v.exp).toBe(exp);
    }
  });

  test("req 범위 토큰은 group 필수", () => {
    expect(() => createApplicantLinkToken({ email: "a@b.com", scope: "req", ttlSeconds: 60 })).toThrow();
    const { token } = createApplicantLinkToken({ email: "a@b.com", scope: "req", group: "R:REQ-1", ttlSeconds: 60 });
    const v = verifyApplicantLinkToken(token);
    expect(v.ok && v.scope === "req" && v.group === "R:REQ-1").toBe(true);
  });

  test("빈·잘못된 이메일 → 에러", () => {
    expect(() => createApplicantLinkToken({ email: "", scope: "email", ttlSeconds: 60 })).toThrow("Invalid email");
    expect(() => createApplicantLinkToken({ email: "noatsign", scope: "email", ttlSeconds: 60 })).toThrow("Invalid email");
  });

  test("신청 직후 토큰은 60분", () => {
    expect(APPLICANT_TOKEN_TTL.APPLY).toBe(3600);
  });
});

describe("verifyApplicantLinkToken (v2)", () => {
  test("61분 뒤 → TOKEN_EXPIRED", () => {
    const now = Date.UTC(2026, 9, 26, 1, 0, 0);
    const { token } = createApplicantLinkToken({ email: "u@t.com", scope: "req", group: "R:X", ttlSeconds: APPLICANT_TOKEN_TTL.APPLY, nowMs: now });
    expect(verifyApplicantLinkToken(token, now + 59 * 60 * 1000).ok).toBe(true);
    const r = verifyApplicantLinkToken(token, now + 61 * 60 * 1000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("TOKEN_EXPIRED");
  });

  test("변조된 서명·payload → TOKEN_INVALID", () => {
    const { token } = createApplicantLinkToken({ email: "user@test.com", scope: "email", ttlSeconds: 60 });
    const [payload, sig] = token.split(".");
    const r1 = verifyApplicantLinkToken(`${payload}.INVALID_SIG`);
    expect(!r1.ok && r1.code === "TOKEN_INVALID").toBe(true);
    const fake = Buffer.from(JSON.stringify({ v: 2, s: "email", e: "hacker@evil.com", exp: 9999999999 })).toString("base64url");
    const r2 = verifyApplicantLinkToken(`${fake}.${sig}`);
    expect(!r2.ok && r2.code === "TOKEN_INVALID").toBe(true);
  });

  test("구형 v1 토큰(서명은 맞음, v 없음) → TOKEN_INVALID", () => {
    // v1 형식을 같은 dev 시크릿으로 직접 서명
    const secret = process.env.PUBLIC_LINK_SECRET || (process.env.ADMIN_PASSWORD ? `link-token-dev::${process.env.ADMIN_PASSWORD}` : "dev-local-only-insecure");
    const p = Buffer.from(JSON.stringify({ e: "victim@example.com", exp: 9999999999 })).toString("base64url");
    const s = crypto.createHmac("sha256", secret).update(p).digest("base64url");
    const r = verifyApplicantLinkToken(`${p}.${s}`);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("TOKEN_INVALID");
  });

  test("빈 문자열·점 없음·null → 실패", () => {
    expect(verifyApplicantLinkToken("").ok).toBe(false);
    expect(verifyApplicantLinkToken("nodothere").ok).toBe(false);
    // @ts-expect-error: null 입력 테스트
    expect(verifyApplicantLinkToken(null).ok).toBe(false);
  });
});

describe("authorizeApplicantAccess", () => {
  const mk = (scope: "email" | "req", group = "") => {
    const { token } = createApplicantLinkToken({ email: "victim@example.com", scope, group: group || undefined, ttlSeconds: 60 });
    const v = verifyApplicantLinkToken(token);
    if (!v.ok) throw new Error("bad token");
    return v;
  };
  test("req 토큰: 같은 묶음만 허용 · 같은 이메일의 다른 신청은 scope 거부(피해자 시나리오)", () => {
    const v = mk("req", "R:REQ-ATTACKER");
    expect(authorizeApplicantAccess(v, { email: "victim@example.com", bundleKey: "R:REQ-ATTACKER" })).toBe("ok");
    expect(authorizeApplicantAccess(v, { email: "victim@example.com", bundleKey: "R:REQ-VICTIM" })).toBe("scope");
  });
  test("email 토큰: 이메일 일치만", () => {
    const v = mk("email");
    expect(authorizeApplicantAccess(v, { email: "VICTIM@example.com", bundleKey: "B:x" })).toBe("ok");
    expect(authorizeApplicantAccess(v, { email: "other@example.com", bundleKey: "B:x" })).toBe("email");
  });
});
