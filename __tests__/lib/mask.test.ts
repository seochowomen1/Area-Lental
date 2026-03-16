import { maskName, maskPhone, maskEmail, maskAddress, maskBirth } from "@/lib/mask";

describe("maskName", () => {
  test("한글 2글자 이름", () => {
    expect(maskName("홍길")).toBe("홍○");
  });

  test("한글 3글자 이름", () => {
    expect(maskName("홍길동")).toBe("홍○○");
  });

  test("한글 4글자 이름", () => {
    expect(maskName("남궁민수")).toBe("남○○○");
  });

  test("1글자 이름", () => {
    expect(maskName("홍")).toBe("홍");
  });

  test("빈 문자열", () => {
    expect(maskName("")).toBe("");
  });

  test("영문 이름", () => {
    expect(maskName("Kim")).toBe("K○○");
  });

  test("공백만 있는 입력", () => {
    expect(maskName("   ")).toBe("");
  });
});

describe("maskPhone", () => {
  test("하이픈 포함 (010-1234-5678)", () => {
    expect(maskPhone("010-1234-5678")).toBe("010-****-5678");
  });

  test("하이픈 포함 3자리 중간 (010-123-4567)", () => {
    expect(maskPhone("010-123-4567")).toBe("010-****-4567");
  });

  test("하이픈 없는 형식 (01012345678)", () => {
    expect(maskPhone("01012345678")).toBe("010****5678");
  });

  test("짧은 번호 (fallback)", () => {
    expect(maskPhone("12345")).toBe("12345");
  });

  test("빈 문자열", () => {
    expect(maskPhone("")).toBe("");
  });

  test("02-1234-5678 (서울 지역번호)", () => {
    expect(maskPhone("02-1234-5678")).toBe("02-****-5678");
  });
});

describe("maskEmail", () => {
  test("일반 이메일", () => {
    expect(maskEmail("user@example.com")).toBe("us***@example.com");
  });

  test("짧은 로컬 파트 (2글자)", () => {
    expect(maskEmail("ab@example.com")).toBe("ab***@example.com");
  });

  test("짧은 로컬 파트 (1글자)", () => {
    expect(maskEmail("a@example.com")).toBe("a***@example.com");
  });

  test("빈 문자열", () => {
    expect(maskEmail("")).toBe("");
  });

  test("@ 없는 문자열", () => {
    expect(maskEmail("noatsign")).toBe("noatsign");
  });

  test("빈 로컬 파트 (@domain.com)", () => {
    expect(maskEmail("@domain.com")).toBe("***@domain.com");
  });
});

describe("maskAddress", () => {
  test("3단위 이상 주소", () => {
    expect(maskAddress("서울시 서초구 방배동 123-4")).toBe("서울시 서초구 ***");
  });

  test("2단위 주소", () => {
    expect(maskAddress("서울시 서초구")).toBe("서울시 ***");
  });

  test("1단위 주소", () => {
    expect(maskAddress("서울")).toBe("서울 ***");
  });

  test("빈 문자열", () => {
    expect(maskAddress("")).toBe("");
  });
});

describe("maskBirth", () => {
  test("YYYY-MM-DD 형식", () => {
    expect(maskBirth("1990-05-15")).toBe("1990-**-**");
  });

  test("YYYY-MM-DD 다른 날짜", () => {
    expect(maskBirth("2000-12-31")).toBe("2000-**-**");
  });

  test("비표준 형식 (길이 > 4)", () => {
    expect(maskBirth("19900515")).toBe("1990-**-**");
  });

  test("짧은 문자열", () => {
    expect(maskBirth("1990")).toBe("1990");
  });

  test("빈 문자열", () => {
    expect(maskBirth("")).toBe("");
  });
});
