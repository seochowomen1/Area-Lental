"use client";

import Card from "@/components/ui/Card";
import Checkbox from "@/components/ui/Checkbox";
import { FieldHelp, FieldLabel, Input } from "@/components/ui/Field";
import { SECTION_TITLE } from "@/components/ui/presets";

interface ConsentSectionProps {
  register: any;
  errors: any;
  privacyAgree: boolean;
  pledgeAgree: boolean;
  fixedPledgeDate: string;
  onPrivacyClick: () => void;
  onPledgeClick: () => void;
  onPledgeNameChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export default function ConsentSection({
  register,
  errors,
  privacyAgree,
  pledgeAgree,
  fixedPledgeDate,
  onPrivacyClick,
  onPledgeClick,
  onPledgeNameChange,
}: ConsentSectionProps) {
  const handleKeyDown = (callback: () => void) => (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      callback();
    }
  };

  return (
    <Card pad="lg">
      <h3 className={SECTION_TITLE}>동의/서약</h3>
      <div className="mt-4">
        <input type="hidden" {...register("privacyAgree")} />
        <Checkbox
          checked={!!privacyAgree}
          readOnly
          onClick={(e) => { e.preventDefault(); onPrivacyClick(); }}
          onKeyDown={handleKeyDown(onPrivacyClick)}
          label="개인정보 수집·이용에 동의합니다. (필수)"
          error={errors.privacyAgree?.message}
        />
        <FieldHelp className="mt-1">* 체크 시 안내 내용을 확인한 후 동의 여부가 반영됩니다.</FieldHelp>
      </div>
      <div className="mt-4">
        <input type="hidden" {...register("pledgeAgree")} />
        <Checkbox
          checked={!!pledgeAgree}
          readOnly
          onClick={(e) => { e.preventDefault(); onPledgeClick(); }}
          onKeyDown={handleKeyDown(onPledgeClick)}
          label="서약 내용에 동의합니다. (필수)"
          error={errors.pledgeAgree?.message}
        />
        <FieldHelp className="mt-1">
          * 체크 시 서약서 내용을 확인한 후 동의 여부가 반영됩니다.
        </FieldHelp>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor="pledgeDate">서약 일자 *</FieldLabel>
          <input type="hidden" {...register("pledgeDate")} />
          <Input id="pledgeDate" type="text" value={fixedPledgeDate} readOnly className="bg-slate-50 text-slate-700" />
          {errors.pledgeDate ? <FieldHelp className="text-red-600">{errors.pledgeDate.message}</FieldHelp> : null}
        </div>

        <div>
          <FieldLabel htmlFor="pledgeName">서약자 성명 *</FieldLabel>
          <Input
            id="pledgeName"
            {...register("pledgeName", { onChange: onPledgeNameChange })}
          />
          {errors.pledgeName ? <FieldHelp className="text-red-600">{errors.pledgeName.message}</FieldHelp> : null}
        </div>
      </div>
    </Card>
  );
}
