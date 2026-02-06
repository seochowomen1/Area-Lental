"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import AdminScheduleForm from "@/components/admin/AdminScheduleForm";
import AdminBlockForm from "@/components/admin/AdminBlockForm";
import ToastBanner from "@/components/ToastBanner";

import type { BlockTime, ClassSchedule, Room } from "@/lib/types";
import { dayOfWeek } from "@/lib/datetime";

type DayOption = { value: number; label: string };

type ToastState =
  | { type: "success" | "error"; message: string }
  | null;

export default function SettingsClient(props: {
  rooms: Room[];
  dayOptions: DayOption[];
  initialSchedules: ClassSchedule[];
  initialBlocks: BlockTime[];
}) {
  const router = useRouter();

  const [schedules, setSchedules] = useState<ClassSchedule[]>(props.initialSchedules);
  const [blocks, setBlocks] = useState<BlockTime[]>(props.initialBlocks);
  const [toast, setToast] = useState<ToastState>(null);

  // 최근 등록 row 하이라이트
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const highlightTimer = useRef<number | null>(null);
  const highlight = (id: string) => {
    setHighlightId(id);
    if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
    highlightTimer.current = window.setTimeout(() => setHighlightId(null), 2500);
  };
  useEffect(() => () => highlightTimer.current && window.clearTimeout(highlightTimer.current), []);

  const [submitting, setSubmitting] = useState<null | "schedule" | "block" | "delete">(null);

  const sortedSchedules = useMemo(() => {
    return [...schedules].sort((a, b) => {
      if (a.roomId !== b.roomId) return a.roomId.localeCompare(b.roomId);
      if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
      return a.startTime.localeCompare(b.startTime);
    });
  }, [schedules]);

  const sortedBlocks = useMemo(() => {
    return [...blocks].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.roomId !== b.roomId) return a.roomId.localeCompare(b.roomId);
      return a.startTime.localeCompare(b.startTime);
    });
  }, [blocks]);

  function renderBlockTime(block: BlockTime) {
    if (block.roomId !== "gallery") {
      return <span>{block.startTime}~{block.endTime}</span>;
    }

    const dow = dayOfWeek(block.date);
    const isSat = dow === 6;
    const hours = isSat ? "09:00~13:00" : "10:00~18:00";

    return (
      <div className="space-y-0.5">
        <div className="font-semibold text-slate-900">하루 전체</div>
        <div className="text-xs text-slate-500">운영시간({isSat ? "토" : "평일"}): {hours}</div>
      </div>
    );
  }

  async function apiJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
    const res = await fetch(input, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) {
      const msg = data?.message || `요청 실패 (${res.status})`;
      throw new Error(msg);
    }
    return data as T;
  }

  async function onCreateSchedule(payload: Omit<ClassSchedule, "id">) {
    setSubmitting("schedule");
    try {
      const data = await apiJson<{ ok: true; created: ClassSchedule }>("/api/admin/class-schedules", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      setSchedules((prev) => [data.created, ...prev]);
      highlight(data.created.id);
      setToast({ type: "success", message: "수업시간이 등록되었습니다." });
      router.refresh();
      return data.created.id;
    } catch (err: any) {
      setToast({ type: "error", message: err?.message ?? "등록에 실패했습니다." });
    } finally {
      setSubmitting(null);
    }
  }

  async function onCreateBlock(payload: Omit<BlockTime, "id">) {
    setSubmitting("block");
    try {
      const data = await apiJson<{ ok: true; created: BlockTime }>("/api/admin/blocks", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      setBlocks((prev) => [data.created, ...prev]);
      highlight(data.created.id);
      setToast({ type: "success", message: "차단시간이 등록되었습니다." });
      router.refresh();
      return data.created.id;
    } catch (err: any) {
      setToast({ type: "error", message: err?.message ?? "등록에 실패했습니다." });
    } finally {
      setSubmitting(null);
    }
  }

  async function onDeleteSchedule(id: string) {
    if (!confirm("해당 수업시간을 삭제할까요?")) return;
    setSubmitting("delete");
    try {
      await apiJson<{ ok: true }>(`/api/admin/class-schedules?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      setSchedules((prev) => prev.filter((s) => s.id !== id));
      setToast({ type: "success", message: "삭제되었습니다." });
      router.refresh();
    } catch (err: any) {
      setToast({ type: "error", message: err?.message ?? "삭제에 실패했습니다." });
    } finally {
      setSubmitting(null);
    }
  }

  async function onDeleteBlock(id: string) {
    if (!confirm("해당 차단시간을 삭제할까요?")) return;
    setSubmitting("delete");
    try {
      await apiJson<{ ok: true }>(`/api/admin/blocks?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      setBlocks((prev) => prev.filter((b) => b.id !== id));
      setToast({ type: "success", message: "삭제되었습니다." });
      router.refresh();
    } catch (err: any) {
      setToast({ type: "error", message: err?.message ?? "삭제에 실패했습니다." });
    } finally {
      setSubmitting(null);
    }
  }

  const highlightRowClass = (id: string) =>
    id === highlightId
      ? "bg-[rgb(var(--brand-primary)/0.06)] ring-2 ring-[rgb(var(--brand-primary)/0.35)]"
      : "";

  return (
    <div className="space-y-6">
      {toast ? (
        <div className="no-print">
          <ToastBanner
            type={toast.type}
            message={toast.message}
            onClose={() => setToast(null)}
            autoHideMs={3000}
          />
        </div>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">정규 수업시간(신청 차단)</h2>
        </div>

        <AdminScheduleForm
          rooms={props.rooms}
          dayOptions={props.dayOptions}
          isSubmitting={submitting !== null}
          resetAfterSuccess={false}
          onCreate={onCreateSchedule}
          onToast={(t) => setToast(t)}
        />

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <div className="text-sm font-semibold text-slate-900">등록 목록</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-gray-600">
                <tr>
                  <th className="px-5 py-3">강의실</th>
                  <th className="px-5 py-3">요일</th>
                  <th className="px-5 py-3">시간</th>
                  <th className="px-5 py-3">제목</th>
                  <th className="px-5 py-3">기간</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {sortedSchedules.length ? (
                  sortedSchedules.map((s) => (
                    <tr key={s.id} className={`border-t border-slate-100 ${highlightRowClass(s.id)}`}>
                      <td className="px-5 py-3">{props.rooms.find((r) => r.id === s.roomId)?.name ?? s.roomId}</td>
                      <td className="px-5 py-3">{props.dayOptions.find((d) => d.value === s.dayOfWeek)?.label ?? s.dayOfWeek}</td>
                      <td className="px-5 py-3">{s.startTime}~{s.endTime}</td>
                      <td className="px-5 py-3">{s.title || "-"}</td>
                      <td className="px-5 py-3">{(s.effectiveFrom || "-") + " ~ " + (s.effectiveTo || "-")}</td>
                      <td className="px-5 py-3 text-right">
                        <button
                          type="button"
                          disabled={submitting !== null}
                          onClick={() => onDeleteSchedule(s.id)}
                          className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-50"
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-5 py-6 text-gray-500" colSpan={6}>등록된 수업시간이 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">수동 차단 시간(신청 차단)</h2>
        </div>

        <AdminBlockForm
          rooms={props.rooms}
          isSubmitting={submitting !== null}
          resetAfterSuccess={false}
          onCreate={onCreateBlock}
          onToast={(t) => setToast(t)}
        />

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <div className="text-sm font-semibold text-slate-900">등록 목록</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-gray-600">
                <tr>
                  <th className="px-5 py-3">강의실</th>
                  <th className="px-5 py-3">날짜</th>
                  <th className="px-5 py-3">시간</th>
                  <th className="px-5 py-3">사유</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {sortedBlocks.length ? (
                  sortedBlocks.map((b) => (
                    <tr key={b.id} className={`border-t border-slate-100 ${highlightRowClass(b.id)}`}>
                      <td className="px-5 py-3">{props.rooms.find((r) => r.id === b.roomId)?.name ?? b.roomId}</td>
                      <td className="px-5 py-3">{b.date}</td>
                      <td className="px-5 py-3">{renderBlockTime(b)}</td>
                      <td className="px-5 py-3">{b.reason || "-"}</td>
                      <td className="px-5 py-3 text-right">
                        <button
                          type="button"
                          disabled={submitting !== null}
                          onClick={() => onDeleteBlock(b.id)}
                          className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-50"
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-5 py-6 text-gray-500" colSpan={5}>등록된 차단시간이 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
