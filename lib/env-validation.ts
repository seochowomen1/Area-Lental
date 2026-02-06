/**
 * 환경 변수 검증 유틸리티
 * 
 * 앱 시작 시 필수 환경 변수가 모두 설정되어 있는지 검증합니다.
 * 검증 실패 시 명확한 에러 메시지를 제공하여 설정 누락을 방지합니다.
 */

import { z } from 'zod';

const envSchema = z.object({
  // Google Sheets API
  GOOGLE_SERVICE_ACCOUNT_EMAIL: z.string().email().optional(),
  GOOGLE_PRIVATE_KEY: z.string().min(1).optional(),
  GOOGLE_SHEET_ID: z.string().min(1).optional(),
  GOOGLE_DRIVE_FOLDER_ID: z.string().min(1).optional(),
  
  // 관리자 인증
  ADMIN_PASSWORD_HASH: z.string().min(1).optional(),
  JWT_SECRET: z.string().min(32).optional(),
  
  // 이메일 (선택)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  ADMIN_EMAIL: z.string().email().optional(),
  
  // 앱 설정
  NODE_ENV: z.enum(['development', 'production', 'test']).optional(),
  NEXT_PUBLIC_BASE_URL: z.string().url().optional(),
});

export type ValidatedEnv = z.infer<typeof envSchema>;

/**
 * 환경 변수 검증
 * Mock 모드가 아닐 때만 필수 값 체크
 */
export function validateEnv(): ValidatedEnv {
  const isMock = process.env.MOCK_MODE === 'true';
  
  const result = envSchema.safeParse(process.env);
  
  if (!result.success) {
    console.error('❌ 환경 변수 검증 실패:');
    console.error(result.error.format());
    
    // Mock 모드가 아닐 때만 에러 발생
    if (!isMock) {
      throw new Error('필수 환경 변수가 설정되지 않았습니다. .env 파일을 확인해주세요.');
    }
  }
  
  // 프로덕션 환경에서 중요한 값 체크
  if (process.env.NODE_ENV === 'production' && !isMock) {
    const critical = [
      'GOOGLE_SERVICE_ACCOUNT_EMAIL',
      'GOOGLE_PRIVATE_KEY',
      'GOOGLE_SHEET_ID',
      'ADMIN_PASSWORD_HASH',
      'JWT_SECRET',
    ];
    
    const missing = critical.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
      console.error('❌ 프로덕션 환경에서 필수 환경 변수가 누락되었습니다:');
      console.error(missing.join(', '));
      throw new Error('프로덕션 배포 전 필수 환경 변수를 설정해주세요.');
    }
  }
  
  return result.data || {};
}

/**
 * 환경 변수 안전하게 가져오기
 */
export function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key];
  
  if (!value && defaultValue === undefined) {
    console.warn(`⚠️ 환경 변수 '${key}'가 설정되지 않았습니다.`);
  }
  
  return value || defaultValue || '';
}
