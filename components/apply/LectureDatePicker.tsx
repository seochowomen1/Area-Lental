"use client";

/**
 * 2단계 강의실·E-스튜디오 날짜 고르기 — "언제?" (02_ui_apply §2-3 · §2-4 · §6-1)
 * - 기본 한 날짜: 다른 칸을 누르면 지금 날짜를 바꾼다. `＋ 다른 날짜도 같이 신청`을 누른 뒤 누른 날짜만 더한다(앞 줄 시간 복사).
 * - 시간: 시작·끝 select(52) · 시작을 고르면 끝은 +1시간 · 오늘 지난 시각은 비활성(P-11 · 1분마다 다시 계산)
 * - 회차 문제는 planLecture(nowHm 포함)의 issues를 줄 옆에 그대로
 * - 다음: `/apply?roomId=…&s=…` (서버로 가는 신청 형식과 무관한 화면 주소)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import type { SpaceRoom } from "@/lib/space";
import { REQUEST_LIMITS } from "@/lib/constants";
import { dayOfWeek, dowLabel, formatKoDate, kstNow } from "@/lib/rules/ymd";
import { lectureOperatingRanges, planLecture } from "@/lib/rules/lecturePlan";
import { useBookedDates } from "@/lib/client/useBookedDates";
import { endOptionsFor, isComplete, startOptionsFor, toMin, type Slot } from "@/lib/apply/times";
import {
  applyHrefForSessions,
  formatSessionLine,
  formatSessionsSummary,
  type ScheduleSession,
} from "@/lib/apply/schedule";
import MonthCalendar, { CalendarLegend, monthKeyOf, type CellSpec } from "@/components/apply/MonthCalendar";
import Step2Shell from "@/components/apply/Step2Shell";
import { A_BTN_PRIMARY, A_BTN_SECONDARY, A_BTN_SMALL, A_CARD, A_CARD_TITLE, A_ERROR_TEXT, A_HELP, A_INPUT } from "@/components/apply/ui";

type SlotState = { status: "idle" | "loading" | "ok" | "error"; date: string; slots: Slot[]; reason: string | null };

export const PICK_FIRST_TEXT = "먼저 달력에서 날짜와 시간을 골라 주세요.";
export const SCHEDULE_ERR_TEXT = "일정 정보가 올바르지 않아 날짜 고르기로 돌아왔습니다.";
const DUP_TEXT = "같은 날짜에 겹치는 시간대가 있어 추가할 수 없습니다.";
const MAX_TEXT = `한 번에 최대 ${REQUEST_LIMITS.BATCH_MAX_SESSIONS}회까지 신청할 수 있습니다.`;

export default function LectureDatePicker({
  room,
  initialSessions,
  scheduleError,
}: {
  room: SpaceRoom;
  initialSessions: ScheduleSession[];
  scheduleError: boolean;
}) {
  const router = useRouter();
  const isStudio = room.category === "studio";
  const maxMinutes = Math.max(60, (room.durationLimitHours || 6) * 60);
  const [now, setNow] = useState(() => kstNow());
  const [sessions, setSessions] = useState<ScheduleSession[]>(initialSessions);
  const [active, setActive] = useState<number>(initialSessions.length ? 0 : -1);
  const [addMode, setAddMode] = useState(false);
  const [dupError, setDupError] = useState("");
  const [needPick, setNeedPick] = useState(false);
  const [month, setMonth] = useState(() => monthKeyOf(initialSessions[0]?.date ?? kstNow().ymd));
  const booked = useBookedDates(room.id, month);
  const [slotState, setSlotState] = useState<SlotState>({ status: "idle", date: "", slots: [], reason: null });
  const timeCardRef = useRef<HTMLDivElement>(null);

  // P-11: 1분마다 지금 시각 다시 계산
  useEffect(() => {
    const t = window.setInterval(() => setNow(kstNow()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const today = booked.data?.today || now.ymd;
  const holidays = useMemo(() => booked.data?.holidays ?? new Map<string, string>(), [booked.data]);
  const holidaySet = useMemo(() => new Set(holidays.keys()) as ReadonlySet<string>, [holidays]);
  const activeSession = active >= 0 ? sessions[active] : undefined;
  const activeDate = activeSession?.date ?? "";

  // 지금 고르는 날짜의 시간표
  useEffect(() => {
    if (!activeDate) {
      setSlotState({ status: "idle", date: "", slots: [], reason: null });
      return;
    }
    const ctrl = new AbortController();
    setSlotState({ status: "loading", date: activeDate, slots: [], reason: null });
    fetch(`/api/availability?roomId=${encodeURIComponent(room.id)}&date=${encodeURIComponent(activeDate)}`, { cache: "no-store", signal: ctrl.signal })
      .then((r) => r.json())
      .then((d) => {
        if (ctrl.signal.aborted) return;
        if (!d?.ok) throw new Error("availability");
        setSlotState({ status: "ok", date: activeDate, slots: Array.isArray(d.slots) ? d.slots : [], reason: d.reasonMessage ?? null });
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setSlotState({ status: "error", date: activeDate, slots: [], reason: null });
      });
    return () => ctrl.abort();
  }, [room.id, activeDate]);

  const nowMin = activeDate && activeDate === now.ymd ? toMin(now.hm) : null;
  const startOptions = useMemo(
    () => (slotState.status === "ok" && slotState.date === activeDate ? startOptionsFor(slotState.slots, maxMinutes, nowMin) : []),
    [slotState, activeDate, maxMinutes, nowMin]
  );
  const endOptions = useMemo(
    () => (slotState.status === "ok" ? endOptionsFor(slotState.slots, activeSession?.startTime ?? "", maxMinutes) : []),
    [slotState, activeSession?.startTime, maxMinutes]
  );

  const patchActive = useCallback(
    (patch: Partial<ScheduleSession>) => {
      setSessions((list) => list.map((s, i) => (i === active ? { ...s, ...patch } : s)));
    },
    [active]
  );

  // 시간표가 오면 고른 시간이 맞는지 확인(맞지 않으면 첫 가능한 시각 + 1시간)
  useEffect(() => {
    if (!activeSession || slotState.status !== "ok" || slotState.date !== activeDate) return;
    const enabled = startOptions.filter((o) => !o.disabled).map((o) => o.value);
    let start = activeSession.startTime;
    if (!enabled.includes(start)) start = enabled[0] ?? "";
    const ends = endOptionsFor(slotState.slots, start, maxMinutes);
    let end = activeSession.endTime;
    if (!ends.includes(end)) end = ends[0] ?? "";
    if (start !== activeSession.startTime || end !== activeSession.endTime) patchActive({ startTime: start, endTime: end });
  }, [slotState, startOptions, activeDate, activeSession, maxMinutes, patchActive]);

  /** 오늘 남은 시작 시각이 있는가(마감 판정) */
  const todayHasStartLeft = useMemo(() => {
    const ranges = lectureOperatingRanges(today, holidaySet);
    const n = today === now.ymd ? toMin(now.hm) : 0;
    return ranges.some((r) => toMin(r.end) - 60 >= Math.ceil(n / 30) * 30);
  }, [today, holidaySet, now]);

  const cellFor = useCallback(
    (ymd: string): CellSpec => {
      const idx = sessions.findIndex((s) => s.date === ymd);
      const holidayName = holidays.get(ymd);
      if (ymd < today) return { view: "past", srState: "지난 날짜", clickable: false };
      if (dayOfWeek(ymd) === 0) return { view: "closed", sub: "휴관", srState: "휴관", clickable: false };
      if (holidayName)
        return {
          view: "closed",
          sub: (
            <>
              <span className="sm:hidden">공휴일</span>
              <span className="hidden sm:inline">{holidayName}</span>
            </>
          ),
          srState: holidayName,
          clickable: false,
        };
      if (idx >= 0 && idx === active) return { view: "active", sub: "선택", srState: "지금 시간을 고르는 날짜", clickable: false };
      if (idx >= 0) return { view: "chosen", sub: "선택", srState: "선택한 날짜", clickable: true };
      if (booked.data?.bookedDates.has(ymd) || (ymd === today && !todayHasStartLeft)) return { view: "booked", sub: "마감", srState: "마감", clickable: false };
      return { view: "available", srState: "선택 가능", clickable: true };
    },
    [sessions, holidays, today, active, booked.data, todayHasStartLeft]
  );

  function scrollToTimeCard() {
    window.setTimeout(() => timeCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  function onPick(ymd: string) {
    setNeedPick(false);
    setDupError("");
    const idx = sessions.findIndex((s) => s.date === ymd);
    if (addMode) {
      if (idx >= 0) {
        setDupError(DUP_TEXT);
        return;
      }
      const prev = sessions[sessions.length - 1];
      setSessions((list) => [...list, { date: ymd, startTime: prev?.startTime ?? "", endTime: prev?.endTime ?? "" }]);
      setActive(sessions.length);
      setAddMode(false);
      scrollToTimeCard();
      return;
    }
    if (idx >= 0) {
      setActive(idx);
      scrollToTimeCard();
      return;
    }
    if (!sessions.length || active < 0) {
      setSessions([{ date: ymd, startTime: "", endTime: "" }]);
      setActive(0);
    } else {
      patchActive({ date: ymd });
    }
    scrollToTimeCard();
  }

  function remove(i: number) {
    setDupError("");
    setSessions((list) => list.filter((_, j) => j !== i));
    setActive((a) => {
      const n = sessions.length - 1;
      if (n <= 0) return -1;
      if (a === i) return Math.min(i, n - 1);
      return a > i ? a - 1 : a;
    });
  }

  function startAdd() {
    setDupError("");
    setAddMode(true);
    document.getElementById("calendar-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const complete = sessions.filter(isComplete);
  const plan = useMemo(
    () => planLecture({ roomId: room.id, sessions: complete, holidays: holidaySet, holidayNames: holidays, todayYmd: today, nowHm: now.hm }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [room.id, JSON.stringify(complete), holidaySet, holidays, today, now.hm]
  );
  const issuesByDate = useMemo(() => {
    const m = new Map<string, string[]>();
    plan.sessions.forEach((s) => {
      if (s.issues.length) m.set(s.date, s.issues);
    });
    return m;
  }, [plan]);

  function goNext() {
    if (!sessions.length || sessions.some((s) => !isComplete(s))) {
      setNeedPick(true);
      document.getElementById("calendar-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (plan.issues.length) {
      document.getElementById("session-list")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    router.push(applyHrefForSessions(room.id, sessions));
  }

  const ranges = activeDate ? lectureOperatingRanges(activeDate, holidaySet) : [];
  const canAdd = sessions.length > 0 && sessions.length < REQUEST_LIMITS.BATCH_MAX_SESSIONS;

  const sessionList = (where: "main" | "side") =>
    sessions.length ? (
      <div id={where === "main" ? "session-list" : undefined} className={cn(where === "main" && cn(A_CARD, "p-4 min-[900px]:hidden"))}>
        <h2 className={A_CARD_TITLE}>신청할 날짜 · {sessions.length}회</h2>
        <ul className="mt-2 divide-y divide-line">
          {sessions.map((s, i) => {
            const issues = issuesByDate.get(s.date) ?? [];
            return (
              <li key={`${s.date}|${i}`} className="py-1.5">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setActive(i);
                      setAddMode(false);
                      scrollToTimeCard();
                    }}
                    className={cn(
                      "min-h-[44px] flex-1 text-left text-[17px] leading-7 tabular-nums",
                      i === active ? "font-extrabold text-ink" : "font-medium text-ink-2",
                      issues.length && "text-red-700"
                    )}
                  >
                    {isComplete(s) ? formatSessionLine(s) : `${formatKoDate(s.date)} 시간 고르는 중`}
                  </button>
                  <button type="button" className={A_BTN_SMALL} onClick={() => remove(i)} aria-label={`${formatKoDate(s.date)} 빼기`}>
                    빼기
                  </button>
                </div>
                {issues.map((t) => (
                  <p key={t} className={A_ERROR_TEXT}>
                    {t}
                  </p>
                ))}
              </li>
            );
          })}
        </ul>
        {canAdd ? (
          <button type="button" className={`${A_BTN_SECONDARY} mt-2`} onClick={startAdd}>
            ＋ 다른 날짜도 같이 신청
          </button>
        ) : sessions.length >= REQUEST_LIMITS.BATCH_MAX_SESSIONS ? (
          <p className={`${A_HELP} mt-2`}>{MAX_TEXT}</p>
        ) : null}
      </div>
    ) : null;

  const total = plan.totalFeeKRW;
  const summaryLine = formatSessionsSummary(complete);

  return (
    <Step2Shell
      room={room}
      title={`${room.name} · 날짜 고르기`}
      step1Href={isStudio ? "/" : `/space?category=lecture&floor=${room.floor}`}
      summary={
        <div className={cn(A_CARD, "space-y-3 p-5")}>
          {sessionList("side") ?? <p className="text-[17px] leading-7 text-ink-2">달력에서 날짜를 누르세요.</p>}
          {complete.length ? (
            <div className="flex items-baseline justify-between border-t border-line pt-3">
              <span className="text-[17px] font-bold text-ink">예상 이용료</span>
              <span className="text-[24px] font-extrabold tabular-nums text-brand">{total.toLocaleString()}원</span>
            </div>
          ) : null}
          <button type="button" className={A_BTN_PRIMARY} onClick={goNext}>
            다음: 신청서 쓰기
          </button>
        </div>
      }
      bar={
        <div>
          {complete.length ? (
            <>
              <p className="truncate text-[16px] leading-6 text-ink-2">{summaryLine}</p>
              <p className="flex items-baseline justify-between">
                <span className="text-[16px] text-ink-2">예상 이용료</span>
                <span className="text-[20px] font-extrabold tabular-nums text-ink">{total.toLocaleString()}원</span>
              </p>
            </>
          ) : null}
          <button type="button" className={`${A_BTN_PRIMARY} mt-1.5`} onClick={goNext}>
            다음: 신청서 쓰기
          </button>
        </div>
      }
    >
      <MonthCalendar
        monthKey={month}
        minMonthKey={monthKeyOf(today)}
        onMonthChange={setMonth}
        status={booked.status}
        onReload={booked.reload}
        today={today}
        cellFor={cellFor}
        onPick={onPick}
        above={
          <>
            {scheduleError ? (
              <div role="alert" className="mb-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[17px] font-bold leading-7 text-amber-900">
                {SCHEDULE_ERR_TEXT}
              </div>
            ) : null}
            {needPick ? (
              <div role="alert" className="mb-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[17px] font-bold leading-7 text-amber-900">
                {PICK_FIRST_TEXT}
              </div>
            ) : null}
            {addMode ? <p className="mb-2 text-[15px] font-bold leading-6 text-brand">더할 날짜를 누르세요.</p> : null}
          </>
        }
        below={<CalendarLegend />}
      />

      <div ref={timeCardRef} className={cn(A_CARD, "scroll-mt-4 p-4 sm:p-5")}>
        {activeSession ? (
          <>
            <h2 className={A_CARD_TITLE}>{formatKoDate(activeDate)} 시간 고르기</h2>
            {slotState.status === "loading" ? (
              <p className="mt-2 text-[15px] text-ink-3">불러오는 중…</p>
            ) : slotState.status === "error" ? (
              <p role="alert" className={`${A_ERROR_TEXT} mt-2`}>
                {"예약 현황을 불러오지 못했습니다. 잠시 뒤 다시 불러와 주세요."}
              </p>
            ) : startOptions.every((o) => o.disabled) ? (
              <p className="mt-2 text-[17px] leading-7 text-ink-2">{slotState.reason || "해당 날짜에 표시할 시간이 없습니다."}</p>
            ) : (
              <>
                <div className="mt-3 grid max-w-[420px] grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="time-start" className="block text-[17px] font-bold leading-7 text-ink">
                      시작
                    </label>
                    <select
                      id="time-start"
                      className={`${A_INPUT} mt-1.5`}
                      value={activeSession.startTime}
                      onChange={(e) => {
                        const st = e.target.value;
                        const ends = endOptionsFor(slotState.slots, st, maxMinutes);
                        patchActive({ startTime: st, endTime: ends[0] ?? "" });
                      }}
                    >
                      {startOptions.map((o) => (
                        <option key={o.value} value={o.value} disabled={o.disabled}>
                          {o.value}
                          {o.past ? " (지난 시간)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="time-end" className="block text-[17px] font-bold leading-7 text-ink">
                      끝
                    </label>
                    <select id="time-end" className={`${A_INPUT} mt-1.5`} value={activeSession.endTime} onChange={(e) => patchActive({ endTime: e.target.value })}>
                      {endOptions.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {ranges.length ? (
                  <p className={`${A_HELP} mt-2`}>
                    {dowLabel(activeDate)}요일은 {ranges.map((r) => `${r.start}~${r.end}`).join(", ")}에 이용할 수 있습니다. 한 번에 최대 {room.durationLimitHours}시간.
                  </p>
                ) : null}
              </>
            )}
          </>
        ) : (
          <p className="text-[17px] leading-7 text-ink-2">달력에서 날짜를 누르세요.</p>
        )}
        {dupError ? (
          <p role="alert" className={`${A_ERROR_TEXT} mt-2`}>
            {dupError}
          </p>
        ) : null}
      </div>

      {sessionList("main")}
    </Step2Shell>
  );
}
