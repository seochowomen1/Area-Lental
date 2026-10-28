"use client";

/**
 * 생년월일 8자리 한 칸 + 확인 글자 (01_spec ⑧ Q7 · 02_ui_apply §2-5)
 * - 숫자 키패드(inputMode=numeric) · maxLength 8 · autocomplete=bday
 * - 8자리가 맞으면 칸 아래 `1965년 3월 12일`(brand 굵게 · aria-live)
 */
import { cn } from "@/lib/cn";
import { BIRTH8_PLACEHOLDER, cleanBirthDigits, parseBirth8 } from "@/lib/apply/birth";
import { A_INPUT, A_INPUT_ERROR, AField, fieldAria } from "@/components/apply/ui";

export default function BirthInput({
  id = "birthDigits",
  value,
  onChange,
  error,
  label = "생년월일 8자리",
}: {
  id?: string;
  value: string;
  onChange: (digits: string) => void;
  error?: string;
  label?: string;
}) {
  const parsed = parseBirth8(value);
  return (
    <AField
      id={id}
      label={label}
      error={error}
      after={
        <p aria-live="polite" className="mt-1 min-h-0 text-[15px] font-bold leading-6 text-brand">
          {parsed.ok && !error ? parsed.label : ""}
        </p>
      }
    >
      <input
        id={id}
        name="bday"
        type="text"
        inputMode="numeric"
        autoComplete="bday"
        maxLength={10}
        placeholder={BIRTH8_PLACEHOLDER}
        value={value}
        onChange={(e) => onChange(cleanBirthDigits(e.target.value))}
        className={cn(A_INPUT, "sm:max-w-[240px] tabular-nums", error && A_INPUT_ERROR)}
        {...fieldAria(id, error)}
      />
    </AField>
  );
}
