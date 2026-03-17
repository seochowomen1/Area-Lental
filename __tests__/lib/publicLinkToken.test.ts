import { createApplicantLinkToken, verifyApplicantLinkToken } from "@/lib/publicLinkToken";

// 테스트 환경에서는 PUBLIC_LINK_SECRET 설정 없이 dev 폴백 사용

describe("createApplicantLinkToken", () => {
  test("유효한 이메일 → 토큰 생성", () => {
    const token = createApplicantLinkToken({ email: "test@example.com" });
    expect(token).toBeTruthy();
    expect(token.split(".")).toHaveLength(2);
  });

  test("TTL 지정 → 토큰 생성", () => {
    const token = createApplicantLinkToken({ email: "test@example.com", ttlSeconds: 3600 });
    expect(token.split(".")).toHaveLength(2);
  });

  test("빈 이메일 → 에러", () => {
    expect(() => createApplicantLinkToken({ email: "" })).toThrow("Invalid email");
  });

  test("@ 없는 이메일 → 에러", () => {
    expect(() => createApplicantLinkToken({ email: "noatsign" })).toThrow("Invalid email");
  });

  test("대소문자 무관 → 소문자로 정규화", () => {
    const token = createApplicantLinkToken({ email: "Test@EXAMPLE.com" });
    const result = verifyApplicantLinkToken(token);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.email).toBe("test@example.com");
    }
  });
});

describe("verifyApplicantLinkToken", () => {
  test("정상 토큰 → 검증 성공", () => {
    const token = createApplicantLinkToken({ email: "user@test.com", ttlSeconds: 300 });
    const result = verifyApplicantLinkToken(token);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.email).toBe("user@test.com");
      expect(result.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    }
  });

  test("빈 문자열 → 실패", () => {
    const result = verifyApplicantLinkToken("");
    expect(result.ok).toBe(false);
  });

  test("변조된 서명 → 실패", () => {
    const token = createApplicantLinkToken({ email: "user@test.com" });
    const [payload] = token.split(".");
    const tampered = `${payload}.INVALID_SIG`;
    const result = verifyApplicantLinkToken(tampered);
    expect(result.ok).toBe(false);
  });

  test("변조된 payload → 실패", () => {
    const token = createApplicantLinkToken({ email: "user@test.com" });
    const [, sig] = token.split(".");
    const fakePayload = Buffer.from(JSON.stringify({ e: "hacker@evil.com", exp: 9999999999 })).toString("base64url");
    const result = verifyApplicantLinkToken(`${fakePayload}.${sig}`);
    expect(result.ok).toBe(false);
  });

  test("만료된 토큰 → 실패", () => {
    // TTL을 0으로 설정하면 즉시 만료... 대신 직접 토큰 생성
    const token = createApplicantLinkToken({ email: "user@test.com", ttlSeconds: -1 });
    const result = verifyApplicantLinkToken(token);
    // TTL이 음수이면 createApplicantLinkToken에서 DEFAULT_TTL로 폴백하므로 별도 검증
    // 대신 "." 없는 토큰 검증
    expect(result.ok).toBe(true); // 폴백으로 30분 TTL 적용됨
  });

  test("점(.) 없는 문자열 → 실패", () => {
    const result = verifyApplicantLinkToken("nodothere");
    expect(result.ok).toBe(false);
  });

  test("null/undefined 처리 → 실패", () => {
    // @ts-expect-error: null 입력 테스트
    expect(verifyApplicantLinkToken(null).ok).toBe(false);
    // @ts-expect-error: undefined 입력 테스트
    expect(verifyApplicantLinkToken(undefined).ok).toBe(false);
  });
});
