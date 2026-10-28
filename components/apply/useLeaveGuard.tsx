"use client";

/**
 * S1 작성 중 이탈 확인 (02_ui_apply §2-8)
 * - 대상: 로고·지난 단계 링크·외부 링크(같은 창)·뒤로가기·새로고침/창 닫기
 * - 제외: data-leave-ok="true" 링크(`날짜·시간 바꾸기` — 확인 없이 이동 · 입력 유지) · 새 창 · tel:/mailto: · 같은 쪽 #
 * - 뒤로가기: 처음 작성 시작 때 같은 주소 항목을 하나 더 쌓아 두고(Next 상태 __NA 복사), popstate가 오면 모달을 연다.
 *   [계속 쓰기] = 항목을 다시 쌓음 · [이동] = 한 번 더 뒤로.
 * - 새로고침·창 닫기: 브라우저 기본 확인창(beforeunload) — 문구는 브라우저가 정한다.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { A_BTN_PRIMARY, A_BTN_SECONDARY } from "@/components/apply/ui";

export const LEAVE_CONFIRM_TEXT = "작성 중인 신청서가 사라집니다. 이동할까요?";

type Pending = { kind: "href"; href: string; external: boolean } | { kind: "back" };

export function useLeaveGuard(active: boolean) {
  const router = useRouter();
  const [pending, setPending] = useState<Pending | null>(null);
  const activeRef = useRef(active);
  const sentinelRef = useRef(false);
  const releasedRef = useRef(false);
  activeRef.current = active;

  const pushSentinel = useCallback(() => {
    try {
      const st = window.history.state && typeof window.history.state === "object" ? { ...window.history.state } : {};
      window.history.pushState({ ...st, __applyGuard: true }, "", window.location.href);
      sentinelRef.current = true;
    } catch {
      /* 무시 */
    }
  }, []);

  // 작성이 시작되면 뒤로가기용 항목 하나 쌓기(한 번만)
  useEffect(() => {
    if (active && !sentinelRef.current) pushSentinel();
  }, [active, pushSentinel]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!activeRef.current || releasedRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    const onPopState = () => {
      if (!sentinelRef.current || releasedRef.current) return;
      sentinelRef.current = false;
      if (!activeRef.current) {
        window.history.back();
        return;
      }
      setPending({ kind: "back" });
    };
    const onClick = (e: MouseEvent) => {
      if (!activeRef.current || releasedRef.current) return;
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.dataset.leaveOk === "true") return;
      if (a.target && a.target !== "_self") return;
      const raw = a.getAttribute("href") || "";
      if (/^(tel:|mailto:|sms:|#)/i.test(raw)) return;
      const url = new URL(a.href, window.location.href);
      const external = url.origin !== window.location.origin;
      if (!external && url.pathname === window.location.pathname && url.search === window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      setPending({ kind: "href", href: external ? url.href : url.pathname + url.search + url.hash, external });
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("popstate", onPopState);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("popstate", onPopState);
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  const stay = useCallback(() => {
    if (pending?.kind === "back") pushSentinel();
    setPending(null);
  }, [pending, pushSentinel]);

  const leave = useCallback(() => {
    const p = pending;
    setPending(null);
    releasedRef.current = true;
    if (!p) return;
    if (p.kind === "back") {
      window.history.back();
      return;
    }
    if (p.external) window.location.href = p.href;
    else router.push(p.href);
  }, [pending, router]);

  /** 제출 성공 등 — 더는 묻지 않음 */
  const release = useCallback(() => {
    releasedRef.current = true;
  }, []);

  const modal = <LeaveConfirmModal open={pending !== null} onStay={stay} onLeave={leave} />;
  return { modal, release };
}

export function LeaveConfirmModal({ open, onStay, onLeave }: { open: boolean; onStay: () => void; onLeave: () => void }) {
  const ref = useFocusTrap(open, { initialFocus: "auto" });
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onStay();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onStay]);
  if (!open) return null;
  return (
    <div ref={ref} className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="leave-title">
      <button type="button" className="absolute inset-0 bg-slate-900/45" aria-label="계속 쓰기" onClick={onStay} tabIndex={-1} />
      <div className="relative w-full max-w-[480px] rounded-[14px] bg-white p-5 shadow-xl">
        <h2 id="leave-title" className="text-[20px] font-extrabold leading-[30px] text-ink">
          {LEAVE_CONFIRM_TEXT}
        </h2>
        <div className="mt-5 flex flex-col gap-2">
          <button type="button" data-autofocus className={A_BTN_PRIMARY} onClick={onStay}>
            계속 쓰기
          </button>
          <button type="button" className={A_BTN_SECONDARY} onClick={onLeave}>
            이동
          </button>
        </div>
      </div>
    </div>
  );
}
