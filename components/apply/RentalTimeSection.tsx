"use client";

import { useMemo } from "react";
import Card from "@/components/ui/Card";
import Notice from "@/components/ui/Notice";
import { FieldHelp, FieldLabel, Select } from "@/components/ui/Field";
import { SECTION_TITLE } from "@/components/ui/presets";
import { TIME_CONSTANTS } from "@/lib/constants";

interface RentalTimeSectionProps {
  selectedDate: string | null;
  startTime: string;
  endTime: string;
  startOptions: string[];
  endOptions: string[];
  durationMinutes: number;
  isTueNight: boolean;
  prefillLocked: boolean;
  register: any;
  errors: any;
}

function fmtDuration(mins: number) {
  const h = Math.floor(mins / TIME_CONSTANTS.MINUTES_PER_HOUR);
  const m = mins % TIME_CONSTANTS.MINUTES_PER_HOUR;
  if (h <= 0) return `${m}분`;
  return m ? `${h}시간 ${m}분` : `${h}시간`;
}

export default function RentalTimeSection({
  selectedDate,
  startTime,
  endTime,
  startOptions,
  endOptions,
  durationMinutes,
  isTueNight,
  prefillLocked,
  register,
  errors,
}: RentalTimeSectionProps) {
  return (
    <Card pad="lg">
      <h3 className={SECTION_TITLE}>대관 일시</h3>

      <div className="mt-4">
        <FieldLabel htmlFor="date">날짜 *</FieldLabel>
        <input
          id="date"
          type="date"
          {...register("date")}
          disabled={prefillLocked}
          className="w-full rounded-xl border border-gray-300 px-4 py-2.5 transition focus:border-[rgb(var(--brand-primary))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--brand-primary))] focus:ring-opacity-20 disabled:bg-gray-50 disabled:text-gray-500"
        />
        {errors.date ? <FieldHelp className="text-red-600">{errors.date.message}</FieldHelp> : null}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <FieldLabel htmlFor="startTime">시작 시간 *</FieldLabel>
          <Select id="startTime" {...register("startTime")} disabled={prefillLocked || !selectedDate}>
            {startOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
          {errors.startTime ? <FieldHelp className="text-red-600">{errors.startTime.message}</FieldHelp> : null}
          {prefillLocked && startTime ? (
            <FieldHelp className="text-blue-600">예약 가능 시간으로 자동 선택됨</FieldHelp>
          ) : null}
        </div>

        <div>
          <FieldLabel htmlFor="endTime">종료 시간 *</FieldLabel>
          <Select id="endTime" {...register("endTime")} disabled={prefillLocked || !selectedDate}>
            {endOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
          {errors.endTime ? <FieldHelp className="text-red-600">{errors.endTime.message}</FieldHelp> : null}
        </div>
      </div>

      <div className="mt-3 text-xs text-slate-700">
        이용시간: <b>{durationMinutes ? fmtDuration(durationMinutes) : "-"}</b>
      </div>

      {isTueNight ? (
        <div className="mt-2">
          <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
            화요일 야간 운영시간입니다
          </span>
        </div>
      ) : null}

      <FieldHelp className="mt-2">
        ※ 시간은 <b>30분 단위</b>로 선택할 수 있습니다. (최소 1시간, 최대 6시간)
        <br />※ 신청 시 &quot;수업시간/차단/이미 신청된 일정&quot;과 충돌하면 신청이 제한됩니다.
      </FieldHelp>
    </Card>
  );
}
