"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  href: string;
  label?: string;
  className?: string;
};

export default function ExcelDownloadButton({ href, label = "엑셀 다운로드", className }: Props) {
  const [showConfirm, setShowConfirm] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!showConfirm) return;
    // 모달 열리면 취소 버튼에 포커스
    cancelRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setShowConfirm(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [showConfirm]);

  return (
    <>
      <button
        type="button"
        onClick={() => setShowConfirm(true)}
        className={className}
      >
        {label}
      </button>

      {showConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="excel-dl-title"
        >
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowConfirm(false)}
          />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 id="excel-dl-title" className="text-base font-bold text-slate-900">개인정보 포함 파일 다운로드</h3>
            <p className="mt-3 text-sm text-slate-700 leading-relaxed">
              다운로드하는 엑셀 파일에는 <strong>개인정보</strong>가 포함되어 있습니다.
              개인정보보호법에 따라 안전하게 관리해 주세요.
            </p>
            <p className="mt-2 text-xs text-slate-500">
              무단 유출·공유 시 법적 책임이 따를 수 있습니다.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                ref={cancelRef}
                type="button"
                onClick={() => setShowConfirm(false)}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                취소
              </button>
              <a
                href={href}
                onClick={() => setShowConfirm(false)}
                className="inline-flex items-center rounded-xl bg-[rgb(var(--brand-primary))] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95"
              >
                다운로드
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
