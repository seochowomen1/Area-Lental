"use client";

import { useState } from "react";

/**
 * 복지종합시스템 등록용 복사 버튼 (2026-10-26 · payment-link-record)
 *
 * GET /api/admin/requests/{id}/welfare-copy 의 fields.welfare.programName(강좌 제목 한 줄)만 클립보드에 복사한다.
 * 예: [전시]26.12.28.(월)~26.12.31.(목) 우리동네갤러리(이*림)
 * (2026-10-27 사용자 요청: 여러 줄 등록 정보 대신 제목만)
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
      const title = data?.ok ? data?.fields?.welfare?.programName : "";
      if (typeof title === "string" && title) {
        ok = await copyText(title);
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
        "rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-slate-50 disabled:opacity-60 " +
        (state === "fail" ? "text-red-700" : "text-slate-700")
      }
      title="복지종합시스템·홈페이지에 쓸 강좌 제목 한 줄을 복사합니다 (예: [전시]26.12.28.(월)~26.12.31.(목) 우리동네갤러리(이*림))"
    >
      {label}
    </button>
  );
}
