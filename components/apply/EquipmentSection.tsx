"use client";

import { EQUIPMENT_FEE_KRW, STUDIO_EQUIPMENT_FEE_KRW, STUDIO_EQUIPMENT_LABELS } from "@/lib/config";
import Card from "@/components/ui/Card";
import Checkbox from "@/components/ui/Checkbox";
import { FieldHelp } from "@/components/ui/Field";
import { SECTION_TITLE } from "@/components/ui/presets";

interface EquipmentSectionProps {
  register: any;
  isStudioRoom: boolean;
  equipmentFee: number;
  sessionCount: number;
  equipmentSum: number;
}

export default function EquipmentSection({
  register,
  isStudioRoom,
  equipmentFee,
  sessionCount,
  equipmentSum,
}: EquipmentSectionProps) {
  return (
    <Card pad="lg">
      <h3 className={SECTION_TITLE}>{isStudioRoom ? "촬영장비 사용(선택)" : "장비 사용(선택)"}</h3>
      {isStudioRoom ? (
        <>
          <div className="mt-4 space-y-3">
            {(Object.keys(STUDIO_EQUIPMENT_FEE_KRW) as Array<keyof typeof STUDIO_EQUIPMENT_FEE_KRW>).map((key) => (
              <Checkbox
                key={key}
                {...register(key)}
                label={`${STUDIO_EQUIPMENT_LABELS[key]} — ${STUDIO_EQUIPMENT_FEE_KRW[key].toLocaleString()}원`}
              />
            ))}
          </div>
          <FieldHelp className="mt-3">
            * 촬영장비 사용료 (1일 1회 과금): <b>{equipmentFee.toLocaleString()}</b>원
            {sessionCount > 1 ? (
              <>
                <br />* 장비 사용료 합계 (총 {sessionCount}회차): <b>{equipmentSum.toLocaleString()}</b>원
              </>
            ) : null}
          </FieldHelp>
        </>
      ) : (
        <>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <Checkbox {...register("laptop")} label="노트북" />
            <Checkbox {...register("projector")} label="프로젝터" />
            <Checkbox {...register("audio")} label="음향" />
          </div>
          <FieldHelp className="mt-3">
            * 장비 사용료 (회차당): <b>{equipmentFee.toLocaleString()}</b>원 (기준: 노트북 {EQUIPMENT_FEE_KRW.laptop.toLocaleString()}원 /
            프로젝터 {EQUIPMENT_FEE_KRW.projector.toLocaleString()}원 / 음향 {EQUIPMENT_FEE_KRW.audio.toLocaleString()}원)
            {sessionCount > 1 ? (
              <>
                <br />* 장비 사용료 합계 (총 {sessionCount}회차): <b>{equipmentSum.toLocaleString()}</b>원
              </>
            ) : null}
          </FieldHelp>
        </>
      )}
    </Card>
  );
}
