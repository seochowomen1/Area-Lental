import Link from "next/link";
import HomeCategoryCard from "@/components/home/HomeCategoryCard";
import { IconGallery, IconLecture, IconStudio } from "@/components/home/Icons";
import { A_BTN_SECONDARY, A_H1, HelpPhoneLine, PublicHeader, StepHeader } from "@/components/apply/ui";
import { GalleryFee, lectureMinFee, studioMinFee } from "@/components/apply/RoomInfo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** `**50,000원**부터 (1시간)` (02_ui_apply §0-8 B-3) */
function FromFee({ amount }: { amount: number }) {
  return (
    <>
      <span className="font-bold text-ink">{amount.toLocaleString()}원</span>부터 (1시간)
    </>
  );
}

/**
 * 1단계 홈 — "어떤 공간?" (02_ui_apply §0-3 · §0-7 · §2-1)
 * 카드 3장 → 이미 신청하셨나요? → 안내 문장 → 전화 줄 → 개인정보 처리방침
 */
export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <PublicHeader />

      <main id="main-content" className="mx-auto w-full max-w-[960px] flex-1 px-4 pb-12 pt-6 sm:px-6 min-[900px]:max-w-6xl">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-accent" />
          <h1 className={A_H1}>대관 · 전시 신청</h1>
        </div>
        <div className="mt-2">
          <StepHeader current={1} />
        </div>

        <div className="mt-4 grid gap-2.5 sm:grid-cols-2 sm:gap-4 min-[900px]:grid-cols-3 min-[900px]:gap-6">
          <HomeCategoryCard
            title="강의실"
            description={"다양한 규모의 강의실을 시간 단위로\n대관할 수 있습니다"}
            shortDescription="시간 단위로 대관"
            icon={<IconLecture />}
            href="/space?category=lecture"
            badgeLabel="대관"
            ctaLabel="대관 신청하기"
            fee={<FromFee amount={lectureMinFee()} />}
          />
          <HomeCategoryCard
            title="E-스튜디오"
            description={"영상 촬영·편집에 필요한 장비와\n공간을 대관할 수 있습니다"}
            shortDescription="영상 촬영·편집 공간"
            icon={<IconStudio />}
            href="/space/media"
            badgeLabel="대관"
            ctaLabel="대관 신청하기"
            fee={<FromFee amount={studioMinFee()} />}
          />
          <HomeCategoryCard
            title="우리동네 갤러리"
            description={"작품 전시를 위한 갤러리 공간을\n일 단위로 신청할 수 있습니다"}
            shortDescription="작품 전시 · 일 단위"
            icon={<IconGallery />}
            href="/space/gallery"
            badgeLabel="전시"
            ctaLabel="전시 신청하기"
            fee={<GalleryFee />}
          />
        </div>

        <div className="mt-6 flex flex-col gap-6">
          <section aria-labelledby="home-check" className="rounded-xl border border-line bg-white p-4 sm:p-5 min-[900px]:order-2 min-[900px]:mx-auto min-[900px]:w-full min-[900px]:max-w-[560px]">
            <h2 id="home-check" className="text-[18px] font-extrabold leading-7 text-ink">
              이미 신청하셨나요?
            </h2>
            <p className="mt-1 text-[15px] leading-6 text-ink-2">이메일로 받은 링크나 신청번호로 확인할 수 있습니다.</p>
            <Link href="/my" className={`${A_BTN_SECONDARY} mt-3`}>
              내 신청 확인하기
            </Link>
          </section>
          <p className="text-center text-[15px] leading-6 text-ink-2 min-[900px]:order-1">
            요금, 운영시간, 신청 방법, 환불 규정은{" "}
            <Link href="/guide" className="font-semibold text-brand underline underline-offset-2">
              대관 · 전시 이용 안내
            </Link>
            에서 확인할 수 있습니다.
          </p>
        </div>

        <HelpPhoneLine className="mt-6 text-center" />
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/privacy" className="inline-flex min-h-[44px] items-center text-[15px] font-medium text-ink-2 underline underline-offset-2">
            개인정보 처리방침
          </Link>
          <Link href="/admin" className="inline-flex min-h-[44px] items-center text-[13px] text-slate-500 hover:text-slate-600">
            관리자
          </Link>
        </div>
      </footer>
    </div>
  );
}
