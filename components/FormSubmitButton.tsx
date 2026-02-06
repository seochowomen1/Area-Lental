"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/cn";
import { BUTTON_BASE, BUTTON_VARIANT, type ButtonVariant } from "@/components/ui/presets";

type Props = {
  idleText: string;
  pendingText?: string;
  className?: string;
  variant?: ButtonVariant;
  disabled?: boolean;
};

/**
 * Server Action <form action={...}> 전용 submit 버튼.
 * - 처리 중(pending)에는 비활성화되어 연타/중복 요청을 방지합니다.
 * - 클릭 순간에도 잠금(locked)을 걸어, pending 반영 전에 연타되는 케이스를 추가로 차단합니다.
 */
export default function FormSubmitButton({
  idleText,
  pendingText = "처리 중...",
  className,
  variant = "primary",
  disabled = false,
}: Props) {
  const { pending } = useFormStatus();
  const [locked, setLocked] = React.useState(false);

  // locked(클릭 순간 잠금)만 켜지고 pending이 켜지지 않는 케이스가 있습니다.
  // 예) required 입력 누락 등으로 브라우저가 제출을 막는 경우
  // 이때 버튼이 "처리 중"에서 풀리지 않는 문제를 방지합니다.
  const unlockTimerRef = React.useRef<number | null>(null);

  // pending 상태가 풀리면(리다이렉트 실패/서버 에러로 같은 페이지에 남는 경우 등) 잠금도 해제
  React.useEffect(() => {
    if (pending) {
      if (unlockTimerRef.current) {
        window.clearTimeout(unlockTimerRef.current);
        unlockTimerRef.current = null;
      }
      return;
    }

    setLocked(false);
  }, [pending]);

  // pending으로 전환되지 않으면(=실제 제출이 발생하지 않음) 잠금을 자동 해제
  React.useEffect(() => {
    if (!locked) return;
    if (pending) return;

    unlockTimerRef.current = window.setTimeout(() => {
      setLocked(false);
    }, 600);

    return () => {
      if (unlockTimerRef.current) {
        window.clearTimeout(unlockTimerRef.current);
        unlockTimerRef.current = null;
      }
    };
  }, [locked, pending]);

  const isPending = pending || locked;
  const isDisabled = disabled || isPending;

  return (
    <button
      type="submit"
      className={cn(BUTTON_BASE, BUTTON_VARIANT[variant], className)}
      disabled={isDisabled}
      aria-busy={isPending}
      onClick={(e) => {
        // pending 반영 전 연타 방지
        if (isDisabled) {
          e.preventDefault();
          return;
        }

        // 폼 유효성 검사에 걸리면 제출 자체가 발생하지 않으므로 잠금 금지
        const form = (e.currentTarget as HTMLButtonElement).form;
        if (form && !form.checkValidity()) {
          form.reportValidity();
          e.preventDefault();
          return;
        }

        setLocked(true);
      }}
    >
      {isPending ? pendingText : idleText}
    </button>
  );
}
