import SiteHeader from "@/components/SiteHeader";
import HomeCategoryCard from "@/components/home/HomeCategoryCard";
import { IconGallery, IconLecture, IconMyReservation, IconStudio } from "@/components/home/Icons";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50">
      <SiteHeader title="대관신청" />

      <main className="relative mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 lg:px-8">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <HomeCategoryCard
            title="강의실"
            description="수강인원, 이용시간, 이용금액 등 상세 정보 확인 및 예약"
            icon={<IconLecture />}
            href="/space"
          />

          <HomeCategoryCard
            title="E-스튜디오"
            description="영상 촬영, 편집, 장비 대여 및 예약"
            icon={<IconStudio />}
            href="/space?category=studio"
          />

          <HomeCategoryCard
            title="우리동네 갤러리"
            description="전시 공간 대관 및 예약"
            icon={<IconGallery />}
            href="/space?category=gallery"
          />
        </div>

        {/* 예약 확인 */}
        <div className="mt-8">
          <div className="mx-auto max-w-md">
            <HomeCategoryCard
              title="예약 확인"
              description="이메일 주소로 내 대관 신청 현황을 조회합니다"
              icon={<IconMyReservation />}
              href="/my"
              ctaLabel="예약 확인하기"
            />
          </div>
        </div>
      </main>
    </div>
  );
}
