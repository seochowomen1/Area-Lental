"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

const DOW_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

export default function SettingsClient(props: {
  rooms: Room[];
  dayOptions: DayOption[];
  initialSchedules: ClassSchedule[];
  initialBlocks: BlockTime[];
  category?: string;
}) {
  const router = useRouter();
  const isGallery = props.category === "gallery";
  const spaceLabel = isGallery ? "공간" : props.category === "studio" ? "공간" : "강의실";

  const [schedules, setSchedules] = useState<ClassSchedule[]>(props.initialSchedules);
  const [blocks, setBlocks] = useState<BlockTime[]>(props.initialBlocks);
  const [toast, setToast] = useState<ToastState>(null);

  const [highlightId, setHighlightId] = useState<string | null>(null);
  const highlightTimer = useRef<number | null>(null);
  const highlight = (id: string) => {
    setHighlightId(id);
    if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
    highlightTimer.current = window.setTimeout(() => setHighlightId(null), 2500);
  };
  useEffect(() => () => { if (highlightTimer.current) window.clearTimeout(highlightTimer.current); }, []);

  const [submitting, setSubmitting] = useState<null | "schedule" | "block" | "delete">(null);

  // 펼치기/접기 상태
  const [scheduleFormOpen, setScheduleFormOpen] = useState(false);
  const [blockFormOpen, setBlockFormOpen] = useState(false);

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
    const isTue = dow === 2;
    const hours = isSat ? "09:00~13:00" : isTue ? "09:00~20:00" : "09:00~18:00";
    const dayLabel = isSat ? "토" : isTue ? "화" : "평일";

    return (
      <div className="space-y-0.5">
        <div className="font-semibold text-slate-900">하루 전체</div>
        <div className="text-xs text-slate-500">운영시간({dayLabel}): {hours}</div>
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
      setScheduleFormOpen(false);
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
      setToast({ type: "success", message: isGallery ? "내부 대관 일정이 등록되었습니다." : "차단시간이 등록되었습니다." });
      setBlockFormOpen(false);
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

      {/* 정규 수업시간 섹션 — 갤러리에서는 숨김 */}
      {!isGallery && (
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">정규 수업시간</h2>
                <p className="mt-0.5 text-xs text-slate-500">등록된 시간에는 대관 신청이 차단됩니다</p>
              </div>
              <button
                type="button"
                onClick={() => setScheduleFormOpen((v) => !v)}
                className="rounded-full bg-[rgb(var(--brand-primary))] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-95"
              >
                {scheduleFormOpen ? "닫기" : "+ 새 수업시간"}
              </button>
            </div>
          </div>

          {scheduleFormOpen && (
            <div className="border-b border-slate-100 bg-blue-50/30 px-5 py-5">
              <AdminScheduleForm
                rooms={props.rooms}
                dayOptions={props.dayOptions}
                isSubmitting={submitting !== null}
                resetAfterSuccess={false}
                onCreate={onCreateSchedule}
                onToast={(t) => setToast(t)}
                spaceLabel={spaceLabel}
              />
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-slate-50/80 text-left text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-5 py-3">{spaceLabel}</th>
                  <th className="px-5 py-3">요일</th>
                  <th className="px-5 py-3">시간</th>
                  <th className="px-5 py-3">제목</th>
                  <th className="px-5 py-3">적용기간</th>
                  <th className="px-5 py-3 text-right">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedSchedules.length ? (
                  sortedSchedules.map((s) => (
                    <tr key={s.id} className={`transition hover:bg-slate-50/50 ${highlightRowClass(s.id)}`}>
                      <td className="px-5 py-3 font-medium">{props.rooms.find((r) => r.id === s.roomId)?.name ?? s.roomId}</td>
                      <td className="px-5 py-3">
                        <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold">
                          {DOW_LABELS[s.dayOfWeek] ?? s.dayOfWeek}
                        </span>
                      </td>
                      <td className="px-5 py-3 tabular-nums">{s.startTime}~{s.endTime}</td>
                      <td className="px-5 py-3 text-slate-600">{s.title || <span className="text-slate-400">-</span>}</td>
                      <td className="px-5 py-3 text-xs tabular-nums text-slate-600">{(s.effectiveFrom || "-") + " ~ " + (s.effectiveTo || "-")}</td>
                      <td className="px-5 py-3 text-right">
                        <button
                          type="button"
                          disabled={submitting !== null}
                          onClick={() => onDeleteSchedule(s.id)}
                          className="rounded-full border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-600 shadow-sm transition hover:bg-rose-50 disabled:opacity-50"
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-5 py-8 text-center text-slate-400" colSpan={6}>등록된 수업시간이 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {sortedSchedules.length > 0 && (
            <div className="border-t border-slate-100 bg-slate-50/50 px-5 py-2.5 text-xs text-slate-500">
              총 {sortedSchedules.length}건 등록
            </div>
          )}
        </section>
      )}

      {/* 내부 대관 일정 / 수동 차단 시간 섹션 */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {isGallery ? "내부 대관 일정" : "내부 대관 일정 (수동 차단)"}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {isGallery
                  ? "내부(강사·수강생) 대관 일정을 등록하면 외부 대관 신청이 차단됩니다"
                  : "특정 날짜/시간을 수동으로 차단합니다"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setBlockFormOpen((v) => !v)}
              className="rounded-full bg-[rgb(var(--brand-primary))] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-95"
            >
              {blockFormOpen ? "닫기" : isGallery ? "+ 내부 대관 일정 추가" : "+ 새 차단시간"}
            </button>
          </div>
        </div>

        {blockFormOpen && (
          <div className="border-b border-slate-100 bg-amber-50/30 px-5 py-5">
            <AdminBlockForm
              rooms={props.rooms}
              isSubmitting={submitting !== null}
              resetAfterSuccess={false}
              onCreate={onCreateBlock}
              onToast={(t) => setToast(t)}
              spaceLabel={spaceLabel}
              category={props.category}
            />
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-slate-50/80 text-left text-xs font-semibold text-slate-600">
              <tr>
                <th className="px-5 py-3">{spaceLabel}</th>
                <th className="px-5 py-3">{isGallery ? "기간" : "날짜"}</th>
                {!isGallery && <th className="px-5 py-3">시간</th>}
                <th className="px-5 py-3">사유</th>
                <th className="px-5 py-3 text-right">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedBlocks.length ? (
                sortedBlocks.map((b) => (
                  <tr key={b.id} className={`transition hover:bg-slate-50/50 ${highlightRowClass(b.id)}`}>
                    <td className="px-5 py-3 font-medium">{props.rooms.find((r) => r.id === b.roomId)?.name ?? b.roomId}</td>
                    <td className="px-5 py-3 tabular-nums">
                      {isGallery ? (
                        <span>
                          {b.date}
                          {b.endDate && b.endDate !== b.date ? ` ~ ${b.endDate}` : ""}
                        </span>
                      ) : (
                        <>
                          {b.date}
                          <span className="ml-1.5 text-xs text-slate-500">({DOW_LABELS[dayOfWeek(b.date)] ?? ""})</span>
                        </>
                      )}
                    </td>
                    {!isGallery && <td className="px-5 py-3">{renderBlockTime(b)}</td>}
                    <td className="px-5 py-3 text-slate-600">{b.reason || <span className="text-slate-400">-</span>}</td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        disabled={submitting !== null}
                        onClick={() => onDeleteBlock(b.id)}
                        className="rounded-full border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-600 shadow-sm transition hover:bg-rose-50 disabled:opacity-50"
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-5 py-8 text-center text-slate-400" colSpan={isGallery ? 4 : 5}>
                    {isGallery ? "등록된 내부 대관 일정이 없습니다." : "등록된 차단시간이 없습니다."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {sortedBlocks.length > 0 && (
          <div className="border-t border-slate-100 bg-slate-50/50 px-5 py-2.5 text-xs text-slate-500">
            총 {sortedBlocks.length}건 등록
          </div>
        )}
      </section>

      {/* 이메일 템플릿 섹션 */}
      <EmailTemplateSection category={props.category ?? "lecture"} onToast={(t) => setToast(t)} />
    </div>
  );
}

/* ── 이메일 템플릿 편집 섹션 ── */

type EmailTemplate = { subject: string; body: string };
type TemplateStatus = "접수" | "승인" | "반려" | "취소";

const STATUS_OPTIONS: TemplateStatus[] = ["접수", "승인", "반려", "취소"];

const TEMPLATE_VARS_HELP = "사용 가능 변수: {{신청번호}}, {{공간}}, {{카테고리}}, {{일시}}, {{신청자}}, {{상태}}, {{요금정보}}, {{반려사유}}, {{조회링크}}, {{장비정보}}";

function EmailTemplateSection({
  category,
  onToast,
}: {
  category: string;
  onToast: (t: { type: "success" | "error"; message: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<TemplateStatus>("승인");
  const [templates, setTemplates] = useState<Record<string, EmailTemplate> | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const catId = category === "studio" ? "studio" : category === "gallery" ? "gallery" : "lecture";

  const loadTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/email-templates");
      const data = await res.json();
      if (data.ok && data.templates?.[catId]) {
        setTemplates(data.templates[catId]);
        const tpl = data.templates[catId][selectedStatus];
        if (tpl) {
          setSubject(tpl.subject);
          setBody(tpl.body);
        }
        setLoaded(true);
      }
    } catch {
      // ignore
    }
  }, [catId, selectedStatus]);

  useEffect(() => {
    if (open && !loaded) {
      loadTemplates();
    }
  }, [open, loaded, loadTemplates]);

  useEffect(() => {
    if (templates && templates[selectedStatus]) {
      setSubject(templates[selectedStatus].subject);
      setBody(templates[selectedStatus].body);
    }
  }, [selectedStatus, templates]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/email-templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: catId, status: selectedStatus, subject, body }),
      });
      const data = await res.json();
      if (data.ok) {
        // Update local cache
        setTemplates((prev) => ({ ...prev, [selectedStatus]: { subject, body } }));
        onToast({ type: "success", message: `${selectedStatus} 메일 템플릿이 저장되었습니다.` });
      } else {
        onToast({ type: "error", message: data.message || "저장 실패" });
      }
    } catch {
      onToast({ type: "error", message: "저장 중 오류가 발생했습니다." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">메일 템플릿</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              접수/승인/반려/취소 시 발송되는 메일 기본 내용을 수정합니다
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-full bg-[rgb(var(--brand-primary))] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-95"
          >
            {open ? "닫기" : "템플릿 편집"}
          </button>
        </div>
      </div>

      {open && (
        <div className="px-5 py-5 space-y-4">
          {/* 상태 선택 탭 */}
          <div className="flex gap-2">
            {STATUS_OPTIONS.map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setSelectedStatus(st)}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                  selectedStatus === st
                    ? "bg-slate-900 text-white"
                    : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          {/* 제목 */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">메일 제목</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300"
            />
          </div>

          {/* 본문 */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">메일 본문</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={14}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300"
            />
            <p className="mt-1 text-xs text-slate-400">{TEMPLATE_VARS_HELP}</p>
          </div>

          {/* 저장 버튼 */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-black disabled:opacity-60"
            >
              {saving ? "저장 중..." : "템플릿 저장"}
            </button>
            <span className="text-xs text-slate-500">
              * 저장 후 승인/반려/취소 시 해당 템플릿이 메일 팝업에 표시됩니다.
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
