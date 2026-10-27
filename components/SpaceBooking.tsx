"use client";

import { useEffect, useMemo, useState } from "react";
import LinkButton from "@/components/ui/LinkButton";
import Button from "@/components/ui/Button";
import Notice from "@/components/ui/Notice";
import { cn } from "@/lib/cn";
import { isTuesdayNightOverlap, operatingRangesForDate } from "@/lib/operating";
import { getRoom } from "@/lib/space";
import { CARD_BASE, FIELD_CONTROL_BASE, FIELD_HELP, FIELD_LABEL } from "@/components/ui/presets";

type Slot = { start: string; end: string; available: boolean };

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function fmtYMD(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

const DOW_NAMES = ["일", "월", "화", "수", "목", "금", "토"];
function dateAriaLabel(d: Date, extra?: string) {
  const label = `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${DOW_NAMES[d.getDay()]}요일`;
  return extra ? `${label}, ${extra}` : label;
}

function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map((v) => parseInt(v, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
  return h * 60 + m;
}

function fromMinutes(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

function addMinutes(time: string, delta: number) {
  const base = toMinutes(time);
  if (!Number.isFinite(base)) return "";
  return fromMinutes(base + delta);
}

function fmtDuration(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (m === 0) return `${h}시간`;
  if (h === 0) return `${m}분`;
  return `${h}시간 ${m}분`;
}

function addDays(d: Date, delta: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + delta);
}

function nextValidDate(from: Date) {
  // 규칙: 과거 날짜 불가, 일요일(0) 불가
  const today = new Date();
  const todayYmd = fmtYMD(today);
  for (let i = 0; i < 60; i++) {
    const cand = addDays(from, i);
    const candYmd = fmtYMD(cand);
    if (candYmd < todayYmd) continue;
    if (cand.getDay() === 0) continue;
    return cand;
  }
  return from;
}

function addMonths(d: Date, delta: number) {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1);
}

function getCalendarGrid(monthStart: Date) {
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const first = new Date(year, month, 1);
  const startDow = first.getDay(); // 0(Sun)...6
  const lastDay = new Date(year, month + 1, 0).getDate();

  const days: Date[] = [];

  // 이전 달 날짜로 첫 줄 채우기
  const prevMonthLast = new Date(year, month, 0).getDate();
  for (let i = startDow - 1; i >= 0; i--) {
    days.push(new Date(year, month - 1, prevMonthLast - i));
  }

  // 이번 달 날짜
  for (let d = 1; d <= lastDay; d++) {
    days.push(new Date(year, month, d));
  }

  // 다음 달 날짜로 마지막 줄 채우기
  let nextDay = 1;
  while (days.length % 7 !== 0) {
    days.push(new Date(year, month + 1, nextDay++));
  }

  return { days, first, last: new Date(year, month + 1, 0) };
}

export default function SpaceBooking({
  roomId,
  selectedDate,
  onSelectDate,
  slots,
  busy,
  meta,
  durationLimitHours,
}: {
  roomId: string;
  selectedDate: string;
  onSelectDate: (ymd: string) => void;
  slots: Slot[];
  busy: boolean;
  meta?: {
    reasonCode: string | null;
    reasonMessage: string | null;
    totalSlots: number;
    availableSlots: number;
  };
  durationLimitHours: number;
}) {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const { days } = useMemo(() => getCalendarGrid(month), [month]);
  const [bookedDates, setBookedDates] = useState<Set<string>>(new Set());
  const [holidayMap, setHolidayMap] = useState<Map<string, string>>(new Map());
  /** 서버 기준 오늘(KST · /api/booked-dates today) — 없으면 브라우저 날짜 */
  const [serverToday, setServerToday] = useState<string>("");

  // 월 변경 시 예약 마감 날짜 + 공휴일 조회
  useEffect(() => {
    const monthKey = `${month.getFullYear()}-${pad2(month.getMonth() + 1)}`;
    fetch(`/api/booked-dates?roomId=${encodeURIComponent(roomId)}&month=${monthKey}`)
      .then((r) => r.json())
      .then((data) => {
        if (typeof data.today === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.today)) setServerToday(data.today);
        if (data.ok && Array.isArray(data.bookedDates)) {
          setBookedDates(new Set(data.bookedDates));
        }
        if (Array.isArray(data.holidays)) {
          const m = new Map<string, string>();
          for (const h of data.holidays) m.set(h.date, h.name);
          setHolidayMap(m);
        } else {
          setHolidayMap(new Map());
        }
      })
      .catch(() => {});
  }, [month, roomId]);

  const monthLabel = useMemo(() => `${month.getFullYear()}.${pad2(month.getMonth() + 1)}`, [month]);
  const todayYmd = serverToday || fmtYMD(new Date());

  /**
   * 오늘 남은 시작 시각이 있는가(01_spec ②-2-1 "마감" 판정 · 3-2)
   * 운영시간 구간마다 "끝 - 60분(최소 이용시간)"이 아직 안 지났으면 남아 있다. 예약 여부는 bookedDates가 따로 판정.
   */
  const todayHasStartLeft = useMemo(() => {
    const ranges = operatingRangesForDate(todayYmd);
    if (!ranges.length) return false;
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    return ranges.some((r) => toMinutes(r.end) - 60 >= Math.ceil(nowMin / 30) * 30);
  }, [todayYmd]);

  /** 이번 달 공휴일 목록 — 휴대폰은 칸에 "공휴일"만, 이름은 달력 아래(02_ui §4-2) */
  const monthHolidayList = useMemo(() => {
    const key = `${month.getFullYear()}-${pad2(month.getMonth() + 1)}`;
    const DOW = ["일", "월", "화", "수", "목", "금", "토"];
    return Array.from(holidayMap.entries())
      .filter(([dt]) => dt.startsWith(key))
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([dt, name]) => {
        const [y, m, d] = dt.split("-").map((v) => parseInt(v, 10));
        return `${m}/${d}(${DOW[new Date(y, m - 1, d).getDay()]}) ${name}`;
      });
  }, [holidayMap, month]);
  const selectedLabel = selectedDate;

  const operatingSummary = useMemo(() => {
    const [y, m, d] = selectedDate.split("-").map((v) => parseInt(v, 10));
    const dt = new Date(y, m - 1, d);
    const dowLabel = ["일", "월", "화", "수", "목", "금", "토"][dt.getDay()] ?? "";
    const ranges = operatingRangesForDate(selectedDate);
    if (!ranges.length) {
      return {
        label: `${dowLabel}요일`,
        text: "휴관(운영시간 없음)",
      };
    }
    const text = ranges.map((r) => `${r.start}~${r.end}`).join(" / ");
    return {
      label: `${dowLabel}요일`,
      text,
    };
  }, [selectedDate]);

  const noSlotsMessage = useMemo(() => {
    if (busy) return null;
    if (slots.length > 0) return null;
    if (meta?.reasonMessage) return meta.reasonMessage;

    // fallback(클라이언트 기준): 과거/일요일/기타
    const todayYmd = fmtYMD(new Date());
    if (selectedDate < todayYmd) return "지난 날짜는 선택할 수 없습니다.";

    const [y, m, d] = selectedDate.split("-").map((v) => parseInt(v, 10));
    const dt = new Date(y, m - 1, d);
    if (dt.getDay() === 0) return "일요일은 휴관으로 대관이 불가합니다.";
    if (holidayMap.has(selectedDate)) return `공휴일(${holidayMap.get(selectedDate)})은 휴관으로 대관이 불가합니다.`;

    return "해당 날짜에 표시할 시간이 없습니다.";
  }, [busy, slots.length, meta?.reasonMessage, selectedDate, holidayMap]);


  const maxMinutes = Math.max(60, Math.min(durationLimitHours * 60, 24 * 60));

  const slotMap = useMemo(() => {
    const m = new Map<string, Slot>();
    for (const s of slots) m.set(s.start, s);
    return m;
  }, [slots]);

  const startOptions = useMemo(() => {
    if (busy) return [] as Array<{ value: string; disabled: boolean }>;
    if (!slots.length) return [] as Array<{ value: string; disabled: boolean }>;

    // 운영시간 내 모든 시작 후보를 노출하되,
    //  - 예약/차단/정규수업 등으로 불가한 시간은 비활성화(회색)
    //  - 최소 1시간(60분) 연속 가능해야 선택 가능
    //  - 오늘 날짜인 경우 이미 지난 시간은 비활성화
    const candidates = Array.from(new Set(slots.map((s) => s.start))).sort((a, b) => toMinutes(a) - toMinutes(b));

    const now = new Date();
    const todayYmd = fmtYMD(now);
    const isToday = selectedDate === todayYmd;
    const nowMinutes = isToday ? now.getHours() * 60 + now.getMinutes() : 0;

    return candidates.map((start) => {
      // 오늘인 경우 이미 지난 시간은 비활성화
      if (isToday && toMinutes(start) < nowMinutes) {
        return { value: start, disabled: true };
      }

      let total = 0;
      let curStart = start;
      for (let guard = 0; guard < 200; guard++) {
        const slot = slotMap.get(curStart);
        if (!slot || !slot.available) break;
        total += 30;
        curStart = slot.end;
        if (total >= maxMinutes) break;
      }
      const enabled = total >= 60;
      return { value: start, disabled: !enabled };
    });
  }, [busy, slots, slotMap, maxMinutes, selectedDate]);

  const [startSel, setStartSel] = useState<string>("");
  const [endSel, setEndSel] = useState<string>("");

  const isTueNight = useMemo(() => {
    return isTuesdayNightOverlap(selectedDate, startSel, endSel);
  }, [selectedDate, startSel, endSel]);

  // startSel 기준으로 선택 가능한 "종료시간" 리스트를 만든다.
  // - 최소 1시간(60분)
  // - 30분 단위
  // - 연속으로 available인 구간만 허용
  // - 최대 durationLimitHours(기본 6시간) 제한
  const endOptions = useMemo(() => {
    if (!startSel) return [] as string[];
    let total = 0;
    let curStart = startSel;
    for (let guard = 0; guard < 200; guard++) {
      const slot = slotMap.get(curStart);
      if (!slot || !slot.available) break;
      total += 30;
      curStart = slot.end;
      if (total >= maxMinutes) break;
    }

    const cap = Math.min(total, maxMinutes);
    const opts: string[] = [];
    for (let m = 60; m <= cap; m += 30) {
      opts.push(addMinutes(startSel, m));
    }
    return opts;
  }, [startSel, slotMap, maxMinutes]);

  useEffect(() => {
    if (!startOptions.length) {
      setStartSel("");
      setEndSel("");
      return;
    }
    const firstEnabled = startOptions.find((o) => !o.disabled)?.value ?? "";
    const isValid = startOptions.some((o) => o.value === startSel && !o.disabled);
    if (!startSel || !isValid) {
      setStartSel(firstEnabled);
    }
  }, [startOptions, startSel]);

  useEffect(() => {
    if (!endOptions.length) {
      setEndSel("");
      return;
    }
    // startSel이 바뀌면 기본 종료시간을 가장 짧은(=최소 1시간)으로 세팅
    if (!endSel || !endOptions.includes(endSel)) {
      setEndSel(endOptions[0]);
    }
  }, [endOptions, endSel]);

  const durationMinutes = useMemo(() => {
    if (!startSel || !endSel) return 0;
    const d = toMinutes(endSel) - toMinutes(startSel);
    return Number.isFinite(d) ? d : 0;
  }, [startSel, endSel]);

  const roomMeta = useMemo(() => getRoom(roomId), [roomId]);
  const hourlyFee = roomMeta?.feeKRW ?? 0;
  const estimatedFeeKRW = useMemo(() => {
    if (!hourlyFee || !durationMinutes) return 0;
    // 30분 단위이므로 (feeKRW * minutes / 60)은 사실상 정수로 떨어짐
    return Math.round((hourlyFee * durationMinutes) / 60);
  }, [hourlyFee, durationMinutes]);

  // 선택 가능한 시간이 하나도 없으면 마감 처리
  const allSlotsDisabled = useMemo(() => {
    if (busy || !slots.length) return false;
    return startOptions.length > 0 && startOptions.every((o) => o.disabled);
  }, [busy, slots.length, startOptions]);

  const canApply = Boolean(startSel && endSel && endOptions.length && durationMinutes >= 60);

  return (
    <>
      {/*
        레이아웃 개선
        - 기존: 캘린더 고정폭(520px) + 우측 1fr → 우측 패널이 과도하게 좁아질 수 있음
        - 변경: 캘린더 1fr + 우측 패널 고정폭(340px)
      */}
      {/*
        반응형 최적안
        - 충분히 넓은 화면(2xl 이상)에서만 달력+시간 패널을 2열로 배치
        - 그 외(대부분 해상도)에는 시간 패널을 아래로 내려 달력 가로폭을 확보
          → 날짜 셀의 '휴관/마감/선택' 라벨이 밀리거나 줄바꿈되는 현상 방지
      */}
      {/*
        NOTE
        - SpaceDetail 페이지는 전체 컨테이너(max-w-6xl) 안에서 좌측 요약 패널 + 우측 상세 영역으로
          이미 2열 레이아웃을 사용하고 있어, 여기서 다시 2열(달력+시간패널)을 만들면 달력 폭이 줄어
          날짜 셀 라벨(휴관/마감/선택)이 밀리는 현상이 쉽게 발생합니다.
        - 따라서 SpaceBooking 내부는 항상 "세로 스택(달력 → 시간패널)" 구조로 유지해
          달력 가로폭을 최대로 확보합니다.
      */}
      <section id="availability" className="grid grid-cols-1 gap-6">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xl font-bold tabular-nums text-ink">{monthLabel}</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex h-11 min-w-[44px] items-center justify-center whitespace-nowrap rounded-xl border border-slate-300 bg-white px-3 text-[15px] font-semibold text-ink hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky"
              onClick={() => setMonth((m) => addMonths(m, -1))}
              aria-label="이전 달"
            >
              ◀
            </button>
            <button
              type="button"
              className="inline-flex h-11 min-w-[44px] items-center justify-center whitespace-nowrap rounded-xl border border-slate-300 bg-white px-3 text-[15px] font-semibold text-ink hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky"
              onClick={() => {
                const today = new Date();
                setMonth(new Date(today.getFullYear(), today.getMonth(), 1));
                onSelectDate(fmtYMD(nextValidDate(today)));
              }}
              aria-label="오늘로 이동"
            >
              오늘
            </button>
            <button
              type="button"
              className="inline-flex h-11 min-w-[44px] items-center justify-center whitespace-nowrap rounded-xl border border-slate-300 bg-white px-3 text-[15px] font-semibold text-ink hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky"
              onClick={() => setMonth((m) => addMonths(m, 1))}
              aria-label="다음 달"
            >
              ▶
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-line bg-white">
          <div className="grid grid-cols-7 border-b border-line bg-slate-50 text-center text-sm font-semibold text-ink-2">
            {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
              <div key={d} className={cn("py-2", d === "일" && "text-rose-700")}>
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {days.map((d) => {
              const ymd = fmtYMD(d);
              const isCurrentMonth = d.getMonth() === month.getMonth();
              if (!isCurrentMonth) {
                // 다른 달: 빈 칸(01_spec ②-2-1)
                return <div key={ymd} className="h-[60px] border-b border-r border-line bg-white sm:h-[76px]" aria-hidden="true" />;
              }
              const isSelected = ymd === selectedDate;
              const isToday = ymd === todayYmd;
              const isPast = ymd < todayYmd;
              const isSunday = d.getDay() === 0;
              const isBooked = bookedDates.has(ymd);
              const isHoliday = holidayMap.has(ymd);
              const holidayName = holidayMap.get(ymd);
              const todayClosed = isToday && !todayHasStartLeft;

              // 칸 상태(위가 우선 · 02_ui §4-1: 지난 날짜가 휴관·공휴일보다 우선)
              const view: "past" | "closed" | "holiday" | "booked" | "selected" | "available" =
                isPast ? "past"
                : isSunday ? "closed"
                : isHoliday ? "holiday"
                : (isBooked || todayClosed) ? "booked"
                : isSelected ? "selected"
                : "available";
              const isDisabled = view !== "available" && view !== "selected";

              const statusHint =
                view === "past" ? "지난 날짜"
                : view === "closed" ? "휴관"
                : view === "holiday" ? (holidayName ?? "공휴일")
                : view === "booked" ? "마감"
                : view === "selected" ? "선택"
                : "선택 가능";

              return (
                <button
                  key={ymd}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => onSelectDate(ymd)}
                  aria-label={dateAriaLabel(d, statusHint)}
                  aria-current={isToday ? "date" : undefined}
                  aria-pressed={isSelected || undefined}
                  className={cn(
                    "relative flex h-[60px] flex-col items-center justify-start gap-0.5 border-b border-r border-line pt-2 transition sm:h-[76px] sm:pt-2.5",
                    "focus:outline-none focus-visible:z-20 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky",
                    isDisabled && "cursor-default",
                    view === "past" && "bg-white",
                    (view === "closed" || view === "holiday") && "bg-rose-50",
                    view === "booked" && "bg-slate-100",
                    view === "selected" && "z-10 bg-brand-soft shadow-[inset_0_0_0_2px_rgb(var(--brand-primary))]",
                    view === "available" && "bg-white hover:bg-slate-50",
                  )}
                >
                  <span className={cn(
                    "text-base tabular-nums leading-5",
                    view === "past" && "font-medium text-slate-300",
                    (view === "closed" || view === "holiday") && "font-semibold text-rose-700",
                    view === "booked" && "font-medium text-slate-500",
                    view === "selected" && "font-bold text-brand",
                    view === "available" && "font-bold text-ink",
                    isToday && "underline decoration-accent decoration-2 underline-offset-4",
                  )}>{d.getDate()}</span>
                  {view === "available" && <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />}
                  {view === "closed" && <span className="text-xs leading-[18px] text-rose-700">휴관</span>}
                  {view === "holiday" && (
                    <>
                      <span className="text-xs leading-[18px] text-rose-700 sm:hidden">공휴일</span>
                      <span className="hidden max-w-full break-keep px-0.5 text-center text-xs leading-[14px] text-rose-700 sm:block">{holidayName}</span>
                    </>
                  )}
                  {view === "booked" && <span className="text-xs leading-[18px] text-slate-600">마감</span>}
                  {view === "selected" && <span className="text-xs font-bold leading-[18px] text-brand">선택</span>}
                </button>
              );
            })}
          </div>
        </div>

        {monthHolidayList.length > 0 && (
          <p className="mt-2 text-[13px] text-rose-700 sm:hidden">이번 달 공휴일: {monthHolidayList.join(" · ")}</p>
        )}

        {/* 범례 — 셀과 같은 표기(③-C) */}
        <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-2" aria-label="달력 범례">
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
            <span>선택 가능</span>
          </li>
          <li className="flex items-center gap-1.5">
            <span className="inline-flex h-5 items-center rounded-sm bg-slate-100 px-1 text-slate-600" aria-hidden>마감</span>
            <span>= 예약 완료</span>
          </li>
          <li className="flex items-center gap-1.5">
            <span className="inline-flex h-5 items-center rounded-sm bg-rose-50 px-1 text-rose-700" aria-hidden>휴관</span>
            <span>= 일요일·공휴일</span>
          </li>
          <li className="flex items-center gap-1.5">
            <span className="inline-flex h-5 items-center rounded-sm border border-line bg-white px-1 font-medium text-slate-300" aria-hidden>12</span>
            <span>흐린 숫자 = 지난 날짜</span>
          </li>
        </ul>

        <p className="mt-2 text-[13px] text-ink-3">
          ※ 시간은 30분 단위로 선택합니다 · 일요일·공휴일 휴관 · 지난 날짜는 선택할 수 없습니다
        </p>

      </div>

      <aside className={`${CARD_BASE} p-5`}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="text-base font-semibold tabular-nums">{selectedLabel}</div>
            {isTueNight && (
              <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
                화요일 야간 운영시간입니다
              </span>
            )}
          </div>
          {busy && <div className="text-[13px] text-slate-500">불러오는 중…</div>}
        </div>

        <Notice variant="accent" title={`운영시간 안내 (${operatingSummary.label})`}>
          <div className="text-sm font-semibold text-slate-900">{operatingSummary.text}</div>
          <div className="mt-1 text-[13px] text-slate-600">
            ※ 운영시간 외 시간은 선택할 수 없습니다. (30분 단위)
          </div>
        </Notice>

        {!busy && !!noSlotsMessage && (
          <div className="mt-3">
            <Notice variant="info" title="예약 안내">
              <div className="text-sm text-slate-700">{noSlotsMessage}</div>
            </Notice>
          </div>
        )}

        {!busy && !noSlotsMessage && allSlotsDisabled && (
          <div className="mt-3">
            <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
              <p className="text-base font-bold">
                {selectedDate === todayYmd ? "오늘은 신청 가능한 시간이 지났습니다" : "이 날은 모든 시간이 예약되었습니다"}
              </p>
              <p className="mt-1 text-sm">다른 날짜를 선택해 주세요.</p>
            </div>
          </div>
        )}

        {!busy && !noSlotsMessage && !allSlotsDisabled && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={FIELD_LABEL}>시작 시간</label>
                <select
                  value={startSel}
                  onChange={(e) => setStartSel(e.target.value)}
                  className={`${FIELD_CONTROL_BASE} mt-1`}
                >
                  {startOptions.map((o) => (
                    <option key={o.value} value={o.value} disabled={o.disabled}>
                      {o.value}
                    </option>
                  ))}
                </select>
                <div className={`${FIELD_HELP} mt-1`}>회색으로 표시된 시간은 선택이 불가합니다.</div>
              </div>

              <div>
                <label className={FIELD_LABEL}>종료 시간</label>
                <select
                  value={endSel}
                  onChange={(e) => setEndSel(e.target.value)}
                  className={`${FIELD_CONTROL_BASE} mt-1`}
                >
                  {endOptions.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <div className={`${FIELD_HELP} mt-1`}>
                  {startSel && endSel ? (
                    <>
                      이용시간 <b>{fmtDuration(durationMinutes)}</b>
                    </>
                  ) : (
                    "시작 시간을 선택하세요"
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[13px] text-slate-700">
              * 최소 <b>1시간</b>, 최대 <b>{durationLimitHours}시간</b>까지 선택할 수 있습니다. (30분 단위)
            </div>

            {durationMinutes > 0 ? (
              <div className="mt-3 overflow-hidden rounded-xl border border-line bg-white">
                <div className="border-b border-line bg-slate-50 px-4 py-2.5">
                  <span className="text-[15px] font-bold text-ink">예상 대관료</span>
                </div>
                {hourlyFee > 0 ? (
                  <div className="px-4 py-3">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm text-slate-600">
                        <span>이용시간</span>
                        <span className="font-semibold text-slate-800">{fmtDuration(durationMinutes)}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm text-slate-600">
                        <span>시간당 요금</span>
                        <span className="font-semibold text-slate-800">{hourlyFee.toLocaleString()}원</span>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between rounded-lg bg-brand-soft px-4 py-3">
                      <span className="text-[15px] font-bold text-ink">합계</span>
                      <span className="text-2xl font-bold tabular-nums text-brand">{estimatedFeeKRW.toLocaleString()}원</span>
                    </div>
                    <p className="mt-2 text-[13px] text-ink-3">※ 기자재 사용료 별도</p>
                  </div>
                ) : (
                  <div className="px-4 py-3">
                    <p className="text-sm text-slate-700">
                      선택하신 이용시간 기준 <b>대관료는 별도 협의</b> 대상입니다.
                    </p>
                    <p className="mt-2 text-[13px] text-ink-3">※ 기자재 사용료 별도</p>
                  </div>
                )}
              </div>
            ) : null}

            {canApply ? (
              <LinkButton
                href={`/apply?roomId=${encodeURIComponent(roomId)}&date=${encodeURIComponent(selectedDate)}&start=${encodeURIComponent(startSel)}&end=${encodeURIComponent(endSel)}`}
                variant="primary"
                className="min-h-[48px] w-full py-3 text-base"
              >
                신청서 작성하기
              </LinkButton>
            ) : (
              <Button type="button" variant="primary" disabled className="min-h-[48px] w-full py-3 text-base">신청서 작성하기</Button>
            )}
          </div>
        )}
      </aside>
    </section>
    </>
  );
}
