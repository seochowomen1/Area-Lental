"use client";

import { useSearchParams } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import Card from "@/components/ui/Card";
import LinkButton from "@/components/ui/LinkButton";
import Notice from "@/components/ui/Notice";
import { SECTION_TITLE } from "@/components/ui/presets";

export default function SuccessClient() {
  const sp = useSearchParams();
  const requestId = sp.get("requestId");
  const batchId = sp.get("batchId");
  const count = Number(sp.get("count") ?? "1");

  return (
    <div>
      <SiteHeader title="대관신청" backHref="/space" backLabel="목록" />

      <main className="mx-auto max-w-2xl px-4 pb-16 pt-8">
        {/* 성공 아이콘 + 제목 */}
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
            <svg className="h-8 w-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="mt-4 text-2xl font-bold text-slate-900">대관 신청이 완료되었습니다</h2>
          <p className="mt-2 text-sm text-slate-600">
            담당자 검토 후 승인/반려 결과를 이메일로 안내드립니다.
          </p>
        </div>

        <div className="mt-8 space-y-4">
          {/* 신청 정보 카드 */}
          <Card pad="lg">
            <h3 className={SECTION_TITLE}>신청 정보</h3>
            <div className="mt-3 divide-y divide-slate-100">
              <div className="flex justify-between py-2.5">
                <span className="text-sm text-slate-500">신청번호</span>
                <span className="text-sm font-bold text-[rgb(var(--brand-primary))]">{requestId ?? "-"}</span>
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
            </div>
          </Card>

          {/* 안내 */}
          <Notice variant="info" title="신청 후 절차 안내" pad="md">
            <ul className="list-disc space-y-1.5 pl-5 text-sm">
              <li>담당자가 신청 내용을 확인한 후 <b>승인 또는 반려</b> 결과를 이메일로 알려드립니다.</li>
              <li>승인 후 <b>대관료를 납부</b>하시면 예약이 최종 확정됩니다.</li>
              <li>신청 내역은 이메일 주소로 조회할 수 있습니다.</li>
            </ul>
          </Notice>

          {/* 버튼 그룹 */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <LinkButton href="/my" variant="outline" className="flex-1 justify-center py-3">
              내 신청 조회
            </LinkButton>
            <LinkButton href="/" variant="primary" className="flex-1 justify-center py-3">
              홈으로 돌아가기
            </LinkButton>
          </div>
        </div>
      </main>
    </div>
  );
}
