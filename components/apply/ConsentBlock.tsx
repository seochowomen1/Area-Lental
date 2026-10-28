"use client";

/**
 * 동의 (02_ui_apply §0-5 (1) · §2-5 5)
 * - 줄 전체가 누르는 영역(56) · 누르면 팝업 → [동의합니다]로만 체크, [동의하지 않습니다]는 해제, [닫기]는 그대로
 * - 이미 체크된 줄을 다시 눌러도 팝업이 열린다(지금 동작 그대로)
 */
import { useState } from "react";
import { cn } from "@/lib/cn";
import PrivacyModal from "@/components/PrivacyModal";
import PledgeModal from "@/components/PledgeModal";
import { A_ERROR_TEXT, A_HELP, A_SECTION_TITLE } from "@/components/apply/ui";

export const CONSENT_HELP = "칸을 누르면 전문이 열립니다. 읽은 뒤 [동의합니다]를 눌러 주세요.";

function ConsentRow({
  id,
  label,
  checked,
  error,
  onOpen,
}: {
  id: string;
  label: string;
  checked: boolean;
  error?: string;
  onOpen: () => void;
}) {
  return (
    <div>
      <button
        id={id}
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onClick={onOpen}
        className="flex min-h-[56px] w-full items-center gap-3 px-3.5 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky"
      >
        <span
          aria-hidden="true"
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded border-2",
            checked ? "border-brand bg-brand text-white" : error ? "border-red-700 bg-white" : "border-slate-400 bg-white"
          )}
        >
          {checked ? (
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path d="M3 8.5l3.2 3L13 4.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : null}
        </span>
        <span className="flex-1 text-[17px] leading-6 text-ink">{label}</span>
        <span className={cn("shrink-0 text-[15px]", checked ? "font-bold text-brand" : "text-ink-3")}>{checked ? "동의함" : "눌러서 읽기"}</span>
      </button>
      {error ? (
        <p id={`${id}-error`} className={cn(A_ERROR_TEXT, "px-3.5 pb-2")}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default function ConsentBlock({
  roomId,
  privacyAgree,
  pledgeAgree,
  onChange,
  privacyError,
  pledgeError,
}: {
  roomId: string;
  privacyAgree: boolean;
  pledgeAgree: boolean;
  onChange: (patch: { privacyAgree?: boolean; pledgeAgree?: boolean }) => void;
  privacyError?: string;
  pledgeError?: string;
}) {
  const [open, setOpen] = useState<null | "privacy" | "pledge">(null);
  const isGallery = roomId === "gallery";
  return (
    <section aria-labelledby="sec-consent" className="space-y-2">
      <h2 id="sec-consent" className={A_SECTION_TITLE}>
        동의
      </h2>
      <p className={A_HELP}>{CONSENT_HELP}</p>
      <div className="divide-y divide-line rounded-xl border border-line bg-white">
        <ConsentRow
          id="privacyAgree"
          label="개인정보 수집·이용에 동의합니다"
          checked={privacyAgree}
          error={privacyError}
          onOpen={() => setOpen("privacy")}
        />
        <ConsentRow
          id="pledgeAgree"
          label={isGallery ? "전시 서약 내용에 동의합니다" : "서약 내용에 동의합니다"}
          checked={pledgeAgree}
          error={pledgeError}
          onOpen={() => setOpen("pledge")}
        />
      </div>
      <PrivacyModal
        open={open === "privacy"}
        variant={isGallery ? "gallery" : "rental"}
        onClose={() => setOpen(null)}
        onAgree={() => onChange({ privacyAgree: true })}
        onDisagree={() => onChange({ privacyAgree: false })}
      />
      <PledgeModal
        open={open === "pledge"}
        roomId={roomId}
        onClose={() => setOpen(null)}
        onAgree={() => onChange({ pledgeAgree: true })}
        onDisagree={() => onChange({ pledgeAgree: false })}
      />
    </section>
  );
}
