"use client";

import { useEffect, useMemo, useState } from "react";
import { FieldHelp, FieldLabel, Input, Textarea } from "@/components/ui/Field";
import { formatKRW, normalizeDiscount } from "@/lib/pricing";

type Props = {
  totalFeeKRW: number;
  defaultRatePct?: number;
  defaultAmountKRW?: number;
  defaultReason?: string;
};

function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

export default function AdminDiscountFields({
  totalFeeKRW,
  defaultRatePct = 0,
  defaultAmountKRW = 0,
  defaultReason = ""
}: Props) {
  const [mode, setMode] = useState<"rate" | "amount">(defaultAmountKRW > 0 ? "amount" : "rate");
  const [ratePct, setRatePct] = useState<number>(toNum(defaultRatePct));
  const [amountKRW, setAmountKRW] = useState<number>(Math.round(toNum(defaultAmountKRW)));
  const [reason, setReason] = useState<string>(defaultReason);

  // total이 바뀌면(시간 변경 등) 현재 모드에 맞춰 값 재계산
  useEffect(() => {
    const norm = normalizeDiscount(totalFeeKRW, { ratePct, amountKRW, mode });
    setRatePct(norm.discountRatePct);
    setAmountKRW(norm.discountAmountKRW);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalFeeKRW]);

  const preview = useMemo(() => {
    return normalizeDiscount(totalFeeKRW, { ratePct, amountKRW, mode });
  }, [totalFeeKRW, ratePct, amountKRW, mode]);

  const finalFee = Math.max(0, Math.round(totalFeeKRW) - preview.discountAmountKRW);

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
      <div className="md:col-span-12">
        <div className="rounded-xl border bg-[rgb(var(--brand-primary)/0.03)] p-3 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <span className="text-gray-600">총 금액</span>: <b>{formatKRW(totalFeeKRW)}</b>
            </div>
            <div>
              <span className="text-gray-600">할인</span>: <b>{preview.discountRatePct.toFixed(2)}%</b> ({formatKRW(preview.discountAmountKRW)})
            </div>
            <div>
              <span className="text-gray-600">최종금액</span>: <b>{formatKRW(finalFee)}</b>
            </div>
          </div>
        </div>
      </div>

      <input type="hidden" name="discountMode" value={mode} />

      <div className="md:col-span-3">
        <FieldLabel htmlFor="discountRatePct">할인률(%)</FieldLabel>
        <Input
          id="discountRatePct"
          name="discountRatePct"
          type="number"
          inputMode="decimal"
          step="0.01"
          min={0}
          max={100}
          value={String(ratePct)}
          onChange={(e) => {
            setMode("rate");
            const v = toNum(e.target.value);
            const norm = normalizeDiscount(totalFeeKRW, { ratePct: v, amountKRW, mode: "rate" });
            setRatePct(norm.discountRatePct);
            setAmountKRW(norm.discountAmountKRW);
          }}
        />
        <FieldHelp>할인률을 입력하면 할인금액이 자동 계산됩니다.</FieldHelp>
      </div>

      <div className="md:col-span-3">
        <FieldLabel htmlFor="discountAmountKRW">할인금액(원)</FieldLabel>
        <Input
          id="discountAmountKRW"
          name="discountAmountKRW"
          type="number"
          inputMode="numeric"
          step="1"
          min={0}
          value={String(amountKRW)}
          onChange={(e) => {
            setMode("amount");
            const v = Math.max(0, Math.round(toNum(e.target.value)));
            const norm = normalizeDiscount(totalFeeKRW, { ratePct, amountKRW: v, mode: "amount" });
            setRatePct(norm.discountRatePct);
            setAmountKRW(norm.discountAmountKRW);
          }}
        />
        <FieldHelp>할인금액을 입력하면 할인률이 자동 계산됩니다.</FieldHelp>
      </div>

      <div className="md:col-span-6">
        <FieldLabel htmlFor="discountReason">할인 사유(선택)</FieldLabel>
        <Textarea
          id="discountReason"
          name="discountReason"
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="예: 기관 협약, 지역사회 지원, 행사 목적 등"
        />
      </div>
    </div>
  );
}
