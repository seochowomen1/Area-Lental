"use client";

import { useEffect, useRef, useCallback } from "react";

/**
 * 모달 포커스 트랩 훅
 * - 열릴 때 첫 포커스 가능 요소로 이동
 * - Tab/Shift+Tab으로 모달 내부에서만 순환
 * - 닫힐 때 트리거 요소로 복귀
 */
export function useFocusTrap(open: boolean) {
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
  }, [open, getFocusableElements]);

  return containerRef;
}
