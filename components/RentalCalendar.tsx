"use client";

import { useEffect, useMemo, useState } from "react";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function ymd(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function ym(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
function addMonths(d: Date, diff: number) {
  return new Date(d.getFullYear(), d.getMonth() + diff, 1);
}

type Props = {
  roomId: string;
  selectedDate: string | null;
  onSelectDate: (ymd: string) => void;
  /** 외부에서 강제로 달력을 잠그고 싶을 때 사용(예: 상세에서 선택한 슬롯을 고정) */
  disabled?: boolean;
};

export default function RentalCalendar({ roomId, selectedDate, onSelectDate, disabled = false }: Props) {
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(() => startOfMonth(today));
  const [unavailable, setUnavailable] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const monthLabel = useMemo(() => {
    return `${cursor.getFullYear()}.${cursor.getMonth() + 1}`;
  }, [cursor]);

  const days = useMemo(() => {
    const first = startOfMonth(cursor);
    const last = endOfMonth(cursor);

    // 일요일(0) 시작 기준으로 앞쪽 공백 채우기
    const startWeekday = first.getDay();
    const total = startWeekday + last.getDate();
    const cells = Math.ceil(total / 7) * 7;

    const arr: (Date | null)[] = [];
    for (let i = 0; i < cells; i++) {
      const dayNum = i - startWeekday + 1;
      if (dayNum < 1 || dayNum > last.getDate()) arr.push(null);
      else arr.push(new Date(cursor.getFullYear(), cursor.getMonth(), dayNum));
    }
    return arr;
  }, [cursor]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!roomId) return;
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(`/api/public/availability?roomId=${encodeURIComponent(roomId)}&ym=${encodeURIComponent(ym(cursor))}`, {
          cache: "no-store",
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.message ?? "가용일 정보를 불러오지 못했습니다.");
        if (cancelled) return;
        setUnavailable(new Set<string>(data.unavailable ?? []));
      } catch (e: any) {
        if (cancelled) return;
        setUnavailable(new Set());
        setErr(e?.message ?? "가용일 정보를 불러오는 중 오류가 발생했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [roomId, cursor]);

  const weekday = ["일", "월", "화", "수", "목", "금", "토"];

  return (
    <div className="rounded-2xl border bg-white p-4">
      {/* 상단: 월 이동 + 오늘 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-sm font-semibold">
            <button
              type="button"
              onClick={() => setCursor(addMonths(cursor, -1))}
              disabled={disabled}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border hover:bg-gray-50"
              aria-label="이전 달"
            >
              ‹
            </button>
            <span className="min-w-[80px] text-center">{monthLabel}</span>
            <button
              type="button"
              onClick={() => setCursor(addMonths(cursor, +1))}
              disabled={disabled}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border hover:bg-gray-50"
              aria-label="다음 달"
            >
              ›
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setCursor(startOfMonth(today))}
          disabled={disabled}
          className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          오늘
        </button>
      </div>

      {/* 범례 */}
      <div className="mt-2 flex items-center justify-between gap-3 text-xs text-gray-600">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded bg-white ring-1 ring-gray-300" />
            대관가능
          </div>
          <div className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded bg-rose-50 ring-1 ring-rose-200" />
            대관불가
          </div>
        </div>
        {loading && <div className="text-gray-500">불러오는 중…</div>}
      </div>

      {err && (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
          {err}
        </div>
      )}

      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs text-gray-500">
        {weekday.map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {days.map((d, idx) => {
          const key = d ? ymd(d) : `empty-${idx}`;
          const isSelected = !!d && selectedDate === ymd(d);
          const isUnavailable = !!d && unavailable.has(ymd(d));
          const isPast = !!d && ymd(d) < ymd(today);
          const isSunday = !!d && d.getDay() === 0;

          const cellDisabled = disabled || !d || isUnavailable || isPast || isSunday || loading;

          return (
            <button
              key={key}
              type="button"
              disabled={cellDisabled}
              onClick={() => d && onSelectDate(ymd(d))}
              className={[
                "relative h-14 rounded-lg border text-sm",
                !d ? "border-transparent bg-transparent" : "bg-white hover:bg-gray-50",
                isUnavailable ? "calendar-hatch border-rose-200 text-rose-700 hover:bg-transparent" : "",
                isSunday ? "bg-gray-50 text-gray-400 hover:bg-gray-50" : "",
                isPast ? "opacity-40" : "",
                isSelected ? "bg-sky-50 ring-2 ring-sky-500" : "",
                cellDisabled ? "cursor-not-allowed" : "",
              ].join(" ")}
            >
              {d ? (
                <>
                  <div className="pt-2 font-medium">{d.getDate()}</div>
                  {(isUnavailable || isSunday) && (
                    <div className="absolute bottom-1 left-1/2 -translate-x-1/2">
                      <span
                        className={
                          "inline-block h-2.5 w-2.5 rounded-full " +
                          (isUnavailable ? "bg-rose-500" : "bg-gray-300")
                        }
                        title={isUnavailable ? "대관불가" : "휴관"}
                        aria-label={isUnavailable ? "대관불가" : "휴관"}
                      />
                    </div>
                  )}
                </>
              ) : (
                ""
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-600">
        <div className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-rose-500" aria-hidden />
          <span>대관불가</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-gray-300" aria-hidden />
          <span>휴관</span>
        </div>
      </div>

      <p className="mt-3 text-xs text-gray-600">
        * 달력의 “대관불가”는 관리자 차단 또는 이미 신청/승인된 일정이 있는 날짜를 기준으로 표시됩니다. 상세 시간 충돌은 신청 시 자동 검증됩니다.
      </p>
    </div>
  );
}
