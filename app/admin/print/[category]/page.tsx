import type { Metadata } from "next";
import { notFound } from "next/navigation";

import PrintActions from "./PrintActions";

import { EQUIPMENT_FEE_KRW, STUDIO_EQUIPMENT_FEE_KRW, STUDIO_EQUIPMENT_LABELS } from "@/lib/config";
import {
  getCategoryLabel,
  getRoomsByCategory,
  type RoomCategory,
  type SpaceRoom,
} from "@/lib/space";
import { formatKRW } from "@/lib/pricing";
import { operatingNoticeLines } from "@/lib/operating";
import {
  PLEDGE_TITLE,
  PLEDGE_INTRO,
  PLEDGE_SECTIONS,
  PLEDGE_FOOTER,
  GALLERY_PLEDGE_SECTIONS,
} from "@/lib/pledge";

const VALID: Record<string, RoomCategory> = {
  lecture: "lecture",
  studio: "studio",
  gallery: "gallery",
};

const TITLES: Record<RoomCategory, string> = {
  lecture: "강의실 대관 신청서 (빈 양식)",
  studio: "E-스튜디오 대관 신청서 (빈 양식)",
  gallery: "우리동네 갤러리 대관 신청서 (빈 양식)",
};

export function generateMetadata({ params }: { params: { category: string } }): Metadata {
  const cat = VALID[params.category];
  if (!cat) return { title: "대관 신청서" };
  return { title: TITLES[cat] };
}

/* ── shared cell styles (matching admin form) ── */
const TH =
  "border border-gray-400 bg-gray-50 px-2 py-1 text-left text-[11px] font-bold text-gray-900 whitespace-nowrap print:px-1.5 print:py-0.5 print:text-[9px]";
const TD =
  "border border-gray-400 px-2 py-1 text-xs text-gray-900 print:px-1.5 print:py-0.5 print:text-[9px]";
const TD_R = `${TD} text-right tabular-nums`;
const BLANK = " ";

export default function BlankFormPage({ params }: { params: { category: string } }) {
  const category = VALID[params.category];
  if (!category) notFound();

  const categoryLabel = getCategoryLabel(category);
  const isLecture = category === "lecture";
  const isGallery = category === "gallery";
  const isStudio = category === "studio";

  /* ── room list (lecture) ── */
  const categoryRooms = isLecture ? getRoomsByCategory("lecture") : [];
  type RoomGroup = { label: string; rooms: SpaceRoom[] };
  const roomGroups: RoomGroup[] = [];
  if (isLecture) {
    const special = categoryRooms.filter((r) => r.feeKRW >= 100000);
    const general = categoryRooms.filter((r) => r.feeKRW < 100000);
    if (special.length) roomGroups.push({ label: "강당 및 특수강의실", rooms: special });
    if (general.length) roomGroups.push({ label: "일반 강의실", rooms: general });
  }

  /* ── equipment ── */
  const equipmentItems = [
    { key: "laptop" as const, label: "노트북", fee: EQUIPMENT_FEE_KRW.laptop },
    { key: "projector" as const, label: "빔프로젝트", fee: EQUIPMENT_FEE_KRW.projector },
    { key: "audio" as const, label: "음향장비", fee: EQUIPMENT_FEE_KRW.audio },
  ];

  const studioEquipmentKeys = Object.keys(STUDIO_EQUIPMENT_FEE_KRW) as Array<keyof typeof STUDIO_EQUIPMENT_FEE_KRW>;
  const studioEquipmentItems = studioEquipmentKeys.map((key) => ({
    key,
    label: STUDIO_EQUIPMENT_LABELS[key],
    fee: STUDIO_EQUIPMENT_FEE_KRW[key],
  }));

  /* ── pledge ── */
  const pledgeSections = isGallery ? GALLERY_PLEDGE_SECTIONS : PLEDGE_SECTIONS;
  const opLines = operatingNoticeLines(isGallery ? "gallery" : undefined);

  return (
    <>
      {/* ── print styles ── */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              .no-print { display: none !important; }
              @page { margin: 10mm 10mm; size: A4; }
              .page-section { page-break-after: always; }
              .page-section:last-child { page-break-after: auto; }
            }
          `,
        }}
      />

      <main className="mx-auto max-w-[800px] bg-white px-4 py-6 print:px-0 print:py-0">
        <PrintActions />

        {/* ════════════════════════════════════ */}
        {/* ═══ PAGE 1: 강의실 대관 신청서 ═══ */}
        {/* ════════════════════════════════════ */}
        {isLecture && (
          <div className="page-section">
            <div className="text-center">
              <h1 className="mt-1 text-sm font-bold text-gray-900 print:text-xs">
                서초여성가족플라자 서초센터
              </h1>
              <h2 className="mt-0.5 text-base font-extrabold text-gray-900 print:text-sm">
                &lsquo;센터 {categoryLabel}&rsquo; 대관 신청서
              </h2>
            </div>

            {/* 1. 신청자 정보 */}
            <table className="mt-3 w-full border-collapse print:mt-2">
              <tbody>
                <tr>
                  <th className={TH} style={{ width: "14%" }}>신청자명</th>
                  <td className={TD} style={{ width: "36%" }}>{BLANK}</td>
                  <th className={TH} style={{ width: "14%" }}>생년월일</th>
                  <td className={TD} style={{ width: "36%" }}>{BLANK}</td>
                </tr>
                <tr>
                  <th className={TH}>연락처</th>
                  <td className={TD}>{BLANK}</td>
                  <th className={TH}>E-mail</th>
                  <td className={TD}>{BLANK}</td>
                </tr>
                <tr>
                  <th className={TH}>주소</th>
                  <td className={TD} colSpan={3}>{BLANK}</td>
                </tr>
                <tr>
                  <th className={TH}>단체명</th>
                  <td className={TD}>{BLANK}</td>
                  <th className={TH}>참여인원</th>
                  <td className={TD}>{BLANK}</td>
                </tr>
              </tbody>
            </table>

            {/* 2. 공간 선택 테이블 */}
            <table className="mt-2 w-full border-collapse print:mt-1.5">
              <thead>
                <tr>
                  <th className={TH} style={{ width: "20%" }}>구분</th>
                  <th className={TH}>공간명</th>
                  <th className={TH} style={{ width: "13%" }}>수용인원</th>
                  <th className={TH} style={{ width: "9%" }}>선택</th>
                  <th className={TH} style={{ width: "16%" }}>대관료(시간당)</th>
                </tr>
              </thead>
              <tbody>
                {roomGroups.map((group) => {
                  const feeRanges: { startIdx: number; count: number; fee: number }[] = [];
                  group.rooms.forEach((r, i) => {
                    const last = feeRanges[feeRanges.length - 1];
                    if (last && last.fee === r.feeKRW) {
                      last.count++;
                    } else {
                      feeRanges.push({ startIdx: i, count: 1, fee: r.feeKRW });
                    }
                  });
                  const feeStartSet = new Set(feeRanges.map((f) => f.startIdx));
                  const feeSpanMap = new Map(feeRanges.map((f) => [f.startIdx, f.count]));

                  return group.rooms.map((r, idx) => (
                    <tr key={r.id}>
                      {idx === 0 && (
                        <th
                          className={TH}
                          rowSpan={group.rooms.length}
                          style={{ textAlign: "center", verticalAlign: "middle" }}
                        >
                          {group.label}
                        </th>
                      )}
                      <td className={TD}>{r.name}</td>
                      <td className={`${TD} text-center`}>{r.capacity}명</td>
                      <td className={`${TD} text-center`}>□</td>
                      {feeStartSet.has(idx) && (
                        <td className={TD_R} rowSpan={feeSpanMap.get(idx)}>
                          {r.feeKRW > 0 ? formatKRW(r.feeKRW) : "별도 협의"}
                        </td>
                      )}
                    </tr>
                  ));
                })}

                {/* 기자재 */}
                {equipmentItems.map((eq, idx) => (
                  <tr key={eq.key}>
                    {idx === 0 && (
                      <th
                        className={TH}
                        rowSpan={equipmentItems.length}
                        style={{ textAlign: "center", verticalAlign: "middle" }}
                      >
                        기자재
                      </th>
                    )}
                    <td className={TD}>{eq.label}</td>
                    <td className={`${TD} text-center`}>-</td>
                    <td className={`${TD} text-center`}>□</td>
                    {idx === 0 && (
                      <td className={TD_R} rowSpan={equipmentItems.length}>
                        {formatKRW(equipmentItems[0].fee)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>

            {/* 3. 이용목적 / 대관일시 / 대관비용 */}
            <table className="mt-2 w-full border-collapse print:mt-1.5">
              <tbody>
                <tr>
                  <th className={TH} style={{ width: "18%" }}>이용목적</th>
                  <td className={TD} colSpan={3}>{BLANK}</td>
                </tr>
                <tr>
                  <th className={TH}>대관일시</th>
                  <td className={TD} colSpan={3}>{BLANK}</td>
                </tr>
                <tr>
                  <th className={TH}>
                    대관비용<br />
                    <span className="font-normal text-gray-500 print:text-[7px]">(※담당자 기재)</span>
                  </th>
                  <td className={TD} colSpan={3}>{BLANK}</td>
                </tr>
              </tbody>
            </table>

            {/* 4. 개인정보 수집·이용 안내 */}
            <div className="mt-2 rounded border border-gray-400 px-3 py-2 print:mt-1.5 print:px-2 print:py-1.5">
              <h3 className="text-center text-[11px] font-bold text-gray-900 print:text-[9px]">
                개인정보 수집 · 이용에 관한 안내 (* 필수항목)
              </h3>
              <table className="mt-1.5 w-full border-collapse text-[10px] print:text-[8px]">
                <thead>
                  <tr>
                    <th className="border border-gray-300 bg-gray-50 px-1.5 py-1 text-center font-bold">개인정보 수집 · 이용 목적</th>
                    <th className="border border-gray-300 bg-gray-50 px-1.5 py-1 text-center font-bold">수집하려는 개인정보 항목</th>
                    <th className="border border-gray-300 bg-gray-50 px-1.5 py-1 text-center font-bold">개인정보의 보유 및 이용 기간</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-gray-300 px-1.5 py-1 text-center">
                      시설 대관 신청업무 처리 및<br />의사소통 경로 확보
                    </td>
                    <td className="border border-gray-300 px-1.5 py-1 text-center">
                      성명(대표자 성명), 생년월일, 연락처,<br />
                      E-mail, 주소, 단체명, 인원 수,<br />
                      사용 목적, 서약자 성명
                    </td>
                    <td className="border border-gray-300 px-1.5 py-1 text-center">
                      수집일로부터 3년 및 대관목적<br />달성 시 지체없이 해당정보 파기
                    </td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-1 text-[9px] text-gray-600 leading-tight print:text-[7px]">
                ※ 개인정보 수집이용에 대한 동의를 거부할 권리가 있으며, 거부 시 대관 신청·진행에 일부 제한이 있습니다.
              </p>
              <div className="mt-1.5 flex items-center gap-3 text-[11px] print:text-[9px]">
                <span className="font-bold text-gray-900">[필수]</span>
                <span>위와 같이 개인정보의 수집 및 이용에 동의합니까?</span>
                <span className="ml-auto flex items-center gap-2">
                  <span>□ 동의</span>
                  <span>□ 미동의</span>
                </span>
              </div>
            </div>

            {/* 5. 서명란 */}
            <div className="mt-3 text-center text-xs text-gray-900 print:mt-2 print:text-[10px]">
              <p>위와 같이 서초여성가족플라자 서초센터 {categoryLabel} 대관을 신청합니다.</p>
              <p className="mt-4 print:mt-3">
                <span className="mr-8">년</span>
                <span className="mr-8">월</span>
                <span>일</span>
              </p>
              <p className="mt-4 print:mt-3">
                신청자: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; (서명/인)
              </p>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════ */}
        {/* ═══ PAGE 1-B: E-스튜디오 대관 신청서 ═══ */}
        {/* ════════════════════════════════════════════ */}
        {isStudio && (
          <div className="page-section">
            <div className="text-center">
              <h1 className="mt-1 text-sm font-bold text-gray-900 print:text-xs">
                서초여성가족플라자 서초센터
              </h1>
              <h2 className="mt-0.5 text-base font-extrabold text-gray-900 print:text-sm">
                E-스튜디오 대관 신청서
              </h2>
            </div>

            {/* 1. 신청자 정보 */}
            <table className="mt-3 w-full border-collapse print:mt-2">
              <tbody>
                <tr>
                  <th className={TH} rowSpan={2} style={{ width: "14%", textAlign: "center", verticalAlign: "middle" }}>
                    신청자명<br />
                    <span className="font-normal text-gray-500 print:text-[7px]">(입금자명)</span>
                  </th>
                  <td className={TD} rowSpan={2} style={{ width: "36%", verticalAlign: "middle" }}>{BLANK}</td>
                  <th className={TH} style={{ width: "14%" }}>연락처</th>
                  <td className={TD} style={{ width: "36%" }}>{BLANK}</td>
                </tr>
                <tr>
                  <th className={TH}>E-mail</th>
                  <td className={TD}>{BLANK}</td>
                </tr>
                <tr>
                  <th className={TH} style={{ textAlign: "center" }}>주소</th>
                  <td className={TD} colSpan={3}>{BLANK}</td>
                </tr>
              </tbody>
            </table>

            {/* 신청내역 헤더 */}
            <div className="mt-2 border border-gray-400 bg-blue-50 px-3 py-1 text-center text-[11px] font-bold text-blue-900 print:mt-1.5 print:text-[9px]">
              신청내역
            </div>

            {/* 2. E-스튜디오 대관 + 촬영장비 */}
            <table className="w-full border-collapse">
              <tbody>
                <tr>
                  <th className={TH} style={{ width: "6%", textAlign: "center", verticalAlign: "middle" }}>1.</th>
                  <td className={TD} colSpan={2}>E-스튜디오 대관 (기본 인원 2명 / 1시간)</td>
                  <td className={TD_R} style={{ width: "14%" }}>20,000원</td>
                  <td className={`${TD} text-center`} style={{ width: "8%" }}>□</td>
                </tr>
                {studioEquipmentItems.map((eq, idx) => (
                  <tr key={eq.key}>
                    {idx === 0 && (
                      <th className={TH} rowSpan={studioEquipmentItems.length} style={{ textAlign: "center", verticalAlign: "middle" }}>
                        2.
                      </th>
                    )}
                    {idx === 0 && (
                      <td className={TH} rowSpan={studioEquipmentItems.length} style={{ textAlign: "center", verticalAlign: "middle", width: "12%" }}>
                        촬영장비
                      </td>
                    )}
                    <td className={TD}>{eq.label}</td>
                    <td className={TD_R}>{formatKRW(eq.fee)}</td>
                    <td className={`${TD} text-center`}>□</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* 장비 동의 */}
            <div className="border border-t-0 border-gray-400 px-3 py-1.5 text-[10px] leading-snug text-gray-800 print:text-[8px]">
              <b>2-1.</b> E-스튜디오 장비 및 시설 사용목록(별지 제2호 서식) 내용을 확인하였으며
              이용규칙을 준수하여 시설 내 장비를 사용할 것을 동의합니다.
            </div>

            {/* 3. 이용목적 / 이용인원 / 대관일시 / 참여비용 */}
            <table className="mt-2 w-full border-collapse print:mt-1.5">
              <tbody>
                <tr>
                  <th className={TH} style={{ width: "18%" }}>
                    이용목적<br />
                    <span className="font-normal text-gray-500 print:text-[7px]">(촬영내용)</span>
                  </th>
                  <td className={TD} colSpan={3}>{BLANK}</td>
                </tr>
                <tr>
                  <th className={TH}>이용인원</th>
                  <td className={TD} colSpan={3}>{BLANK}</td>
                </tr>
                <tr>
                  <th className={TH}>
                    대관일시<br />
                    <span className="font-normal text-gray-500 print:text-[7px]">(일자/시간)</span>
                  </th>
                  <td className={TD} colSpan={3}>{BLANK}</td>
                </tr>
                <tr>
                  <th className={TH}>참여비용</th>
                  <td className={TD} colSpan={3}>{BLANK}</td>
                </tr>
              </tbody>
            </table>

            {/* 4. 개인정보 수집·이용 안내 */}
            <div className="mt-2 rounded border border-gray-400 px-3 py-2 print:mt-1.5 print:px-2 print:py-1.5">
              <h3 className="text-center text-[11px] font-bold text-gray-900 print:text-[9px]">
                개인정보 수집 · 이용에 관한 안내 (* 필수항목)
              </h3>
              <table className="mt-1.5 w-full border-collapse text-[10px] print:text-[8px]">
                <thead>
                  <tr>
                    <th className="border border-gray-300 bg-gray-50 px-1.5 py-1 text-center font-bold">개인정보 수집 · 이용 목적</th>
                    <th className="border border-gray-300 bg-gray-50 px-1.5 py-1 text-center font-bold">수집하려는 개인정보 항목</th>
                    <th className="border border-gray-300 bg-gray-50 px-1.5 py-1 text-center font-bold">개인정보의 보유 및 이용 기간</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-gray-300 px-1.5 py-1 text-center">
                      시설 대관 신청업무 처리 및<br />
                      의사소통 경로 확보
                    </td>
                    <td className="border border-gray-300 px-1.5 py-1 text-center">
                      성명(대표자 성명), 생년월일, 연락처,<br />
                      E-mail, 주소, 단체명, 인원 수,<br />
                      사용 목적, 서약자 성명
                    </td>
                    <td className="border border-gray-300 px-1.5 py-1 text-center">
                      수집일로부터 3년 및 대관목적<br />달성 시 지체없이 해당정보 파기
                    </td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-1 text-[9px] text-gray-600 leading-tight print:text-[7px]">
                ※ 개인정보 수집이용에 대한 동의를 거부할 권리가 있으며, 거부 시 대관 신청·진행에 일부 제한이 있습니다.
              </p>
              <div className="mt-1.5 flex items-center gap-3 text-[11px] print:text-[9px]">
                <span className="font-bold text-gray-900">[필수]</span>
                <span>위와 같이 개인정보의 수집 및 이용에 동의합니까?</span>
                <span className="ml-auto flex items-center gap-2">
                  <span>□ 동의</span>
                  <span>□ 미동의</span>
                </span>
              </div>
            </div>

            {/* 5. 서명란 */}
            <div className="mt-3 text-center text-xs text-gray-900 print:mt-2 print:text-[10px]">
              <p>위와 같이 서초여성가족플라자 서초센터 E-스튜디오 대관을 신청합니다.</p>
              <p className="mt-4 print:mt-3">
                <span className="mr-8">년</span>
                <span className="mr-8">월</span>
                <span>일</span>
              </p>
              <p className="mt-4 print:mt-3">
                신청자: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; (서명/인)
              </p>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════ */}
        {/* ═══ PAGE 1-C: 우리동네 갤러리 대관 신청서 ═══ */}
        {/* ═══════════════════════════════════════════════ */}
        {isGallery && (
          <div className="page-section">
            <div className="text-center">
              <h1 className="mt-1 text-sm font-bold text-gray-900 print:text-xs">
                서초여성가족플라자 서초센터
              </h1>
              <h2 className="mt-0.5 text-base font-extrabold text-gray-900 print:text-sm">
                우리동네 갤러리 대관 신청서
              </h2>
            </div>

            {/* 1. 신청자 정보 */}
            <table className="mt-3 w-full border-collapse print:mt-2">
              <tbody>
                <tr>
                  <th className={TH} style={{ width: "14%" }}>신청자명</th>
                  <td className={TD} style={{ width: "36%" }}>{BLANK}</td>
                  <th className={TH} style={{ width: "14%" }}>생년월일</th>
                  <td className={TD} style={{ width: "36%" }}>{BLANK}</td>
                </tr>
                <tr>
                  <th className={TH}>연락처</th>
                  <td className={TD}>{BLANK}</td>
                  <th className={TH}>E-mail</th>
                  <td className={TD}>{BLANK}</td>
                </tr>
                <tr>
                  <th className={TH}>주소</th>
                  <td className={TD} colSpan={3}>{BLANK}</td>
                </tr>
                <tr>
                  <th className={TH}>단체명</th>
                  <td className={TD}>{BLANK}</td>
                  <th className={TH}>관람인원</th>
                  <td className={TD}>{BLANK}</td>
                </tr>
              </tbody>
            </table>

            {/* 2. 전시 정보 */}
            <table className="mt-2 w-full border-collapse print:mt-1.5">
              <tbody>
                <tr>
                  <th className={TH} style={{ width: "18%" }}>전시명</th>
                  <td className={TD} colSpan={3}>{BLANK}</td>
                </tr>
                <tr>
                  <th className={TH}>전시 기간</th>
                  <td className={TD} colSpan={3}>{BLANK}</td>
                </tr>
                <tr>
                  <th className={TH}>준비일</th>
                  <td className={TD}>{BLANK}</td>
                  <th className={TH} style={{ width: "14%" }}>철수시간</th>
                  <td className={TD}>{BLANK}</td>
                </tr>
                <tr>
                  <th className={TH}>전시 목적</th>
                  <td className={TD} colSpan={3}>{BLANK}</td>
                </tr>
                <tr>
                  <th className={TH}>장르 · 내용</th>
                  <td className={TD} colSpan={3}>{BLANK}</td>
                </tr>
                <tr>
                  <th className={TH}>인지 경로</th>
                  <td className={TD} colSpan={3}>
                    <span className="text-[10px] text-gray-500">
                      □ 홈페이지 &nbsp; □ 전단지 &nbsp; □ 구청 &nbsp; □ 지인 소개 &nbsp; □ 기타
                    </span>
                  </td>
                </tr>
                <tr>
                  <th className={TH}>특이사항</th>
                  <td className={TD} colSpan={3}>{BLANK}</td>
                </tr>
              </tbody>
            </table>

            {/* 3. 대관비용 */}
            <table className="mt-2 w-full border-collapse print:mt-1.5">
              <tbody>
                <tr>
                  <th className={TH} style={{ width: "18%" }}>
                    대관비용<br />
                    <span className="font-normal text-gray-500 print:text-[7px]">(※담당자 기재)</span>
                  </th>
                  <td className={TD} colSpan={3}>{BLANK}</td>
                </tr>
              </tbody>
            </table>

            {/* 4. 대관료 안내 */}
            <div className="mt-2 rounded border border-gray-400 px-3 py-1.5 print:mt-1.5 print:px-2 print:py-1">
              <h4 className="text-[10px] font-bold text-gray-700 print:text-[8px]">대관료 안내</h4>
              <table className="mt-1 w-full border-collapse text-[10px] print:text-[8px]">
                <thead>
                  <tr>
                    <th className="border border-gray-300 bg-gray-50 px-1.5 py-0.5 text-center font-bold">구분</th>
                    <th className="border border-gray-300 bg-gray-50 px-1.5 py-0.5 text-center font-bold">1일 대관료</th>
                    <th className="border border-gray-300 bg-gray-50 px-1.5 py-0.5 text-center font-bold">비고</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-gray-300 px-1.5 py-0.5 text-center">평일</td>
                    <td className="border border-gray-300 px-1.5 py-0.5 text-center">20,000원</td>
                    <td className="border border-gray-300 px-1.5 py-0.5 text-center" rowSpan={3}>
                      준비(세팅)일 1일 무료
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-gray-300 px-1.5 py-0.5 text-center">토요일</td>
                    <td className="border border-gray-300 px-1.5 py-0.5 text-center">10,000원</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-300 px-1.5 py-0.5 text-center">일요일 · 공휴일</td>
                    <td className="border border-gray-300 px-1.5 py-0.5 text-center">휴관</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 5. 개인정보 수집·이용 안내 */}
            <div className="mt-2 rounded border border-gray-400 px-3 py-2 print:mt-1.5 print:px-2 print:py-1.5">
              <h3 className="text-center text-[11px] font-bold text-gray-900 print:text-[9px]">
                개인정보 수집 · 이용에 관한 안내 (* 필수항목)
              </h3>
              <table className="mt-1.5 w-full border-collapse text-[10px] print:text-[8px]">
                <thead>
                  <tr>
                    <th className="border border-gray-300 bg-gray-50 px-1.5 py-1 text-center font-bold">개인정보 수집 · 이용 목적</th>
                    <th className="border border-gray-300 bg-gray-50 px-1.5 py-1 text-center font-bold">수집하려는 개인정보 항목</th>
                    <th className="border border-gray-300 bg-gray-50 px-1.5 py-1 text-center font-bold">개인정보의 보유 및 이용 기간</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-gray-300 px-1.5 py-1 text-center">
                      갤러리 대관 신청업무 처리 및<br />의사소통 경로 확보
                    </td>
                    <td className="border border-gray-300 px-1.5 py-1 text-center">
                      이름(또는 단체명), 대표자 성명,<br />
                      연락처, E-mail, 주소, 생년월일
                    </td>
                    <td className="border border-gray-300 px-1.5 py-1 text-center">
                      수집일로부터 3년 및 대관목적<br />달성 시 지체없이 해당정보 파기
                    </td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-1 text-[9px] text-gray-600 leading-tight print:text-[7px]">
                ※ 개인정보 수집이용에 대한 동의를 거부할 권리가 있으며, 거부 시 대관 신청·진행에 일부 제한이 있습니다.
              </p>
              <div className="mt-1.5 flex items-center gap-3 text-[11px] print:text-[9px]">
                <span className="font-bold text-gray-900">[필수]</span>
                <span>위와 같이 개인정보의 수집 및 이용에 동의합니까?</span>
                <span className="ml-auto flex items-center gap-2">
                  <span>□ 동의</span>
                  <span>□ 미동의</span>
                </span>
              </div>
            </div>

            {/* 6. 서명란 */}
            <div className="mt-3 text-center text-xs text-gray-900 print:mt-2 print:text-[10px]">
              <p>위와 같이 서초여성가족플라자 서초센터 우리동네 갤러리 대관을 신청합니다.</p>
              <p className="mt-4 print:mt-3">
                <span className="mr-8">년</span>
                <span className="mr-8">월</span>
                <span>일</span>
              </p>
              <p className="mt-4 print:mt-3">
                신청자: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; (서명/인)
              </p>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════ */}
        {/* ═══ PAGE 2: 대관규정 서약서 ═══ */}
        {/* ════════════════════════════════════ */}
        <div className="page-section mt-10 print:mt-0">
          <div className="no-print mb-6 border-t-4 border-dashed border-gray-300 pt-4 text-center text-xs text-gray-400">
            ─── 서약서 (인쇄 시 2페이지) ───
          </div>

          <div className="text-center">
            <h1 className="text-sm font-bold text-gray-900 print:text-xs">
              서초여성가족플라자 서초센터
            </h1>
            <h2 className="mt-0.5 text-base font-extrabold text-gray-900 print:text-sm">
              {PLEDGE_TITLE}
            </h2>
          </div>

          <p className="mt-3 text-xs leading-relaxed text-gray-900 print:mt-2 print:text-[9px] print:leading-snug">
            {PLEDGE_INTRO}
          </p>

          <div className="mt-2.5 space-y-1.5 print:mt-1.5 print:space-y-1">
            {pledgeSections.map((sec) => (
              <div key={sec.title}>
                <h4 className="text-xs font-bold text-gray-900 print:text-[9px]">
                  {sec.title}
                </h4>
                <ul className="mt-0.5 list-disc space-y-0 pl-4 text-[11px] leading-snug text-gray-800 print:pl-3 print:text-[8.5px] print:leading-tight">
                  {sec.bullets.map((b, idx) => (
                    <li key={idx}>{b}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* 운영시간 안내 */}
          <div className="mt-3 print:mt-2">
            <h4 className="text-xs font-bold text-gray-900 print:text-[9px]">
              ※ {categoryLabel} 운영시간 안내
            </h4>
            <table className="mt-1 w-full border-collapse text-[11px] print:text-[9px]">
              <thead>
                <tr>
                  <th className={TH} style={{ width: "25%" }}>구분</th>
                  <th className={TH}>운영시간</th>
                </tr>
              </thead>
              <tbody>
                {opLines.map((line) => (
                  <tr key={line.label}>
                    <td className={`${TD} text-center font-semibold`}>{line.label}</td>
                    <td className={TD}>{line.text}</td>
                  </tr>
                ))}
                <tr>
                  <td className={`${TD} text-center font-semibold`}>휴관</td>
                  <td className={TD}>일요일 및 공휴일</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-0.5 text-[10px] text-gray-500 print:text-[8px]">
              ※ 기관 휴관 상황 시 운영 불가
            </p>
          </div>

          <p className="mt-3 text-xs font-semibold text-gray-900 print:mt-2 print:text-[9px]">
            {PLEDGE_FOOTER}
          </p>

          {/* 서약 서명란 */}
          <div className="mt-4 rounded border border-gray-300 bg-gray-50 px-3 py-3 print:mt-3 print:px-2 print:py-2">
            <table className="w-full border-collapse text-[11px] print:text-[9px]">
              <tbody>
                <tr>
                  <th className={TH} style={{ width: "18%" }}>서약 일자</th>
                  <td className={TD}>{BLANK}</td>
                  <th className={TH} style={{ width: "14%" }}>연락처</th>
                  <td className={TD}>{BLANK}</td>
                </tr>
                <tr>
                  <th className={TH}>서약자</th>
                  <td className={TD}>{BLANK}</td>
                  <th className={TH}>대관 시설</th>
                  <td className={TD}>{categoryLabel}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-3 text-center text-xs text-gray-900 print:mt-2 print:text-[10px]">
            <p className="mt-4 print:mt-3">
              <span className="mr-8">년</span>
              <span className="mr-8">월</span>
              <span>일</span>
            </p>
            <p className="mt-4 print:mt-3">
              서약자: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; (서명/인)
            </p>
          </div>

          <div className="mt-4 border-t border-gray-300 pt-2 text-center text-xs font-bold text-gray-900 print:mt-2 print:pt-1 print:text-[10px]">
            서초여성가족플라자 서초센터장 귀하
          </div>
        </div>
      </main>
    </>
  );
}
