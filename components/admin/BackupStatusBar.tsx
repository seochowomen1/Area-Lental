"use client";

import { useState } from "react";
import { adminErrorText, adminFetch } from "@/lib/adminFetch";

// lib/backup.ts BACKUP_DELETE_MAX와 같은 값 (서버 모듈을 클라이언트에 끌어오지 않으려고 따로 둠)
const BACKUP_DELETE_MAX = 31;

/**
 * 설정 화면 맨 위 — 시트 백업 상태 줄 + 30일 지난 백업 정리 + 저장소 재검토 기준 줄 (audit-fix-3 3-1 · 01_spec ③ 3-1)
 * - [지금 백업] POST /api/admin/backup/run · 목록 GET /api/admin/backup/list · 정리 DELETE /api/admin/backup
 * - 정리: [목록 보고 정리] → 최신 목록을 다시 받아 파일 이름·건수 표시 → [N개 삭제] → 그 목록만 삭제(자동 삭제 없음)
 */

export type BackupStatusProps = {
  configured: boolean;
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  failedSinceSuccess: boolean;
  count: number;
  old: Array<{ fileId: string; name: string }>;
  folderUrl: string | null;
  listError: boolean;
  /** 재검토 기준 줄 */
  requestRows: number;
  duplicateCancelled: number;
};

type ListResponse = {
  ok: boolean;
  configured: boolean;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  failedSinceSuccess: boolean;
  count: number;
  folderUrl: string | null;
  listError: boolean;
  items: Array<{ fileId: string; name: string; createdAt: string; olderThan30d: boolean }>;
};

const DOW = ["일", "월", "화", "수", "목", "금", "토"];

/** epoch ms → "10월 28일(수) 04:00" (KST) */
function koDateTime(ms: number): string {
  const k = new Date(ms + 9 * 3600 * 1000);
  const hh = String(k.getUTCHours()).padStart(2, "0");
  const mm = String(k.getUTCMinutes()).padStart(2, "0");
  return `${k.getUTCMonth() + 1}월 ${k.getUTCDate()}일(${DOW[k.getUTCDay()]}) ${hh}:${mm}`;
}

const RUN_FAIL = "백업하지 못했습니다. 잠시 뒤 다시 눌러 주세요. 계속 실패하면 드라이브 연결을 확인해야 합니다.";
const BTN =
  "inline-flex min-h-[44px] items-center justify-center rounded-lg border px-4 text-[15px] font-semibold disabled:opacity-60";

export default function BackupStatusBar(props: BackupStatusProps) {
  const [st, setSt] = useState(props);
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const [cleanup, setCleanup] = useState<Array<{ fileId: string; name: string }> | null>(null);
  const [cleanupBusy, setCleanupBusy] = useState(false);

  async function reload(): Promise<ListResponse | null> {
    try {
      const res = await adminFetch("/api/admin/backup/list", { cache: "no-store" });
      const d = (await res.json()) as ListResponse;
      setSt((p) => ({
        ...p,
        configured: d.configured,
        lastSuccessAt: d.lastSuccessAt ? Date.parse(d.lastSuccessAt) : null,
        lastFailureAt: d.lastFailureAt ? Date.parse(d.lastFailureAt) : null,
        failedSinceSuccess: d.failedSinceSuccess,
        count: d.count,
        old: d.items.filter((i) => i.olderThan30d).map(({ fileId, name }) => ({ fileId, name })),
        folderUrl: d.folderUrl,
        listError: d.listError,
      }));
      return d;
    } catch {
      return null;
    }
  }

  async function runNow() {
    setRunning(true);
    setNote(null);
    try {
      const res = await adminFetch("/api/admin/backup/run", { method: "POST" });
      const d = (await res.json()) as { fileName?: string };
      setNote({ text: `백업했습니다: ${d.fileName ?? ""}`, tone: "ok" });
      await reload();
    } catch (e) {
      setNote({ text: adminErrorText(e, RUN_FAIL), tone: "error" });
      await reload();
    } finally {
      setRunning(false);
    }
  }

  async function openCleanup() {
    setNote(null);
    const d = await reload();
    if (!d) {
      setNote({ text: "백업 목록을 불러오지 못했습니다. 잠시 뒤 다시 눌러 주세요.", tone: "error" });
      return;
    }
    // 서버는 한 번에 BACKUP_DELETE_MAX개까지만 받는다 → 오래된 순으로 그만큼만 보여 주고 나머지는 다음 번에(검수 M-1)
    const allOld = d.items
      .filter((i) => i.olderThan30d)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const old = allOld.slice(0, BACKUP_DELETE_MAX).map(({ fileId, name }) => ({ fileId, name }));
    setCleanup(old.length ? old : null);
    if (!old.length) setNote({ text: "30일 지난 백업이 없습니다.", tone: "ok" });
    else if (allOld.length > old.length)
      setNote({ text: `30일 지난 백업 ${allOld.length}개 중 오래된 ${old.length}개를 먼저 보여 드립니다. 나머지는 삭제 후 한 번 더 정리해 주세요.`, tone: "ok" });
  }

  async function confirmCleanup() {
    if (!cleanup?.length) return;
    setCleanupBusy(true);
    try {
      const res = await adminFetch("/api/admin/backup", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileIds: cleanup.map((c) => c.fileId), confirmCount: cleanup.length }),
      });
      const d = (await res.json()) as { deleted?: number };
      setNote({ text: `백업 ${d.deleted ?? cleanup.length}개를 삭제했습니다.`, tone: "ok" });
      setCleanup(null);
    } catch (e) {
      // 409·400은 서버 문구(아무것도 지우지 않았음)를 그대로 보여 준다
      setNote({ text: e instanceof Error ? adminErrorText(e, e.message) : "삭제하지 못했습니다.", tone: "error" });
      setCleanup(null);
    } finally {
      setCleanupBusy(false);
      await reload();
    }
  }

  let line: string;
  let tone: "ok" | "warn" | "error";
  if (!st.configured) {
    line = "백업이 아직 한 번도 되지 않았습니다. Google 드라이브 연결(첨부 업로드와 같은 설정)이 필요합니다.";
    tone = "error";
  } else if (st.failedSinceSuccess && st.lastFailureAt) {
    line = `백업 실패: ${koDateTime(st.lastFailureAt)} · 마지막 성공 ${st.lastSuccessAt ? koDateTime(st.lastSuccessAt) : "없음"}`;
    tone = "error";
  } else if (!st.lastSuccessAt) {
    line = "백업이 아직 한 번도 되지 않았습니다. [지금 백업]을 눌러 첫 백업을 만들어 주세요.";
    tone = "warn";
  } else {
    line = `백업: 마지막 ${koDateTime(st.lastSuccessAt)} · 보관 ${st.count.toLocaleString("ko-KR")}개`;
    tone = "ok";
  }

  const toneCls =
    tone === "ok" ? "border-line bg-white text-ink" : tone === "warn" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-red-200 bg-red-50 text-red-800";

  return (
    <section aria-label="시트 백업" className="mb-4 space-y-2">
      <div role="status" className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-4 py-3 text-[15px] ${toneCls}`}>
        <span className="min-w-0 flex-1 font-semibold">{line}</span>
        {st.configured && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={runNow} disabled={running} className={`${BTN} border-brand bg-brand text-white hover:bg-brand-hover`}>
              {running ? "백업 중…" : "지금 백업"}
            </button>
            {st.folderUrl && !st.failedSinceSuccess && (
              <a href={st.folderUrl} target="_blank" rel="noopener noreferrer" className={`${BTN} border-line bg-white text-ink hover:bg-slate-50`}>
                백업 폴더 열기
              </a>
            )}
          </div>
        )}
      </div>

      {st.listError && st.configured && (
        <p className="px-1 text-[14px] text-slate-600">백업 목록을 읽지 못해 보관 개수가 정확하지 않을 수 있습니다.</p>
      )}

      {note && (
        <p role={note.tone === "error" ? "alert" : "status"} className={`px-1 text-[15px] font-semibold ${note.tone === "error" ? "text-red-700" : "text-ink"}`}>
          {note.text}
        </p>
      )}

      {st.old.length > 0 && !cleanup && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[15px] text-amber-900">
          <span className="min-w-0 flex-1">
            30일 지난 백업 {st.old.length}개가 있습니다. 개인정보가 들어 있으니 정리해 주세요.
          </span>
          <button type="button" onClick={openCleanup} className={`${BTN} border-amber-300 bg-white text-amber-900 hover:bg-amber-100`}>
            목록 보고 정리
          </button>
        </div>
      )}

      {cleanup && (
        <div role="alertdialog" aria-labelledby="backup-cleanup-title" className="rounded-xl border border-red-200 bg-white px-4 py-4">
          <h3 id="backup-cleanup-title" className="text-[16px] font-bold text-ink">
            백업 {cleanup.length}개 삭제
          </h3>
          <ul className="mt-2 max-h-56 space-y-1 overflow-auto rounded-lg border border-line bg-slate-50 px-3 py-2 font-mono text-[14px] text-ink">
            {cleanup.map((c) => (
              <li key={c.fileId}>{c.name}</li>
            ))}
          </ul>
          <p className="mt-2 text-[15px] text-ink">위 {cleanup.length}개 파일만 삭제합니다. 삭제한 백업은 되돌릴 수 없습니다.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => setCleanup(null)} disabled={cleanupBusy} className={`${BTN} border-line bg-white text-ink hover:bg-slate-50`}>
              취소
            </button>
            <button type="button" onClick={confirmCleanup} disabled={cleanupBusy} className={`${BTN} border-red-600 bg-red-600 text-white hover:bg-red-700`}>
              {cleanupBusy ? "삭제 중…" : `${cleanup.length}개 삭제`}
            </button>
          </div>
        </div>
      )}

      <p className="px-1 text-[14px] text-slate-600">
        신청 기록 {props.requestRows.toLocaleString("ko-KR")}행 · 재검토 기준 10,000행 · 동시 신청 자동 취소 누적 {props.duplicateCancelled.toLocaleString("ko-KR")}건(1건이 생기면 저장소 전환 검토)
      </p>
    </section>
  );
}
