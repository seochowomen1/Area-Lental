"use client";

/**
 * S2 다시 들어옴 — 이어서 쓰기 (02_ui_apply §2-8 · 확정 2026-10-28 §6-7)
 * h1 바로 아래 brand-soft 상자 role="status"
 */
import { A_BTN_PRIMARY, A_BTN_SECONDARY, A_HELP } from "@/components/apply/ui";

export const RESUME_TITLE = "작성하던 내용이 있습니다. 이어서 쓸까요?";
export const RESUME_HELP = "이름·휴대폰 번호·생년월일·이메일·주소·단체 이름은 개인정보라 저장하지 않습니다. 다시 입력해 주세요.";

export default function ResumeDraftBox({ onResume, onFresh }: { onResume: () => void; onFresh: () => void }) {
  return (
    <div role="status" className="rounded-xl border border-brand/20 bg-brand-soft p-4 sm:p-5">
      <p className="text-[17px] font-bold leading-7 text-ink">{RESUME_TITLE}</p>
      <p className={`${A_HELP} mt-1`}>{RESUME_HELP}</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <button type="button" className={`${A_BTN_PRIMARY} sm:w-auto sm:min-w-[180px]`} onClick={onResume}>
          이어서 쓰기
        </button>
        <button type="button" className={`${A_BTN_SECONDARY} sm:w-auto sm:min-w-[180px]`} onClick={onFresh}>
          처음부터 쓰기
        </button>
      </div>
    </div>
  );
}
