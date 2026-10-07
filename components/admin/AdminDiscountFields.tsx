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

/** 할인(감면) 근거 목록 — 감사 대응용. 필요 시 항목 추가 */
export const DISCOUNT_REASON_PRESETS = [
  "기관 협약",
  "센터 내부 행사·협력 사업",
  "구청·공공기관 협조",
  "지역사회 공익 행사",
] as const;
const OTHER = "__other__";

function splitReason(raw: string): { preset: string; detail: string } {
  const text = String(raw ?? "").trim();
  if (!text) return { preset: "", detail: "" };
  const hit = DISCOUNT_REASON_PRESETS.find((p) => text === p || text.startsWith(`${p} · `));
  if (hit) return { preset: hit, detail: text === hit ? "" : text.slice(hit.length + 3) };
  return { preset: OTHER, detail: text };
}

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
  const initial = splitReason(defaultReason);
  const [preset, setPreset] = useState<string>(initial.preset);
  const [detail, setDetail] = useState<string>(initial.detail);

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
        <FieldLabel htmlFor="discountReasonPreset">
          할인 근거{preview.discountAmountKRW > 0 ? <span className="ml-1 text-rose-600">(필수)</span> : null}
        </FieldLabel>
        <select
          id="discountReasonPreset"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          value={preset}
          required={preview.discountAmountKRW > 0}
          onChange={(e) => {
            const v = e.target.value;
            setPreset(v);
            setReason(v === OTHER ? detail : v ? (detail ? `${v} · ${detail}` : v) : "");
          }}
        >
          <option value="">할인 없음 / 선택</option>
          {DISCOUNT_REASON_PRESETS.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
          <option value={OTHER}>기타(직접 입력)</option>
        </select>
        <Textarea
          id="discountReasonDetail"
          className="mt-2"
          rows={2}
          value={detail}
          required={preview.discountAmountKRW > 0 && preset === OTHER}
          onChange={(e) => {
            const d = e.target.value;
            setDetail(d);
            setReason(preset === OTHER ? d : preset ? (d ? `${preset} · ${d}` : preset) : d);
          }}
          placeholder="세부 내용 (예: 협약 문서번호, 행사명) — 감사로그에 함께 남습니다"
        />
        <input type="hidden" name="discountReason" value={reason.trim()} />
        <FieldHelp>할인을 적용하면 근거를 반드시 선택해야 저장됩니다. 변경 내역은 감사로그 시트에 기록됩니다.</FieldHelp>
      </div>
    </div>
  );
}
