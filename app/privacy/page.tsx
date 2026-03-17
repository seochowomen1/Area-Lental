import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "개인정보 처리방침",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <SiteHeader title="개인정보 처리방침" backHref="/" backLabel="홈으로" />

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 pb-16 pt-8 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-8 shadow-sm sm:px-10 sm:py-10">
          <h2 className="text-xl font-bold text-slate-900">개인정보 처리방침</h2>
          <p className="mt-2 text-sm text-slate-600">
            서초여성가족플라자 서초센터(이하 &ldquo;센터&rdquo;)는 개인정보보호법 제30조에 따라
            정보주체의 개인정보를 보호하고 이와 관련한 고충을 신속하고 원활하게 처리할 수 있도록
            다음과 같이 개인정보 처리방침을 수립·공개합니다.
          </p>

          {/* 제1조 */}
          <Section number={1} title="개인정보의 처리 목적">
            <p>센터는 다음 목적을 위해 개인정보를 처리합니다. 처리한 개인정보는 해당 목적 이외의 용도로 이용하지 않으며, 목적이 변경되는 경우 별도의 동의를 받는 등 필요한 조치를 이행합니다.</p>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li>시설 대관 신청접수 및 처리</li>
              <li>신청자 본인 확인 및 의사소통 경로 확보</li>
              <li>대관료 안내 및 결제 관련 연락</li>
              <li>시설 이용 관련 통계 작성(개인을 식별할 수 없는 형태)</li>
            </ul>
          </Section>

          {/* 제2조 */}
          <Section number={2} title="수집하는 개인정보 항목">
            <table className="mt-2 w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="border border-slate-300 bg-slate-50 px-3 py-2 text-left font-semibold">구분</th>
                  <th className="border border-slate-300 bg-slate-50 px-3 py-2 text-left font-semibold">항목</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-slate-300 px-3 py-2 font-medium">필수</td>
                  <td className="border border-slate-300 px-3 py-2">성명(대표자 성명), 생년월일, 연락처(전화번호), 이메일(E-mail), 주소, 단체명, 인원 수, 사용 목적, 서약자 성명</td>
                </tr>
                <tr>
                  <td className="border border-slate-300 px-3 py-2 font-medium">선택</td>
                  <td className="border border-slate-300 px-3 py-2">첨부파일(전시 관련 자료)</td>
                </tr>
                <tr>
                  <td className="border border-slate-300 px-3 py-2 font-medium">갤러리 전용</td>
                  <td className="border border-slate-300 px-3 py-2">전시명, 전시 목적, 장르·내용, 인지 경로, 특이사항(각 선택)</td>
                </tr>
              </tbody>
            </table>
          </Section>

          {/* 제3조 */}
          <Section number={3} title="개인정보의 보유 및 이용 기간">
            <p>센터는 개인정보 수집·이용 목적이 달성된 후에는 해당 정보를 지체 없이 파기합니다. 단, 다음 기준에 따라 보유합니다.</p>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li><strong>보유 기간:</strong> 수집일로부터 <strong>3년</strong></li>
              <li><strong>근거:</strong> 시설 대관 관리 및 통계 목적</li>
              <li>보유 기간 경과 또는 처리 목적 달성 시 지체 없이 파기</li>
            </ul>
          </Section>

          {/* 제4조 */}
          <Section number={4} title="개인정보의 파기 절차 및 방법">
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>파기 절차:</strong> 보유 기간이 경과한 개인정보는 별도 DB(또는 시트)로 분리 후 관리자 확인을 거쳐 파기합니다.</li>
              <li><strong>파기 방법:</strong> 전자적 파일 형태의 정보는 기록을 재생할 수 없는 기술적 방법을 사용하여 삭제합니다.</li>
            </ul>
          </Section>

          {/* 제5조 */}
          <Section number={5} title="개인정보의 제3자 제공">
            <p>센터는 정보주체의 개인정보를 제1조에서 명시한 범위 내에서만 처리하며, 원칙적으로 제3자에게 제공하지 않습니다. 다만 다음의 경우에는 예외로 합니다.</p>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li>정보주체가 사전에 동의한 경우</li>
              <li>법률에 특별한 규정이 있거나 법령상 의무 준수를 위해 불가피한 경우</li>
            </ul>
          </Section>

          {/* 제6조 */}
          <Section number={6} title="정보주체의 권리·의무 및 행사 방법">
            <p>정보주체는 센터에 대해 언제든지 다음 각 호의 개인정보 보호 관련 권리를 행사할 수 있습니다.</p>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li>개인정보 열람 요구</li>
              <li>오류 등이 있을 경우 정정 요구</li>
              <li>삭제 요구</li>
              <li>처리정지 요구</li>
            </ul>
            <p className="mt-2">위 권리 행사는 서면, 전화(070-7163-2953), 이메일(seochowomen1@naver.com)을 통해 하실 수 있으며, 센터는 이에 대해 지체 없이 조치하겠습니다.</p>
            <p className="mt-1">진행 중인 대관 신청(접수·승인 상태)의 개인정보 삭제를 요청하시는 경우, 해당 신청이 취소 처리된 후 삭제됩니다.</p>
          </Section>

          {/* 제7조 */}
          <Section number={7} title="개인정보의 안전성 확보 조치">
            <p>센터는 개인정보의 안전성 확보를 위해 다음과 같은 조치를 취하고 있습니다.</p>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li>관리자 비밀번호 암호화 저장(bcrypt)</li>
              <li>개인정보 접근 기록 감사 로그 관리(최소 1년 보존 후 파기)</li>
              <li>공개 API 응답 시 개인정보 마스킹 처리</li>
              <li>보안 헤더(CSP, X-Content-Type-Options 등) 적용</li>
              <li>API 호출 빈도 제한(Rate Limiting)</li>
            </ul>
          </Section>

          {/* 제8조 */}
          <Section number={8} title="개인정보 보호책임자">
            <p>센터는 개인정보 처리에 관한 업무를 총괄해서 책임지고, 개인정보 처리와 관련한 정보주체의 불만 처리 및 피해 구제 등을 위하여 아래와 같이 개인정보 보호책임자를 지정하고 있습니다.</p>
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
              <p><strong>개인정보 보호책임자</strong></p>
              <p className="mt-1">담당: 서초여성가족플라자 서초센터 시설총무</p>
              <p className="mt-1">전화: 070-7163-2953</p>
              <p className="mt-1">이메일: seochowomen1@naver.com</p>
            </div>
          </Section>

          {/* 제9조 */}
          <Section number={9} title="개인정보 침해 구제">
            <p>정보주체는 개인정보침해로 인한 구제를 받기 위하여 개인정보분쟁조정위원회, 한국인터넷진흥원 개인정보침해신고센터 등에 분쟁해결이나 상담 등을 신청할 수 있습니다.</p>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li>개인정보분쟁조정위원회: (국번없이) 1833-6972 (<a href="https://www.kopico.go.kr" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">www.kopico.go.kr</a>)</li>
              <li>개인정보침해신고센터: (국번없이) 118 (<a href="https://privacy.kisa.or.kr" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">privacy.kisa.or.kr</a>)</li>
              <li>대검찰청 사이버수사과: (국번없이) 1301 (<a href="https://www.spo.go.kr" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">www.spo.go.kr</a>)</li>
              <li>경찰청 사이버수사국: (국번없이) 182 (<a href="https://ecrm.cyber.go.kr" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">ecrm.cyber.go.kr</a>)</li>
            </ul>
          </Section>

          {/* 제10조 */}
          <Section number={10} title="개인정보 처리방침의 변경">
            <p>이 개인정보 처리방침은 시행일로부터 적용되며, 변경 사항이 있는 경우 시행 7일 전부터 본 페이지를 통해 공지합니다.</p>
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
              <p><strong>공고일:</strong> 2026년 3월 17일</p>
              <p><strong>시행일:</strong> 2026년 3월 17일</p>
            </div>

            <h4 className="mt-4 text-sm font-semibold text-slate-800">변경 이력</h4>
            <table className="mt-2 w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="border border-slate-300 bg-slate-50 px-3 py-2 text-left font-semibold">버전</th>
                  <th className="border border-slate-300 bg-slate-50 px-3 py-2 text-left font-semibold">시행일</th>
                  <th className="border border-slate-300 bg-slate-50 px-3 py-2 text-left font-semibold">변경 내용</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-slate-300 px-3 py-2">v1.2</td>
                  <td className="border border-slate-300 px-3 py-2">2026.03.17</td>
                  <td className="border border-slate-300 px-3 py-2">수집 항목 전수 반영(단체명·인원 수·사용 목적·서약자 성명 필수 명시, 갤러리 전용 항목 추가)</td>
                </tr>
                <tr>
                  <td className="border border-slate-300 px-3 py-2">v1.1</td>
                  <td className="border border-slate-300 px-3 py-2">2026.03.17</td>
                  <td className="border border-slate-300 px-3 py-2">보호책임자 연락처 구체화, 침해 구제 기관 안내(제9조) 추가, 수집 항목 표기 통일</td>
                </tr>
                <tr>
                  <td className="border border-slate-300 px-3 py-2">v1.0</td>
                  <td className="border border-slate-300 px-3 py-2">2026.03.16</td>
                  <td className="border border-slate-300 px-3 py-2">최초 제정</td>
                </tr>
              </tbody>
            </table>
          </Section>
        </div>
      </main>

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

function Section({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h3 className="text-base font-bold text-slate-800">
        제{number}조 ({title})
      </h3>
      <div className="mt-2 text-sm leading-relaxed text-slate-700">
        {children}
      </div>
    </section>
  );
}
