/**
 * 신청자 안내 문구·정책 상수 — 단일 출처 (audit-fix-1 · 2026-10-26)
 *
 * DB·서버 전용 import 없음 → 클라이언트 컴포넌트에서도 그대로 import 한다.
 * 결제 안내 문구는 01_spec ③-L 원문. 화면마다 따로 쓰지 말고 이 함수를 쓴다.
 */

export type PaymentTarget = "예약" | "전시";

/** 대상 + 주격 조사(받침 따라 이/가) — "예약이" · "전시가" */
function subject(target: PaymentTarget): string {
  return target === "전시" ? "전시가" : "예약이";
}

/** 굵게 표시할 부분 문자열(화면에서 split 해서 <b>로 감싸는 용도) */
export const PAYMENT_FLOW_EMPHASIS = "결제 기한(기본: 승인일로부터 7일) 안에";

/** 결제 절차 안내(긴 문장) — 이용 안내·상세 탭·완료 화면 */
export function PAYMENT_FLOW_TEXT(target: PaymentTarget): string {
  return `승인되면 이메일로 홈페이지(서초여성가족플라자) 결제 링크와 결제 기한을 보내 드립니다. 결제 기한(기본: 승인일로부터 7일) 안에 홈페이지에서 결제하면 ${subject(target)} 확정되고, 기한 안에 결제가 확인되지 않으면 기한 다음 날 오전 9시에 신청이 자동 취소됩니다.`;
}

/** 결제 절차 안내(짧은 문장) — 신청서 "신청 전 확인" */
export function PAYMENT_FLOW_SHORT(target: PaymentTarget): string {
  return `승인되면 이메일로 홈페이지 결제 링크가 갑니다. 결제 기한(기본: 승인일로부터 7일) 안에 결제해야 ${subject(target)} 확정되며, 기한이 지나면 신청이 자동 취소됩니다.`;
}

/* ── 개인정보 처리방침 v1.3 (⑧-3 확정: 배포일 공고 · 배포일+7일 시행) ──
 * ⚠️ 실제 배포일이 다르면 아래 두 줄만 고친다(제10조 "시행 7일 전 공지"). */
export const PRIVACY_POLICY_VERSION = "v1.3";
export const PRIVACY_POLICY_ANNOUNCED_AT = "2026-10-27";
export const PRIVACY_POLICY_EFFECTIVE_AT = "2026-11-03";

/* ── 만 14세 미만 신청 차단 (⑧-2 확정) ── */
export const MIN_APPLICANT_AGE = 14;
export const MINOR_APPLICANT_MESSAGE =
  "만 14세 미만은 직접 신청할 수 없습니다. 보호자(법정대리인)가 보호자 이름으로 신청해 주세요.";

/** 만 나이(기준일 포함) — 형식이 틀리면 NaN */
export function ageOn(birthYmd: string, todayYmd: string): number {
  const b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthYmd ?? "");
  const t = /^(\d{4})-(\d{2})-(\d{2})$/.exec(todayYmd ?? "");
  if (!b || !t) return NaN;
  const by = Number(b[1]);
  const ty = Number(t[1]);
  const bmd = Number(b[2]) * 100 + Number(b[3]);
  const tmd = Number(t[2]) * 100 + Number(t[3]);
  return ty - by - (tmd < bmd ? 1 : 0);
}

/** 신청일(KST) 기준 만 14세 미만이면 true */
export function isUnderMinApplicantAge(birthYmd: string, todayYmd: string): boolean {
  const age = ageOn(birthYmd, todayYmd);
  return Number.isFinite(age) && age < MIN_APPLICANT_AGE;
}
