import Link from "next/link";

import Notice from "@/components/ui/Notice";
import TodoList from "@/components/admin/TodoList";
import { RETENTION_YEARS } from "@/lib/config";
import { getDatabase } from "@/lib/database";
import { groupBundles } from "@/lib/payment";
import { normalizeRoomCategory, getRoom } from "@/lib/space";
import { assertAdminAuth } from "@/lib/adminAuth";
import { getBackupHealth } from "@/lib/backup";
import { todayYmdSeoul } from "@/lib/datetime";
import { buildTodoRow, bundleMatchesSearch, parseSearchQuery, sortTodoRows, type TodoRow } from "@/lib/workflow";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function categoryOfRoom(roomId: string): string {
  return normalizeRoomCategory(getRoom(roomId)?.category);
}

/**
 * 관리자 홈 = 할 일 목록 하나 (audit-fix-3 3-2 · 02_ui v2 §2-2)
 * - 묶음 단위 · 급한 순(기한 지남 → 내일 기한 → 홈페이지 마감 → 승인 → 결제 안내 → 결제 확인)
 * - 끝난 건·무료 승인·이전 방식 승인은 안 나옴
 * - `?q=` 검색: 끝난 건까지 포함 · 서버에서만 거름 · 목록 데이터에 전화번호·이메일 없음
 * - 이용일이 모두 지난 "접수" 묶음은 첫 화면을 덮지 않게 맨 아래 한 줄로만 세고, `?past=1`에서 목록으로 본다
 */
export default async function AdminHomePage({ searchParams }: { searchParams?: { q?: string; past?: string } }) {
  await assertAdminAuth();
  const db = getDatabase();
  const allRequests = await db.getAllRequests();
  // audit-fix-3 3-1: 마지막 백업 성공이 36시간을 넘으면 노란 띠 1줄 (감사로그만 읽음 · 5분 캐시 · 실패 시 띠 없음)
  const backupHealth = await getBackupHealth();

  // 보존기한(3년) 경과 건 체크
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - RETENTION_YEARS);
  const expiredCount = allRequests.filter((r) => {
    const d = new Date(r.createdAt);
    return !isNaN(d.getTime()) && d < cutoff;
  }).length;

  const todayYmd = todayYmdSeoul();
  const rawQ = (searchParams?.q ?? "").trim().slice(0, 50);
  const searching = rawQ.length > 0;
  const pastView = !searching && searchParams?.past === "1";
  const query = parseSearchQuery(rawQ);

  const rows: TodoRow[] = [];
  let pastPendingCount = 0;
  for (const sessions of groupBundles(allRequests).values()) {
    if (searching && !bundleMatchesSearch(sessions, query)) continue;
    const row = buildTodoRow(sessions, todayYmd, categoryOfRoom);
    if (!searching && row.stage === "done") continue;
    if (!searching) {
      if (row.pastPending) pastPendingCount++;
      // 첫 화면 = 이용일 지난 미처리 제외 · ?past=1 = 그것만
      if (row.pastPending !== pastView) continue;
    }
    rows.push(row);
  }
  const sorted = sortTodoRows(rows);

  return (
    <div className="space-y-4">
      {backupHealth.show && (
        <p role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[15px] font-semibold text-amber-900">
          <span>
            {backupHealth.kind === "stale"
              ? "시트 백업이 하루 넘게 되지 않았습니다. 설정에서 확인해 주세요."
              : "시트 백업이 아직 한 번도 되지 않았습니다. 설정에서 확인해 주세요."}
          </span>
          <Link href="/admin/settings" className="inline-flex min-h-[44px] items-center underline underline-offset-2">설정으로 가기</Link>
        </p>
      )}
      {expiredCount > 0 && (
        <Notice title="개인정보 보존기한 만료 안내" variant="warn">
          <p>
            보존기한(3년)이 경과된 신청 건이 <strong className="text-amber-700">{expiredCount}건</strong> 있습니다.
            개인정보보호법 제21조에 따라 파기가 필요합니다.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            기준일: {cutoff.toISOString().slice(0, 10)} 이전 접수 건
          </p>
        </Notice>
      )}

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-xl font-extrabold leading-[30px] text-ink min-[900px]:text-2xl min-[900px]:leading-8">
          {searching ? "신청 찾기" : pastView ? "이용일이 지난 미처리 신청" : "할 일"}
        </h1>
        <span className="text-base text-ink-2">
          {searching ? (
            <>
              &quot;{rawQ}&quot; · <b className="tabular-nums text-ink">{sorted.length}건</b>
            </>
          ) : pastView ? (
            <>
              <b className="tabular-nums text-ink">{sorted.length}건</b> · 반려 또는 취소로 정리해 주세요
            </>
          ) : (
            <>
              <b className="tabular-nums text-ink">{sorted.length}건</b> · 급한 순
            </>
          )}
        </span>
      </div>

      {searching && sorted.length === 0 ? (
        <div className="rounded-xl border border-line bg-white px-6 py-6 text-center text-base text-ink-2">
          <p>&quot;{rawQ}&quot;에 맞는 신청이 없습니다. 이름은 두 글자 이상, 전화번호는 뒤 4자리로 찾아 보세요.</p>
          <Link href="/admin" className="mt-3 inline-flex min-h-[44px] items-center rounded-xl border border-slate-300 bg-white px-4 text-[15px] font-semibold text-ink hover:bg-slate-50">
            검색 지우기
          </Link>
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-xl border border-line bg-white px-6 py-6 text-center text-base text-ink-2">
          {pastView ? "이용일이 지난 미처리 신청이 없습니다." : "처리할 일이 없습니다."}
        </div>
      ) : (
        <TodoList rows={sorted} />
      )}

      {/* 이용일이 지난 미처리 — 첫 화면 맨 아래 한 줄(배포 전 확인 권고 · 옛 데이터가 할 일을 덮지 않게) */}
      {!searching && !pastView && pastPendingCount > 0 && (
        <Link
          href="/admin?past=1"
          className="flex min-h-[44px] flex-wrap items-center gap-x-2 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-3 text-[15px] text-ink-2 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky"
        >
          <span>
            이용일이 지난 미처리 신청 <b className="tabular-nums text-ink">{pastPendingCount}건</b> — 반려 또는 취소로 정리해 주세요
          </span>
          <span className="font-semibold text-brand" aria-hidden="true">›</span>
        </Link>
      )}
      {pastView && (
        <p>
          <Link href="/admin" className="inline-flex min-h-[44px] items-center text-[15px] font-semibold text-brand underline underline-offset-2">
            ← 할 일로
          </Link>
        </p>
      )}

      {searching && sorted.length > 0 && (
        <p>
          <Link href="/admin" className="inline-flex min-h-[44px] items-center text-[15px] font-semibold text-brand underline underline-offset-2">
            검색 지우기
          </Link>
        </p>
      )}
    </div>
  );
}
