"use client";

import ExcelDownloadButton from "@/components/admin/ExcelDownloadButton";

/**
 * 인쇄 미리보기 상단 버튼 — audit-fix-3 3-2: 상세 헤더의 Excel 버튼을 인쇄 미리보기 안으로 옮김(원칙 1 · 내보내기는 미리보기 안)
 */
export default function PrintActions({ requestId }: { requestId: string }) {
  return (
    <div className="no-print mb-4 flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex min-h-[44px] items-center rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-hover"
      >
        인쇄 / PDF 저장
      </button>
      <ExcelDownloadButton
        href={`/api/admin/export/form?requestId=${encodeURIComponent(requestId)}`}
        label="엑셀 받기"
        className="inline-flex min-h-[44px] items-center rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
      />
      <button
        type="button"
        onClick={() => history.back()}
        className="inline-flex min-h-[44px] items-center rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        뒤로가기
      </button>
    </div>
  );
}
