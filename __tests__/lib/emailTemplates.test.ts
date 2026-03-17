import { renderTemplate, getDefaultUnifiedTemplates, getDefaultTemplates } from "@/lib/emailTemplates";

// ─── renderTemplate ───

describe("renderTemplate", () => {
  test("기본 변수 치환", () => {
    const template = { subject: "[{{상태}}] {{신청번호}}", body: "{{공간}}에서 {{일시}}" };
    const result = renderTemplate(template, {
      "상태": "승인",
      "신청번호": "REQ-001",
      "공간": "4층 강의실1",
      "일시": "2026-03-16 10:00-12:00",
    });
    expect(result.subject).toBe("[승인] REQ-001");
    expect(result.body).toBe("4층 강의실1에서 2026-03-16 10:00-12:00");
  });

  test("미사용 변수 → 빈 문자열로 제거", () => {
    const template = { subject: "제목", body: "본문 {{없는변수}} 끝" };
    const result = renderTemplate(template, {});
    expect(result.body).toBe("본문  끝");
  });

  test("변수 값에 {{}} 포함 → 재귀 치환 방지 (sanitize)", () => {
    const template = { subject: "{{값}}", body: "test" };
    const result = renderTemplate(template, { "값": "{{공격코드}}" });
    // sanitizeValue로 "{ {공격코드} }"로 변환됨
    expect(result.subject).not.toContain("{{공격코드}}");
    expect(result.subject).toContain("{ {공격코드} }");
  });

  test("모든 기본 변수 치환", () => {
    const template = {
      subject: "{{신청번호}} {{상태}}",
      body: "{{신청번호}} {{공간}} {{카테고리}} {{일시}} {{신청자}} {{상태}} {{요금정보}} {{반려사유}} {{조회링크}} {{장비정보}}"
    };
    const vars: Record<string, string> = {
      "신청번호": "REQ-001",
      "공간": "4층 강의실1",
      "카테고리": "강의실",
      "일시": "2026-03-16 10:00-12:00",
      "신청자": "홍길동",
      "상태": "승인",
      "요금정보": "30,000원",
      "반려사유": "",
      "조회링크": "https://example.com",
      "장비정보": "노트북",
    };
    const result = renderTemplate(template, vars);
    expect(result.subject).toBe("REQ-001 승인");
    expect(result.body).toContain("홍길동");
    expect(result.body).toContain("노트북");
  });

  test("빈 템플릿 → 빈 결과", () => {
    const result = renderTemplate({ subject: "", body: "" }, {});
    expect(result.subject).toBe("");
    expect(result.body).toBe("");
  });
});

// ─── getDefaultUnifiedTemplates ───

describe("getDefaultUnifiedTemplates", () => {
  test("4가지 상태 모두 포함", () => {
    const templates = getDefaultUnifiedTemplates();
    expect(templates["접수"]).toBeDefined();
    expect(templates["승인"]).toBeDefined();
    expect(templates["반려"]).toBeDefined();
    expect(templates["취소"]).toBeDefined();
  });

  test("각 템플릿에 subject, body 존재", () => {
    const templates = getDefaultUnifiedTemplates();
    for (const status of ["접수", "승인", "반려", "취소"] as const) {
      expect(templates[status].subject).toBeTruthy();
      expect(templates[status].body).toBeTruthy();
    }
  });

  test("접수 subject에 {{카테고리}} 변수 포함", () => {
    const templates = getDefaultUnifiedTemplates();
    expect(templates["접수"].subject).toContain("{{카테고리}}");
  });

  test("반려 body에 {{반려사유}} 변수 포함", () => {
    const templates = getDefaultUnifiedTemplates();
    expect(templates["반려"].body).toContain("{{반려사유}}");
  });

  test("승인 body에 {{요금정보}} 변수 포함", () => {
    const templates = getDefaultUnifiedTemplates();
    expect(templates["승인"].body).toContain("{{요금정보}}");
  });
});

// ─── getDefaultTemplates (하위 호환) ───

describe("getDefaultTemplates", () => {
  test("lecture, studio, gallery 모두 동일한 템플릿", () => {
    const all = getDefaultTemplates();
    expect(all.lecture).toBeDefined();
    expect(all.studio).toBeDefined();
    expect(all.gallery).toBeDefined();
    // 통합 후 모든 카테고리가 동일
    expect(all.lecture["접수"]!.subject).toBe(all.studio["접수"]!.subject);
    expect(all.lecture["접수"]!.subject).toBe(all.gallery["접수"]!.subject);
  });
});
