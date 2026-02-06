"use client";

import { useSearchParams } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import Card from "@/components/ui/Card";
import LinkButton from "@/components/ui/LinkButton";

export default function SuccessClient() {
  const sp = useSearchParams();
  const requestId = sp.get("requestId");

  return (
    <div>
      <SiteHeader title="대관신청" backHref="/space" backLabel="목록" />

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-8">
        <Card pad="lg" className="space-y-4">
          <h2 className="text-2xl font-semibold">신청 완료</h2>
          <p className="text-sm text-gray-700">
            대관 신청이 정상적으로 완료되었습니다. 담당자 검토 후 승인/반려 결과를 이메일로 안내드립니다.
          </p>

          <div className="rounded-xl border border-slate-200 bg-[rgb(var(--brand-primary)/0.02)] p-4 text-sm">
            <div className="text-gray-600">신청번호</div>
            <div className="text-lg font-semibold text-slate-900">{requestId ?? "-"}</div>
          </div>

          <div>
            <LinkButton href="/space" variant="primary">
              새 신청하기
            </LinkButton>
          </div>
        </Card>
      </main>
    </div>
  );
}
