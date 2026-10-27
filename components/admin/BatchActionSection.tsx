"use client";

import { useState, type ReactNode } from "react";
import FormSubmitButton from "@/components/FormSubmitButton";

interface Props {
  approveLabel: string;
  rejectLabel: string;
  children?: ReactNode;
  note?: string;
}

export default function BatchActionSection({
  approveLabel,
  rejectLabel,
  children,
  note,
}: Props) {
  const [intent, setIntent] = useState<"승인" | "반려">("승인");
  const isReject = intent === "반려";

  return (
    <>
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-2">처리 방식</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setIntent("승인")}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              !isReject
                ? "bg-brand text-white shadow-sm"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {approveLabel}
          </button>
          <button
            type="button"
            onClick={() => setIntent("반려")}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              isReject
                ? "bg-red-600 text-white shadow-sm"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {rejectLabel}
          </button>
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700">
          반려 사유 (반려 시 필수)
        </label>
        <textarea
          name="rejectReason"
          defaultValue=""
          disabled={!isReject}
          className={`mt-1.5 w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 ${
            isReject
              ? "border-slate-200 bg-white"
              : "border-slate-100 bg-slate-50 text-slate-500 cursor-not-allowed"
          }`}
          rows={2}
          placeholder={isReject ? "반려 사유를 입력해 주세요" : "반려를 선택하면 입력할 수 있습니다"}
        />
      </div>

      {children}

      <input type="hidden" name="actionStatus" value={intent} />

      <div className="flex flex-wrap items-center gap-3">
        {/* 처리 중 표시 + 이중 클릭 방지(서버 액션 · audit-fix-1) */}
        <FormSubmitButton
          idleText={isReject ? rejectLabel : approveLabel}
          pendingText="처리 중..."
          variant={isReject ? "danger" : "primary"}
          className="rounded-lg px-5 py-2.5"
        />
        {note && <span className="text-xs text-slate-500">{note}</span>}
      </div>
    </>
  );
}
