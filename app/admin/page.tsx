import Link from "next/link";
import HomeCategoryCard from "@/components/home/HomeCategoryCard";
import { IconGallery, IconLecture, IconStudio } from "@/components/home/Icons";
import Notice from "@/components/ui/Notice";
import { RETENTION_YEARS } from "@/lib/config";
import { getDatabase } from "@/lib/database";
import { getRoomsByCategory } from "@/lib/space";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminHomePage() {
  const db = getDatabase();
  const allRequests = await db.getAllRequests();

  // 카테고리별 대기(접수) 건수
  const lectureRoomIds = new Set(getRoomsByCategory("lecture").map((r) => r.id));
  const studioRoomIds = new Set(getRoomsByCategory("studio").map((r) => r.id));
  const galleryRoomIds = new Set(getRoomsByCategory("gallery").map((r) => r.id));

  const pending = allRequests.filter((r) => r.status === "접수");
  const lecturePending = pending.filter((r) => lectureRoomIds.has(r.roomId)).length;
  const studioPending = pending.filter((r) => studioRoomIds.has(r.roomId)).length;
  const galleryPending = pending.filter((r) => galleryRoomIds.has(r.roomId)).length;

  // 보존기한(3년) 경과 건 체크
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - RETENTION_YEARS);
  const expiredCount = allRequests.filter((r) => {
    const d = new Date(r.createdAt);
    return !isNaN(d.getTime()) && d < cutoff;
  }).length;

  return (
    <div className="space-y-4">
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

      <div className="rounded-xl bg-white p-5 shadow">
        <h1 className="text-lg font-semibold text-gray-900">공간별 대관신청 관리</h1>
        <p className="mt-1 text-sm text-gray-600">
          공간을 선택하여 신청 현황을 목록 또는 캘린더로 확인하세요.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <HomeCategoryCard
          title="강의실"
          description={`강의실 대관신청 현황(접수/승인/취소)\n목록 및 캘린더 조회`}
          icon={<IconLecture />}
          href="/admin/requests?category=lecture"
          ctaLabel="조회하기"
          pendingCount={lecturePending}
          accentColor="blue"
        />

        <HomeCategoryCard
          title="E-스튜디오"
          description={`E-스튜디오 대관신청 현황(접수/승인/취소)\n목록 및 캘린더 조회`}
          icon={<IconStudio />}
          href="/admin/requests?category=studio"
          ctaLabel="조회하기"
          pendingCount={studioPending}
          accentColor="violet"
        />

        <HomeCategoryCard
          title="우리동네 갤러리"
          description={`갤러리 대관신청 현황(접수/승인/취소)\n목록 및 캘린더 조회`}
          icon={<IconGallery />}
          href="/admin/requests?category=gallery"
          ctaLabel="조회하기"
          pendingCount={galleryPending}
          accentColor="emerald"
        />
      </div>

      {/* 빈 신청서 양식 인쇄 */}
      <div className="rounded-xl bg-white p-5 shadow">
        <div className="flex items-center gap-3">
          <svg className="h-5 w-5 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18.25 7.034V3.375" />
          </svg>
          <span className="text-sm font-medium text-slate-700">빈 신청서 양식 인쇄:</span>
          <div className="flex items-center gap-2 text-sm">
            <Link href="/admin/print/lecture" className="text-blue-600 underline underline-offset-2 hover:text-blue-800 transition-colors">강의실</Link>
            <span className="text-slate-300">·</span>
            <Link href="/admin/print/studio" className="text-violet-600 underline underline-offset-2 hover:text-violet-800 transition-colors">E-스튜디오</Link>
            <span className="text-slate-300">·</span>
            <Link href="/admin/print/gallery" className="text-emerald-600 underline underline-offset-2 hover:text-emerald-800 transition-colors">갤러리</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
