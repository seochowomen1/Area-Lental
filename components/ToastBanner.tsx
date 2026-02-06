"use client";

import { useEffect } from "react";

import { cn } from "@/lib/cn";
import { NOTICE_BASE, NOTICE_VARIANT, CARD_PAD } from "@/components/ui/presets";

type ToastType = "success" | "error";

type Props = {
  type: ToastType;
  message: string;
  onClose?: () => void;
  autoHideMs?: number;
};

/**
 * Admin Settings 등에서 사용하는 상단 토스트 배너.
 * - onClose가 주어지면 X 버튼이 노출됩니다.
 * - autoHideMs가 주어지면 해당 ms 이후 자동 닫힙니다.
 */
export default function ToastBanner({ type, message, onClose, autoHideMs }: Props) {
  useEffect(() => {
    if (!autoHideMs || !onClose) return;
    const t = setTimeout(() => onClose(), autoHideMs);
    return () => clearTimeout(t);
  }, [autoHideMs, onClose]);

  return (
    <div
      className={cn(
        NOTICE_BASE,
        NOTICE_VARIANT[type === "success" ? "success" : "danger"],
        CARD_PAD.sm,
        "flex items-center justify-between"
      )}
      role="status"
      aria-live="polite"
    >
      <p className="text-sm">{message}</p>
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-2 py-1 text-sm opacity-80 hover:opacity-100"
          aria-label="닫기"
        >
          ×
        </button>
      ) : null}
    </div>
  );
}
