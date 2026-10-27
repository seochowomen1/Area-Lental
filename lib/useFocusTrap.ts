"use client";

import { useEffect, useRef, useCallback } from "react";

/**
 * 모달 포커스 트랩 훅
 * - 열릴 때 첫 포커스 가능 요소로 이동
 * - Tab/Shift+Tab으로 모달 내부에서만 순환
 * - 닫힐 때 트리거 요소로 복귀
 * - opts.initialFocus: 첫 포커스 선택 규칙(audit-fix-2 ②-2-6)
 *   "auto"(기본) = [data-autofocus] → 첫 입력칸 → [data-modal-cancel](취소·닫기) → 첫 포커스 요소
 *   확인 모달에서 엔터 실수로 확정되지 않게 입력칸이 없으면 취소 버튼에 먼저 둔다.
 */
export function useFocusTrap(open: boolean, opts?: { initialFocus?: "first" | "auto" }) {
  const initialFocus = opts?.initialFocus ?? "first";
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const getFocusableElements = useCallback(() => {
    if (!containerRef.current) return [];
    return Array.from(
      containerRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]):not([tabindex="-1"]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    );
  }, []);

  useEffect(() => {
    if (!open) return;

    // 열릴 때 현재 포커스된 요소를 기억
    triggerRef.current = document.activeElement as HTMLElement;

    // 약간의 딜레이 후 첫 포커스 가능 요소로 이동
    const timer = setTimeout(() => {
      const root = containerRef.current;
      if (initialFocus === "auto" && root) {
        const pick =
          root.querySelector<HTMLElement>("[data-autofocus]") ??
          root.querySelector<HTMLElement>(
            'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])'
          ) ??
          root.querySelector<HTMLElement>("[data-modal-cancel]:not([disabled])");
        if (pick) {
          pick.focus();
          return;
        }
      }
      const focusable = getFocusableElements();
      if (focusable.length > 0) {
        focusable[0].focus();
      }
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;

      const focusable = getFocusableElements();
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", handleKeyDown);
      // 닫힐 때 트리거 요소로 복귀
      triggerRef.current?.focus();
    };
  }, [open, getFocusableElements, initialFocus]);

  return containerRef;
}
