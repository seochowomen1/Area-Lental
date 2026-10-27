"use client";

export default function PrintActions() {
  return (
    <div className="no-print mb-4 flex items-center gap-3">
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-hover"
      >
        인쇄 / PDF 저장
      </button>
      <button
        type="button"
        onClick={() => history.back()}
        className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        뒤로가기
      </button>
    </div>
  );
}
