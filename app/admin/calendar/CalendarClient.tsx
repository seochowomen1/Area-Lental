"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/cn";
import {
  FLOORS,
  ROOMS_BY_ID,
  getRoomsByCategory,
  normalizeRoomCategory,
  type FloorId,
} from "@/lib/space";
import type { RequestStatus } from "@/lib/types";

type CalendarKind = "request" | "block" | "schedule";

type CalendarItem = {
  kind: CalendarKind;
  id: string;
  roomId: string;
  roomName: string;
  floorId: FloorId | null;
  date: string;
  startTime: string;
  endTime: string;
  title: string;
  status?: RequestStatus;
  applicantName?: string;
  phone?: string;
  batchId?: string;
  batchSeq?: number;
  batchSize?: number;
  /** 우리동네 갤러리: 준비(세팅)일 여부 */
  isPrepDay?: boolean;
  reason?: string;
};

type CalendarResponse = {
  ok: boolean;
  from: string;
  to: string;
  roomId: string;
  floorId: string;
  status: string;
  blocks: boolean;
  schedules: boolean;
  items: CalendarItem[];
};

function isYmd(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function ymdToUtcDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map((n) => parseInt(n, 10));
  return new Date(Date.UTC(y, m - 1, d));
}

function utcDateToYmd(dt: Date): string {
  return dt.toISOString().slice(0, 10);
}

function todayYmdSeoulClient(): string {
  const now = new Date();
  const k = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return k.toISOString().slice(0, 10);
}

function isYm(v: string) {
  return /^\d{4}-\d{2}$/.test(v);
}

function ymToMonthStartUtc(ym: string): Date {
  const [y, m] = ym.split("-").map((n) => parseInt(n, 10));
  return new Date(Date.UTC(y, m - 1, 1));
}

function monthStartToYm(monthStart: Date): string {
  const y = monthStart.getUTCFullYear();
  const m = String(monthStart.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function parseBoolFlag(v: string | null | undefined, defaultValue: boolean): boolean {
  if (v == null || v === "") return defaultValue;
  return v !== "0";
}

function startOfMonthUtc(dt: Date): Date {
  return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), 1));
}

function endOfMonthUtc(monthStart: Date): Date {
  // 다음 달 0일 = 이번 달 말일
  return new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0));
}

function addMonthsUtc(monthStart: Date, delta: number): Date {
  return new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + delta, 1));
}

function gridStartMondayUtc(monthStart: Date): Date {
  const dow = monthStart.getUTCDay(); // 0..6 (Sun..Sat)
  const shift = (dow + 6) % 7; // Monday 기준
  const d = new Date(monthStart);
  d.setUTCDate(d.getUTCDate() - shift);
  return d;
}

function weekdayLabel(ymd: string): string {
  const dt = ymdToUtcDate(ymd);
  const k = dt.getUTCDay();
  const map = ["일", "월", "화", "수", "목", "금", "토"];
  return map[k] ?? "";
}

function statusBadge(status?: RequestStatus) {
  if (!status) return null;

  const base = "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold";

  if (status === "승인") {
    return <span className={cn(base, "border-emerald-200 bg-emerald-50 text-emerald-700")}>{status}</span>;
  }

  if (status === "접수" || status === "검토중") {
    return <span className={cn(base, "border-amber-200 bg-amber-50 text-amber-800")}>{status}</span>;
  }

  if (status === "반려" || status === "취소") {
    return <span className={cn(base, "border-rose-200 bg-rose-50 text-rose-700")}>{status}</span>;
  }

  if (status === "완료") {
    return <span className={cn(base, "border-slate-200 bg-slate-100 text-slate-700")}>{status}</span>;
  }

  return <span className={cn(base, "border-gray-200 bg-gray-50 text-gray-700")}>{status}</span>;
}

function kindBadge(kind: CalendarKind) {
  const base = "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold";
  if (kind === "schedule") {
    return <span className={cn(base, "border-indigo-200 bg-indigo-50 text-indigo-700")}>정규수업</span>;
  }
  if (kind === "block") {
    return <span className={cn(base, "border-gray-200 bg-gray-50 text-gray-700")}>차단</span>;
  }
  return null;
}

function kindWeight(k: CalendarKind): number {
  if (k === "request") return 0;
  if (k === "schedule") return 1;
  return 2;
}

export default function CalendarClient({
  initialYmd,
  category: categoryProp,
}: {
  initialYmd: string;
  category?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const syncingFromUrlRef = useRef(false);

  const init = isYmd(initialYmd) ? initialYmd : todayYmdSeoulClient();

  const normalized = normalizeRoomCategory(categoryProp);
  // 우리동네 갤러리 포함: 카테고리별 룸/블록/수업/신청을 동일한 캘린더 UX로 확인합니다.
  const category = normalized;
  const isStudio = category === "studio";

  const floors = useMemo(() => {
    return isStudio ? FLOORS.filter((f) => f.id === "5") : FLOORS;
  }, [isStudio]);

  const roomsInCategory = useMemo(() => {
    return getRoomsByCategory(category);
  }, [category]);

  // 스튜디오(또는 단일 룸 카테고리)에서는 기본 룸을 자동 선택합니다.
  const preferredRoomId = useMemo(() => {
    if (roomsInCategory.length === 0) return "all";
    if (category === "studio") {
      // 현재 E-스튜디오 roomId = "media"
      const studio = roomsInCategory.find((r) => r.id === "media") ?? roomsInCategory[0];
      return studio?.id ?? "all";
    }
    // 카테고리 내 룸이 1개면 자동 선택 (향후 확장 대비)
    if (roomsInCategory.length === 1) return roomsInCategory[0].id;
    return "all";
  }, [category, roomsInCategory]);

  const allowedRoomIds = useMemo(() => {
    return new Set(roomsInCategory.map((r) => r.id));
  }, [roomsInCategory]);

  const readNormalizedParams = () => {
    const sp = searchParams;

    // date/month
    const rawDate = String(sp.get("date") ?? "").trim();
    const safeDate = isYmd(rawDate) ? rawDate : init;

    const rawMonth = String(sp.get("month") ?? "").trim();
    const safeMonthStart = isYm(rawMonth) ? ymToMonthStartUtc(rawMonth) : startOfMonthUtc(ymdToUtcDate(safeDate));

    // floor/room
    const rawFloor = String(sp.get("floorId") ?? "").trim();
    const safeFloor = isStudio
      ? "5"
      : rawFloor === "all" || FLOORS.some((f) => f.id === rawFloor)
        ? rawFloor || "all"
        : "all";

    const rawRoom = String(sp.get("roomId") ?? "").trim();
    let safeRoom = rawRoom || "all";
    if (safeRoom !== "all" && !allowedRoomIds.has(safeRoom)) safeRoom = "all";
    if (isStudio && (safeRoom === "all" || !allowedRoomIds.has(safeRoom))) {
      safeRoom = preferredRoomId;
    }

    // status
    const rawStatus = String(sp.get("status") ?? "").trim();
    const allowedStatus = new Set([
      "active",
      "승인",
      "접수",
      "검토중",
      "반려",
      "취소",
      "완료",
      "all",
    ]);
    const safeStatus = allowedStatus.has(rawStatus) ? rawStatus : "active";

    // flags
    const safeBlocks = parseBoolFlag(sp.get("blocks"), true);
    const safeSchedules = parseBoolFlag(sp.get("schedules"), true);

    return {
      floorId: safeFloor,
      roomId: safeRoom,
      status: safeStatus,
      showBlocks: safeBlocks,
      showSchedules: safeSchedules,
      selectedDate: safeDate,
      monthStart: safeMonthStart,
    };
  };

  const [floorId, setFloorId] = useState<string>(() => readNormalizedParams().floorId);
  const [roomId, setRoomId] = useState<string>(() => readNormalizedParams().roomId);
  const [status, setStatus] = useState<string>(() => readNormalizedParams().status);
  const [showBlocks, setShowBlocks] = useState<boolean>(() => readNormalizedParams().showBlocks);
  const [showSchedules, setShowSchedules] = useState<boolean>(() => readNormalizedParams().showSchedules);

  const [monthStart, setMonthStart] = useState<Date>(() => readNormalizedParams().monthStart);
  const [selectedDate, setSelectedDate] = useState<string>(() => readNormalizedParams().selectedDate);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<CalendarItem[]>([]);

  // URL → State 동기화 (새로고침/공유 링크/탭 이동 후에도 필터 유지)
  useEffect(() => {
    const next = readNormalizedParams();
    syncingFromUrlRef.current = true;

    if (floorId !== next.floorId) setFloorId(next.floorId);
    if (roomId !== next.roomId) setRoomId(next.roomId);
    if (status !== next.status) setStatus(next.status);
    if (showBlocks !== next.showBlocks) setShowBlocks(next.showBlocks);
    if (showSchedules !== next.showSchedules) setShowSchedules(next.showSchedules);
    if (selectedDate !== next.selectedDate) setSelectedDate(next.selectedDate);
    if (monthStart.getTime() !== next.monthStart.getTime()) setMonthStart(next.monthStart);

    // 다음 tick에 해제 (router.replace로 URL 바뀔 때의 피드백 루프 방지)
    queueMicrotask(() => {
      syncingFromUrlRef.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, category, isStudio, preferredRoomId, allowedRoomIds]);

  // State → URL 동기화 (필터/월/선택일을 URL에 반영해 새로고침/공유 유지)
  useEffect(() => {
    if (syncingFromUrlRef.current) return;

    const normalized = readNormalizedParams();
    const current = new URLSearchParams();
    current.set("category", category);
    current.set("floorId", normalized.floorId);
    current.set("roomId", normalized.roomId);
    current.set("status", normalized.status);
    current.set("blocks", normalized.showBlocks ? "1" : "0");
    current.set("schedules", normalized.showSchedules ? "1" : "0");
    current.set("date", normalized.selectedDate);
    current.set("month", monthStartToYm(normalized.monthStart));

    const desired = new URLSearchParams();
    desired.set("category", category);
    desired.set("floorId", floorId);
    desired.set("roomId", roomId);
    desired.set("status", status);
    desired.set("blocks", showBlocks ? "1" : "0");
    desired.set("schedules", showSchedules ? "1" : "0");
    desired.set("date", selectedDate);
    desired.set("month", monthStartToYm(monthStart));

    if (current.toString() !== desired.toString()) {
      router.replace(`${pathname}?${desired.toString()}`, { scroll: false });
    }
  }, [
    category,
    floorId,
    roomId,
    status,
    showBlocks,
    showSchedules,
    selectedDate,
    monthStart,
    pathname,
    router,
  ]);

  // 월 이동 시, 선택일이 다른 달에 머무르면 해당 월의 1일로 자연스럽게 이동
  useEffect(() => {
    if (!isYmd(selectedDate)) return;
    const dt = ymdToUtcDate(selectedDate);
    if (dt.getUTCFullYear() !== monthStart.getUTCFullYear() || dt.getUTCMonth() !== monthStart.getUTCMonth()) {
      setSelectedDate(utcDateToYmd(monthStart));
    }
  }, [monthStart, selectedDate]);

  // floor 변경 시 roomId가 floor에 맞지 않으면 reset
  useEffect(() => {
    // 카테고리 밖의 roomId가 강제로 들어오면 안전하게 초기화
    if (roomId !== "all" && !allowedRoomIds.has(roomId)) {
      setRoomId("all");
      return;
    }

    // 층 필터가 걸려있을 때, 다른 층 roomId가 남아있지 않도록 정리
    if (floorId === "all") return;
    if (roomId === "all") return;
    const meta = (ROOMS_BY_ID as any)[roomId] as { floor?: string } | undefined;
    if (!meta?.floor || meta.floor !== floorId) {
      setRoomId("all");
    }
  }, [floorId, roomId, allowedRoomIds]);

  const range = useMemo(() => {
    const from = utcDateToYmd(monthStart);
    const to = utcDateToYmd(endOfMonthUtc(monthStart));
    return { from, to };
  }, [monthStart]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);

      try {
        const qs = new URLSearchParams();
        qs.set("from", range.from);
        qs.set("to", range.to);
        qs.set("category", category);
        qs.set("roomId", roomId);
        qs.set("floorId", floorId);
        qs.set("status", status);
        qs.set("blocks", showBlocks ? "1" : "0");
        qs.set("schedules", showSchedules ? "1" : "0");

        const res = await fetch(`/api/admin/calendar?${qs.toString()}`, { cache: "no-store" });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `HTTP ${res.status}`);
        }

        const data = (await res.json()) as CalendarResponse;
        if (!data.ok) throw new Error("캘린더 데이터를 불러오지 못했습니다.");

        if (!cancelled) {
          const raw = Array.isArray(data.items) ? data.items : [];
          // 카테고리 외 요청은 숨김(단, "all"은 공통 차단/시간표로 간주하여 유지)
          const filtered = raw.filter((it: any) => it?.roomId === "all" || allowedRoomIds.has(String(it?.roomId)));
          setItems(filtered);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ? String(e.message) : "알 수 없는 오류");
          setItems([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [range.from, range.to, category, roomId, floorId, status, showBlocks, showSchedules, allowedRoomIds]);

  const itemsByDate = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const it of items) {
      const arr = map.get(it.date) ?? [];
      arr.push(it);
      map.set(it.date, arr);
    }

    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => {
        if (a.startTime !== b.startTime) return a.startTime.localeCompare(b.startTime);
        const kw = kindWeight(a.kind) - kindWeight(b.kind);
        if (kw !== 0) return kw;
        return `${a.roomName} ${a.id}`.localeCompare(`${b.roomName} ${b.id}`);
      });
      map.set(k, arr);
    }

    return map;
  }, [items]);

  const gridDays = useMemo(() => {
    const start = gridStartMondayUtc(monthStart);
    const out: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + i);
      out.push(d);
    }
    return out;
  }, [monthStart]);

  const today = todayYmdSeoulClient();

  const selectedItems = itemsByDate.get(selectedDate) ?? [];

  const roomOptions = useMemo(() => {
    const base = [{ id: "all", name: "전체" }];
    // 카테고리별 강의실만 노출
    const list = roomsInCategory
      .filter((r) => (floorId === "all" ? true : r.floor === (floorId as any)))
      .map((r) => ({ id: r.id, name: r.name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return base.concat(list);
  }, [floorId, roomsInCategory]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-white p-4 shadow">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div>
            <label className="text-sm font-medium">층</label>
            <select
              value={floorId}
              onChange={(e) => setFloorId(e.target.value)}
              className="mt-1 w-full rounded-xl border px-3 py-2"
              disabled={isStudio}
            >
              {!isStudio ? <option value="all">전체</option> : null}
              {floors.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium">강의실</label>
            <select
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className="mt-1 w-full rounded-xl border px-3 py-2"
            >
              {roomOptions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium">상태</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="mt-1 w-full rounded-xl border px-3 py-2"
            >
              <option value="active">예약 진행(접수/검토중/승인)</option>
              <option value="승인">승인</option>
              <option value="접수">접수</option>
              <option value="검토중">검토중</option>
              <option value="반려">반려</option>
              <option value="취소">취소</option>
              <option value="완료">완료</option>
              <option value="all">전체</option>
            </select>
          </div>

          <div className="flex flex-col justify-end gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={showSchedules}
                  onChange={(e) => setShowSchedules(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                정규수업
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={showBlocks}
                  onChange={(e) => setShowBlocks(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                차단시간
              </label>
            </div>

            <p className="text-xs text-gray-500">표시 범위: {range.from} ~ {range.to}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMonthStart((d) => addMonthsUtc(d, -1))}
              className="rounded-full border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--brand-primary))] focus-visible:ring-offset-2"
            >
              이전
            </button>
            <button
              type="button"
              onClick={() => setMonthStart((d) => startOfMonthUtc(ymdToUtcDate(today)))}
              className="rounded-full border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--brand-primary))] focus-visible:ring-offset-2"
            >
              이번 달
            </button>
            <button
              type="button"
              onClick={() => setMonthStart((d) => addMonthsUtc(d, 1))}
              className="rounded-full border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--brand-primary))] focus-visible:ring-offset-2"
            >
              다음
            </button>
          </div>

          <div className="text-sm font-semibold text-gray-800">
            {monthStart.getUTCFullYear()}년 {monthStart.getUTCMonth() + 1}월
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="mt-4 rounded-xl border bg-slate-50 p-4 text-sm text-gray-600">불러오는 중…</div>
        ) : null}
      </div>

      <div className="rounded-xl bg-white p-4 shadow">
        <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold text-gray-600">
          {[
            "월",
            "화",
            "수",
            "목",
            "금",
            "토",
            "일"
          ].map((d) => (
            <div key={d} className={cn("py-2", d === "토" ? "text-blue-600" : d === "일" ? "text-rose-600" : "")}>{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-2">
          {gridDays.map((d) => {
            const ymd = utcDateToYmd(d);
            const inMonth = d.getUTCMonth() === monthStart.getUTCMonth();
            const isToday = ymd === today;
            const isSelected = ymd === selectedDate;

            const dayItems = (itemsByDate.get(ymd) ?? []).slice();
            dayItems.sort((a, b) => {
              const kw = kindWeight(a.kind) - kindWeight(b.kind);
              if (kw !== 0) return kw;
              if (a.startTime !== b.startTime) return a.startTime.localeCompare(b.startTime);
              return `${a.roomName} ${a.id}`.localeCompare(`${b.roomName} ${b.id}`);
            });

            const preview = dayItems.slice(0, 3);
            const more = dayItems.length - preview.length;

            return (
              <button
                key={ymd}
                type="button"
                onClick={() => setSelectedDate(ymd)}
                className={cn(
                  "min-h-[106px] rounded-2xl border p-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--brand-primary))] focus-visible:ring-offset-2",
                  inMonth ? "bg-white" : "bg-slate-50",
                  isSelected ? "border-[rgb(var(--brand-primary))]" : "border-gray-200",
                  "hover:bg-gray-50"
                )}
                aria-current={isSelected ? "date" : undefined}
              >
                <div className="flex items-center justify-between">
                  <div className={cn("text-sm font-semibold", inMonth ? "text-gray-900" : "text-gray-400")}>
                    {d.getUTCDate()}
                  </div>
                  {isToday ? (
                    <span className="inline-flex h-2 w-2 rounded-full bg-[rgb(var(--brand-primary))]" aria-label="오늘" />
                  ) : null}
                </div>

                <div className="mt-2 space-y-1">
                  {preview.map((it) => (
                    <div
                      key={it.id}
                      className={cn(
                        "truncate rounded-lg border px-2 py-1 text-[11px]",
                        it.kind === "request"
                          ? it.status === "승인"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : "border-amber-200 bg-amber-50 text-amber-900"
                          : it.kind === "schedule"
                            ? "border-indigo-200 bg-indigo-50 text-indigo-800"
                            : "border-gray-200 bg-gray-50 text-gray-700"
                      )}
                      title={
                        it.kind === "request"
                          ? it.roomId === "gallery"
                            ? `하루 전체 ${it.roomName} (${it.isPrepDay ? "준비일" : "전시일"}) (${it.status}) ${it.applicantName ?? ""}`
                            : `${it.startTime}-${it.endTime} ${it.roomName} (${it.status}) ${it.applicantName ?? ""}`
                          : it.kind === "block" && it.roomId === "gallery"
                            ? `하루 전체 ${it.roomName} ${it.title}`
                            : `${it.startTime}-${it.endTime} ${it.roomName} ${it.title}`
                      }
                    >
                      <span className="font-semibold">
                        {it.roomId === "gallery" && (it.kind === "block" || it.kind === "request") ? "하루 전체" : it.startTime}
                      </span>{" "}
                      {it.roomName}
                      {it.kind === "request" ? (
                        it.roomId === "gallery" ? (
                          <span className="ml-1">· {it.isPrepDay ? "준비일" : "전시일"} · {it.status}</span>
                        ) : (
                          <span className="ml-1">· {it.status}</span>
                        )
                      ) : (
                        <span className="ml-1">· {it.title}</span>
                      )}
                    </div>
                  ))}
                  {more > 0 ? (
                    <div className="text-[11px] text-gray-500">+{more}건 더보기</div>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-xs text-gray-600">
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> 승인
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-400" /> 접수/검토중
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-indigo-400" /> 정규수업
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-gray-400" /> 차단시간
          </span>
        </div>
      </div>

      <div className="rounded-xl bg-white p-4 shadow">
        <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              {selectedDate} ({weekdayLabel(selectedDate)}) 일정
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              예약(신청) 항목을 클릭하면 상세/승인/메일/엑셀 흐름으로 이동합니다.
            </p>
          </div>

          <div className="text-sm text-gray-700">
            총 {selectedItems.length}건
          </div>
        </div>

        {selectedItems.length === 0 ? (
          <div className="mt-4 rounded-xl border bg-slate-50 p-4 text-sm text-gray-600">등록된 일정이 없습니다.</div>
        ) : (
          <div className="mt-4 divide-y rounded-xl border">
            {selectedItems.map((it) => {
              const time = it.roomId === "gallery" && (it.kind === "block" || it.kind === "request")
                ? "하루 전체"
                : `${it.startTime}-${it.endTime}`;
              const bundleText = it.kind === "request" && it.batchId
                ? `묶음 ${it.batchSeq ?? "?"}/${it.batchSize ?? "?"}`
                : null;

              return (
                <div key={it.id} className="flex flex-col gap-2 p-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="w-24 shrink-0 text-sm font-semibold text-gray-900">{time}</div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="truncate text-sm font-semibold text-gray-900">{it.roomName}</div>
                        {it.kind === "request" ? statusBadge(it.status) : kindBadge(it.kind)}
                        {bundleText ? (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                            {bundleText}
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-1 text-xs text-gray-600">
                        {it.kind === "request" ? (
                          <>
                            <span className="font-medium">{it.applicantName}</span>
                            {it.phone ? <span className="ml-2">({it.phone})</span> : null}
                            {it.roomId === "gallery" ? (
                              <span className="ml-2">· {it.isPrepDay ? "준비일" : "전시일"}</span>
                            ) : null}
                          </>
                        ) : it.kind === "block" ? (
                          <>
                            <span className="font-medium">{it.title}</span>
                            {it.reason ? <span className="ml-2">· {it.reason}</span> : null}
                          </>
                        ) : (
                          <>
                            <span className="font-medium">{it.title}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {it.kind === "request" ? (
                      <Link
                        href={`/admin/requests/${encodeURIComponent(it.id)}?category=${encodeURIComponent(category)}`}
                        className="rounded-full bg-[rgb(var(--brand-primary))] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--brand-primary))] focus-visible:ring-offset-2"
                      >
                        상세 보기
                      </Link>
                    ) : (
                      <Link
                        href={`/admin/settings?category=${encodeURIComponent(category)}`}
                        className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--brand-primary))] focus-visible:ring-offset-2"
                      >
                        설정 이동
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
