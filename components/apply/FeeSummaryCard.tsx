"use client";

import Card from "@/components/ui/Card";
import { SECTION_TITLE } from "@/components/ui/presets";

function fmtDuration(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m}분`;
  return m ? `${h}시간 ${m}분` : `${h}시간`;
}

interface FeeSummaryCardProps {
  sessionCount: number;
  totalDurationMin: number;
  durationMinutes: number;
  rentalSum: number;
  equipmentSum: number;
  total: number;
}

export default function FeeSummaryCard({
  sessionCount,
  totalDurationMin,
  durationMinutes,
  rentalSum,
  equipmentSum,
  total,
}: FeeSummaryCardProps) {
  return (
    <Card pad="lg">
      <h3 className={SECTION_TITLE}>이용요금 안내</h3>
      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-blue-50/80 via-white to-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5">
          <span className="text-base">💰</span>
          <span className="text-sm font-bold text-slate-800">대관료 및 장비 사용료</span>
        </div>
        <div className="px-4 py-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>
                {sessionCount > 1 ? (
                  <>대관료 ({sessionCount}회차 · {totalDurationMin ? fmtDuration(totalDurationMin) : "-"})</>
                ) : (
                  <>대관료 {durationMinutes ? `(${fmtDuration(durationMinutes)})` : ""}</>
                )}
              </span>
              <span className="font-semibold text-slate-800 tabular-nums">{rentalSum.toLocaleString()}원</span>
            </div>
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>
                {sessionCount > 1 ? <>장비 사용료 ({sessionCount}회차)</> : <>장비 사용료</>}
              </span>
              <span className="font-semibold text-slate-800 tabular-nums">{equipmentSum.toLocaleString()}원</span>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between rounded-xl bg-[rgb(var(--brand-primary)/0.06)] px-4 py-3">
            <span className="text-sm font-bold text-slate-900">총 금액</span>
            <span className="text-lg font-extrabold text-[rgb(var(--brand-primary))]">{total.toLocaleString()}원</span>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            ※ 장비 사용료는 선택 항목에 따라 변동되며, 선택한 회차 수 기준으로 합산됩니다.
          </p>
        </div>
      </div>
    </Card>
  );
}
