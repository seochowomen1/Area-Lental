/**
 * 이메일 템플릿 관리
 *
 * 카테고리별(강의실/E-스튜디오/갤러리) + 상태별(승인/반려/취소) 이메일 본문 템플릿을
 * data/email-templates.json에 저장·로드합니다.
 *
 * 변수 치환:
 *   {{신청번호}}, {{공간}}, {{카테고리}}, {{일시}}, {{신청자}}, {{상태}},
 *   {{요금정보}}, {{반려사유}}, {{조회링크}}
 */

import fs from "fs";
import path from "path";

const TEMPLATE_FILE = path.join(process.cwd(), "data", "email-templates.json");

export type TemplateCategory = "lecture" | "studio" | "gallery";
export type TemplateStatus = "승인" | "반려" | "취소";

export type EmailTemplate = {
  subject: string;
  body: string;
};

export type AllTemplates = Record<TemplateCategory, Partial<Record<TemplateStatus, EmailTemplate>>>;

const DEFAULT_SUBJECT: Record<TemplateStatus, string> = {
  "승인": "[승인] {{카테고리}} 대관 신청 결과 ({{신청번호}})",
  "반려": "[반려] {{카테고리}} 대관 신청 결과 ({{신청번호}})",
  "취소": "[취소] {{카테고리}} 대관 신청 결과 ({{신청번호}})",
};

const DEFAULT_BODY_APPROVED = `안녕하세요. 서초여성가족플라자 서초센터입니다.

- 신청번호: {{신청번호}}
- 공간({{카테고리}}): {{공간}}
- 일시: {{일시}}
- 처리상태: {{상태}}

{{요금정보}}

승인/반려 결과는 아래 페이지에서도 확인할 수 있습니다.
{{조회링크}}

감사합니다.`;

const DEFAULT_BODY_REJECTED = `안녕하세요. 서초여성가족플라자 서초센터입니다.

- 신청번호: {{신청번호}}
- 공간({{카테고리}}): {{공간}}
- 일시: {{일시}}
- 처리상태: {{상태}}

반려 사유:
{{반려사유}}

승인/반려 결과는 아래 페이지에서도 확인할 수 있습니다.
{{조회링크}}

감사합니다.`;

const DEFAULT_BODY_CANCELLED = `안녕하세요. 서초여성가족플라자 서초센터입니다.

- 신청번호: {{신청번호}}
- 공간({{카테고리}}): {{공간}}
- 일시: {{일시}}
- 처리상태: {{상태}}

취소 처리되었습니다.

승인/반려 결과는 아래 페이지에서도 확인할 수 있습니다.
{{조회링크}}

감사합니다.`;

function defaultTemplateFor(status: TemplateStatus): EmailTemplate {
  return {
    subject: DEFAULT_SUBJECT[status],
    body:
      status === "승인"
        ? DEFAULT_BODY_APPROVED
        : status === "반려"
        ? DEFAULT_BODY_REJECTED
        : DEFAULT_BODY_CANCELLED,
  };
}

export function getDefaultTemplates(): AllTemplates {
  return {
    lecture: {
      "승인": defaultTemplateFor("승인"),
      "반려": defaultTemplateFor("반려"),
      "취소": defaultTemplateFor("취소"),
    },
    studio: {
      "승인": defaultTemplateFor("승인"),
      "반려": defaultTemplateFor("반려"),
      "취소": defaultTemplateFor("취소"),
    },
    gallery: {
      "승인": defaultTemplateFor("승인"),
      "반려": defaultTemplateFor("반려"),
      "취소": defaultTemplateFor("취소"),
    },
  };
}

export function loadTemplates(): AllTemplates {
  try {
    if (fs.existsSync(TEMPLATE_FILE)) {
      const raw = fs.readFileSync(TEMPLATE_FILE, "utf-8");
      const parsed = JSON.parse(raw) as Partial<AllTemplates>;
      const defaults = getDefaultTemplates();

      // Merge with defaults to fill any missing fields
      for (const cat of ["lecture", "studio", "gallery"] as TemplateCategory[]) {
        if (!parsed[cat]) continue;
        for (const st of ["승인", "반려", "취소"] as TemplateStatus[]) {
          if (parsed[cat]![st]) {
            defaults[cat][st] = {
              subject: parsed[cat]![st]!.subject || defaults[cat][st]!.subject,
              body: parsed[cat]![st]!.body || defaults[cat][st]!.body,
            };
          }
        }
      }
      return defaults;
    }
  } catch {
    // ignore
  }
  return getDefaultTemplates();
}

export function saveTemplates(templates: AllTemplates): void {
  const dir = path.dirname(TEMPLATE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(TEMPLATE_FILE, JSON.stringify(templates, null, 2), "utf-8");
}

export function getTemplate(category: TemplateCategory, status: TemplateStatus): EmailTemplate {
  const all = loadTemplates();
  return all[category]?.[status] ?? defaultTemplateFor(status);
}

/** 변수를 실제 값으로 치환합니다 */
export function renderTemplate(
  template: EmailTemplate,
  vars: Record<string, string>,
): { subject: string; body: string } {
  function replace(text: string) {
    let result = text;
    for (const [key, value] of Object.entries(vars)) {
      result = result.replaceAll(`{{${key}}}`, value);
    }
    return result;
  }
  return {
    subject: replace(template.subject),
    body: replace(template.body),
  };
}
