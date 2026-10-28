"use client";

/**
 * 서면 등록 — 갤러리 일정(편집 가능) : 전시 시작일·종료일 · 준비일 · 이용료 미리보기
 * 3-4 전 OfflineIntakeForm의 일정 부분을 그대로 옮김(관리자는 날짜 칸으로 직접 입력 · 준비일 `없음` 선택 가능).
 */
import { useEffect, useMemo, useState } from "react";
import { FieldHelp, FieldLabel, Input, Select } from "@/components/ui/Field";
import { GALLERY_FEE_KRW, GALLERY_RULES } from "@/lib/constants";
import { addDays, dayOfWeek, dowLabel, isYmd } from "@/lib/rules/ymd";

export type OfflineGallerySchedule = { startDate: string; endDate: string; prepDate: string; prepAfter: boolean };
type MonthInfo = { booked: Set<string>; ends: Set<string>; holidays: Map<string, string> };

export function prepAfterStart(ymd: string) {
  return dayOfWeek(ymd) === 6 ? GALLERY_RULES.PREP_AFTER.SATURDAY : GALLERY_RULES.PREP_AFTER.WEEKDAY;
}

export default function OfflineGallerySchedulePart({ onChange }: { onChange: (s: OfflineGallerySchedule) => void }) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [galleryPrepDate, setGalleryPrepDate] = useState("");
  const [prepTouched, setPrepTouched] = useState(false);

  // 월별 예약 현황(공휴일·마감·철거일) — 준비일 전월부터 종료월까지
  const [monthInfo, setMonthInfo] = useState<Map<string, MonthInfo>>(new Map());
  const monthsNeeded = useMemo(() => {
    if (!isYmd(startDate)) return [] as string[];
    const set = new Set<string>();
    set.add(addDays(startDate, -14).slice(0, 7));
    set.add(startDate.slice(0, 7));
    if (isYmd(endDate)) set.add(endDate.slice(0, 7));
    return Array.from(set);
  }, [startDate, endDate]);
  useEffect(() => {
    let alive = true;
    const missing = monthsNeeded.filter((m) => !monthInfo.has(m));
    if (!missing.length) return;
    Promise.all(
      missing.map((m) =>
        fetch(`/api/booked-dates?roomId=gallery&month=${m}`)
          .then((r) => r.json())
          .then((data) => {
            const info: MonthInfo = { booked: new Set(), ends: new Set(), holidays: new Map() };
            if (data?.ok) {
              for (const d of data.bookedDates ?? []) info.booked.add(d);
              for (const d of data.exhibitionEndDates ?? []) info.ends.add(d);
              for (const h of data.holidays ?? []) info.holidays.set(h.date, h.name);
            }
            return [m, info] as const;
          })
          .catch(() => [m, { booked: new Set<string>(), ends: new Set<string>(), holidays: new Map<string, string>() }] as const)
      )
    ).then((entries) => {
      if (!alive) return;
      setMonthInfo((prev) => {
        const next = new Map(prev);
        for (const [m, info] of entries) next.set(m, info);
        return next;
      });
    });
    return () => {
      alive = false;
    };
  }, [monthsNeeded, monthInfo]);

  const merged = useMemo(() => {
    const booked = new Set<string>();
    const ends = new Set<string>();
    const holidays = new Map<string, string>();
    for (const info of monthInfo.values()) {
      for (const d of info.booked) booked.add(d);
      for (const d of info.ends) ends.add(d);
      for (const [d, n] of info.holidays) holidays.set(d, n);
    }
    return { booked, ends, holidays };
  }, [monthInfo]);

  // 전시일수·이용료 (일요일·공휴일 제외 · 평일 20,000 · 토 10,000 · 준비일 무료)
  const fee = useMemo(() => {
    if (!isYmd(startDate) || !isYmd(endDate) || endDate < startDate) return { weekdays: 0, saturdays: 0, total: 0, conflicts: [] as string[] };
    let weekdays = 0,
      saturdays = 0;
    const conflicts: string[] = [];
    let cur = startDate,
      guard = 0;
    while (cur <= endDate && guard++ < 400) {
      const d = dayOfWeek(cur);
      if (d !== 0 && !merged.holidays.has(cur)) {
        if (d === 6) saturdays++;
        else weekdays++;
        if (merged.booked.has(cur)) conflicts.push(cur);
      }
      cur = addDays(cur, 1);
    }
    return { weekdays, saturdays, total: weekdays * GALLERY_FEE_KRW.WEEKDAY + saturdays * GALLERY_FEE_KRW.SATURDAY, conflicts };
  }, [startDate, endDate, merged]);

  // 준비일 후보: 시작 직전 운영일부터 7개 — 마감일(전시 중간)을 만나면 그 이전은 제외, 철거일은 "17:00 이후"로 허용
  const prepCandidates = useMemo(() => {
    if (!isYmd(startDate)) return [] as { date: string; after: boolean }[];
    const out: { date: string; after: boolean }[] = [];
    let cur = addDays(startDate, -1),
      guard = 0;
    while (out.length < 7 && guard++ < 30) {
      if (dayOfWeek(cur) !== 0 && !merged.holidays.has(cur)) {
        if (merged.booked.has(cur)) {
          if (merged.ends.has(cur)) {
            out.push({ date: cur, after: true });
            cur = addDays(cur, -1);
            continue;
          }
          break;
        }
        out.push({ date: cur, after: false });
      }
      cur = addDays(cur, -1);
    }
    return out;
  }, [startDate, merged]);
  useEffect(() => {
    if (prepTouched && (galleryPrepDate === "" || prepCandidates.some((c) => c.date === galleryPrepDate))) return;
    setGalleryPrepDate(prepCandidates[0]?.date ?? "");
  }, [prepCandidates, galleryPrepDate, prepTouched]);
  const prepAfter = prepCandidates.find((c) => c.date === galleryPrepDate)?.after ?? false;

  useEffect(() => {
    onChange({ startDate, endDate, prepDate: galleryPrepDate, prepAfter });
  }, [startDate, endDate, galleryPrepDate, prepAfter, onChange]);

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div>
          <FieldLabel htmlFor="startDate">전시 시작일 *</FieldLabel>
          <Input
            id="startDate"
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setPrepTouched(false);
            }}
          />
        </div>
        <div>
          <FieldLabel htmlFor="endDate">전시 종료일 *</FieldLabel>
          <Input id="endDate" type="date" min={startDate || undefined} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          <FieldHelp>일요일·공휴일은 자동 제외 · 최대 30일</FieldHelp>
        </div>
        <div>
          <FieldLabel htmlFor="galleryPrepDate">준비(세팅)일 — 무료</FieldLabel>
          <Select
            id="galleryPrepDate"
            value={galleryPrepDate}
            onChange={(e) => {
              setGalleryPrepDate(e.target.value);
              setPrepTouched(true);
            }}
            disabled={!isYmd(startDate)}
          >
            {prepCandidates.map((c) => (
              <option key={c.date} value={c.date}>
                {c.date} ({dowLabel(c.date)}){c.after ? ` · 앞 전시 철거 후 ${prepAfterStart(c.date)} 이후` : ""}
              </option>
            ))}
            <option value="">준비일 없음</option>
          </Select>
          {prepAfter ? <FieldHelp>앞 전시가 있는 날이라 철거 후 {prepAfterStart(galleryPrepDate)}부터 세팅 가능합니다.</FieldHelp> : null}
        </div>
      </div>
      {isYmd(startDate) && isYmd(endDate) && endDate >= startDate && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-slate-700">
            <span>
              평일 {fee.weekdays}일 × {GALLERY_FEE_KRW.WEEKDAY.toLocaleString()}원
            </span>
            <span>
              토요일 {fee.saturdays}일 × {GALLERY_FEE_KRW.SATURDAY.toLocaleString()}원
            </span>
            <span className="font-bold text-slate-900">예상 이용료 {fee.total.toLocaleString()}원</span>
            <span className="text-xs text-slate-500">(서버에서 다시 계산해 저장)</span>
          </div>
          {fee.conflicts.length > 0 && (
            <p className="mt-2 text-xs font-semibold text-red-600">
              이미 마감된 날짜가 기간에 포함돼 있습니다: {fee.conflicts.join(", ")} — 등록 시 일정 충돌로 거부됩니다.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
