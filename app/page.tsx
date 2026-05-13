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

      <main id="main-content" className="relative mx-auto w-full max-w-7xl flex-1 px-4 pb-16 pt-8 sm:px-6 lg:px-8">
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

        {/* 신청 내역 조회 + 신청서 양식 인쇄 */}
        <div className="mt-8 flex flex-col gap-4">
          <HomeReservationCheck />

          <div className="flex items-center justify-center gap-1 text-sm text-slate-400">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18.25 7.034V3.375" />
            </svg>
            <span>신청서 양식 인쇄:</span>
            <Link href="/print/lecture" className="text-slate-500 underline underline-offset-2 hover:text-slate-700 transition-colors">강의실</Link>
            <span>·</span>
            <Link href="/print/studio" className="text-slate-500 underline underline-offset-2 hover:text-slate-700 transition-colors">E-스튜디오</Link>
            <span>·</span>
            <Link href="/print/gallery" className="text-slate-500 underline underline-offset-2 hover:text-slate-700 transition-colors">갤러리</Link>
          </div>
        </div>
      </main>

      {/* 하단 푸터 */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <Link
              href="/privacy"
              className="text-xs text-slate-500 hover:text-slate-700 transition-colors font-medium"
            >
              개인정보 처리방침
            </Link>
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
