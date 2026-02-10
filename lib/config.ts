import { z } from "zod";
import { ROOMS_WITH_ALL } from "./space";

/**
 * 관리자 페이지용 공간 목록 (전체 옵션 포함)
 * lib/space.ts에서 import하여 사용하므로 데이터 일관성 보장
 */
export const ROOMS = ROOMS_WITH_ALL;


export const EQUIPMENT_FEE_KRW = {
  laptop: 10000,
  projector: 10000,
  audio: 10000
} as const;

export const OPERATING_RULES = {
  weekday: { start: "10:00", end: "17:00" },
  tuesdayNight: { start: "18:00", end: "20:00" },
  // 토요일 운영시간: 10:00~12:00
  saturday: { start: "10:00", end: "12:00" }
};

/**
 * 사용자 화면에 고정 노출할 운영시간 안내 문구
 * (대표 사이트 톤/표기 방식에 맞춰 한 줄로 유지)
 */
export const OPERATING_NOTICE_TEXT = "평일 10~17 / 화 18~20 야간 / 토 10~12 (일 휴관)";

export const UPLOAD = {
  maxFiles: 3,
  maxBytesPerFile: 10 * 1024 * 1024,
  allowedMime: ["application/pdf", "image/png", "image/jpeg"],
  accept: [".pdf", ".png", ".jpg", ".jpeg"]
};

/**
 * MOCK_MODE=true 일 때는 Google/SMTP 없이도 로컬에서 “전체 흐름(신청→관리자목록→승인/반려→출력/엑셀)” 테스트가 가능하도록
 * 환경변수를 최소 요구로 낮춥니다.
 */
/**
 * ADMIN_PASSWORD: 최소 8자, 영문+숫자 포함 필수
 * (운영 환경에서는 특수문자 포함 12자 이상 권장)
 */
const adminPasswordSchema = z
  .string()
  .min(8, "ADMIN_PASSWORD는 최소 8자 이상이어야 합니다.")
  .regex(
    /^(?=.*[A-Za-z])(?=.*\d).{8,}$/,
    "ADMIN_PASSWORD는 영문과 숫자를 모두 포함해야 합니다."
  );

export const MockEnvSchema = z.object({
  MOCK_MODE: z.literal("true"),
  ADMIN_PASSWORD: adminPasswordSchema,
  APP_BASE_URL: z.string().url()
});

export const FullEnvSchema = z.object({
  MOCK_MODE: z.string().optional(),

  GOOGLE_SERVICE_ACCOUNT_JSON: z.string().min(10),
  GOOGLE_SHEET_ID: z.string().min(10),
  GOOGLE_DRIVE_FOLDER_ID: z.string().min(10),

  ADMIN_PASSWORD: adminPasswordSchema,

  SMTP_HOST: z.string().min(3),
  SMTP_PORT: z.string().min(2),
  SMTP_USER: z.string().min(1),
  SMTP_PASS: z.string().min(1),
  SMTP_FROM: z.string().email(),

  ADMIN_NOTIFY_EMAIL: z.string().email(),
  APP_BASE_URL: z.string().url()
});

export type FullEnv = z.infer<typeof FullEnvSchema>;
export type MockEnv = z.infer<typeof MockEnvSchema>;
export type AppEnv = FullEnv | MockEnv;

export function isMockEnv(env: AppEnv): env is MockEnv {
  return (env as any).MOCK_MODE === "true";
}
