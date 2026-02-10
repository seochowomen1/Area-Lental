import { redirect } from "next/navigation";

import PrintActions from "../form/PrintActions";

import { assertAdminAuth } from "@/lib/adminAuth";
import { getDatabase } from "@/lib/database";
import {
  getCategoryLabel,
  getRoom,
  normalizeRoomCategory,
} from "@/lib/space";
import { operatingNoticeLines } from "@/lib/operating";
import {
  PLEDGE_TITLE,
  PLEDGE_INTRO,
  PLEDGE_SECTIONS,
  GALLERY_PLEDGE_SECTIONS,
  PLEDGE_FOOTER,
} from "@/lib/pledge";
import type { RentalRequest } from "@/lib/types";

export const runtime = "nodejs";

/* ── Shared table cell styles ── */
const TH =
  "border border-gray-400 bg-gray-50 px-3 py-2 text-left text-xs font-bold text-gray-900 whitespace-nowrap";
const TD = "border border-gray-400 px-3 py-2 text-sm text-gray-900";

export default async function AdminPledgePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { category?: string };
}) {
  await assertAdminAuth();

  const db = getDatabase();
  let req: RentalRequest | null = null;
  try {
    req = await db.getRequestById(params.id);
  } catch {
    // ignore
  }

  if (!req) {
    return (
      <main className="mx-auto max-w-3xl p-10 text-center">
        <p className="text-gray-600">
          신청번호 <b>{params.id}</b>에 해당하는 데이터가 없습니다.
        </p>
      </main>
    );
  }

  const room = getRoom(req.roomId);
  const inferredCategory = normalizeRoomCategory(room?.category);
  const rawCategory = (searchParams?.category ?? "").trim();
  if (!rawCategory) {
    redirect(
      `/admin/requests/${encodeURIComponent(req.requestId)}/pledge?category=${encodeURIComponent(inferredCategory)}`
    );
  }
  const normalizedCategory = normalizeRoomCategory(rawCategory);

  // 서약서는 강의실 + E-스튜디오 전용 (갤러리 제외)
  if (normalizedCategory === "gallery") {
    redirect(
      `/admin/requests/${encodeURIComponent(req.requestId)}?category=${encodeURIComponent(normalizedCategory)}`
    );
  }

  const categoryLabel = getCategoryLabel(normalizedCategory);
  const sections = PLEDGE_SECTIONS;
  const opLines = operatingNoticeLines(req.roomId);

  const now = new Date();
  const printDate = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")}`;

  // 전자 동의 정보
  const consentDate = req.createdAt
    ? new Date(req.createdAt).toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : printDate;

  return (
    <>
      {/* ── print styles ── */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              .no-print { display: none !important; }
              @page { margin: 15mm 12mm; size: A4; }
            }
          `,
        }}
      />

      <main className="mx-auto max-w-[800px] bg-white px-4 py-6 print:px-0 print:py-0">
        {/* ── 인쇄 버튼 ── */}
        <PrintActions />

        {/* ═══ 문서 헤더 ═══ */}
        <div className="text-center">
          <h1 className="text-base font-bold text-gray-900">
            서초여성가족플라자 서초센터
          </h1>
          <h2 className="mt-1 text-lg font-extrabold text-gray-900">
            {PLEDGE_TITLE}
          </h2>
        </div>

        {/* ═══ 서약 서문 ═══ */}
        <p className="mt-4 text-sm leading-relaxed text-gray-900">
          {PLEDGE_INTRO}
        </p>

        {/* ═══ 서약 조항 (가~사) ═══ */}
        <div className="mt-4 space-y-3">
          {sections.map((sec) => (
            <div key={sec.title}>
              <h4 className="text-sm font-bold text-gray-900">{sec.title}</h4>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm leading-relaxed text-gray-800">
                {sec.bullets.map((b, idx) => (
                  <li key={idx}>{b}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* ═══ 운영시간 안내 ═══ */}
        <div className="mt-5">
          <h4 className="text-sm font-bold text-gray-900">
            ※ {categoryLabel} 운영시간 안내
          </h4>
          <table className="mt-2 w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={TH} style={{ width: "25%" }}>
                  구분
                </th>
                <th className={TH}>운영시간</th>
              </tr>
            </thead>
            <tbody>
              {opLines.map((line) => (
                <tr key={line.label}>
                  <td className={`${TD} text-center font-semibold`}>
                    {line.label}
                  </td>
                  <td className={TD}>{line.text}</td>
                </tr>
              ))}
              <tr>
                <td className={`${TD} text-center font-semibold`}>휴관</td>
                <td className={TD}>일요일 및 공휴일</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-1 text-xs text-gray-500">
            ※ 기관 휴관 상황 시 운영 불가
          </p>
        </div>

        {/* ═══ 서약 푸터 ═══ */}
        <p className="mt-5 text-sm font-semibold text-gray-900">
          {PLEDGE_FOOTER}
        </p>

        {/* ═══ 전자 서약 확인란 ═══ */}
        <div className="mt-6 rounded-lg border border-gray-300 bg-gray-50 px-5 py-4">
          <h4 className="text-xs font-bold text-gray-700">
            [전자 서약 확인]
          </h4>
          <table className="mt-2 w-full border-collapse text-sm">
            <tbody>
              <tr>
                <th className={TH} style={{ width: "20%" }}>
                  서약 일시
                </th>
                <td className={TD}>{consentDate}</td>
              </tr>
              <tr>
                <th className={TH}>서약자</th>
                <td className={TD}>
                  <b>{req.applicantName}</b>
                  {req.orgName ? ` (${req.orgName})` : ""}
                </td>
              </tr>
              <tr>
                <th className={TH}>연락처</th>
                <td className={TD}>{req.phone}</td>
              </tr>
              <tr>
                <th className={TH}>대관 시설</th>
                <td className={TD}>
                  {room?.name ?? req.roomId} ({categoryLabel})
                </td>
              </tr>
              <tr>
                <th className={TH}>서약 동의</th>
                <td className={TD}>
                  <span className="font-semibold">
                    {req.pledgeAgree ? "■ 동의" : "□ 동의"} &nbsp;&nbsp;{" "}
                    {req.pledgeAgree ? "□ 미동의" : "■ 미동의"}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
          <p className="mt-2 text-[10px] text-gray-500 leading-relaxed">
            본 서약은 온라인 대관 신청 시 전자적 방식으로 동의한 내용이며,
            신청자의 성명·연락처·동의 일시를 기반으로 서명을 대체합니다.
          </p>
        </div>

        {/* ═══ 서명란 (인쇄용) ═══ */}
        <div className="mt-6 text-center text-sm text-gray-900">
          <p>{printDate}</p>
          <p className="mt-4">
            서약자: <b>{req.applicantName}</b> &nbsp;&nbsp; (전자 동의 완료)
          </p>
        </div>

        {/* ═══ 푸터 ═══ */}
        <div className="mt-8 border-t border-gray-300 pt-3 text-center text-sm font-bold text-gray-900">
          서초여성가족플라자 서초센터장 귀하
        </div>

        <div className="mt-3 text-xs text-gray-500">
          <p>*문의 : 서초여성가족플라자 서초센터 02-522-5291</p>
          {req.requestId && (
            <p className="mt-1 text-gray-400">
              신청번호: {req.requestId} | 출력일: {printDate}
            </p>
          )}
        </div>
      </main>
    </>
  );
}
