"use client";

/**
 * 갤러리 월별 공휴일·예약 현황 조회 훅 — 클라이언트 전용 (audit-fix-1 [3])
 * - GET /api/booked-dates?roomId=gallery&month=YYYY-MM 를 달마다 1번 부르고 합친다.
 * - 공휴일 집합(holidaySet)은 lib/galleryPlan.ts planGallery()·availablePrepDates()에 그대로 넘긴다.
 * - 상태: idle(조회할 달 없음) · loading · ok · error(한 달이라도 실패)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { addDaysYmd } from "@/lib/galleryPlan";
import { dayOfWeek } from "@/lib/datetime";

export type GalleryMonthStatus = "idle" | "loading" | "ok" | "error";

/** 서버 공휴일 상태(/api/booked-dates holidayStatus · 03_api 1-1) — 화면은 unavailable일 때만 F-1 */
export type PublicHolidayStatus = "ok" | "stale" | "fallback" | "unavailable";
const HOLIDAY_STATUS_RANK: Record<PublicHolidayStatus, number> = { ok: 0, stale: 1, fallback: 2, unavailable: 3 };
export function parseHolidayStatus(v: unknown): PublicHolidayStatus {
  return v === "stale" || v === "fallback" || v === "unavailable" ? v : "ok";
}
/** 여러 달 중 가장 나쁜 상태 */
export function worstPublicHolidayStatus(list: PublicHolidayStatus[]): PublicHolidayStatus {
  return list.reduce<PublicHolidayStatus>((w, s) => (HOLIDAY_STATUS_RANK[s] > HOLIDAY_STATUS_RANK[w] ? s : w), "ok");
}

const DOW = ["일", "월", "화", "수", "목", "금", "토"] as const;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** 준비일 후보 첫날(시작일 10일 전)이 속한 달 ~ 종료일(없으면 시작일)이 속한 달 */
export function galleryMonthsForRange(startDate: string, endDate: string): string[] {
  if (!YMD.test(startDate ?? "")) return [];
  const from = addDaysYmd(startDate, -10).slice(0, 7);
  const last = (YMD.test(endDate ?? "") && endDate >= startDate ? endDate : startDate).slice(0, 7);
  const out: string[] = [];
  let [y, m] = from.split("-").map((v) => parseInt(v, 10));
  let guard = 0;
  while (guard++ < 4) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    out.push(key);
    if (key >= last) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/** 01_spec ③-F: `선택한 기간의 일요일·공휴일은 휴관이라 빠집니다: {MM/DD(요일) 공휴일명}, …` (공휴일이 없으면 "") */
export function formatExcludedHolidays(dates: string[], names: ReadonlyMap<string, string>): string {
  if (!dates.length) return "";
  const parts = dates.map((d) => {
    const [, mm, dd] = d.split("-");
    const name = names.get(d) ?? "공휴일";
    return `${mm}/${dd}(${DOW[dayOfWeek(d)] ?? ""}) ${name}`;
  });
  return `선택한 기간의 일요일·공휴일은 휴관이라 빠집니다: ${parts.join(", ")}`;
}

type MonthPayload = { holidays: Array<{ date: string; name: string }>; booked: string[]; ends: string[]; prepOnly: string[]; holidayStatus: PublicHolidayStatus };

export function useGalleryMonthData(monthKeys: string[]) {
  const keyStr = monthKeys.join(",");
  const [status, setStatus] = useState<GalleryMonthStatus>(monthKeys.length ? "loading" : "idle");
  const [payloads, setPayloads] = useState<MonthPayload[]>([]);
  const [seq, setSeq] = useState(0);

  useEffect(() => {
    const keys = keyStr ? keyStr.split(",") : [];
    if (!keys.length) {
      setStatus("idle");
      setPayloads([]);
      return;
    }
    let cancelled = false;
    setStatus("loading");
    Promise.all(
      keys.map((m) =>
        fetch(`/api/booked-dates?roomId=gallery&month=${m}`, { cache: "no-store" })
          .then((r) => r.json())
          .then((data): MonthPayload => {
            if (!data?.ok) throw new Error("booked-dates 실패");
            return {
              holidays: Array.isArray(data.holidays) ? data.holidays : [],
              booked: Array.isArray(data.bookedDates) ? data.bookedDates : [],
              ends: Array.isArray(data.exhibitionEndDates) ? data.exhibitionEndDates : [],
              prepOnly: Array.isArray(data.prepOnlyDates) ? data.prepOnlyDates : [],
              holidayStatus: parseHolidayStatus(data.holidayStatus),
            };
          })
      )
    )
      .then((list) => {
        if (cancelled) return;
        setPayloads(list);
        setStatus("ok");
      })
      .catch(() => {
        if (cancelled) return;
        setPayloads([]);
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [keyStr, seq]);

  const reload = useCallback(() => setSeq((s) => s + 1), []);

  const merged = useMemo(() => {
    const holidayNames = new Map<string, string>();
    const booked = new Set<string>();
    const exhibitionEnds = new Set<string>();
    const prepOnly = new Set<string>();
    for (const p of payloads) {
      for (const h of p.holidays) if (h?.date) holidayNames.set(h.date, h.name ?? "공휴일");
      for (const d of p.booked) booked.add(d);
      for (const d of p.ends) exhibitionEnds.add(d);
      for (const d of p.prepOnly) prepOnly.add(d);
    }
    const holidayStatus = worstPublicHolidayStatus(payloads.map((p) => p.holidayStatus));
    return { holidayNames, holidaySet: new Set(holidayNames.keys()) as ReadonlySet<string>, booked, exhibitionEnds, prepOnly, holidayStatus };
  }, [payloads]);

  return { status, reload, ...merged };
}
