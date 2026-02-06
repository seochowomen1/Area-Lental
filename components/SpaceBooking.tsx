"use client";

import { useEffect, useMemo, useState } from "react";
import LinkButton from "@/components/ui/LinkButton";
import Button from "@/components/ui/Button";
import Notice from "@/components/ui/Notice";
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
  // monthStart is the first day of the month
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startDow = first.getDay(); // 0(Sun)...6
  const start = new Date(year, month, 1 - startDow);
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    days.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }
  return { days, first, last };
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

  const monthLabel = useMemo(() => `${month.getFullYear()}.${pad2(month.getMonth() + 1)}`, [month]);
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

    return "해당 날짜에 표시할 시간이 없습니다.";
  }, [busy, slots.length, meta?.reasonMessage, selectedDate]);


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
          <div className="text-lg font-semibold">{monthLabel}</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-md border bg-white px-2 py-1 text-sm hover:bg-gray-50"
              onClick={() => setMonth((m) => addMonths(m, -1))}
            >
              ◀
            </button>
            <button
              type="button"
              className="rounded-md border bg-white px-2 py-1 text-sm hover:bg-gray-50"
              onClick={() => {
                const today = new Date();
                setMonth(new Date(today.getFullYear(), today.getMonth(), 1));
                onSelectDate(fmtYMD(nextValidDate(today)));
              }}
            >
              오늘
            </button>
            <button
              type="button"
              className="rounded-md border bg-white px-2 py-1 text-sm hover:bg-gray-50"
              onClick={() => setMonth((m) => addMonths(m, 1))}
            >
              ▶
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border bg-white">
          <div className="grid grid-cols-7 border-b bg-gray-50 text-center text-xs font-semibold text-gray-700">
            {[
              "SUN",
              "MON",
              "TUE",
              "WED",
              "THU",
              "FRI",
              "SAT",
            ].map((d) => (
              <div key={d} className="py-2">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {days.map((d) => {
              const ymd = fmtYMD(d);
              const isCurrentMonth = d.getMonth() === month.getMonth();
              const isSelected = ymd === selectedDate;

              const todayYmd = fmtYMD(new Date());
              const isPast = ymd < todayYmd;
              const isSunday = d.getDay() === 0;
              const isDisabled = !isCurrentMonth || isPast || isSunday;

              return (
                <button
                  key={ymd}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => onSelectDate(ymd)}
                  className={
                    "relative h-20 border-b border-r p-2 text-left text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--brand-primary))] " +
                    (isCurrentMonth ? "bg-white" : "bg-gray-50 text-gray-400") +
                    (isSelected ? " z-10 bg-orange-50 ring-2 ring-orange-400 ring-inset" : "") +
                    (isDisabled ? " cursor-not-allowed opacity-50" : "")
                  }
                >
                  <div className="font-medium">{d.getDate()}</div>
                  {/* 간단 표시(데이터는 우측 기준) */}
                  <div className="mt-2 flex items-center gap-1">
                    <span
                      className={
                        "inline-block h-2.5 w-2.5 rounded-full " +
                        (isSunday
                          ? "bg-gray-300"
                          : isPast
                            ? "bg-gray-400"
                            : "bg-orange-500")
                      }
                      title={isSunday ? "휴관" : isPast ? "마감" : "선택 가능"}
                      aria-label={isSunday ? "휴관" : isPast ? "마감" : "선택 가능"}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-600">
          <div className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-orange-500" aria-hidden />
            <span>선택 가능</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-gray-400" aria-hidden />
            <span>마감</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-gray-300" aria-hidden />
            <span>휴관</span>
          </div>
        </div>

        <p className="mt-3 text-xs text-gray-600">
          ※ 시간은 <b>30분 단위</b>로 선택할 수 있습니다.
          <br />
          ※ 일요일은 휴관으로 대관이 불가하며, 지난 날짜는 선택할 수 없습니다.
        </p>

      </div>

      <aside className={`${CARD_BASE} p-5`}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold">{selectedLabel}</div>
            {isTueNight && (
              <span className="inline-flex items-center rounded-full border bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-700">
                화요일 야간 운영시간입니다
              </span>
            )}
          </div>
          {busy && <div className="text-xs text-gray-500">불러오는 중…</div>}
        </div>

        <Notice variant="accent" title={`운영시간 안내 (${operatingSummary.label})`}>
          <div className="text-sm font-semibold text-slate-900">{operatingSummary.text}</div>
          <div className="mt-1 text-xs text-slate-600">
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

        {!busy && !noSlotsMessage && (
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

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
              * 최소 <b>1시간</b>, 최대 <b>{durationLimitHours}시간</b>까지 선택할 수 있습니다. (30분 단위)
            </div>

            {durationMinutes > 0 ? (
              <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-blue-50/80 via-white to-white shadow-sm">
                <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5">
                  <span className="text-base">💰</span>
                  <span className="text-sm font-bold text-slate-800">예상 대관 이용료</span>
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
                    <div className="mt-3 flex items-center justify-between rounded-xl bg-[rgb(var(--brand-primary)/0.06)] px-4 py-3">
                      <span className="text-sm font-bold text-slate-900">합계</span>
                      <span className="text-lg font-extrabold text-[rgb(var(--brand-primary))]">{estimatedFeeKRW.toLocaleString()}원</span>
                    </div>
                    <p className="mt-2 text-[11px] text-slate-400">※ 기자재 사용료 별도</p>
                  </div>
                ) : (
                  <div className="px-4 py-3">
                    <p className="text-sm text-slate-700">
                      선택하신 이용시간 기준 <b>대관 이용료는 별도 협의</b> 대상입니다.
                    </p>
                    <p className="mt-2 text-[11px] text-slate-400">※ 기자재 사용료 별도</p>
                  </div>
                )}
              </div>
            ) : null}

            {canApply ? (
              <LinkButton
                href={`/apply?roomId=${encodeURIComponent(roomId)}&date=${encodeURIComponent(selectedDate)}&start=${encodeURIComponent(startSel)}&end=${encodeURIComponent(endSel)}`}
                variant="primary"
                className="w-full py-3"
              >
                신청서 작성하기
              </LinkButton>
            ) : (
              <Button type="button" variant="outline" disabled className="w-full py-3">신청서 작성하기</Button>
            )}
          </div>
        )}
      </aside>
    </section>
    </>
  );
}
