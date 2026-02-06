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
