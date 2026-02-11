import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import HomeCategoryCard from "@/components/home/HomeCategoryCard";
import HomeReservationCheck from "@/components/home/HomeReservationCheck";
import { IconGallery, IconLecture, IconStudio } from "@/components/home/Icons";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <SiteHeader title="대관신청" />

      <main className="relative mx-auto w-full max-w-7xl flex-1 px-4 pb-16 pt-8 sm:px-6 lg:px-8">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <HomeCategoryCard
            title="강의실"
            description={"다양한 규모의 강의실을 시간 단위로\n대관할 수 있습니다"}
            icon={<IconLecture />}
            href="/space"
          />

          <HomeCategoryCard
            title="E-스튜디오"
            description={"영상 촬영·편집에 필요한 장비와\n공간을 대관할 수 있습니다"}
            icon={<IconStudio />}
            href="/space?category=studio"
          />

          <HomeCategoryCard
            title="우리동네 갤러리"
            description={"작품 전시를 위한 갤러리 공간을\n일 단위로 대관할 수 있습니다"}
            icon={<IconGallery />}
            href="/space?category=gallery"
          />
        </div>

        {/* 신청 내역 조회 - 컴팩트 인라인 */}
        <div className="mt-8">
          <HomeReservationCheck />
        </div>
      </main>

      {/* 하단 푸터 */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center justify-end">
            <Link
              href="/admin"
              className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
            >
              관리자
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
