"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import Card from "@/components/ui/Card";
import LinkButton from "@/components/ui/LinkButton";
import Notice from "@/components/ui/Notice";
import PaymentFlowText, { paymentFlowBold } from "@/components/PaymentFlowText";
import { SECTION_TITLE } from "@/components/ui/presets";
import { PAYMENT_FLOW_TEXT } from "@/lib/policy";
import { adoptTokenFromUrl, clearApplicantAccess, purgeLegacyApplicantToken, readApplicantAccess } from "@/lib/applicantAccess";

export default function SuccessClient() {
  const sp = useSearchParams();
  const router = useRouter();
  const requestId = sp.get("requestId");
  const count = Number(sp.get("count") ?? "1");
  // 갤러리 신청에서 넘어온 경우(category=gallery)에만 "전시" 용어 사용
  const isGallery = sp.get("category") === "gallery";
  const target = isGallery ? "전시" : "예약";
  // 서버 공용 계산 금액(POST /api/requests 응답 estimatedFeeKRW)
  const feeRaw = sp.get("fee");
  const estimatedFee = feeRaw !== null && feeRaw !== "" && Number.isFinite(Number(feeRaw)) ? Number(feeRaw) : null;

  // ★ [10] 조회 권한은 sessionStorage(applicantAccess)에서만 읽는다. 주소창에는 토큰이 없다.
  const [hasAccess, setHasAccess] = useState(false);
  useEffect(() => {
    purgeLegacyApplicantToken();
    adoptTokenFromUrl(); // 예전 형식 링크(?token=)로 들어온 경우만 — 주소에서 지운다
    setHasAccess(!!readApplicantAccess());
  }, []);

  const resultHref = `/result${requestId ? `?requestId=${encodeURIComponent(requestId)}` : ""}`;

  function clearDeviceRecord() {
    clearApplicantAccess();
    setHasAccess(false);
    router.push("/my?cleared=1");
  }

  return (
    <div>
      <SiteHeader title={isGallery ? "전시신청" : "대관신청"} backHref={isGallery ? "/space?category=gallery" : "/space"} backLabel="목록" />

      <main className="mx-auto max-w-2xl px-4 pb-16 pt-8">
        {/* 성공 아이콘 + 제목 */}
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
            <svg className="h-8 w-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="mt-4 text-2xl font-bold text-slate-900">{isGallery ? "전시 신청이 완료되었습니다" : "대관 신청이 완료되었습니다"}</h2>
          <p className="mt-2 text-sm text-slate-600">
            담당자 검토 후 승인/반려 결과를 이메일로 안내드립니다.
          </p>
        </div>

        <div className="mt-8 space-y-4">
          {/* 신청 정보 카드 */}
          <Card pad="lg">
            <h3 className={SECTION_TITLE}>신청 정보</h3>
            <div className="mt-3 divide-y divide-slate-100">
              <div className="flex justify-between gap-3 py-2.5">
                <span className="text-sm text-slate-500">신청번호</span>
                <span className="break-all text-right text-sm font-bold text-[rgb(var(--brand-primary))]">{requestId ?? "-"}</span>
              </div>
              {count > 1 && (
                <div className="flex justify-between py-2.5">
                  <span className="text-sm text-slate-500">신청 건수</span>
                  <span className="text-sm font-semibold text-slate-900">{count}건</span>
                </div>
              )}
              <div className="flex justify-between py-2.5">
                <span className="text-sm text-slate-500">처리 상태</span>
                <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                  접수 대기
                </span>
              </div>
              {estimatedFee !== null ? (
                <div className="flex justify-between gap-3 py-2.5">
                  <span className="shrink-0 text-sm text-slate-500">예상 이용료</span>
                  <span className="text-right text-sm font-semibold text-slate-900 tabular-nums">
                    {estimatedFee.toLocaleString()}원 (담당자 승인 시 확정)
                  </span>
                </div>
              ) : null}
            </div>
          </Card>

          {/* 안내 */}
          <Notice variant="info" title="신청 후 절차 안내" pad="md">
            <ul className="list-disc space-y-1.5 pl-5 text-sm">
              <li>담당자가 신청 내용을 확인한 후 <b>승인 또는 반려</b> 결과를 이메일로 알려드립니다.</li>
              <li>
                <PaymentFlowText text={PAYMENT_FLOW_TEXT(target)} bold={paymentFlowBold(target, "long")} />
              </li>
              <li>아래 버튼으로 바로 신청 결과를 확인할 수 있습니다.</li>
            </ul>
          </Notice>

          {/* 버튼 그룹 */}
          <div className="flex flex-col gap-3 sm:flex-row">
            {hasAccess && requestId ? (
              <LinkButton href={resultHref} variant="primary" className="flex-1 justify-center py-3">
                신청 결과 바로 확인
              </LinkButton>
            ) : null}
            <LinkButton href="/my" variant={hasAccess ? "outline" : "primary"} className="flex-1 justify-center py-3">
              내 신청 조회
            </LinkButton>
            <LinkButton href="/" variant="outline" className="flex-1 justify-center py-3">
              홈으로 돌아가기
            </LinkButton>
          </div>

          {/* ★ [10] 공용 PC 안내 + 조회 기록 지우기 */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-sm leading-6 text-slate-700">
              공용 PC라면 확인을 마친 뒤 [이 기기에서 조회 기록 지우기]를 누르거나 브라우저 창을 닫아 주세요. 이 화면의 조회 권한은 60분 뒤 자동으로 사라집니다.
            </p>
            <div className="mt-2 text-right">
              <button
                type="button"
                onClick={clearDeviceRecord}
                className="text-sm font-semibold text-[rgb(var(--brand-primary))] underline-offset-2 hover:underline"
              >
                이 기기에서 조회 기록 지우기
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
