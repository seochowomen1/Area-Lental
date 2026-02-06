"use client";

import { useEffect } from "react";
import Button from "@/components/ui/Button";

type PrivacyModalProps = {
  open: boolean;
  onClose: () => void;
  onAgree: () => void;
  onDisagree: () => void;
};

export default function PrivacyModal({ open, onClose, onAgree, onDisagree }: PrivacyModalProps) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="privacy-modal-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="모달 닫기"
        onClick={onClose}
        tabIndex={-1}
      />

      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h3 id="privacy-modal-title" className="text-base font-semibold">
            개인정보 수집·이용 동의
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-gray-600 hover:bg-gray-100"
            aria-label="모달 닫기"
          >
            닫기
          </button>
        </div>

        <div className="max-h-[70vh] overflow-auto px-5 py-4 text-sm text-slate-700">
          <p className="leading-6">
            서초여성가족플라자 서초센터는 센터 시설물 대관 및 이용승인, 각종 서비스 제공을 위해 최초 신청서 접수 시 아래와 같은 최소한의 개인정보를 필수항목으로 수집·이용하고 있습니다.
          </p>

          <div className="mt-3 space-y-2 leading-6">
            <div className="flex gap-2">
              <span className="font-semibold">1.</span>
              <span>
                <span className="font-semibold">수집이용목적</span> : 센터 시설물 이용안내 및 홍보, 요금납부안내
              </span>
            </div>
            <div className="flex gap-2">
              <span className="font-semibold">2.</span>
              <span>
                <span className="font-semibold">수집항목</span> : 단체명, 대표자성명, 신청자성명, 연락처
              </span>
            </div>
            <div className="flex gap-2">
              <span className="font-semibold">3.</span>
              <span>
                <span className="font-semibold">개인정보 보유 및 이용기간</span> : 이용목적 달성 시까지
              </span>
            </div>
            <div className="flex gap-2">
              <span className="font-semibold">4.</span>
              <span>
                동의를 거부할 권리가 있으며, 거부 시 센터 시설물 대관신청이 제한됩니다.
              </span>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            본 동의는 시설물 대관신청을 위한 필수 사항입니다.
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t bg-white px-5 py-4 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onDisagree();
              onClose();
            }}
          >
            동의하지 않습니다
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => {
              onAgree();
              onClose();
            }}
          >
            동의합니다
          </Button>
        </div>
      </div>
    </div>
  );
}
