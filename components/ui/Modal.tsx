"use client";

import { useEffect, useId, type ReactNode } from "react";

import { cn } from "@/lib/cn";
import { useFocusTrap } from "@/lib/useFocusTrap";

/**
 * 공통 모달 (audit-fix-2 ②-2-6 · 02_ui §2-4)
 * - role="dialog" · aria-modal · aria-labelledby(제목)
 * - 첫 포커스: [data-autofocus] → 첫 입력칸 → [data-modal-cancel](취소·닫기) — 확인 모달은 취소 버튼이 먼저
 * - Tab 순환(useFocusTrap) · ESC·바깥 클릭으로 닫기 · 배경 스크롤 잠금 · 닫으면 연 버튼으로 포커스 복귀
 * - busy(전송·복사 진행 중)면 ESC·바깥 클릭을 무시한다.
 * - 닫기 전에 확인이 필요하면(메일 본문 수정 등) onClose 안에서 판단한다.
 */
type Props = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  busy?: boolean;
  /** 최대 폭 — 기본 480px(02_ui) */
  size?: "sm" | "md" | "lg" | "xl";
  /** 제목 아래 설명 id(aria-describedby) */
  describedBy?: string;
  /** 오른쪽 위 [닫기] 버튼 표시(기본 true) */
  showClose?: boolean;
  zIndexClass?: string;
  bodyClassName?: string;
};

const SIZE: Record<NonNullable<Props["size"]>, string> = {
  sm: "max-w-sm",
  md: "max-w-[480px]",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

export default function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  busy = false,
  size = "md",
  describedBy,
  showClose = true,
  zIndexClass = "z-50",
  bodyClassName,
}: Props) {
  const titleId = useId();
  const ref = useFocusTrap(open, { initialFocus: "auto" });

  // ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (busy) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  // 배경 스크롤 잠금
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      className={cn("fixed inset-0 flex items-center justify-center p-4", zIndexClass)}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={describedBy}
    >
      <div
        className="absolute inset-0 bg-slate-900/45"
        aria-hidden="true"
        onClick={() => {
          if (!busy) onClose();
        }}
      />
      <div
        className={cn(
          "relative flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-[14px] bg-white shadow-xl",
          SIZE[size]
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-4 sm:px-5">
          <h2 id={titleId} className="text-xl font-bold text-ink">
            {title}
          </h2>
          {showClose && (
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              aria-label="닫기"
              className="-mr-2 -mt-1 inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg text-2xl leading-none text-ink-3 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky disabled:text-slate-300"
            >
              ×
            </button>
          )}
        </div>
        <div className={cn("min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5", bodyClassName)}>{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-4 py-3 sm:px-5">{footer}</div>
        )}
      </div>
    </div>
  );
}

/** 모달 버튼 클래스(02_ui §1-3) */
export const MODAL_BTN_SECONDARY =
  "inline-flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-xl border border-slate-300 bg-white px-4 py-2 text-[15px] font-semibold text-ink hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky focus-visible:ring-offset-2 disabled:border-transparent disabled:bg-slate-200 disabled:text-slate-500";
export const MODAL_BTN_PRIMARY =
  "inline-flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-xl bg-brand px-4 py-2 text-[15px] font-semibold text-white hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky focus-visible:ring-offset-2 disabled:bg-slate-200 disabled:text-slate-500";
export const MODAL_BTN_DANGER =
  "inline-flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-xl bg-red-700 px-4 py-2 text-[15px] font-semibold text-white hover:bg-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky focus-visible:ring-offset-2 disabled:bg-slate-200 disabled:text-slate-500";
