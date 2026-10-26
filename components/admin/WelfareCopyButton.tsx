"use client";

import { useState } from "react";

/**
 * 복지종합시스템 등록용 복사 버튼 (2026-10-26 · payment-link-record)
 *
 * GET /api/admin/requests/{id}/welfare-copy 의 text를 클립보드에 복사한다.
 * 복지종합시스템PLUS 프로그램관리 → 홈페이지 등록 폼 순서로 한 줄씩 붙여넣는 용도(JSON 아님).
 * 동작·2초 피드백은 GianCopyButton과 동일.
 */
export default function WelfareCopyButton({ requestId }: { requestId: string }) {
  const [state, setState] = useState<"idle" | "loading" | "ok" | "fail">("idle");

  async function copyText(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        return ok;
      } catch {
        return false;
      }
    }
  }

  async function handleCopy() {
    if (state === "loading") return;
    setState("loading");
    let ok = false;
    try {
      const res = await fetch(`/api/admin/requests/${encodeURIComponent(requestId)}/welfare-copy`);
      const data = await res.json();
      if (data?.ok && typeof data.text === "string") {
        ok = await copyText(data.text);
      }
    } catch {
      ok = false;
    }
    setState(ok ? "ok" : "fail");
    window.setTimeout(() => setState("idle"), 2000);
  }

  const label =
    state === "loading" ? "불러오는 중…" : state === "ok" ? "✓ 복사됨" : state === "fail" ? "복사 실패" : "복지종합시스템 등록용 복사";

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={state === "loading"}
      className={
        "rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-gray-50 disabled:opacity-60 " +
        (state === "fail" ? "text-red-700" : "text-gray-700")
      }
      title="복지종합시스템 프로그램관리·홈페이지 등록 폼 입력 순서대로 텍스트를 복사합니다"
    >
      {label}
    </button>
  );
}
