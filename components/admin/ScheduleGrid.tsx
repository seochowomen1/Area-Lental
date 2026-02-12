"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import type { ClassSchedule, Room } from "@/lib/types";

/* ── 상수 ── */

const DOW_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
const DAYS = [1, 2, 3, 4, 5, 6]; // Mon-Sat

const GRID_START = 540;   // 09:00
const GRID_END   = 1200;  // 20:00
const SLOT_MIN   = 30;
const SLOT_H     = 26;    // px per slot

const SLOTS = Array.from(
  { length: (GRID_END - GRID_START) / SLOT_MIN },
  (_, i) => {
    const m = GRID_START + i * SLOT_MIN;
    return { m, label: fmt(m) };
  },
);

function fmt(m: number) {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
function toMin(hhmm: string) {
  const [h, mm] = hhmm.split(":").map(Number);
  return h * 60 + mm;
}

/** 해당 요일의 운영시간 구간 (minutes) */
function opRanges(dow: number): { s: number; e: number }[] {
  if (dow === 0) return [];
  if (dow === 6) return [{ s: 600, e: 720 }];          // 토 10~12
  if (dow === 2) return [{ s: 600, e: 1020 }, { s: 1080, e: 1200 }]; // 화 10~17 + 18~20
  return [{ s: 600, e: 1020 }];                         // 평일 10~17
}
function isOp(dow: number, m: number) {
  return opRanges(dow).some((r) => m >= r.s && m < r.e);
}

const BLOCK_COLORS = [
  "bg-blue-100 border-blue-300 text-blue-900",
  "bg-emerald-100 border-emerald-300 text-emerald-900",
  "bg-violet-100 border-violet-300 text-violet-900",
  "bg-amber-100 border-amber-300 text-amber-900",
  "bg-rose-100 border-rose-300 text-rose-900",
  "bg-cyan-100 border-cyan-300 text-cyan-900",
  "bg-pink-100 border-pink-300 text-pink-900",
  "bg-lime-100 border-lime-300 text-lime-900",
];

function hashColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return BLOCK_COLORS[Math.abs(h) % BLOCK_COLORS.length];
}

/* ── 분기 프리셋 ── */
function currentYear() {
  return new Date().getFullYear();
}
function quarterPresets(year: number) {
  return [
    { label: `${year} 1분기`, from: `${year}-01-01`, to: `${year}-03-31` },
    { label: `${year} 2분기`, from: `${year}-04-01`, to: `${year}-06-30` },
    { label: `${year} 3분기`, from: `${year}-07-01`, to: `${year}-09-30` },
    { label: `${year} 4분기`, from: `${year}-10-01`, to: `${year}-12-31` },
  ];
}

/* ── Props ── */

type Props = {
  rooms: Room[];
  schedules: ClassSchedule[];
  onAdd: (payload: Omit<ClassSchedule, "id">) => Promise<string | void>;
  onDelete: (id: string) => Promise<void>;
  isSubmitting: boolean;
  spaceLabel?: string;
};

export default function ScheduleGrid({
  rooms,
  schedules,
  onAdd,
  onDelete,
  isSubmitting,
  spaceLabel = "강의실",
}: Props) {
  const [selectedRoom, setSelectedRoom] = useState(rooms[0]?.id ?? "all");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [effectiveTo, setEffectiveTo] = useState("");
  const [presetYear, setPresetYear] = useState(currentYear());

  // drag
  const [dragDay, setDragDay] = useState<number | null>(null);
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragEnd, setDragEnd] = useState<number | null>(null);
  const dragging = useRef(false);

  // dialog
  const [dialog, setDialog] = useState<{ day: number; start: number; end: number } | null>(null);
  const [dialogTitle, setDialogTitle] = useState("");

  /* ── 필터 ── */
  const filtered = useMemo(() => {
    return schedules.filter((s) => {
      if (selectedRoom !== "all" && s.roomId !== selectedRoom && s.roomId !== "all") return false;
      if (effectiveFrom && effectiveTo) {
        const sf = s.effectiveFrom || "0000-00-00";
        const st = s.effectiveTo || "9999-12-31";
        if (st < effectiveFrom || sf > effectiveTo) return false;
      }
      return true;
    });
  }, [schedules, selectedRoom, effectiveFrom, effectiveTo]);

  /* 특정 요일+시간에 있는 스케줄 */
  const scheduleAt = useCallback(
    (dow: number, m: number) =>
      filtered.find((s) => s.dayOfWeek === dow && m >= toMin(s.startTime) && m < toMin(s.endTime)),
    [filtered],
  );
  const scheduleStartAt = useCallback(
    (dow: number, m: number) =>
      filtered.find((s) => s.dayOfWeek === dow && toMin(s.startTime) === m),
    [filtered],
  );
  const slotCount = (s: ClassSchedule) =>
    (toMin(s.endTime) - toMin(s.startTime)) / SLOT_MIN;

  /* ── drag handlers ── */
  function onCellDown(dow: number, m: number) {
    if (!effectiveFrom || !effectiveTo) return;
    if (!isOp(dow, m) || scheduleAt(dow, m)) return;
    dragging.current = true;
    setDragDay(dow);
    setDragStart(m);
    setDragEnd(m);
  }
  function onCellEnter(dow: number, m: number) {
    if (!dragging.current || dragDay !== dow || dragStart === null) return;
    if (!isOp(dow, m) || scheduleAt(dow, m)) return;
    setDragEnd(m);
  }
  function onMouseUp() {
    if (!dragging.current) return;
    dragging.current = false;
    if (dragDay !== null && dragStart !== null && dragEnd !== null) {
      const s = Math.min(dragStart, dragEnd);
      const e = Math.max(dragStart, dragEnd) + SLOT_MIN;
      setDialog({ day: dragDay, start: s, end: e });
      setDialogTitle("");
    }
    setDragDay(null);
    setDragStart(null);
    setDragEnd(null);
  }
  function cancelDrag() {
    dragging.current = false;
    setDragDay(null);
    setDragStart(null);
    setDragEnd(null);
  }
  function isDrag(dow: number, m: number) {
    if (dragDay !== dow || dragStart === null || dragEnd === null) return false;
    const lo = Math.min(dragStart, dragEnd);
    const hi = Math.max(dragStart, dragEnd);
    return m >= lo && m <= hi;
  }

  /* ── add ── */
  async function handleAdd() {
    if (!dialog || !effectiveFrom || !effectiveTo) return;
    await onAdd({
      roomId: selectedRoom,
      dayOfWeek: dialog.day,
      startTime: fmt(dialog.start),
      endTime: fmt(dialog.end),
      title: dialogTitle.trim() || "정규수업",
      effectiveFrom,
      effectiveTo,
    });
    setDialog(null);
  }

  const periodReady = Boolean(effectiveFrom && effectiveTo);

  return (
    <div>
      {/* ── 강의실 탭 ── */}
      <div className="flex flex-wrap gap-2 mb-4">
        {rooms.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setSelectedRoom(r.id)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-semibold transition",
              selectedRoom === r.id
                ? "bg-slate-900 text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
            )}
          >
            {r.name}
          </button>
        ))}
      </div>

      {/* ── 적용기간 ── */}
      <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-bold text-slate-700">적용기간</span>
          <input
            type="date"
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm"
          />
          <span className="text-slate-400">~</span>
          <input
            type="date"
            value={effectiveTo}
            onChange={(e) => setEffectiveTo(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm"
          />
        </div>
        {/* 분기 프리셋 */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPresetYear((y) => y - 1)}
              className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-50"
            >
              &lt;
            </button>
            <span className="w-12 text-center text-xs font-semibold text-slate-600">{presetYear}</span>
            <button
              type="button"
              onClick={() => setPresetYear((y) => y + 1)}
              className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-50"
            >
              &gt;
            </button>
          </div>
          {quarterPresets(presetYear).map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => { setEffectiveFrom(q.from); setEffectiveTo(q.to); }}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold transition",
                effectiveFrom === q.from && effectiveTo === q.to
                  ? "border-blue-400 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50",
              )}
            >
              {q.label}
            </button>
          ))}
        </div>
      </div>

      {!periodReady && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          적용기간을 설정하면 시간표에서 드래그하여 수업을 추가할 수 있습니다.
        </div>
      )}

      {/* ── 그리드 ── */}
      <div
        className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm"
        onMouseLeave={cancelDrag}
        onMouseUp={onMouseUp}
      >
        <table className="w-full border-collapse" style={{ tableLayout: "fixed", minWidth: 520 }}>
          <colgroup>
            <col style={{ width: 56 }} />
            {DAYS.map((d) => <col key={d} />)}
          </colgroup>
          <thead>
            <tr className="bg-slate-50">
              <th className="border-r border-b border-slate-200 py-2 text-[11px] font-semibold text-slate-400">
                시간
              </th>
              {DAYS.map((d) => (
                <th
                  key={d}
                  className="border-r border-b border-slate-200 py-2 text-sm font-bold text-slate-700 last:border-r-0"
                >
                  {DOW_LABELS[d]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SLOTS.map((slot) => (
              <tr key={slot.m}>
                {/* 시간 라벨 */}
                <td
                  className="select-none border-r border-b border-slate-100 pr-2 text-right text-[10px] tabular-nums text-slate-400"
                  style={{ height: SLOT_H }}
                >
                  {slot.m % 60 === 0 ? slot.label : ""}
                </td>

                {/* 요일 셀 */}
                {DAYS.map((d) => {
                  const op = isOp(d, slot.m);
                  const sched = scheduleAt(d, slot.m);
                  const schedS = sched ? scheduleStartAt(d, slot.m) : null;
                  const drag = isDrag(d, slot.m);

                  return (
                    <td
                      key={d}
                      className={cn(
                        "relative border-r border-b border-slate-100 last:border-r-0",
                        !op && "bg-slate-50/80",
                        op && !sched && periodReady && "cursor-crosshair",
                        drag && "bg-blue-200/50",
                      )}
                      style={{ height: SLOT_H, padding: 0 }}
                      onMouseDown={() => onCellDown(d, slot.m)}
                      onMouseEnter={() => onCellEnter(d, slot.m)}
                    >
                      {/* 스케줄 블록(시작 셀에만 렌더) */}
                      {schedS && (
                        <div
                          className={cn(
                            "absolute inset-x-0.5 z-10 rounded border px-1 overflow-hidden",
                            "flex flex-col justify-center",
                            "cursor-pointer hover:opacity-80 transition-opacity",
                            hashColor(schedS.id),
                          )}
                          style={{ top: 0, height: slotCount(schedS) * SLOT_H - 1 }}
                          onClick={(e) => { e.stopPropagation(); onDelete(schedS.id); }}
                          title={`${schedS.title} (${schedS.startTime}~${schedS.endTime})\n클릭하면 삭제됩니다`}
                        >
                          <div className="truncate text-[10px] font-bold leading-tight">
                            {schedS.title}
                          </div>
                          {slotCount(schedS) >= 2 && (
                            <div className="truncate text-[9px] opacity-70 leading-tight">
                              {schedS.startTime}~{schedS.endTime}
                            </div>
                          )}
                          {slotCount(schedS) >= 3 && schedS.roomId === "all" && (
                            <div className="truncate text-[9px] opacity-60 leading-tight">전체</div>
                          )}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 범례 */}
      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded border border-slate-200 bg-slate-50/80" />
          운영시간 외
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded border border-blue-300 bg-blue-100" />
          등록된 수업
        </span>
        {periodReady && (
          <span className="text-slate-400">* 빈 셀을 드래그하여 수업 추가, 블록 클릭으로 삭제</span>
        )}
      </div>

      {/* ── 추가 다이얼로그 ── */}
      {dialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          onClick={() => setDialog(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-slate-900 mb-4">수업시간 추가</h3>
            <div className="space-y-2.5 text-sm">
              <div className="flex gap-3">
                <span className="w-16 shrink-0 font-semibold text-slate-500">{spaceLabel}</span>
                <span className="font-medium text-slate-900">
                  {rooms.find((r) => r.id === selectedRoom)?.name ?? selectedRoom}
                </span>
              </div>
              <div className="flex gap-3">
                <span className="w-16 shrink-0 font-semibold text-slate-500">요일</span>
                <span className="font-medium text-slate-900">{DOW_LABELS[dialog.day]}요일</span>
              </div>
              <div className="flex gap-3">
                <span className="w-16 shrink-0 font-semibold text-slate-500">시간</span>
                <span className="font-medium text-slate-900">
                  {fmt(dialog.start)} ~ {fmt(dialog.end)}
                </span>
              </div>
              <div className="flex gap-3">
                <span className="w-16 shrink-0 font-semibold text-slate-500">기간</span>
                <span className="font-medium text-slate-900">{effectiveFrom} ~ {effectiveTo}</span>
              </div>
              <div className="pt-1">
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  수업 제목
                </label>
                <input
                  type="text"
                  value={dialogTitle}
                  onChange={(e) => setDialogTitle(e.target.value)}
                  placeholder="예: 정규강좌"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAdd();
                  }}
                />
              </div>
            </div>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setDialog(null)}
                className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleAdd}
                disabled={isSubmitting}
                className="flex-1 rounded-lg bg-[rgb(var(--brand-primary))] py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-50"
              >
                {isSubmitting ? "등록 중..." : "추가"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
