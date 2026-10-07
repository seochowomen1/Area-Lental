import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "대관 · 전시 이용 안내",
};

const CONTACT_PHONE = "070-7163-2953";
const CONTACT_EMAIL = "seochowomen1@naver.com";

export default function GuidePage() {
  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <SiteHeader title="대관 · 전시 이용 안내" backHref="/" backLabel="홈으로" />

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16 pt-8 sm:px-6 lg:px-8">
        {/* 대관 시설 */}
        <section>
          <SectionTitle>대관 시설 (강의실 · E-스튜디오)</SectionTitle>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <FacilityCard
              name="강의실"
              floor="4~7F"
              description="교육·세미나·회의 등 커뮤니티 활동을 위한 공간 (모두의교실, 상상교실, IT강의실, 마루강의실 등)"
              rows={[
                ["운영시간", "평일 10:00~17:00 · 화요일 10:00~20:00 · 토요일 10:00~12:00 (일요일·공휴일 휴관)"],
                ["대관료", "공간별 시간당 요금 · 온라인 예약 화면에서 확인"],
                ["대상", "서초구민 우선, 그 외 신청 가능"],
              ]}
              href="/space"
              cta="강의실 예약하기"
            />
            <FacilityCard
              name="E-스튜디오"
              floor="5F"
              description="방음시설과 촬영장비를 갖춘 영상 촬영·편집 공간"
              rows={[
                ["운영시간", "평일 10:00~17:00 · 화요일 10:00~20:00 · 토요일 10:00~12:00 (일요일·공휴일 휴관)"],
                ["대관료", "1시간 20,000원 (기본 2인) · 2인 초과 시 1인당 시간당 5,000원 추가 · 촬영장비는 1일 1회 별도"],
                ["대상", "서초구민 우선, 그 외 신청 가능"],
              ]}
              href="/space?category=studio"
              cta="E-스튜디오 예약하기"
            />
          </div>
        </section>

        {/* 전시 공간 */}
        <section className="mt-10">
          <SectionTitle>전시 공간 (우리동네 갤러리)</SectionTitle>
          <p className="mt-2 text-sm text-slate-600">
            우리동네 갤러리는 주민 누구나 작품을 전시할 수 있는 동네 전시 공간입니다. 전시 신청은 온라인으로
            접수하며, 전시 공간 이용료는 아래 기준을 따릅니다.
          </p>
          <div className="mt-4">
            <FacilityCard
              name="우리동네 갤러리"
              floor="4F"
              description="액자 형태 작품 최대 15점, 가로·세로 최대 60cm · 와이어 걸이 방식"
              rows={[
                ["운영시간", "평일 9:00~18:00 · 화요일 9:00~20:00 · 토요일 9:00~13:00 (일요일·공휴일 휴관)"],
                ["이용료", "평일 20,000원/일 · 토요일 10,000원/일 · 준비일 1일 무료"],
                ["대상", "지역주민 및 문화예술인 누구나"],
              ]}
              href="/space?category=gallery"
              cta="전시 신청하기"
            />
          </div>
        </section>

        {/* 신청 방법 */}
        <section className="mt-10">
          <SectionTitle>신청 방법</SectionTitle>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Card title="온라인 신청 (권장)">
              <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-700">
                <li>시설을 선택하고 달력에서 날짜·시간을 확인합니다.</li>
                <li>신청서를 작성하고 개인정보 동의와 규정 서약을 완료합니다.</li>
                <li>담당자 검토 후 3일 이내에 승인 여부를 이메일로 안내합니다. 같은 일정은 먼저 신청한 분이 우선입니다.</li>
                <li>승인 후 이용료를 결제(방문 결제)하면 예약이 확정됩니다.</li>
              </ol>
              <div className="mt-4 flex flex-wrap gap-2">
                <LinkButton href="/space">강의실 · E-스튜디오 예약</LinkButton>
                <LinkButton href="/space?category=gallery" soft>
                  갤러리 전시 신청
                </LinkButton>
              </div>
            </Card>
            <Card title="신청서 이메일 접수 (강의실 · E-스튜디오)">
              <p className="text-sm text-slate-700">
                아래 신청서를 내려받아 작성한 뒤 이메일({CONTACT_EMAIL})로 제출하셔도 됩니다. 담당자 확인 후
                승인 여부와 결제 방법을 안내드립니다.
              </p>
              <ul className="mt-3 space-y-2 text-sm">
                <li>
                  <FileLink href="/docs/센터강의실 대관신청서 및 서약서.hwp">강의실 대관신청서 및 서약서 (.hwp)</FileLink>
                </li>
                <li>
                  <FileLink href="/docs/E-스튜디오 대관신청서 및 서약서.hwp">E-스튜디오 대관신청서 및 서약서 (.hwp)</FileLink>
                </li>
              </ul>
              <p className="mt-3 text-xs text-slate-500">※ 우리동네 갤러리 전시 신청은 온라인으로만 접수합니다.</p>
            </Card>
          </div>
        </section>

        {/* 환불 규정 */}
        <section className="mt-10">
          <SectionTitle>환불 규정</SectionTitle>
          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-700">
                <tr>
                  <th className="px-4 py-3 font-semibold">취소 요청 시점 (이용일 기준)</th>
                  <th className="px-4 py-3 font-semibold">환불 비율</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                <tr>
                  <td className="px-4 py-3">3일 전까지</td>
                  <td className="px-4 py-3 font-semibold">100%</td>
                </tr>
                <tr>
                  <td className="px-4 py-3">2일 전까지</td>
                  <td className="px-4 py-3 font-semibold">90%</td>
                </tr>
                <tr>
                  <td className="px-4 py-3">1일 전까지</td>
                  <td className="px-4 py-3 font-semibold">80%</td>
                </tr>
                <tr>
                  <td className="px-4 py-3">이용 당일 및 이후</td>
                  <td className="px-4 py-3 font-semibold text-rose-600">환불 불가</td>
                </tr>
              </tbody>
            </table>
            <p className="px-4 py-3 text-xs text-slate-500">
              환불은 센터 방문 후 환불신청서를 작성해 접수합니다. 카드 결제는 카드 취소, 현금 결제는 계좌 환불로
              처리합니다. 예약 시간을 모두 사용하지 않아도 잔여 시간은 환불되지 않습니다.
            </p>
          </div>
        </section>

        {/* 유의사항 */}
        <section className="mt-10">
          <SectionTitle>유의사항</SectionTitle>
          <Card>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-700">
              <li>이용 후 원상 복구가 되지 않으면 추가 비용이 발생할 수 있습니다.</li>
              <li>사전 허가 없이 시설물을 변경하거나 훼손할 수 없습니다.</li>
              <li>승인된 이용 시간을 지켜 주시기 바랍니다. 초과 시 추가 비용이 발생합니다.</li>
              <li>종교 포교, 정치 목적, 영리 목적, 판매·판촉 행사에는 이용할 수 없습니다.</li>
            </ul>
          </Card>
        </section>

        {/* 문의 */}
        <section className="mt-10">
          <SectionTitle>문의</SectionTitle>
          <Card>
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs font-semibold text-slate-500">전화</dt>
                <dd className="mt-1 font-medium text-slate-800">{CONTACT_PHONE}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-slate-500">이메일</dt>
                <dd className="mt-1 font-medium text-slate-800">{CONTACT_EMAIL}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-slate-500">위치</dt>
                <dd className="mt-1 font-medium text-slate-800">
                  서울특별시 서초구 서운로26길 3, 4~7층
                  <span className="block text-xs font-normal text-slate-500">9호선·신분당선 신논현역 9번 출구 도보 4분</span>
                </dd>
              </div>
            </dl>
          </Card>
        </section>
      </main>
    </div>
  );
}

/* ───────────── 내부 컴포넌트 ───────────── */

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
      <span className="inline-block h-2 w-2 rounded-full bg-[rgb(var(--brand-accent))]" />
      {children}
    </h2>
  );
}

function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {title && <h3 className="mb-3 text-sm font-bold text-slate-900">{title}</h3>}
      {children}
    </div>
  );
}

function FacilityCard({
  name,
  floor,
  description,
  rows,
  href,
  cta,
}: {
  name: string;
  floor: string;
  description: string;
  rows: [string, string][];
  href: string;
  cta: string;
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-base font-bold text-slate-900">{name}</h3>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-600">
          {floor}
        </span>
      </div>
      <p className="mt-2 text-sm text-slate-600">{description}</p>
      <dl className="mt-4 space-y-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[72px_1fr] gap-2">
            <dt className="font-semibold text-slate-500">{k}</dt>
            <dd className="text-slate-800">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-5">
        <LinkButton href={href}>{cta}</LinkButton>
      </div>
    </div>
  );
}

function LinkButton({ href, children, soft }: { href: string; children: ReactNode; soft?: boolean }) {
  return (
    <Link
      href={href}
      className={
        soft
          ? "inline-flex items-center rounded-full border border-[rgb(var(--brand-primary))] px-4 py-2 text-sm font-semibold text-[rgb(var(--brand-primary))] transition hover:bg-[rgb(var(--brand-primary)/0.06)]"
          : "inline-flex items-center rounded-full bg-[rgb(var(--brand-primary))] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-95"
      }
    >
      {children}
    </Link>
  );
}

function FileLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={encodeURI(href)}
      download
      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-medium text-slate-800 transition hover:bg-slate-100"
    >
      <span aria-hidden>📄</span>
      {children}
    </a>
  );
}
