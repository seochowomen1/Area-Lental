"use client";

/**
 * 이용 정보 — 단체 이름 · 인원 · 사용 목적 (02_ui_apply §2-5 4 · §3 E-스튜디오)
 */
import { cn } from "@/lib/cn";
import type { ApplyErrors, ApplyFormValues } from "@/lib/apply/form";
import { A_INPUT, A_INPUT_ERROR, AField, fieldAria } from "@/components/apply/ui";

export const ORG_HELP = '단체가 아니면 "개인"이라고 적어 주세요.';
export const STUDIO_HEADCOUNT_HELP = "2명까지 시간당 20,000원. 3명부터 1명마다 시간당 10,000원이 더해집니다. (최대 12명)";

export function OrgField({
  values,
  errors,
  onChange,
}: {
  values: ApplyFormValues;
  errors: ApplyErrors;
  onChange: (patch: Partial<ApplyFormValues>) => void;
}) {
  return (
    <AField id="orgName" label="단체 이름" help={ORG_HELP} error={errors.orgName}>
      <input
        id="orgName"
        type="text"
        maxLength={80}
        autoComplete="organization"
        value={values.orgName}
        onChange={(e) => onChange({ orgName: e.target.value })}
        className={cn(A_INPUT, errors.orgName && A_INPUT_ERROR)}
        {...fieldAria("orgName", errors.orgName, true)}
      />
    </AField>
  );
}

export function UsageFields({
  values,
  errors,
  onChange,
  isStudio,
  capacity,
}: {
  values: ApplyFormValues;
  errors: ApplyErrors;
  onChange: (patch: Partial<ApplyFormValues>) => void;
  isStudio: boolean;
  capacity?: number;
}) {
  return (
    <>
      <AField id="headcount" label="인원" help={isStudio ? STUDIO_HEADCOUNT_HELP : undefined} error={errors.headcount}>
        <div className="flex items-center gap-2">
          <input
            id="headcount"
            type="text"
            inputMode="numeric"
            maxLength={3}
            value={values.headcount}
            onChange={(e) => onChange({ headcount: e.target.value.replace(/\D/g, "").slice(0, 3) })}
            className={cn(A_INPUT, "w-[120px] tabular-nums", errors.headcount && A_INPUT_ERROR)}
            aria-label={capacity ? `인원(최대 ${capacity}명)` : undefined}
            {...fieldAria("headcount", errors.headcount, isStudio)}
          />
          <span className="text-[17px] text-ink-2">명</span>
        </div>
      </AField>
      <AField id="purpose" label="사용 목적" error={errors.purpose}>
        <textarea
          id="purpose"
          rows={3}
          maxLength={1000}
          value={values.purpose}
          onChange={(e) => onChange({ purpose: e.target.value })}
          className={cn(A_INPUT, "min-h-[96px] resize-y", errors.purpose && A_INPUT_ERROR)}
          {...fieldAria("purpose", errors.purpose)}
        />
      </AField>
    </>
  );
}
