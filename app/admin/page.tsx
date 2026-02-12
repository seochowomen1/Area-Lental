import HomeCategoryCard from "@/components/home/HomeCategoryCard";
import { IconGallery, IconLecture, IconStudio } from "@/components/home/Icons";
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

  return (
    <div className="space-y-4">
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
    </div>
  );
}
