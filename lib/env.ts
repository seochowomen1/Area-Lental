import { z } from "zod";

/**
 * 환경변수는 "기능(용도)" 단위로 검증합니다.
 *
 * ✅ MOCK_MODE=true 로컬 개발 시
 *  - Google/SMTP 없이도 /space → /apply → /success, /admin/settings 흐름 테스트 가능
 *  - 실제로 필요한 지점에서만 해당 env를 요구합니다.
 */

export function isMockMode(): boolean {
  return (process.env.MOCK_MODE ?? "").trim().toLowerCase() === "true";
}

/** 기본값(로컬 편의)까지 포함한 공통 env */
const BaseSchema = z.object({
  MOCK_MODE: z.string().optional(),
  APP_BASE_URL: z.string().url().optional()
}).passthrough();

export type BaseEnv = z.infer<typeof BaseSchema>;

export function getBaseEnv(): BaseEnv {
  const parsed = BaseSchema.safeParse(process.env);
  if (!parsed.success) {
    // APP_BASE_URL이 URL 형식이 아닐 때 등
    throw new Error(
      `환경변수 형식 오류: ${parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("\n")}`
    );
  }

  // APP_BASE_URL: Vercel 배포 시 VERCEL_URL 자동 사용, 로컬 fallback
  const vercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined;
  return {
    ...parsed.data,
    APP_BASE_URL: parsed.data.APP_BASE_URL ?? vercelUrl ?? "http://localhost:3000"
  };
}

/** 관리자 로그인에 필요한 env */
const AdminSchema = z.object({
  ADMIN_PASSWORD: z.string().min(1, "Required")
}).passthrough();

export function requireAdminEnv(): z.infer<typeof AdminSchema> {
  const parsed = AdminSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `환경변수 설정 오류(관리자 로그인):\n${parsed.error.issues.map(i => `${i.path.join(".")}: Required`).join("\n")}`
    );
  }
  return parsed.data;
}

/** Google Sheets/Drive 사용에 필요한 env (운영/실서버 모드) */
const GoogleSchema = z.object({
  GOOGLE_SERVICE_ACCOUNT_JSON: z.string().min(1, "Required"),
  GOOGLE_SHEET_ID: z.string().min(1, "Required"),
  GOOGLE_DRIVE_FOLDER_ID: z.string().min(1, "Required")
}).passthrough();

export function requireGoogleEnv(): z.infer<typeof GoogleSchema> {
  const parsed = GoogleSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `환경변수 설정 오류(Google 연동):\n` +
      `- MOCK_MODE=true 로 실행하려면 .env.local에 MOCK_MODE=true 를 설정하세요.\n` +
      parsed.error.issues.map(i => `${i.path.join(".")}: Required`).join("\n")
    );
  }
  return parsed.data;
}

/** SMTP 메일 발송(선택) */
const SmtpSchema = z.object({
  SMTP_HOST: z.string().min(1, "Required"),
  SMTP_PORT: z.string().min(1, "Required"),
  SMTP_USER: z.string().min(1, "Required"),
  SMTP_PASS: z.string().min(1, "Required"),
  SMTP_FROM: z.string().min(1, "Required"),
  ADMIN_NOTIFY_EMAIL: z.string().email().optional()
}).passthrough();

/**
 * SMTP는 "없어도" 앱이 동작하도록 optional입니다.
 * - 운영에서 메일이 꼭 필요하면 Vercel env에 전부 설정하세요.
 */
export function getSmtpEnvOptional(): (z.infer<typeof SmtpSchema> & { ADMIN_NOTIFY_EMAIL?: string }) | null {
  // 아무것도 없으면 null
  const any = process.env.SMTP_HOST || process.env.SMTP_PORT || process.env.SMTP_USER || process.env.SMTP_PASS || process.env.SMTP_FROM;
  if (!any) return null;

  const parsed = SmtpSchema.safeParse(process.env);
  if (!parsed.success) {
    // SMTP는 선택이므로, 형식이 망가진 경우에만 명확히 오류
    throw new Error(
      `환경변수 설정 오류(SMTP):\n${parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("\n")}`
    );
  }
  return parsed.data;
}

/**
 * Google Drive 업로드용 OAuth(선택 · 2026-10-19)
 * - 서비스 계정은 My Drive 저장 용량이 없어 파일 생성이 403(storageQuotaExceeded)으로 실패한다.
 * - 세 값이 모두 있으면 첨부 업로드만 드라이브 소유자 OAuth 토큰으로 수행(범위 drive.file · 앱 전용 폴더).
 * - 발급: scripts/google-oauth-token.mjs
 */
const GoogleOAuthSchema = z.object({
  GOOGLE_OAUTH_CLIENT_ID: z.string().min(1, "Required"),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1, "Required"),
  GOOGLE_OAUTH_REFRESH_TOKEN: z.string().min(1, "Required"),
  /** 앱이 만들 업로드 폴더 이름(기본 "대관앱 첨부") */
  GOOGLE_DRIVE_UPLOAD_FOLDER_NAME: z.string().optional()
}).passthrough();

export function getGoogleOAuthEnvOptional(): z.infer<typeof GoogleOAuthSchema> | null {
  const any = process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_SECRET || process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  if (!any) return null;
  const parsed = GoogleOAuthSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `환경변수 설정 오류(Google OAuth 업로드):\n${parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("\n")}`
    );
  }
  return parsed.data;
}
