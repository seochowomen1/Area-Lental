"use client";

import { useState } from "react";

import Modal, { MODAL_BTN_SECONDARY } from "@/components/ui/Modal";

type Props = {
  href: string;
  label?: string;
  className?: string;
};

export default function ExcelDownloadButton({ href, label = "엑셀 받기", className }: Props) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [maskPii, setMaskPii] = useState(false);

  const downloadHref = maskPii ? `${href}&mask=true` : href;

  return (
    <>
      <button
        type="button"
        onClick={() => setShowConfirm(true)}
        className={className}
      >
        {label}
      </button>

      {/* 공통 Modal — 첫 포커스는 [취소](확인 모달 · 02_ui §2-4) */}
      <Modal
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        title="개인정보 포함 파일 다운로드"
        showClose={false}
        footer={
          <>
            <button
              type="button"
              data-autofocus
              data-modal-cancel
              onClick={() => setShowConfirm(false)}
              className={MODAL_BTN_SECONDARY}
            >
              취소
            </button>
            <a
              href={downloadHref}
              onClick={() => setShowConfirm(false)}
              className="inline-flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-xl bg-brand px-4 py-2 text-[15px] font-semibold text-white hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky focus-visible:ring-offset-2"
            >
              다운로드
            </a>
          </>
        }
      >
        <p className="text-[15px] leading-relaxed text-slate-700">
          다운로드하는 엑셀 파일에는 <strong>개인정보</strong>가 포함되어 있습니다.
          개인정보보호법에 따라 안전하게 관리해 주세요.
        </p>
        <p className="mt-2 text-[13px] text-slate-500">
          무단 유출·공유 시 법적 책임이 따를 수 있습니다.
        </p>
        <label className="mt-4 flex min-h-[44px] cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={maskPii}
            onChange={(e) => setMaskPii(e.target.checked)}
            className="h-5 w-5 rounded border-slate-300 text-brand focus:ring-sky"
          />
          <span className="text-[15px] text-slate-700">개인정보 마스킹 처리 (이름·전화·이메일)</span>
        </label>
      </Modal>
    </>
  );
}
