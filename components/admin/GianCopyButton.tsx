"use client";

import { useState } from "react";

/**
 * 기안 데이터 복사 버튼 (2026-08-26 신설)
 *
 * 그룹웨어 대관 기안(내부 결재) 작성에 필요한 데이터를 JSON으로 클립보드에 복사한다.
 * 복사된 JSON은 관리 도구(/대관 스킬)가 그대로 파싱해 기안 초안을 만든다.
 * 스키마 버전은 payload._type / payload.version으로 식별한다.
 */
export default function GianCopyButton({ payload }: { payload: Record<string, unknown> }) {
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");

  async function handleCopy() {
    const text = JSON.stringify(payload, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setCopied("ok");
    } catch {
      // clipboard API가 막힌 환경(비보안 컨텍스트 등) 폴백
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setCopied("ok");
      } catch {
        setCopied("fail");
      }
    }
    window.setTimeout(() => setCopied("idle"), 2000);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
      title="그룹웨어 대관 기안 작성용 데이터를 JSON으로 복사합니다"
    >
      {copied === "ok" ? "✓ 복사됨" : copied === "fail" ? "복사 실패" : "기안 데이터 복사"}
    </button>
  );
}
