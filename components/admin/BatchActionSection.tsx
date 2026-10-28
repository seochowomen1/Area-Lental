"use client";

import { useState, type ReactNode } from "react";
import FormSubmitButton from "@/components/FormSubmitButton";
import { cn } from "@/lib/cn";

type Intent = "승인" | "반려" | "취소";

interface Props {
  approveLabel: string;
  rejectLabel: string;
  /** 있으면 세 번째 처리 방식 "취소(신청자 요청)"를 보인다 — 승인된 예약을 신청자가 전화로 취소할 때(audit-fix-3 3-2 검수 M1) */
  cancelLabel?: string;
  children?: ReactNode;
  note?: string;
  /** 화면의 주 버튼이 위 "다음 할 일" 카드에 있을 때 — 토글·제출을 보조 모양으로(채운 주 버튼은 화면에 1개 · audit-fix-3 3-2) */
  quiet?: boolean;
}

/** 선택된 토글 모양 — quiet면 연한 바탕(채운 버튼은 카드 주 버튼 1개만) */
const SELECTED: Record<Intent, { solid: string; soft: string }> = {
  승인: { solid: "bg-brand text-white shadow-sm", soft: "border-2 border-brand bg-brand-soft text-brand" },
  반려: { solid: "bg-red-600 text-white shadow-sm", soft: "border-2 border-red-400 bg-red-50 text-red-800" },
  취소: { solid: "bg-slate-700 text-white shadow-sm", soft: "border-2 border-slate-500 bg-slate-100 text-ink" },
};
const UNSELECTED = "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50";

export default function BatchActionSection({
  approveLabel,
  rejectLabel,
  cancelLabel,
  children,
  note,
  quiet = false,
}: Props) {
  const [intent, setIntent] = useState<Intent>("승인");
  const isReject = intent === "반려";
  const isCancel = intent === "취소";
  const reasonEnabled = isReject || isCancel;

  const options: { value: Intent; label: string }[] = [
    { value: "승인", label: approveLabel },
    { value: "반려", label: rejectLabel },
    ...(cancelLabel ? [{ value: "취소" as const, label: cancelLabel }] : []),
  ];
  const labelOf = (v: Intent) => options.find((o) => o.value === v)?.label ?? v;

  return (
    <>
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-2">처리 방식</label>
        <div className="flex flex-wrap gap-2" role="group" aria-label="처리 방식">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              aria-pressed={intent === o.value}
              onClick={() => setIntent(o.value)}
              className={cn(
                "min-h-[44px] rounded-lg px-4 py-2 text-sm font-semibold transition-colors",
                intent === o.value ? (quiet ? SELECTED[o.value].soft : SELECTED[o.value].solid) : UNSELECTED
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700">
          {isCancel ? "취소 사유 (선택 · 비우면 \"신청자 요청\")" : "반려 사유 (반려 시 필수)"}
        </label>
        <textarea
          name="rejectReason"
          defaultValue=""
          disabled={!reasonEnabled}
          className={`mt-1.5 w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 ${
            reasonEnabled
              ? "border-slate-200 bg-white"
              : "border-slate-100 bg-slate-50 text-slate-500 cursor-not-allowed"
          }`}
          rows={2}
          placeholder={
            isReject
              ? "반려 사유를 입력해 주세요"
              : isCancel
                ? "예: 신청자 전화 요청(10/28)"
                : cancelLabel
                  ? "반려나 취소를 선택하면 입력할 수 있습니다"
                  : "반려를 선택하면 입력할 수 있습니다"
          }
        />
      </div>

      {children}

      <input type="hidden" name="actionStatus" value={intent} />

      <div className="flex flex-wrap items-center gap-3">
        {/* 처리 중 표시 + 이중 클릭 방지(서버 액션 · audit-fix-1) */}
        <FormSubmitButton
          idleText={labelOf(intent)}
          pendingText="처리 중..."
          variant={isReject ? "danger" : quiet || isCancel ? "outline" : "primary"}
          className="rounded-lg px-5 py-2.5"
        />
        {note && <span className="text-xs text-slate-500">{note}</span>}
      </div>
    </>
  );
}
