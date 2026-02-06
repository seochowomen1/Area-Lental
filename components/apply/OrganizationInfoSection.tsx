"use client";

import Card from "@/components/ui/Card";
import { FieldHelp, FieldLabel, Input, Textarea } from "@/components/ui/Field";
import { SECTION_TITLE } from "@/components/ui/presets";

interface OrganizationInfoSectionProps {
  register: any;
  errors: any;
}

export default function OrganizationInfoSection({
  register,
  errors,
}: OrganizationInfoSectionProps) {
  return (
    <Card pad="lg">
      <h3 className={SECTION_TITLE}>단체/행사 정보</h3>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <FieldLabel htmlFor="orgName">단체명 *</FieldLabel>
          <Input id="orgName" {...register("orgName")} />
          {errors.orgName ? <FieldHelp className="text-red-600">{errors.orgName.message}</FieldHelp> : null}
        </div>

        <div>
          <FieldLabel htmlFor="headcount">인원 *</FieldLabel>
          <Input
            id="headcount"
            type="number"
            min={1}
            {...register("headcount", { valueAsNumber: true })}
          />
          {errors.headcount ? <FieldHelp className="text-red-600">{errors.headcount.message}</FieldHelp> : null}
        </div>

        <div className="md:col-span-2">
          <FieldLabel htmlFor="purpose">사용 목적/행사 내용 *</FieldLabel>
          <Textarea id="purpose" {...register("purpose")} rows={4} />
          {errors.purpose ? <FieldHelp className="text-red-600">{errors.purpose.message}</FieldHelp> : null}
        </div>
      </div>
    </Card>
  );
}
