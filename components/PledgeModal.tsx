"use client";

import { useEffect } from "react";
import Button from "@/components/ui/Button";
import { PLEDGE_FOOTER, PLEDGE_SECTIONS, GALLERY_PLEDGE_SECTIONS, PLEDGE_TITLE } from "@/lib/pledge";
import { operatingNoticeText } from "@/lib/operating";

type Props = {
  open: boolean;
  onClose: () => void;
  roomId?: string;
  onAgree: () => void;
  onDisagree: () => void;
};

export default function PledgeModal({ open, onClose, roomId, onAgree, onDisagree }: Props) {
  const isGallery = roomId === "gallery";
  const sections = isGallery ? GALLERY_PLEDGE_SECTIONS : PLEDGE_SECTIONS;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pledge-modal-title"
      aria-describedby="pledge-modal-desc"
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
          <h3 id="pledge-modal-title" className="text-base font-semibold">{PLEDGE_TITLE}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-gray-600 hover:bg-gray-100"
            aria-label="모달 닫기"
          >
            닫기
          </button>
        </div>

        <div id="pledge-modal-desc" className="max-h-[60vh] overflow-auto px-5 py-4">
          <p className="text-sm text-gray-700">
            서초여성가족플라자 서초센터 시설을 대관하여 이용함에 있어 아래 규정을 확인하고 준수합니다.
          </p>

          <p className="mt-2 text-sm text-gray-700">
            <b>운영시간:</b> {operatingNoticeText(roomId)}
          </p>

          {/* PDF 원문 링크는 제거(모달 본문에 서약 내용 포함) */}

          <div className="mt-4 space-y-4">
            {sections.map((sec) => (
              <section key={sec.title} className="rounded-xl border bg-gray-50 p-4">
                <h4 className="text-sm font-semibold">{sec.title}</h4>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
                  {sec.bullets.map((b, idx) => (
                    <li key={idx}>{b}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <p className="mt-4 text-sm text-gray-700">{PLEDGE_FOOTER}</p>

        </div>

        <div className="flex items-center justify-end gap-2 border-t bg-white px-5 py-4">
          <Button 
            type="button" 
            variant="outline" 
            onClick={() => { onDisagree(); onClose(); }}
            aria-label="서약에 동의하지 않고 닫기"
          >
            비동의
          </Button>
          <Button 
            type="button" 
            variant="primary" 
            onClick={() => { onAgree(); onClose(); }}
            aria-label="서약에 동의하고 진행하기"
          >
            동의
          </Button>
        </div>
      </div>
    </div>
  );
}
