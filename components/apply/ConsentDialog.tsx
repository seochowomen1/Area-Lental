"use client";

/**
 * 동의 팝업 틀 (02_ui_apply §0-5 (1) · M6-1)
 * - 휴대폰: 가장자리 12px만 남긴 거의 전체 화면 · radius 14 · 머리/바닥 고정, 본문만 스크롤(17/28)
 * - 머리: 제목 20 + `닫기`(44 · 체크 상태 바꾸지 않음)
 * - 바닥: `동의합니다`(56) / `동의하지 않습니다`(52) · PC 오른쪽 정렬 가로
 * - 첫 초점 = 본문 제목 · ESC 닫기 · 닫히면 누른 줄로 초점 복귀(useFocusTrap) · 배경 스크롤 잠금
 */
import { useEffect, useId, type ReactNode } from "react";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { A_BTN_PRIMARY, A_BTN_SECONDARY, A_BTN_SMALL } from "@/components/apply/ui";

export default function ConsentDialog({
  open,
  title,
  bodyTitle,
  children,
  onClose,
  onAgree,
  onDisagree,
}: {
  open: boolean;
  title: string;
  /** 본문 첫 제목(첫 초점 자리) */
  bodyTitle?: string;
  children: ReactNode;
  onClose: () => void;
  onAgree: () => void;
  onDisagree: () => void;
}) {
  const titleId = useId();
  const bodyId = useId();
  const ref = useFocusTrap(open, { initialFocus: "auto" });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
    >
      <button type="button" className="absolute inset-0 bg-slate-900/45" aria-label="닫기" onClick={onClose} tabIndex={-1} />
      <div className="relative flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-[14px] bg-white shadow-xl max-sm:h-full">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-2.5 sm:px-5">
          <h2 id={titleId} className="text-[20px] font-extrabold leading-[30px] text-ink">
            {title}
          </h2>
          <button type="button" onClick={onClose} className={A_BTN_SMALL}>
            닫기
          </button>
        </div>
        <div id={bodyId} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 text-[17px] leading-7 text-ink sm:px-5">
          {bodyTitle ? (
            <h3 tabIndex={-1} data-autofocus className="text-[17px] font-bold leading-7 text-ink focus:outline-none">
              {bodyTitle}
            </h3>
          ) : (
            <span tabIndex={-1} data-autofocus className="sr-only">
              {title}
            </span>
          )}
          {children}
        </div>
        <div className="flex shrink-0 flex-col gap-2 border-t border-line bg-white px-4 py-3 sm:flex-row-reverse sm:justify-start sm:px-5">
          <button
            type="button"
            className={`${A_BTN_PRIMARY} sm:w-auto sm:min-w-[160px]`}
            onClick={() => {
              onAgree();
              onClose();
            }}
          >
            동의합니다
          </button>
          <button
            type="button"
            className={`${A_BTN_SECONDARY} sm:w-auto sm:min-w-[160px]`}
            onClick={() => {
              onDisagree();
              onClose();
            }}
          >
            동의하지 않습니다
          </button>
        </div>
      </div>
    </div>
  );
}
