/**
 * 프로젝트 전역 상수 모음
 *
 * ✅ 원칙
 * - 런타임에서 `XXX is not defined` 류 오류를 방지하기 위해, 화면에서 쓰는 상수는
 *   가능한 한 한 곳에서 import 하도록 정리합니다.
 */

/**
 * 시간 관련 상수
 * - Magic number 제거를 위한 명명된 상수
 */
export const TIME_CONSTANTS = {
  MINUTES_PER_HOUR: 60,
  MIN_RENTAL_MINUTES: 60,     // 최소 1시간
  MAX_RENTAL_MINUTES: 360,    // 최대 6시간
  TIME_SLOT_INTERVAL: 30,     // 30분 단위
} as const;

/**
 * 관리자 작업 제한
 */
export const ADMIN_LIMITS = {
  /** 한 번에 삭제 가능한 최대 건수 */
  DELETE_MAX_REQUESTS: 200,
  /** 데이터 보존 삭제 시 최대 건수 */
  DATA_RETENTION_MAX_DELETE: 500,
} as const;

/**
 * 대관 신청 제한
 */
export const REQUEST_LIMITS = {
  /** 강의실/스튜디오 묶음 신청 최대 회차 */
  BATCH_MAX_SESSIONS: 20,
  /** 갤러리 묶음 신청 최대 회차 (기술 안전장치) */
  GALLERY_MAX_SESSIONS: 500,
  /** 갤러리 전시 기간 최대 일수 */
  GALLERY_MAX_EXHIBITION_DAYS: 30,
} as const;

/**
 * 갤러리 요금 (원/일)
 */
export const GALLERY_FEE_KRW = {
  /** 평일 대관료 */
  WEEKDAY: 20_000,
  /** 토요일 대관료 */
  SATURDAY: 10_000,
} as const;

/**
 * 우리동네 갤러리 준비·철거 규정 (2026-10-19 확정)
 * - 철거: 전시 마지막 날 평일 16:00, 토요일 11:00 이전 완료
 * - 준비일: 직전 운영일. 그날 전시가 없으면 운영시간 내 언제든,
 *   전시가 있으면(앞 전시 철거 후) 평일 17:00 이후 · 토요일 11:00 이후
 */
export const GALLERY_RULES = {
  /** 철거 완료 기한 (HH:MM) */
  TEARDOWN_DEADLINE: { WEEKDAY: "16:00", SATURDAY: "11:00" },
  /** 직전 운영일에 전시가 있을 때 준비 가능 시작 시각 (HH:MM) */
  PREP_AFTER: { WEEKDAY: "17:00", SATURDAY: "11:00" },
} as const;

/** 규정 안내 문구 (화면·서약서 공용) */
export const GALLERY_RULE_TEXT = {
  TEARDOWN: "전시 마지막 날 철거는 평일 16:00, 토요일 11:00 이전에 완료해야 합니다.",
  PREP: "준비(세팅)일은 전시 시작 직전 운영일 1일(무료)이며, 그날 전시가 없으면 운영시간 내 언제든, 전시가 있으면 앞 전시 철거 후 평일 17:00 이후(토요일 11:00 이후)부터 가능합니다.",
} as const;

/**
 * 요일 옵션
 * - 0=일요일 ... 6=토요일
 * - (관리자 설정) 정규 수업시간 등록에서 사용
 */
export const DAY_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "월" },
  { value: 2, label: "화" },
  { value: 3, label: "수" },
  { value: 4, label: "목" },
  { value: 5, label: "금" },
  { value: 6, label: "토" },
];
