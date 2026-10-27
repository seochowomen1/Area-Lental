/**
 * ③-F-1 공휴일 확인 실패 안내 — 갤러리 상세 달력·신청서·확인 화면의 금액 카드 바로 위.
 * 서버 holidayStatus가 "unavailable"일 때만 그린다(ok·stale·fallback은 경고 없음 · 내장표로 법정공휴일은 반영됨).
 * 제출은 막지 않는다.
 */
export const HOLIDAY_UNAVAILABLE_TEXT =
  "공휴일 정보를 확인하지 못했습니다. 기간에 공휴일이 있으면 그날은 휴관이라 실제 전시 공간 이용료가 표시 금액보다 적을 수 있습니다. 확정 금액은 승인 메일로 안내해 드립니다.";

export default function HolidayUnavailableNotice({ className = "" }: { className?: string }) {
  return (
    <div role="status" className={`rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-[22px] text-amber-800 ${className}`}>
      {HOLIDAY_UNAVAILABLE_TEXT}
    </div>
  );
}
