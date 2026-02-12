/**
 * 이메일 템플릿 관리
 *
 * 카테고리별(강의실/E-스튜디오/갤러리) + 상태별(접수/승인/반려/취소) 이메일 본문 템플릿을
 * Google Sheets(email_templates 시트)에 저장·로드합니다.
 *
 * 변수 치환:
 *   {{신청번호}}, {{공간}}, {{카테고리}}, {{일시}}, {{신청자}}, {{상태}},
 *   {{요금정보}}, {{반려사유}}, {{조회링크}}, {{장비정보}}
 */

import { getDatabase } from "./database";

export type TemplateCategory = "lecture" | "studio" | "gallery";
export type TemplateStatus = "접수" | "승인" | "반려" | "취소";

export type EmailTemplate = {
  subject: string;
  body: string;
};

export type AllTemplates = Record<TemplateCategory, Partial<Record<TemplateStatus, EmailTemplate>>>;

const DEFAULT_SUBJECT: Record<TemplateStatus, string> = {
  "접수": "[신청완료] {{카테고리}} 대관 신청 ({{신청번호}})",
  "승인": "[승인] {{카테고리}} 대관 신청 결과 ({{신청번호}})",
  "반려": "[반려] {{카테고리}} 대관 신청 결과 ({{신청번호}})",
  "취소": "[취소] {{카테고리}} 대관 신청 결과 ({{신청번호}})",
};

const DEFAULT_BODY_RECEIVED = `안녕하세요. 서초여성가족플라자 서초센터입니다.

{{카테고리}} 대관 신청이 정상적으로 완료되었습니다.
담당자 검토 후 승인/반려 결과를 이메일로 안내드리겠습니다.

- 신청번호: {{신청번호}}
- 공간({{카테고리}}): {{공간}}
- 일시: {{일시}}
{{장비정보}}

감사합니다.`;

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
      status === "접수"
        ? DEFAULT_BODY_RECEIVED
        : status === "승인"
        ? DEFAULT_BODY_APPROVED
        : status === "반려"
        ? DEFAULT_BODY_REJECTED
        : DEFAULT_BODY_CANCELLED,
  };
}

const ALL_STATUSES: TemplateStatus[] = ["접수", "승인", "반려", "취소"];

export function getDefaultTemplates(): AllTemplates {
  const makeCategory = () => Object.fromEntries(ALL_STATUSES.map((s) => [s, defaultTemplateFor(s)])) as Record<TemplateStatus, EmailTemplate>;
  return {
    lecture: makeCategory(),
    studio: makeCategory(),
    gallery: makeCategory(),
  };
}

/**
 * Google Sheets에서 이메일 템플릿을 로드합니다.
 * DB에 저장된 값이 없으면 기본 템플릿을 반환합니다.
 */
export async function loadTemplates(): Promise<AllTemplates> {
  const defaults = getDefaultTemplates();

  try {
    const db = getDatabase();
    const rows = await db.getEmailTemplates();

    for (const row of rows) {
      const cat = row.category as TemplateCategory;
      const st = row.status as TemplateStatus;
      if (!defaults[cat]) continue;
      if (!ALL_STATUSES.includes(st)) continue;

      defaults[cat][st] = {
        subject: row.subject || defaults[cat][st]!.subject,
        body: row.body || defaults[cat][st]!.body,
      };
    }
  } catch {
    // DB 연결 실패 시 기본 템플릿 반환
  }

  return defaults;
}

/**
 * 특정 카테고리+상태의 이메일 템플릿을 Google Sheets에 저장합니다.
 */
export async function saveTemplates(
  category: TemplateCategory,
  status: TemplateStatus,
  subject: string,
  body: string,
): Promise<void> {
  const db = getDatabase();
  await db.saveEmailTemplate(category, status, subject, body);
}

export async function getTemplate(category: TemplateCategory, status: TemplateStatus): Promise<EmailTemplate> {
  const all = await loadTemplates();
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
