"use client";

/**
 * 신청하시는 분 — 이름 · 생년월일 8자리 · 휴대폰 번호 · 이메일 · 주소 (02_ui_apply §2-5 3)
 * 강의실·E-스튜디오·갤러리·서면 등록 공용
 */
import { cn } from "@/lib/cn";
import { formatPhoneKR, type ApplyErrors, type ApplyFormValues } from "@/lib/apply/form";
import BirthInput from "@/components/apply/BirthInput";
import { A_INPUT, A_INPUT_ERROR, A_SECTION_TITLE, AField, fieldAria } from "@/components/apply/ui";

export default function ApplicantFields({
  values,
  errors,
  onChange,
  title = "신청하시는 분",
  emailHelp = "결과와 결제 안내를 이 메일로 보내 드립니다.",
}: {
  values: ApplyFormValues;
  errors: ApplyErrors;
  onChange: (patch: Partial<ApplyFormValues>) => void;
  title?: string;
  emailHelp?: string;
}) {
  return (
    <section aria-labelledby="sec-applicant" className="space-y-5">
      <h2 id="sec-applicant" className={A_SECTION_TITLE}>
        {title}
      </h2>
      <AField id="applicantName" label="이름" error={errors.applicantName}>
        <input
          id="applicantName"
          type="text"
          autoComplete="name"
          maxLength={30}
          value={values.applicantName}
          onChange={(e) => onChange({ applicantName: e.target.value })}
          className={cn(A_INPUT, "sm:max-w-[320px]", errors.applicantName && A_INPUT_ERROR)}
          {...fieldAria("applicantName", errors.applicantName)}
        />
      </AField>
      <BirthInput value={values.birthDigits} onChange={(birthDigits) => onChange({ birthDigits })} error={errors.birthDigits} />
      <AField id="phone" label="휴대폰 번호" error={errors.phone}>
        <input
          id="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          maxLength={13}
          placeholder="010-0000-0000"
          value={values.phone}
          onChange={(e) => onChange({ phone: formatPhoneKR(e.target.value) })}
          className={cn(A_INPUT, "sm:max-w-[320px] tabular-nums", errors.phone && A_INPUT_ERROR)}
          {...fieldAria("phone", errors.phone)}
        />
      </AField>
      <AField id="email" label="이메일" help={emailHelp} error={errors.email}>
        <input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={values.email}
          onChange={(e) => onChange({ email: e.target.value })}
          className={cn(A_INPUT, errors.email && A_INPUT_ERROR)}
          {...fieldAria("email", errors.email, Boolean(emailHelp))}
        />
      </AField>
      <AField id="address" label="주소" error={errors.address}>
        <input
          id="address"
          type="text"
          autoComplete="street-address"
          maxLength={200}
          value={values.address}
          onChange={(e) => onChange({ address: e.target.value })}
          className={cn(A_INPUT, errors.address && A_INPUT_ERROR)}
          {...fieldAria("address", errors.address)}
        />
      </AField>
    </section>
  );
}
