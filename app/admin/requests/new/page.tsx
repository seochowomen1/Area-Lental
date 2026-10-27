import Link from "next/link";

import OfflineIntakeForm from "@/components/admin/OfflineIntakeForm";
import { assertAdminAuth } from "@/lib/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 서면 신청 등록 (2026-10-19)
 * - 방문·이메일·팩스로 받은 종이 신청서를 관리자가 대신 등록한다.
 * - 저장 구조는 온라인 신청과 동일(시트 1행) → 캘린더·통계·수입 내역·기안 데이터 복사·신청서 출력이 그대로 동작
 * - 현재는 우리동네 갤러리만 지원
 */
export default async function AdminOfflineIntakePage({
  searchParams,
}: {
  searchParams: { category?: string };
}) {
  await assertAdminAuth();
  const category = searchParams.category === "gallery" ? "gallery" : "gallery";

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-3 text-xl font-bold text-ink"><span className="inline-block h-6 w-1 shrink-0 rounded-full bg-accent" aria-hidden="true" />우리동네 갤러리 서면 신청 등록</h1>
          <p className="mt-1 text-sm text-slate-600">
            방문·이메일·팩스로 받은 종이 신청서를 대신 등록합니다. 등록된 건은 온라인 신청과 똑같이 목록·캘린더·통계·기안 데이터에 반영되고,
            신청서 출력물에는 &ldquo;서면 접수&rdquo;로 표기됩니다. 신청자에게 접수 메일은 발송되지 않습니다.
          </p>
        </div>
        <Link
          href={`/admin/requests?category=${encodeURIComponent(category)}`}
          className="shrink-0 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm hover:bg-slate-50"
        >
          ← 목록
        </Link>
      </div>
      <OfflineIntakeForm category={category} />
    </main>
  );
}
