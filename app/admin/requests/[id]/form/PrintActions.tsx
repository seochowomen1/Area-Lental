"use client";

export default function PrintActions() {
  return (
    <div className="no-print mb-4 flex items-center gap-3">
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-black"
      >
        인쇄 / PDF 저장
      </button>
      <button
        type="button"
        onClick={() => history.back()}
        className="rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        뒤로가기
      </button>
    </div>
  );
}
