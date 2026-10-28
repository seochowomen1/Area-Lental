"use client";

/**
 * 예약 현황(마감 날짜·공휴일) 조회 훅 — 2단계 달력·신청서 공용 (01_spec ⑤ 3-4 · P-3)
 * - GET /api/booked-dates?roomId=…&month=YYYY-MM
 * - AbortController로 이전 달 요청을 끊는다. 달을 바꾸면 바로 data=null(앞 달 마감 표시가 남지 않음).
 * - 상태: loading · error · ok
 */
import { useCallback, useEffect, useMemo, useState } from "react";

export type BookedMonthData = {
  month: string;
  bookedDates: ReadonlySet<string>;
  exhibitionEndDates: ReadonlySet<string>;
  prepOnlyDates: ReadonlySet<string>;
  holidays: ReadonlyMap<string, string>;
  /** 서버 기준 오늘(KST) */
  today: string;
  availableDayCount: number | null;
};

export type BookedStatus = "loading" | "error" | "ok";

async function fetchMonth(roomId: string, month: string, signal?: AbortSignal): Promise<BookedMonthData> {
  const res = await fetch(`/api/booked-dates?roomId=${encodeURIComponent(roomId)}&month=${encodeURIComponent(month)}`, {
    cache: "no-store",
    signal,
  });
  const data = await res.json();
  if (!res.ok || !data?.ok) throw new Error("booked-dates 실패");
  const holidays = new Map<string, string>();
  for (const h of Array.isArray(data.holidays) ? data.holidays : []) if (h?.date) holidays.set(h.date, h.name ?? "공휴일");
  return {
    month,
    bookedDates: new Set<string>(Array.isArray(data.bookedDates) ? data.bookedDates : []),
    exhibitionEndDates: new Set<string>(Array.isArray(data.exhibitionEndDates) ? data.exhibitionEndDates : []),
    prepOnlyDates: new Set<string>(Array.isArray(data.prepOnlyDates) ? data.prepOnlyDates : []),
    holidays,
    today: typeof data.today === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.today) ? data.today : "",
    availableDayCount: typeof data.availableDayCount === "number" ? data.availableDayCount : null,
  };
}

/** 한 달 */
export function useBookedDates(roomId: string, month: string) {
  const [state, setState] = useState<{ status: BookedStatus; data: BookedMonthData | null }>({ status: "loading", data: null });
  const [seq, setSeq] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setState({ status: "loading", data: null });
    fetchMonth(roomId, month, ctrl.signal)
      .then((data) => {
        if (!ctrl.signal.aborted) setState({ status: "ok", data });
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setState({ status: "error", data: null });
      });
    return () => ctrl.abort();
  }, [roomId, month, seq]);

  const reload = useCallback(() => setSeq((s) => s + 1), []);
  return { ...state, reload };
}

/** 여러 달(신청서의 공휴일 확인용) — 합친 공휴일·마감 */
export function useBookedMonths(roomId: string, months: readonly string[]) {
  const key = months.join(",");
  const [state, setState] = useState<{ status: BookedStatus | "idle"; list: BookedMonthData[] }>({ status: months.length ? "loading" : "idle", list: [] });

  useEffect(() => {
    const keys = key ? key.split(",") : [];
    if (!keys.length) {
      setState({ status: "idle", list: [] });
      return;
    }
    const ctrl = new AbortController();
    setState((s) => ({ status: "loading", list: s.list }));
    Promise.all(keys.map((m) => fetchMonth(roomId, m, ctrl.signal)))
      .then((list) => {
        if (!ctrl.signal.aborted) setState({ status: "ok", list });
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setState({ status: "error", list: [] });
      });
    return () => ctrl.abort();
  }, [roomId, key]);

  return useMemo(() => {
    const holidayNames = new Map<string, string>();
    const booked = new Set<string>();
    let today = "";
    for (const d of state.list) {
      for (const [k, v] of d.holidays) holidayNames.set(k, v);
      for (const b of d.bookedDates) booked.add(b);
      if (d.today) today = d.today;
    }
    return { status: state.status, holidayNames, holidaySet: new Set(holidayNames.keys()) as ReadonlySet<string>, booked, today };
  }, [state]);
}
