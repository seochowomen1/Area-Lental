import { PAYMENT_FLOW_EMPHASIS, type PaymentTarget } from "@/lib/policy";

/** 굵게 표시할 부분 — long: "…안에 홈페이지에서 결제" · short: "…안에 결제해야 {예약이|전시가} 확정" (01_spec ③-L 9·10행) */
export function paymentFlowBold(target: PaymentTarget, variant: "long" | "short"): string {
  const subject = target === "전시" ? "전시가" : "예약이";
  return variant === "short" ? `${PAYMENT_FLOW_EMPHASIS} 결제해야 ${subject} 확정` : `${PAYMENT_FLOW_EMPHASIS} 홈페이지에서 결제`;
}

/**
 * 결제 절차 안내 문구 표시 (audit-fix-1 [5][결1])
 * 문구 자체는 호출하는 쪽이 lib/policy.ts의 PAYMENT_FLOW_TEXT / PAYMENT_FLOW_SHORT로 넘긴다(단일 출처).
 * 이 컴포넌트는 text 안의 bold 부분만 <b>로 감싼다.
 */
export default function PaymentFlowText({ text, bold }: { text: string; bold: string }) {
  const idx = bold ? text.indexOf(bold) : -1;
  if (idx < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <b>{bold}</b>
      {text.slice(idx + bold.length)}
    </>
  );
}
