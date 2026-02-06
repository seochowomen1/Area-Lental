"use client";

import Card from "@/components/ui/Card";
import { FieldHelp, FieldLabel, Input } from "@/components/ui/Field";
import { SECTION_TITLE } from "@/components/ui/presets";

interface ApplicantInfoSectionProps {
  register: any;
  errors: any;
  setValue: any;
  formatPhoneKR: (input: string) => string;
}

export default function ApplicantInfoSection({
  register,
  errors,
  setValue,
  formatPhoneKR,
}: ApplicantInfoSectionProps) {
  return (
    <Card pad="lg">
      <h3 className={SECTION_TITLE}>신청자 정보</h3>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <FieldLabel htmlFor="applicantName">성명 *</FieldLabel>
          <Input id="applicantName" {...register("applicantName")} placeholder="홍길동" />
          {errors.applicantName ? (
            <FieldHelp className="text-red-600">{errors.applicantName.message}</FieldHelp>
          ) : null}
        </div>

        <div>
          <FieldLabel htmlFor="birth">생년월일 *</FieldLabel>
          <Input id="birth" type="date" {...register("birth")} />
          {errors.birth ? <FieldHelp className="text-red-600">{errors.birth.message}</FieldHelp> : null}
        </div>

        <div className="md:col-span-2">
          <FieldLabel htmlFor="address">주소 *</FieldLabel>
          <Input
            id="address"
            {...register("address")}
            placeholder="서울특별시 서운로26길 3, 4층"
          />
          {errors.address ? <FieldHelp className="text-red-600">{errors.address.message}</FieldHelp> : null}
        </div>

        <div>
          <FieldLabel htmlFor="phone">연락처 *</FieldLabel>
          <Input
            id="phone"
            {...register("phone", {
              onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                const formatted = formatPhoneKR((e.target as HTMLInputElement).value);
                setValue("phone", formatted, { shouldDirty: true, shouldValidate: true });
              },
            })}
            placeholder="010-0000-0000"
            inputMode="numeric"
            autoComplete="tel"
          />
          {errors.phone ? <FieldHelp className="text-red-600">{errors.phone.message}</FieldHelp> : null}
        </div>

        <div>
          <FieldLabel htmlFor="email">이메일 *</FieldLabel>
          <Input id="email" type="email" {...register("email")} placeholder="example@email.com" />
          {errors.email ? <FieldHelp className="text-red-600">{errors.email.message}</FieldHelp> : null}
        </div>
      </div>
    </Card>
  );
}
