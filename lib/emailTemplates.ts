/**
 * 이메일 템플릿 관리 (통합)
 *
 * 상태별(접수/승인/반려/취소) 이메일 본문 템플릿을
 * Google Sheets(email_templates 시트)에 저장·로드합니다.
 * 공간 카테고리 구분 없이 하나의 템플릿 세트를 사용합니다.
 *
 * 변수 치환:
 *   {{신청번호}}, {{공간}}, {{카테고리}}, {{일시}}, {{신청자}}, {{상태}},
 *   {{요금정보}}, {{반려사유}}, {{조회링크}}, {{장비정보}}
 */

import { getDatabase } from "./database";

export type TemplateStatus = "접수" | "승인" | "반려" | "취소";

export type EmailTemplate = {
  subject: string;
  body: string;
};

export type UnifiedTemplates = Record<TemplateStatus, EmailTemplate>;

// 하위 호환: 기존 TemplateCategory 타입 export (mail.ts 등에서 사용)
export type TemplateCategory = "lecture" | "studio" | "gallery";
// 하위 호환: 기존 AllTemplates 타입 export
export type AllTemplates = Record<TemplateCategory, Partial<Record<TemplateStatus, EmailTemplate>>>;

/** 통합 저장 시 사용하는 내부 카테고리 키 */
const UNIFIED_CATEGORY = "common";

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

export function getDefaultUnifiedTemplates(): UnifiedTemplates {
  return Object.fromEntries(ALL_STATUSES.map((s) => [s, defaultTemplateFor(s)])) as UnifiedTemplates;
}

/**
 * 하위 호환용: 기존 API가 category별로 반환하는 형태 유지
 * 내부적으로는 통합 템플릿 1세트를 모든 카테고리에 동일하게 제공
 */
export function getDefaultTemplates(): AllTemplates {
  const unified = getDefaultUnifiedTemplates();
  return {
    lecture: { ...unified },
    studio: { ...unified },
    gallery: { ...unified },
  };
}

/**
 * Google Sheets에서 이메일 템플릿을 로드합니다.
 * "common" 카테고리로 저장된 통합 템플릿을 우선 사용하고,
 * 없으면 기존 카테고리별 데이터에서 폴백합니다.
 */
export async function loadUnifiedTemplates(): Promise<UnifiedTemplates> {
  const defaults = getDefaultUnifiedTemplates();

  try {
    const db = getDatabase();
    const rows = await db.getEmailTemplates();

    // "common" 카테고리 템플릿 우선
    for (const row of rows) {
      if (row.category !== UNIFIED_CATEGORY) continue;
      const st = row.status as TemplateStatus;
      if (!ALL_STATUSES.includes(st)) continue;
      defaults[st] = {
        subject: row.subject || defaults[st].subject,
        body: row.body || defaults[st].body,
      };
    }
  } catch {
    // DB 연결 실패 시 기본 템플릿 반환
  }

  return defaults;
}

/**
 * 하위 호환: 기존 API 응답 형태 (category→status→template)
 * 내부적으로 통합 템플릿을 모든 카테고리에 동일하게 반환
 */
export async function loadTemplates(): Promise<AllTemplates> {
  const unified = await loadUnifiedTemplates();
  return {
    lecture: { ...unified },
    studio: { ...unified },
    gallery: { ...unified },
  };
}

/**
 * 통합 이메일 템플릿을 Google Sheets에 저장합니다.
 * 항상 "common" 카테고리로 저장합니다.
 */
export async function saveTemplates(
  _category: string,
  status: TemplateStatus,
  subject: string,
  body: string,
): Promise<void> {
  const db = getDatabase();
  await db.saveEmailTemplate(UNIFIED_CATEGORY, status, subject, body);
}

/**
 * 특정 상태의 이메일 템플릿을 반환합니다.
 * category 인자는 하위 호환을 위해 남겨두었으나 무시됩니다.
 */
export async function getTemplate(_category: TemplateCategory | string, status: TemplateStatus): Promise<EmailTemplate> {
  const all = await loadUnifiedTemplates();
  return all[status] ?? defaultTemplateFor(status);
}

/** 변수 값 내의 {{...}} 패턴을 무력화하여 재귀 치환 방지 */
function sanitizeValue(value: string): string {
  return value.replace(/\{\{/g, "{ {").replace(/\}\}/g, "} }");
}

/** 변수를 실제 값으로 치환합니다 */
export function renderTemplate(
  template: EmailTemplate,
  vars: Record<string, string>,
): { subject: string; body: string } {
  function replace(text: string) {
    let result = text;
    for (const [key, value] of Object.entries(vars)) {
      result = result.replaceAll(`{{${key}}}`, sanitizeValue(value));
    }
    // 미치환 변수 제거 (사용되지 않는 플레이스홀더 정리)
    result = result.replace(/\{\{[^}]+\}\}/g, "");
    return result;
  }
  return {
    subject: replace(template.subject),
    body: replace(template.body),
  };
}
