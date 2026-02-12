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
          <h4 className="text-center text-sm font-bold text-slate-900">
            개인정보 수집 · 이용에 관한 안내 (* 필수항목)
          </h4>

          <table className="mt-4 w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className="border border-slate-300 bg-slate-50 px-3 py-2 text-center font-bold">개인정보 수집 · 이용 목적</th>
                <th className="border border-slate-300 bg-slate-50 px-3 py-2 text-center font-bold">수집하려는 개인정보 항목</th>
                <th className="border border-slate-300 bg-slate-50 px-3 py-2 text-center font-bold">개인정보의 보유 및 이용 기간</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-slate-300 px-3 py-2 text-center leading-5">
                  시설 대관 신청업무 처리 및<br />의사소통 경로 확보
                </td>
                <td className="border border-slate-300 px-3 py-2 text-center leading-5">
                  이름(또는 단체명), 대표자 성명,<br />연락처, 성별, E-mail, 주소, 생년월일
                </td>
                <td className="border border-slate-300 px-3 py-2 text-center leading-5">
                  수집일로부터 3년 및 대관목적<br />달성 시 지체없이 해당정보 파기
                </td>
              </tr>
            </tbody>
          </table>

          <p className="mt-3 text-xs text-slate-600 leading-relaxed">
            ※ 개인정보 수집이용에 대한 동의를 거부할 권리가 있으며, 거부 시 대관 신청·진행에 일부 제한이 있습니다.
          </p>

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
