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
  if (dow === 2) return [{ s: 600, e: 1200 }]; // 화 10~20 (통합)
  return [{ s: 600, e: 1020 }];                         // 평일 10~17
}
function isOp(dow: number, m: number) {
  return opRanges(dow).some((r) => m >= r.s && m < r.e);
}

/** 시작시간 옵션 생성 */
function startOpts(dow: number): string[] {
  const ops = opRanges(dow);
  const out: string[] = [];
  for (const r of ops) for (let m = r.s; m < r.e; m += SLOT_MIN) out.push(fmt(m));
  return out;
}
/** 종료시간 옵션 생성 */
function endOpts(dow: number, startMin: number): string[] {
  const range = opRanges(dow).find((r) => startMin >= r.s && startMin < r.e);
  if (!range) return [];
  const out: string[] = [];
  for (let m = startMin + SLOT_MIN; m <= range.e; m += SLOT_MIN) out.push(fmt(m));
  return out;
}

const ROOM_COLORS = [
  { bg: "bg-blue-100", border: "border-blue-300", text: "text-blue-900", dot: "bg-blue-400" },
  { bg: "bg-emerald-100", border: "border-emerald-300", text: "text-emerald-900", dot: "bg-emerald-400" },
  { bg: "bg-violet-100", border: "border-violet-300", text: "text-violet-900", dot: "bg-violet-400" },
  { bg: "bg-amber-100", border: "border-amber-300", text: "text-amber-900", dot: "bg-amber-400" },
  { bg: "bg-rose-100", border: "border-rose-300", text: "text-rose-900", dot: "bg-rose-400" },
  { bg: "bg-cyan-100", border: "border-cyan-300", text: "text-cyan-900", dot: "bg-cyan-400" },
  { bg: "bg-pink-100", border: "border-pink-300", text: "text-pink-900", dot: "bg-pink-400" },
  { bg: "bg-lime-100", border: "border-lime-300", text: "text-lime-900", dot: "bg-lime-400" },
];

function hashColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return ROOM_COLORS[Math.abs(h) % ROOM_COLORS.length];
}

/* ── 분기 프리셋 ── */
function currentYear() { return new Date().getFullYear(); }
function quarterPresets(year: number) {
  return [
    { label: `${year} 1분기`, from: `${year}-01-01`, to: `${year}-03-31` },
    { label: `${year} 2분기`, from: `${year}-04-01`, to: `${year}-06-30` },
    { label: `${year} 3분기`, from: `${year}-07-01`, to: `${year}-09-30` },
    { label: `${year} 4분기`, from: `${year}-10-01`, to: `${year}-12-31` },
  ];
}

function quarterLabel(from: string, to: string) {
  const presets = quarterPresets(parseInt(from.substring(0, 4), 10));
  return presets.find((p) => p.from === from && p.to === to)?.label ?? `${from} ~ ${to}`;
}

/* ── Props ── */

type Props = {
  rooms: Room[];
  schedules: ClassSchedule[];
  onAdd: (payload: Omit<ClassSchedule, "id">) => Promise<string | void>;
  onUpdate: (id: string, payload: Omit<ClassSchedule, "id">) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  isSubmitting: boolean;
  spaceLabel?: string;
};

export default function ScheduleGrid({
  rooms,
  schedules,
  onAdd,
  onUpdate,
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

  // add dialog
  const [addDialog, setAddDialog] = useState<{ day: number; start: number; end: number } | null>(null);
  const [addTitle, setAddTitle] = useState("");

  // edit dialog
  const [editSchedule, setEditSchedule] = useState<ClassSchedule | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");

  // copy dialog
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyTarget, setCopyTarget] = useState("");
  const [copyProgress, setCopyProgress] = useState<{ done: number; total: number } | null>(null);

  const individualRooms = useMemo(() => rooms.filter((r) => r.id !== "all"), [rooms]);
  const isAllView = selectedRoom === "all";

  /* ── 필터 ── */
  const filtered = useMemo(() => {
    return schedules.filter((s) => {
      if (!isAllView && s.roomId !== selectedRoom && s.roomId !== "all") return false;
      if (effectiveFrom && effectiveTo) {
        const sf = s.effectiveFrom || "0000-00-00";
        const st = s.effectiveTo || "9999-12-31";
        if (st < effectiveFrom || sf > effectiveTo) return false;
      }
      return true;
    });
  }, [schedules, selectedRoom, effectiveFrom, effectiveTo, isAllView]);

  /* 현재 분기에 해당하는 스케줄 (복사용 - 전체 룸) */
  const quarterSchedules = useMemo(() => {
    if (!effectiveFrom || !effectiveTo) return [];
    return schedules.filter(
      (s) => s.effectiveFrom === effectiveFrom && s.effectiveTo === effectiveTo,
    );
  }, [schedules, effectiveFrom, effectiveTo]);

  /* 특정 요일+시간에 있는 스케줄들 */
  const schedulesAt = useCallback(
    (dow: number, m: number) =>
      filtered.filter((s) => s.dayOfWeek === dow && m >= toMin(s.startTime) && m < toMin(s.endTime)),
    [filtered],
  );
  const schedulesStartAt = useCallback(
    (dow: number, m: number) =>
      filtered.filter((s) => s.dayOfWeek === dow && toMin(s.startTime) === m),
    [filtered],
  );
  const slotCount = (s: ClassSchedule) =>
    (toMin(s.endTime) - toMin(s.startTime)) / SLOT_MIN;

  /* ── 전체 보기: 룸별 레인 계산 ── */
  function roomLaneIndex(roomId: string): number {
    if (roomId === "all") return -1;
    return individualRooms.findIndex((r) => r.id === roomId);
  }
  function roomColor(roomId: string) {
    const idx = individualRooms.findIndex((r) => r.id === roomId);
    return ROOM_COLORS[idx >= 0 ? idx % ROOM_COLORS.length : 0];
  }

  /* ── drag handlers ── */
  function onCellDown(dow: number, m: number) {
    if (!effectiveFrom || !effectiveTo) return;
    if (!isOp(dow, m)) return;
    if (isAllView) return; // 전체보기에서는 드래그 추가 불가
    if (schedulesAt(dow, m).length > 0) return;
    dragging.current = true;
    setDragDay(dow);
    setDragStart(m);
    setDragEnd(m);
  }
  function onCellEnter(dow: number, m: number) {
    if (!dragging.current || dragDay !== dow || dragStart === null) return;
    if (!isOp(dow, m) || schedulesAt(dow, m).length > 0) return;
    setDragEnd(m);
  }
  function onMouseUp() {
    if (!dragging.current) return;
    dragging.current = false;
    if (dragDay !== null && dragStart !== null && dragEnd !== null) {
      const s = Math.min(dragStart, dragEnd);
      const e = Math.max(dragStart, dragEnd) + SLOT_MIN;
      setAddDialog({ day: dragDay, start: s, end: e });
      setAddTitle("");
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
    if (!addDialog || !effectiveFrom || !effectiveTo) return;
    await onAdd({
      roomId: selectedRoom,
      dayOfWeek: addDialog.day,
      startTime: fmt(addDialog.start),
      endTime: fmt(addDialog.end),
      title: addTitle.trim() || "정규수업",
      effectiveFrom,
      effectiveTo,
    });
    setAddDialog(null);
  }

  /* ── edit ── */
  function openEdit(s: ClassSchedule) {
    setEditSchedule(s);
    setEditTitle(s.title);
    setEditStart(s.startTime);
    setEditEnd(s.endTime);
  }
  async function handleUpdate() {
    if (!editSchedule) return;
    await onUpdate(editSchedule.id, {
      roomId: editSchedule.roomId,
      dayOfWeek: editSchedule.dayOfWeek,
      startTime: editStart,
      endTime: editEnd,
      title: editTitle.trim() || "정규수업",
      effectiveFrom: editSchedule.effectiveFrom,
      effectiveTo: editSchedule.effectiveTo,
    });
    setEditSchedule(null);
  }
  async function handleEditDelete() {
    if (!editSchedule) return;
    await onDelete(editSchedule.id);
    setEditSchedule(null);
  }

  /* ── copy ── */
  const copyTargetPresets = useMemo(() => {
    if (!effectiveFrom || !effectiveTo) return [];
    const year = parseInt(effectiveFrom.substring(0, 4), 10);
    // 현재 연도 + 다음 연도 분기
    return [...quarterPresets(year), ...quarterPresets(year + 1)].filter(
      (q) => q.from !== effectiveFrom || q.to !== effectiveTo,
    );
  }, [effectiveFrom, effectiveTo]);

  async function handleCopy() {
    if (!copyTarget || quarterSchedules.length === 0) return;
    const [targetFrom, targetTo] = copyTarget.split("|");
    const total = quarterSchedules.length;
    setCopyProgress({ done: 0, total });

    for (let i = 0; i < quarterSchedules.length; i++) {
      const s = quarterSchedules[i];
      try {
        await onAdd({
          roomId: s.roomId,
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime,
          endTime: s.endTime,
          title: s.title,
          effectiveFrom: targetFrom,
          effectiveTo: targetTo,
        });
      } catch {
        // 충돌 등으로 실패 시 건너뜀
      }
      setCopyProgress({ done: i + 1, total });
    }

    setCopyProgress(null);
    setCopyOpen(false);
    setCopyTarget("");
  }

  const periodReady = Boolean(effectiveFrom && effectiveTo);

  /* ── 블록 렌더 헬퍼 ── */
  function renderBlock(sched: ClassSchedule, laneLeft?: string, laneWidth?: string) {
    const color = isAllView ? roomColor(sched.roomId) : hashColor(sched.id);
    const slots = slotCount(sched);
    const roomName = isAllView
      ? (rooms.find((r) => r.id === sched.roomId)?.name ?? sched.roomId)
      : null;

    return (
      <div
        key={sched.id}
        className={cn(
          "absolute z-10 rounded border px-0.5 overflow-hidden",
          "flex flex-col justify-center",
          "cursor-pointer hover:opacity-80 transition-opacity",
          color.bg, color.border, color.text,
        )}
        style={{
          top: 0,
          height: slots * SLOT_H - 1,
          left: laneLeft ?? "2px",
          right: laneLeft ? undefined : "2px",
          width: laneWidth,
        }}
        onClick={(e) => { e.stopPropagation(); openEdit(sched); }}
        title={`${sched.title} (${sched.startTime}~${sched.endTime})${roomName ? `\n${roomName}` : ""}\n클릭하여 수정`}
      >
        {roomName && slots >= 2 && (
          <div className="truncate text-[8px] font-bold leading-tight opacity-70">{roomName}</div>
        )}
        <div className="truncate text-[10px] font-bold leading-tight">{sched.title}</div>
        {slots >= 2 && (
          <div className="truncate text-[9px] opacity-70 leading-tight">
            {sched.startTime}~{sched.endTime}
          </div>
        )}
      </div>
    );
  }

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

      {/* ── 적용기간 + 분기복사 ── */}
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
          {/* 분기 복사 버튼 */}
          {periodReady && quarterSchedules.length > 0 && (
            <button
              type="button"
              onClick={() => { setCopyOpen(true); setCopyTarget(copyTargetPresets[0] ? `${copyTargetPresets[0].from}|${copyTargetPresets[0].to}` : ""); }}
              className="rounded-full border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
            >
              분기 복사
            </button>
          )}
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

      {/* 전체보기 범례 */}
      {isAllView && individualRooms.length > 1 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
          {individualRooms.map((r, i) => {
            const c = ROOM_COLORS[i % ROOM_COLORS.length];
            return (
              <span key={r.id} className="flex items-center gap-1.5">
                <span className={cn("inline-block h-3 w-3 rounded", c.bg, c.border, "border")} />
                {r.name}
              </span>
            );
          })}
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
                  const scheds = schedulesAt(d, slot.m);
                  const schedsStart = schedulesStartAt(d, slot.m);
                  const drag = isDrag(d, slot.m);

                  return (
                    <td
                      key={d}
                      className={cn(
                        "relative border-r border-b border-slate-100 last:border-r-0",
                        !op && "bg-slate-50/80",
                        op && scheds.length === 0 && periodReady && !isAllView && "cursor-crosshair",
                        drag && "bg-blue-200/50",
                      )}
                      style={{ height: SLOT_H, padding: 0 }}
                      onMouseDown={() => onCellDown(d, slot.m)}
                      onMouseEnter={() => onCellEnter(d, slot.m)}
                    >
                      {/* 스케줄 블록(시작 셀에만 렌더) */}
                      {schedsStart.map((sched) => {
                        if (isAllView && individualRooms.length > 1) {
                          // 전체 보기: 룸별 레인 배치
                          const totalLanes = individualRooms.length;
                          const lane = roomLaneIndex(sched.roomId);
                          if (sched.roomId === "all") {
                            return renderBlock(sched, "2px", `calc(100% - 4px)`);
                          }
                          if (lane < 0) return null;
                          const pct = 100 / totalLanes;
                          return renderBlock(
                            sched,
                            `calc(${lane * pct}% + 1px)`,
                            `calc(${pct}% - 2px)`,
                          );
                        }
                        // 개별 룸 보기
                        return renderBlock(sched);
                      })}
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
        {periodReady && !isAllView && (
          <span className="text-slate-400">* 빈 셀을 드래그하여 수업 추가, 블록 클릭으로 수정</span>
        )}
        {isAllView && (
          <span className="text-slate-400">* 블록 클릭으로 수정/삭제 가능</span>
        )}
      </div>

      {/* ── 추가 다이얼로그 ── */}
      {addDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setAddDialog(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
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
                <span className="font-medium text-slate-900">{DOW_LABELS[addDialog.day]}요일</span>
              </div>
              <div className="flex gap-3">
                <span className="w-16 shrink-0 font-semibold text-slate-500">시간</span>
                <span className="font-medium text-slate-900">
                  {fmt(addDialog.start)} ~ {fmt(addDialog.end)}
                </span>
              </div>
              <div className="flex gap-3">
                <span className="w-16 shrink-0 font-semibold text-slate-500">기간</span>
                <span className="font-medium text-slate-900">{effectiveFrom} ~ {effectiveTo}</span>
              </div>
              <div className="pt-1">
                <label className="block text-xs font-semibold text-slate-600 mb-1">수업 제목</label>
                <input
                  type="text"
                  value={addTitle}
                  onChange={(e) => setAddTitle(e.target.value)}
                  placeholder="예: 정규강좌"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
                />
              </div>
            </div>
            <div className="mt-5 flex gap-3">
              <button type="button" onClick={() => setAddDialog(null)} className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                취소
              </button>
              <button type="button" onClick={handleAdd} disabled={isSubmitting} className="flex-1 rounded-lg bg-[rgb(var(--brand-primary))] py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-50">
                {isSubmitting ? "등록 중..." : "추가"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 수정/삭제 다이얼로그 ── */}
      {editSchedule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setEditSchedule(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900 mb-4">수업시간 수정</h3>
            <div className="space-y-2.5 text-sm">
              <div className="flex gap-3">
                <span className="w-16 shrink-0 font-semibold text-slate-500">{spaceLabel}</span>
                <span className="font-medium text-slate-900">
                  {rooms.find((r) => r.id === editSchedule.roomId)?.name ?? editSchedule.roomId}
                </span>
              </div>
              <div className="flex gap-3">
                <span className="w-16 shrink-0 font-semibold text-slate-500">요일</span>
                <span className="font-medium text-slate-900">{DOW_LABELS[editSchedule.dayOfWeek]}요일</span>
              </div>
              <div className="flex gap-3">
                <span className="w-16 shrink-0 font-semibold text-slate-500">기간</span>
                <span className="font-medium text-slate-900">
                  {editSchedule.effectiveFrom} ~ {editSchedule.effectiveTo}
                </span>
              </div>
              <div className="pt-1">
                <label className="block text-xs font-semibold text-slate-600 mb-1">수업 제목</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="예: 정규강좌"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">시작시간</label>
                  <select
                    value={editStart}
                    onChange={(e) => {
                      setEditStart(e.target.value);
                      // 종료시간이 시작시간보다 이전이면 자동 보정
                      const newEndOpts = endOpts(editSchedule.dayOfWeek, toMin(e.target.value));
                      if (!newEndOpts.includes(editEnd) && newEndOpts.length > 0) {
                        setEditEnd(newEndOpts[0]);
                      }
                    }}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300"
                  >
                    {startOpts(editSchedule.dayOfWeek).map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">종료시간</label>
                  <select
                    value={editEnd}
                    onChange={(e) => setEditEnd(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300"
                  >
                    {endOpts(editSchedule.dayOfWeek, toMin(editStart)).map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={handleEditDelete}
                disabled={isSubmitting}
                className="rounded-lg border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
              >
                삭제
              </button>
              <div className="flex-1" />
              <button type="button" onClick={() => setEditSchedule(null)} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                취소
              </button>
              <button type="button" onClick={handleUpdate} disabled={isSubmitting} className="rounded-lg bg-[rgb(var(--brand-primary))] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-50">
                {isSubmitting ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 분기 복사 다이얼로그 ── */}
      {copyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => { if (!copyProgress) setCopyOpen(false); }}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900 mb-2">분기 시간표 복사</h3>
            <p className="text-sm text-slate-500 mb-4">
              현재 적용기간의 수업 <b className="text-slate-800">{quarterSchedules.length}건</b>을 선택한 분기로 복사합니다.
            </p>

            <div className="space-y-3 text-sm">
              <div className="flex gap-3 items-center">
                <span className="w-20 shrink-0 font-semibold text-slate-500">현재 기간</span>
                <span className="font-medium text-slate-900">
                  {quarterLabel(effectiveFrom, effectiveTo)}
                </span>
              </div>
              <div className="flex gap-3 items-center">
                <span className="w-20 shrink-0 font-semibold text-slate-500">복사 대상</span>
                <select
                  value={copyTarget}
                  onChange={(e) => setCopyTarget(e.target.value)}
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300"
                  disabled={!!copyProgress}
                >
                  {copyTargetPresets.map((q) => (
                    <option key={q.label} value={`${q.from}|${q.to}`}>{q.label} ({q.from} ~ {q.to})</option>
                  ))}
                </select>
              </div>
            </div>

            {copyProgress && (
              <div className="mt-4">
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full bg-[rgb(var(--brand-primary))] transition-all rounded-full"
                    style={{ width: `${(copyProgress.done / copyProgress.total) * 100}%` }}
                  />
                </div>
                <p className="mt-1.5 text-xs text-slate-500 text-center">
                  {copyProgress.done} / {copyProgress.total} 복사 중...
                </p>
              </div>
            )}

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setCopyOpen(false)}
                disabled={!!copyProgress}
                className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleCopy}
                disabled={!copyTarget || !!copyProgress || quarterSchedules.length === 0}
                className="flex-1 rounded-lg bg-[rgb(var(--brand-primary))] py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-50"
              >
                {copyProgress ? "복사 중..." : `${quarterSchedules.length}건 복사`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
