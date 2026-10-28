"use client";

/**
 * 장비 (선택) — 강의실 3개 · E-스튜디오 촬영 장비 6개 (02_ui_apply §2-5 4 · §3)
 * 줄 52 · 체크 24 · 오른쪽 금액. 합계는 예상 이용료 상자에.
 */
import { equipFee, LECTURE_EQUIP_KEYS, PUBLIC_EQUIP_LABELS, STUDIO_EQUIP_KEYS, type ApplyFormValues, type EquipKey } from "@/lib/apply/form";
import { A_HELP } from "@/components/apply/ui";

export const STUDIO_EQUIP_HELP = "장비 요금은 하루 1번만 받습니다. 영상 저장용 SD카드나 외장하드를 꼭 가져오세요.";

export default function EquipmentFields({
  values,
  onChange,
  isStudio,
}: {
  values: ApplyFormValues;
  onChange: (patch: Partial<ApplyFormValues>) => void;
  isStudio: boolean;
}) {
  const keys: EquipKey[] = isStudio ? STUDIO_EQUIP_KEYS : LECTURE_EQUIP_KEYS;
  return (
    <fieldset>
      <legend className="text-[17px] font-bold leading-7 text-ink">
        {isStudio ? "촬영 장비" : "장비"}
        <span className="font-medium text-ink-3"> (선택)</span>
      </legend>
      <div className="mt-1.5 divide-y divide-line rounded-xl border border-line bg-white">
        {keys.map((k) => {
          const id = `equip-${k}`;
          return (
            <label key={k} htmlFor={id} className="flex min-h-[52px] cursor-pointer items-center gap-3 px-3.5 py-2">
              <input
                id={id}
                type="checkbox"
                checked={values.equipment[k]}
                onChange={(e) => onChange({ equipment: { ...values.equipment, [k]: e.target.checked } })}
                className="h-6 w-6 shrink-0 rounded border-slate-300 text-brand focus:ring-sky"
              />
              <span className="flex-1 text-[17px] leading-6 text-ink">{PUBLIC_EQUIP_LABELS[k]}</span>
              <span className="shrink-0 text-[16px] tabular-nums text-ink-2">
                {isStudio ? "" : "1회 "}
                {equipFee(k).toLocaleString()}원
              </span>
            </label>
          );
        })}
      </div>
      {isStudio ? <p className={`${A_HELP} mt-1.5`}>{STUDIO_EQUIP_HELP}</p> : null}
    </fieldset>
  );
}
