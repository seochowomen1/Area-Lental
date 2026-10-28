"use client";

/**
 * 완료 `/success` (audit-fix-3 3-4 · 02_ui_apply §2-7)
 * h1 `신청이 접수되었습니다` + 두 줄 → 카드(신청번호 · 공간 · 날짜 · 예상 이용료) → `다음 순서` → `처음 화면으로` · `내 신청 확인하기`
 * 단계 표시 없음. 공용 PC 조회 기록 지우기 안내는 그대로(audit-fix-1 [10]).
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import PaymentFlowText from "@/components/PaymentFlowText";
import { PAYMENT_FLOW_EMPHASIS, PAYMENT_FLOW_TEXT } from "@/lib/policy";
import { adoptTokenFromUrl, clearApplicantAccess, purgeLegacyApplicantToken, readApplicantAccess } from "@/lib/applicantAccess";
import { readDoneSummary, type DoneSummary } from "@/lib/apply/submit";
import { A_BTN_PRIMARY, A_CARD, A_CARD_TITLE, A_H1, HelpPhoneLine, PublicHeader } from "@/components/apply/ui";

export default function SuccessClient() {
  const sp = useSearchParams();
  const router = useRouter();
  const requestId = sp.get("requestId");
  const count = Number(sp.get("count") ?? "1");
  const isGallery = sp.get("category") === "gallery";
  const target = isGallery ? "전시" : "예약";
  const feeRaw = sp.get("fee");
  const estimatedFee = feeRaw !== null && feeRaw !== "" && Number.isFinite(Number(feeRaw)) ? Number(feeRaw) : null;
  const holidayUnchecked = sp.get("hc") === "unavailable";

  const [hasAccess, setHasAccess] = useState(false);
  const [summary, setSummary] = useState<DoneSummary | null>(null);
  useEffect(() => {
    purgeLegacyApplicantToken();
    adoptTokenFromUrl(); // 예전 형식 링크(?token=)로 들어온 경우만 — 주소에서 지운다
    setHasAccess(!!readApplicantAccess());
    setSummary(readDoneSummary(requestId));
  }, [requestId]);

  const myHref = hasAccess && requestId ? `/result?requestId=${encodeURIComponent(requestId)}` : "/my";

  function clearDeviceRecord() {
    clearApplicantAccess();
    setHasAccess(false);
    router.push("/my?cleared=1");
  }

  const rows: Array<{ label: string; value: React.ReactNode }> = [{ label: "신청번호", value: <span className="text-[18px] font-bold tabular-nums text-ink">{requestId ?? "-"}</span> }];
  if (summary?.roomName) rows.push({ label: "공간", value: summary.roomName });
  if (summary?.schedule) rows.push({ label: "날짜", value: summary.schedule });
  else if (count > 1) rows.push({ label: "신청 건수", value: `${count}건` });
  if (estimatedFee !== null)
    rows.push({
      label: isGallery ? "예상 전시 공간 이용료" : "예상 이용료",
      value: (
        <>
          {estimatedFee.toLocaleString()}원
          {holidayUnchecked ? <span className="block text-[15px] font-medium text-amber-800">(공휴일 미확인 · 승인 때 확정)</span> : null}
        </>
      ),
    });

  return (
    <div className="min-h-screen bg-slate-50">
      <PublicHeader />
      <main id="main-content" className="mx-auto w-full max-w-[720px] space-y-5 px-4 pb-16 pt-6 sm:px-6">
        <div>
          <h1 className={A_H1}>신청이 접수되었습니다</h1>
          <p className="mt-2 text-[17px] leading-7 text-ink-2">
            아직 예약이 확정된 것은 아닙니다.
            <br />
            담당자가 확인한 뒤 이메일로 결과를 알려 드립니다.
          </p>
        </div>

        <section className={`${A_CARD} p-4 sm:p-5`} aria-label="신청 정보">
          <dl className="grid grid-cols-[minmax(92px,auto)_1fr] gap-x-3 gap-y-1.5 sm:grid-cols-[140px_1fr]">
            {rows.map((r) => (
              <div key={r.label} className="contents">
                <dt className="text-[17px] font-semibold leading-7 text-ink-3">{r.label}</dt>
                <dd className="min-w-0 break-all text-[17px] font-semibold leading-7 text-ink">{r.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className={`${A_CARD} p-4 sm:p-5`} aria-labelledby="next-steps">
          <h2 id="next-steps" className={A_CARD_TITLE}>
            다음 순서
          </h2>
          <p className="mt-2 text-[17px] leading-7 text-ink">
            <PaymentFlowText text={PAYMENT_FLOW_TEXT(target)} bold={PAYMENT_FLOW_EMPHASIS} />
          </p>
        </section>

        <div className="space-y-3 text-center">
          <Link href="/" className={A_BTN_PRIMARY}>
            처음 화면으로
          </Link>
          <Link href={myHref} className="inline-flex min-h-[44px] items-center text-[17px] font-bold text-brand underline underline-offset-4">
            내 신청 확인하기
          </Link>
        </div>

        {/* ★ [10] 공용 PC 안내 + 조회 기록 지우기 */}
        <div className="rounded-xl border border-line bg-white px-4 py-3">
          <p className="text-[15px] leading-6 text-ink-2">
            공용 PC라면 확인을 마친 뒤 [이 기기에서 조회 기록 지우기]를 누르거나 브라우저 창을 닫아 주세요. 이 화면의 조회 권한은 60분 뒤 자동으로 사라집니다.
          </p>
          <div className="mt-1 text-right">
            <button type="button" onClick={clearDeviceRecord} className="inline-flex min-h-[44px] items-center text-[15px] font-semibold text-brand underline-offset-2 hover:underline">
              이 기기에서 조회 기록 지우기
            </button>
          </div>
        </div>
        <HelpPhoneLine />
      </main>
    </div>
  );
}
