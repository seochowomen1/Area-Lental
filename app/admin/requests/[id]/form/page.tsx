import { redirect } from "next/navigation";

import PrintActions from "./PrintActions";

import { assertAdminAuth } from "@/lib/adminAuth";
import { pickFeeBasisSessions } from "@/lib/bundle";
import { getDatabase } from "@/lib/database";
import {
  computeBaseTotalKRW,
  computeFeesForBundle,
  computeFeesForRequest,
  computeDurationHours,
  formatKRW,
} from "@/lib/pricing";
import { EQUIPMENT_FEE_KRW, STUDIO_EQUIPMENT_FEE_KRW, STUDIO_EQUIPMENT_LABELS } from "@/lib/config";
import {
  getCategoryLabel,
  getRoom,
  getRoomsByCategory,
  normalizeRoomCategory,
  type SpaceRoom,
} from "@/lib/space";
import { dayOfWeek } from "@/lib/datetime";
import { operatingNoticeLines } from "@/lib/operating";
import {
  PLEDGE_TITLE,
  PLEDGE_INTRO,
  PLEDGE_SECTIONS,
  PLEDGE_FOOTER,
} from "@/lib/pledge";
import type { RentalRequest } from "@/lib/types";

export const runtime = "nodejs";

function sortSessions(list: RentalRequest[]) {
  return list
    .slice()
    .sort(
      (a, b) =>
        (a.batchSeq ?? 0) - (b.batchSeq ?? 0) ||
        `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`)
    );
}

/** galleryRemovalTime이 비어 있으면 galleryAuditJson에서 추출(구버전 데이터 호환) */
function resolveGalleryRemovalTime(req: RentalRequest): string | undefined {
  if (req.galleryRemovalTime) return req.galleryRemovalTime;
  if (req.galleryAuditJson) {
    try {
      const audit = JSON.parse(req.galleryAuditJson);
      if (typeof audit.removalTime === "string" && audit.removalTime) return audit.removalTime;
    } catch { /* ignore */ }
  }
  return undefined;
}

/* ── Shared table cell styles (compact for A4) ── */
const TH =
  "border border-gray-400 bg-gray-50 px-2 py-1 text-left text-[11px] font-bold text-gray-900 whitespace-nowrap print:px-1.5 print:py-0.5 print:text-[9px]";
const TD =
  "border border-gray-400 px-2 py-1 text-xs text-gray-900 print:px-1.5 print:py-0.5 print:text-[9px]";
const TD_R = `${TD} text-right tabular-nums`;

export default async function AdminRequestFormPage({
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
      `/admin/requests/${encodeURIComponent(req.requestId)}/form?category=${encodeURIComponent(inferredCategory)}`
    );
  }
  const normalizedCategory = normalizeRoomCategory(rawCategory);

  const categoryLabel = getCategoryLabel(normalizedCategory);
  const isLecture = normalizedCategory === "lecture";
  const isGallery = normalizedCategory === "gallery";

  /* ── batch / session ── */
  const batchList = req.batchId
    ? await db.getRequestsByBatchId(req.batchId)
    : [];
  const sessions = req.batchId
    ? sortSessions(batchList.length ? batchList : [req])
    : [req];
  const isBatch = !!req.batchId;

  /* ── fee ── */
  const feeBasisSessions = isBatch ? pickFeeBasisSessions(sessions) : sessions;
  const feeBasis = isBatch
    ? computeFeesForBundle(feeBasisSessions)
    : computeFeesForRequest(req);

  /* ── room list for selection table (lecture only) ── */
  const categoryRooms = isLecture ? getRoomsByCategory("lecture") : [];

  /* ── group rooms by section ── */
  type RoomGroup = { label: string; rooms: SpaceRoom[] };
  let roomGroups: RoomGroup[] = [];
  if (isLecture) {
    const special = categoryRooms.filter((r) => r.feeKRW >= 100000);
    const general = categoryRooms.filter((r) => r.feeKRW < 100000);
    if (special.length)
      roomGroups.push({ label: "강당 및 특수강의실", rooms: special });
    if (general.length)
      roomGroups.push({ label: "일반 강의실", rooms: general });
  }

  /* ── equipment items ── */
  const equipmentItems = [
    { key: "laptop" as const, label: "노트북", fee: EQUIPMENT_FEE_KRW.laptop },
    {
      key: "projector" as const,
      label: "빔프로젝트",
      fee: EQUIPMENT_FEE_KRW.projector,
    },
    { key: "audio" as const, label: "음향장비", fee: EQUIPMENT_FEE_KRW.audio },
  ];

  /* ── studio equipment items (config 기반) ── */
  const studioEquipmentKeys = Object.keys(STUDIO_EQUIPMENT_FEE_KRW) as Array<keyof typeof STUDIO_EQUIPMENT_FEE_KRW>;
  const studioEquipmentItems = studioEquipmentKeys.map((key) => ({
    key,
    label: STUDIO_EQUIPMENT_LABELS[key],
    fee: STUDIO_EQUIPMENT_FEE_KRW[key],
  }));

  /* ── fee detail string ── */
  const baseFeeKRW = feeBasis.totalFeeKRW;
  const discountStr =
    feeBasis.discountAmountKRW > 0
      ? `${feeBasis.discountRatePct.toFixed(0)}% 할인`
      : "";

  const now = new Date();
  const printDate = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")}`;

  // 전자 동의 일시
  const consentDate = req.createdAt
    ? new Date(req.createdAt).toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : printDate;

  /* ── pledge data ── */
  const pledgeSections = PLEDGE_SECTIONS;
  const opLines = operatingNoticeLines(req.roomId);

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
        {/* ── 인쇄 버튼 ── */}
        <PrintActions />

        {/* ════════════════════════════════════════════ */}
        {/* ═══ PAGE 1: 대관 신청서 (강의실 전용) ═══ */}
        {/* ════════════════════════════════════════════ */}
        {isLecture && (
          <div className="page-section">
            {/* ── 문서 헤더 ── */}
            <div className="text-center">
              <h1 className="mt-1 text-sm font-bold text-gray-900 print:text-xs">
                서초여성가족플라자 서초센터
              </h1>
              <h2 className="mt-0.5 text-base font-extrabold text-gray-900 print:text-sm">
                &lsquo;센터 {categoryLabel}&rsquo; 대관 신청서
              </h2>
            </div>

            {/* ── 1. 신청자 정보 ── */}
            <table className="mt-3 w-full border-collapse print:mt-2">
              <tbody>
                <tr>
                  <th className={TH} style={{ width: "14%" }}>
                    신청자명
                  </th>
                  <td className={TD} style={{ width: "36%" }}>
                    {req.applicantName}
                  </td>
                  <th className={TH} style={{ width: "14%" }}>
                    생년월일
                  </th>
                  <td className={TD} style={{ width: "36%" }}>
                    {req.birth || "-"}
                  </td>
                </tr>
                <tr>
                  <th className={TH}>연락처</th>
                  <td className={TD}>{req.phone}</td>
                  <th className={TH}>E-mail</th>
                  <td className={TD}>{req.email}</td>
                </tr>
                <tr>
                  <th className={TH}>주소</th>
                  <td className={TD} colSpan={3}>
                    {req.address || "-"}
                  </td>
                </tr>
                <tr>
                  <th className={TH}>단체명</th>
                  <td className={TD}>{req.orgName || "-"}</td>
                  <th className={TH}>참여인원</th>
                  <td className={TD}>{req.headcount}명</td>
                </tr>
              </tbody>
            </table>

            {/* ── 2. 공간 선택 테이블 ── */}
            <table className="mt-2 w-full border-collapse print:mt-1.5">
              <thead>
                <tr>
                  <th className={TH} style={{ width: "20%" }}>
                    구분
                  </th>
                  <th className={TH}>공간명</th>
                  <th className={TH} style={{ width: "13%" }}>
                    수용인원
                  </th>
                  <th className={TH} style={{ width: "9%" }}>
                    선택
                  </th>
                  <th className={TH} style={{ width: "16%" }}>
                    대관료(시간당)
                  </th>
                </tr>
              </thead>
              <tbody>
                {roomGroups.map((group) => {
                  const feeRanges: {
                    startIdx: number;
                    count: number;
                    fee: number;
                  }[] = [];
                  group.rooms.forEach((r, i) => {
                    const last = feeRanges[feeRanges.length - 1];
                    if (last && last.fee === r.feeKRW) {
                      last.count++;
                    } else {
                      feeRanges.push({ startIdx: i, count: 1, fee: r.feeKRW });
                    }
                  });
                  const feeStartSet = new Set(
                    feeRanges.map((f) => f.startIdx)
                  );
                  const feeSpanMap = new Map(
                    feeRanges.map((f) => [f.startIdx, f.count])
                  );

                  return group.rooms.map((r, idx) => (
                    <tr key={r.id}>
                      {idx === 0 && (
                        <th
                          className={TH}
                          rowSpan={group.rooms.length}
                          style={{
                            textAlign: "center",
                            verticalAlign: "middle",
                          }}
                        >
                          {group.label}
                        </th>
                      )}
                      <td className={TD}>{r.name}</td>
                      <td className={`${TD} text-center`}>{r.capacity}명</td>
                      <td className={`${TD} text-center`}>
                        {r.id === req.roomId ? "■" : "□"}
                      </td>
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
                        style={{
                          textAlign: "center",
                          verticalAlign: "middle",
                        }}
                      >
                        기자재
                      </th>
                    )}
                    <td className={TD}>{eq.label}</td>
                    <td className={`${TD} text-center`}>-</td>
                    <td className={`${TD} text-center`}>
                      {req.equipment?.[eq.key] ? "■" : "□"}
                    </td>
                    {idx === 0 && (
                      <td className={TD_R} rowSpan={equipmentItems.length}>
                        {formatKRW(equipmentItems[0].fee)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>

            {/* ── 3. 이용목적 / 대관일시 / 대관비용 ── */}
            <table className="mt-2 w-full border-collapse print:mt-1.5">
              <tbody>
                <tr>
                  <th className={TH} style={{ width: "18%" }}>
                    이용목적
                  </th>
                  <td className={TD} colSpan={3}>
                    {req.purpose || "-"}
                  </td>
                </tr>
                <tr>
                  <th className={TH}>대관일시</th>
                  <td className={TD} colSpan={3}>
                    {isBatch ? (
                      <span className="print:text-[8px]">
                        {sessions.map((s, i) => (
                          <span key={s.requestId}>
                            {i > 0 && " / "}
                            {i + 1}회 {s.date} {s.startTime}~{s.endTime}(
                            {computeDurationHours(s.startTime, s.endTime)}h)
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span>
                        {req.date} &nbsp; {req.startTime} ~ {req.endTime} (
                        {computeDurationHours(req.startTime, req.endTime)}시간)
                      </span>
                    )}
                  </td>
                </tr>
                <tr>
                  <th className={TH}>
                    대관비용
                    <br />
                    <span className="font-normal text-gray-500 print:text-[7px]">
                      (※담당자 기재)
                    </span>
                  </th>
                  <td className={TD} colSpan={3}>
                    <span className="font-semibold">
                      {formatKRW(baseFeeKRW)}
                    </span>
                    {feeBasis.discountAmountKRW > 0 && (
                      <>
                        {" → "}
                        <span className="font-extrabold">
                          {formatKRW(feeBasis.finalFeeKRW)}
                        </span>
                        <span className="text-[10px] text-gray-600 print:text-[8px]">
                          {" "}
                          ({discountStr})
                        </span>
                      </>
                    )}
                    {feeBasis.discountReason && (
                      <span className="ml-2 text-[10px] text-gray-600 print:text-[8px]">
                        사유: {feeBasis.discountReason}
                      </span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* ── 4. 배치 회차 상세 (다회차) ── */}
            {isBatch && (
              <table className="mt-2 w-full border-collapse print:mt-1.5">
                <thead>
                  <tr>
                    <th className={TH}>회차</th>
                    <th className={TH}>일자</th>
                    <th className={TH}>시간</th>
                    <th className={TH}>상태</th>
                    <th className={TH} style={{ textAlign: "right" }}>
                      이용료
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s, i) => {
                    const base = computeBaseTotalKRW(s);
                    return (
                      <tr key={s.requestId}>
                        <td className={`${TD} text-center`}>{i + 1}</td>
                        <td className={TD}>{s.date}</td>
                        <td className={TD}>
                          {s.startTime}~{s.endTime}
                        </td>
                        <td className={`${TD} text-center`}>{s.status}</td>
                        <td className={TD_R}>
                          {formatKRW(base.totalFeeKRW)}
                        </td>
                      </tr>
                    );
                  })}
                  <tr>
                    <th
                      className={TH}
                      colSpan={4}
                      style={{ textAlign: "right" }}
                    >
                      합계
                    </th>
                    <td className={`${TD_R} font-bold`}>
                      {formatKRW(baseFeeKRW)}
                    </td>
                  </tr>
                </tbody>
              </table>
            )}

            {/* ── 5. 개인정보 수집·이용 안내 ── */}
            <div className="mt-2 rounded border border-gray-400 px-3 py-2 print:mt-1.5 print:px-2 print:py-1.5">
              <h3 className="text-center text-[11px] font-bold text-gray-900 print:text-[9px]">
                개인정보 수집 · 이용에 관한 안내 (* 필수항목)
              </h3>
              <table className="mt-1.5 w-full border-collapse text-[10px] print:text-[8px]">
                <thead>
                  <tr>
                    <th className="border border-gray-300 bg-gray-50 px-1.5 py-1 text-center font-bold">
                      개인정보 수집 · 이용 목적
                    </th>
                    <th className="border border-gray-300 bg-gray-50 px-1.5 py-1 text-center font-bold">
                      수집하려는 개인정보 항목
                    </th>
                    <th className="border border-gray-300 bg-gray-50 px-1.5 py-1 text-center font-bold">
                      개인정보의 보유 및 이용 기간
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-gray-300 px-1.5 py-1 text-center">
                      시설 대관 신청업무 처리 및
                      <br />
                      의사소통 경로 확보
                    </td>
                    <td className="border border-gray-300 px-1.5 py-1 text-center">
                      이름(또는 단체명), 대표자 성명,
                      <br />
                      연락처, 성별, E-mail, 주소, 생년월일
                    </td>
                    <td className="border border-gray-300 px-1.5 py-1 text-center">
                      수집일로부터 3년 및 대관목적
                      <br />
                      달성 시 지체없이 해당정보 파기
                    </td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-1 text-[9px] text-gray-600 leading-tight print:text-[7px]">
                ※ 개인정보 수집이용에 대한 동의를 거부할 권리가 있으며, 거부 시
                대관 신청·진행에 일부 제한이 있습니다.
              </p>
              <div className="mt-1.5 flex items-center gap-3 text-[11px] print:text-[9px]">
                <span className="font-bold text-gray-900">[필수]</span>
                <span>
                  위와 같이 개인정보의 수집 및 이용에 동의합니까?
                </span>
                <span className="ml-auto flex items-center gap-2">
                  <span>{req.privacyAgree ? "■" : "□"} 동의</span>
                  <span>{req.privacyAgree ? "□" : "■"} 미동의</span>
                </span>
              </div>
            </div>

            {/* ── 6. 전자 동의 확인 ── */}
            <div className="mt-2 rounded border border-gray-300 bg-gray-50 px-3 py-2 print:mt-1.5 print:px-2 print:py-1">
              <h4 className="text-[10px] font-bold text-gray-700 print:text-[8px]">
                [전자 동의 확인]
              </h4>
              <div className="mt-1 flex flex-wrap gap-x-6 gap-y-0.5 text-[11px] text-gray-800 print:text-[8px]">
                <span>신청 일시: {consentDate}</span>
                <span>
                  개인정보 동의: {req.privacyAgree ? "동의" : "미동의"}
                </span>
                <span>서약 동의: {req.pledgeAgree ? "동의" : "미동의"}</span>
              </div>
              <p className="mt-0.5 text-[9px] text-gray-500 print:text-[7px]">
                본 신청서는 온라인 대관 신청 시 전자적 방식으로 동의한 내용이며,
                신청자의 성명·연락처·동의 일시를 기반으로 서명을 대체합니다.
              </p>
            </div>

            {/* ── 서명란 ── */}
            <div className="mt-3 text-center text-xs text-gray-900 print:mt-2 print:text-[10px]">
              <p>
                위와 같이 서초여성가족플라자 서초센터 {categoryLabel} 대관을
                신청합니다.
              </p>
              <p className="mt-2">{printDate}</p>
              <p className="mt-2">
                신청자: <b>{req.applicantName}</b> &nbsp;&nbsp; (전자 동의 완료)
              </p>
            </div>

            {/* ── 푸터 ── */}
            <div className="mt-4 border-t border-gray-300 pt-2 text-[10px] text-gray-600 print:mt-2 print:pt-1 print:text-[8px]">
              {req.requestId && (
                <p className="mt-0.5 text-gray-400">
                  신청번호: {req.requestId} | 출력일: {printDate}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════ */}
        {/* ═══ PAGE 1-B: E-스튜디오 대관 신청서 (스튜디오 전용) ═══ */}
        {/* ════════════════════════════════════════════════════ */}
        {!isLecture && !isGallery && (
          <div className="page-section">
            {/* ── 문서 헤더 ── */}
            <div className="text-center">
              <h1 className="mt-1 text-sm font-bold text-gray-900 print:text-xs">
                서초여성가족플라자 서초센터
              </h1>
              <h2 className="mt-0.5 text-base font-extrabold text-gray-900 print:text-sm">
                E-스튜디오 대관 신청서
              </h2>
            </div>

            {/* ── 1. 신청자 정보 ── */}
            <table className="mt-3 w-full border-collapse print:mt-2">
              <tbody>
                <tr>
                  <th className={TH} rowSpan={2} style={{ width: "14%", textAlign: "center", verticalAlign: "middle" }}>
                    신청지방
                    <br />
                    <span className="font-normal text-gray-500 print:text-[7px]">(입금지방)</span>
                  </th>
                  <td className={TD} rowSpan={2} style={{ width: "36%", verticalAlign: "middle" }}>
                    {req.applicantName}
                  </td>
                  <th className={TH} style={{ width: "14%" }}>연락처</th>
                  <td className={TD} style={{ width: "36%" }}>{req.phone}</td>
                </tr>
                <tr>
                  <th className={TH}>E-mail</th>
                  <td className={TD}>{req.email}</td>
                </tr>
                <tr>
                  <th className={TH} style={{ textAlign: "center" }}>주소</th>
                  <td className={TD} colSpan={3}>{req.address || "-"}</td>
                </tr>
              </tbody>
            </table>

            {/* ── 신청내역 헤더 ── */}
            <div className="mt-2 border border-gray-400 bg-blue-50 px-3 py-1 text-center text-[11px] font-bold text-blue-900 print:mt-1.5 print:text-[9px]">
              신청내역
            </div>

            {/* ── 2. E-스튜디오 대관 + 촬영장비 ── */}
            <table className="w-full border-collapse">
              <tbody>
                {/* 대관 기본 */}
                <tr>
                  <th className={TH} style={{ width: "6%", textAlign: "center", verticalAlign: "middle" }}>1.</th>
                  <td className={TD} colSpan={2}>
                    E-스튜디오 대관 (기본 인원 2명 / 1시간)
                  </td>
                  <td className={TD_R} style={{ width: "14%" }}>20,000원</td>
                  <td className={`${TD} text-center`} style={{ width: "8%" }}>■</td>
                </tr>

                {/* 촬영장비 */}
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
                    <td className={`${TD} text-center`}>
                      {req.equipment?.[eq.key] ? "■" : "□"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* ── 2-1. 장비 사용 동의 ── */}
            <div className="border border-t-0 border-gray-400 px-3 py-1.5 text-[10px] leading-snug text-gray-800 print:text-[8px]">
              <b>2-1.</b> E-스튜디오 장비 및 시설 사용목록(별지 제2호 서식) 내용을 확인하였으며
              이용규칙을 준수하여 시설 내 장비를 사용할 것을 동의합니다.
            </div>

            {/* ── 3. 이용목적 / 이용인원 / 대관일시 / 참여비용 ── */}
            <table className="mt-2 w-full border-collapse print:mt-1.5">
              <tbody>
                <tr>
                  <th className={TH} style={{ width: "18%" }}>
                    이용목적
                    <br />
                    <span className="font-normal text-gray-500 print:text-[7px]">(촬영내용)</span>
                  </th>
                  <td className={TD} colSpan={3}>
                    {req.purpose || "-"}
                  </td>
                </tr>
                <tr>
                  <th className={TH}>이용인원</th>
                  <td className={TD} colSpan={3}>{req.headcount}명</td>
                </tr>
                <tr>
                  <th className={TH}>
                    대관일시
                    <br />
                    <span className="font-normal text-gray-500 print:text-[7px]">(일자/시간)</span>
                  </th>
                  <td className={TD} colSpan={3}>
                    {isBatch ? (
                      <span className="print:text-[8px]">
                        {sessions.map((s, i) => (
                          <span key={s.requestId}>
                            {i > 0 && " / "}
                            {i + 1}회 {s.date} {s.startTime}~{s.endTime}(
                            {computeDurationHours(s.startTime, s.endTime)}h)
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span>
                        {req.date} &nbsp; {req.startTime} ~ {req.endTime} (
                        {computeDurationHours(req.startTime, req.endTime)}시간)
                      </span>
                    )}
                  </td>
                </tr>
                <tr>
                  <th className={TH}>참여비용</th>
                  <td className={TD} colSpan={3}>
                    <span className="font-semibold">
                      {formatKRW(baseFeeKRW)}
                    </span>
                    {feeBasis.discountAmountKRW > 0 && (
                      <>
                        {" → "}
                        <span className="font-extrabold">
                          {formatKRW(feeBasis.finalFeeKRW)}
                        </span>
                        <span className="text-[10px] text-gray-600 print:text-[8px]">
                          {" "}({discountStr})
                        </span>
                      </>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* ── 4. 배치 회차 상세 (다회차) ── */}
            {isBatch && (
              <table className="mt-2 w-full border-collapse print:mt-1.5">
                <thead>
                  <tr>
                    <th className={TH}>회차</th>
                    <th className={TH}>일자</th>
                    <th className={TH}>시간</th>
                    <th className={TH}>상태</th>
                    <th className={TH} style={{ textAlign: "right" }}>이용료</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s, i) => {
                    const base = computeBaseTotalKRW(s);
                    return (
                      <tr key={s.requestId}>
                        <td className={`${TD} text-center`}>{i + 1}</td>
                        <td className={TD}>{s.date}</td>
                        <td className={TD}>{s.startTime}~{s.endTime}</td>
                        <td className={`${TD} text-center`}>{s.status}</td>
                        <td className={TD_R}>{formatKRW(base.totalFeeKRW)}</td>
                      </tr>
                    );
                  })}
                  <tr>
                    <th className={TH} colSpan={4} style={{ textAlign: "right" }}>합계</th>
                    <td className={`${TD_R} font-bold`}>{formatKRW(baseFeeKRW)}</td>
                  </tr>
                </tbody>
              </table>
            )}

            {/* ── 5. 개인정보 수집·이용 안내 (E-스튜디오) ── */}
            <div className="mt-2 rounded border border-gray-400 px-3 py-2 print:mt-1.5 print:px-2 print:py-1.5">
              <h3 className="text-center text-[11px] font-bold text-blue-900 print:text-[9px]">
                개인정보 수집 · 이용에 관한 안내
              </h3>
              <table className="mt-1.5 w-full border-collapse text-[10px] print:text-[8px]">
                <thead>
                  <tr>
                    <th className="border border-gray-300 bg-gray-50 px-1.5 py-1 text-center font-bold">
                      개인정보의 수집이용 목적
                    </th>
                    <th className="border border-gray-300 bg-gray-50 px-1.5 py-1 text-center font-bold">
                      수집이용하려는 개인정보 항목
                    </th>
                    <th className="border border-gray-300 bg-gray-50 px-1.5 py-1 text-center font-bold">
                      개인정보 이용기간 및 보유기간
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-gray-300 px-1.5 py-1 text-center">
                      E-스튜디오 대관 신청업무 처리 및
                      <br />
                      본인 식별, 의사소통, 수수료 등
                      <br />
                      관련 업무
                    </td>
                    <td className="border border-gray-300 px-1.5 py-1 text-center">
                      이름, 연락처, E-mail, 주소
                    </td>
                    <td className="border border-gray-300 px-1.5 py-1 text-center">
                      E-스튜디오 이용완료 일 해당
                      <br />
                      1년
                    </td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-1 text-[9px] text-gray-600 leading-tight print:text-[7px]">
                ※ 위의 개인정보 수집·이용에 대한 동의를 거부할 권리가 있습니다.
                다만 위 제공사항은 이용신청에 반드시 필요한 사항으로 거부하실 경우 이용에 일부 제한이 있습니다.
              </p>
              <div className="mt-1.5 flex items-center gap-3 text-[11px] print:text-[9px]">
                <span className="font-bold text-gray-900">[필수]</span>
                <span>
                  위와 같이 개인정보의 수집 및 이용에 동의합니까?
                </span>
                <span className="ml-auto flex items-center gap-2">
                  <span>{req.privacyAgree ? "■" : "□"} 동의함</span>
                  <span>{req.privacyAgree ? "□" : "■"} 동의하지 않음</span>
                </span>
              </div>
            </div>

            {/* ── 6. 전자 동의 확인 ── */}
            <div className="mt-2 rounded border border-gray-300 bg-gray-50 px-3 py-2 print:mt-1.5 print:px-2 print:py-1">
              <h4 className="text-[10px] font-bold text-gray-700 print:text-[8px]">
                [전자 동의 확인]
              </h4>
              <div className="mt-1 flex flex-wrap gap-x-6 gap-y-0.5 text-[11px] text-gray-800 print:text-[8px]">
                <span>신청 일시: {consentDate}</span>
                <span>개인정보 동의: {req.privacyAgree ? "동의" : "미동의"}</span>
                <span>서약 동의: {req.pledgeAgree ? "동의" : "미동의"}</span>
              </div>
              <p className="mt-0.5 text-[9px] text-gray-500 print:text-[7px]">
                본 신청서는 온라인 대관 신청 시 전자적 방식으로 동의한 내용이며,
                신청자의 성명·연락처·동의 일시를 기반으로 서명을 대체합니다.
              </p>
            </div>

            {/* ── 서명란 ── */}
            <div className="mt-3 text-center text-xs text-gray-900 print:mt-2 print:text-[10px]">
              <p>
                위와 같이 서초여성가족플라자 서초센터 E-스튜디오 대관을 신청합니다.
              </p>
              <p className="mt-2">{printDate}</p>
              <p className="mt-2">
                신청자: <b>{req.applicantName}</b> &nbsp;&nbsp; (전자 동의 완료)
              </p>
            </div>

            {/* ── 푸터 ── */}
            <div className="mt-4 border-t border-gray-300 pt-2 text-[10px] text-gray-600 print:mt-2 print:pt-1 print:text-[8px]">
              {req.requestId && (
                <p className="mt-0.5 text-gray-400">
                  신청번호: {req.requestId} | 출력일: {printDate}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════ */}
        {/* ═══ PAGE 1-C: 우리동네 갤러리 대관 신청서 (갤러리 전용) ═══ */}
        {/* ════════════════════════════════════════════════════════ */}
        {isGallery && (
          <div className="page-section">
            {/* ── 문서 헤더 ── */}
            <div className="text-center">
              <h1 className="mt-1 text-sm font-bold text-gray-900 print:text-xs">
                서초여성가족플라자 서초센터
              </h1>
              <h2 className="mt-0.5 text-base font-extrabold text-gray-900 print:text-sm">
                우리동네 갤러리 대관 신청서
              </h2>
            </div>

            {/* ── 1. 신청자 정보 ── */}
            <table className="mt-3 w-full border-collapse print:mt-2">
              <tbody>
                <tr>
                  <th className={TH} style={{ width: "14%" }}>
                    신청자명
                  </th>
                  <td className={TD} style={{ width: "36%" }}>
                    {req.applicantName}
                  </td>
                  <th className={TH} style={{ width: "14%" }}>
                    생년월일
                  </th>
                  <td className={TD} style={{ width: "36%" }}>
                    {req.birth || "-"}
                  </td>
                </tr>
                <tr>
                  <th className={TH}>연락처</th>
                  <td className={TD}>{req.phone}</td>
                  <th className={TH}>E-mail</th>
                  <td className={TD}>{req.email}</td>
                </tr>
                <tr>
                  <th className={TH}>주소</th>
                  <td className={TD} colSpan={3}>
                    {req.address || "-"}
                  </td>
                </tr>
                <tr>
                  <th className={TH}>단체명</th>
                  <td className={TD}>{req.orgName || "-"}</td>
                  <th className={TH}>관람인원</th>
                  <td className={TD}>{req.headcount}명</td>
                </tr>
              </tbody>
            </table>

            {/* ── 2. 전시 정보 ── */}
            <table className="mt-2 w-full border-collapse print:mt-1.5">
              <tbody>
                <tr>
                  <th className={TH} style={{ width: "18%" }}>전시명</th>
                  <td className={TD} colSpan={3}>
                    {req.exhibitionTitle || "-"}
                  </td>
                </tr>
                <tr>
                  <th className={TH}>전시 기간</th>
                  <td className={TD} colSpan={3}>
                    {req.startDate && req.endDate
                      ? `${req.startDate} ~ ${req.endDate}`
                      : req.date}
                    {req.galleryExhibitionDayCount
                      ? ` (전시 ${req.galleryExhibitionDayCount}일)`
                      : ""}
                    {req.galleryPrepDate
                      ? ` / 준비일: ${req.galleryPrepDate}`
                      : ""}
                  </td>
                </tr>
                <tr>
                  <th className={TH}>철수시간</th>
                  <td className={TD} colSpan={3}>
                    {(() => {
                      const rt = resolveGalleryRemovalTime(req);
                      return rt
                        ? `종료일(${req.endDate ?? req.date}) ${rt}까지`
                        : "-";
                    })()}
                  </td>
                </tr>
                <tr>
                  <th className={TH}>전시 목적</th>
                  <td className={TD} colSpan={3}>
                    {req.exhibitionPurpose || req.purpose || "-"}
                  </td>
                </tr>
                <tr>
                  <th className={TH}>장르 · 내용</th>
                  <td className={TD} colSpan={3}>
                    {req.genreContent || "-"}
                  </td>
                </tr>
                <tr>
                  <th className={TH}>인지 경로</th>
                  <td className={TD} colSpan={3}>
                    {req.awarenessPath || "-"}
                  </td>
                </tr>
                {req.specialNotes && (
                  <tr>
                    <th className={TH}>특이사항</th>
                    <td className={TD} colSpan={3}>
                      {req.specialNotes}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* ── 3. 대관 일정 상세 (배치 회차) ── */}
            {isBatch && (
              <table className="mt-2 w-full border-collapse print:mt-1.5">
                <thead>
                  <tr>
                    <th className={TH} style={{ width: "8%" }}>회차</th>
                    <th className={TH}>일자</th>
                    <th className={TH} style={{ width: "14%" }}>구분</th>
                    <th className={TH} style={{ width: "12%" }}>요일</th>
                    <th className={TH} style={{ textAlign: "right", width: "16%" }}>이용료</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s, i) => {
                    const base = computeBaseTotalKRW(s);
                    const dow = ["일", "월", "화", "수", "목", "금", "토"][dayOfWeek(s.date)];
                    return (
                      <tr key={s.requestId}>
                        <td className={`${TD} text-center`}>{i + 1}</td>
                        <td className={TD}>{s.date}</td>
                        <td className={`${TD} text-center`}>
                          {s.isPrepDay ? "준비일" : "전시일"}
                        </td>
                        <td className={`${TD} text-center`}>{dow}</td>
                        <td className={TD_R}>
                          {s.isPrepDay ? "무료" : formatKRW(base.totalFeeKRW)}
                        </td>
                      </tr>
                    );
                  })}
                  <tr>
                    <th className={TH} colSpan={4} style={{ textAlign: "right" }}>
                      합계
                    </th>
                    <td className={`${TD_R} font-bold`}>
                      {formatKRW(baseFeeKRW)}
                    </td>
                  </tr>
                </tbody>
              </table>
            )}

            {/* ── 3-1. 단건(1행) 형식: 일정 요약 + 비용 ── */}
            {!isBatch && (
              <table className="mt-2 w-full border-collapse print:mt-1.5">
                <tbody>
                  <tr>
                    <th className={TH} style={{ width: "18%" }}>
                      대관비용
                      <br />
                      <span className="font-normal text-gray-500 print:text-[7px]">
                        (※담당자 기재)
                      </span>
                    </th>
                    <td className={TD} colSpan={3}>
                      <span className="font-semibold">
                        {formatKRW(baseFeeKRW)}
                      </span>
                      {(req.galleryWeekdayCount ?? 0) > 0 && (
                        <span className="ml-2 text-[10px] text-gray-600 print:text-[8px]">
                          평일 {req.galleryWeekdayCount}일 × 20,000원
                        </span>
                      )}
                      {(req.gallerySaturdayCount ?? 0) > 0 && (
                        <span className="ml-2 text-[10px] text-gray-600 print:text-[8px]">
                          토요일 {req.gallerySaturdayCount}일 × 10,000원
                        </span>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            )}

            {/* ── 4. 대관료 안내 ── */}
            <div className="mt-2 rounded border border-gray-400 px-3 py-1.5 print:mt-1.5 print:px-2 print:py-1">
              <h4 className="text-[10px] font-bold text-gray-700 print:text-[8px]">
                대관료 안내
              </h4>
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

            {/* ── 5. 개인정보 수집·이용 안내 ── */}
            <div className="mt-2 rounded border border-gray-400 px-3 py-2 print:mt-1.5 print:px-2 print:py-1.5">
              <h3 className="text-center text-[11px] font-bold text-gray-900 print:text-[9px]">
                개인정보 수집 · 이용에 관한 안내 (* 필수항목)
              </h3>
              <table className="mt-1.5 w-full border-collapse text-[10px] print:text-[8px]">
                <thead>
                  <tr>
                    <th className="border border-gray-300 bg-gray-50 px-1.5 py-1 text-center font-bold">
                      개인정보 수집 · 이용 목적
                    </th>
                    <th className="border border-gray-300 bg-gray-50 px-1.5 py-1 text-center font-bold">
                      수집하려는 개인정보 항목
                    </th>
                    <th className="border border-gray-300 bg-gray-50 px-1.5 py-1 text-center font-bold">
                      개인정보의 보유 및 이용 기간
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-gray-300 px-1.5 py-1 text-center">
                      갤러리 대관 신청업무 처리 및
                      <br />
                      의사소통 경로 확보
                    </td>
                    <td className="border border-gray-300 px-1.5 py-1 text-center">
                      이름(또는 단체명), 대표자 성명,
                      <br />
                      연락처, E-mail, 주소, 생년월일
                    </td>
                    <td className="border border-gray-300 px-1.5 py-1 text-center">
                      수집일로부터 3년 및 대관목적
                      <br />
                      달성 시 지체없이 해당정보 파기
                    </td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-1 text-[9px] text-gray-600 leading-tight print:text-[7px]">
                ※ 개인정보 수집이용에 대한 동의를 거부할 권리가 있으며, 거부 시
                대관 신청·진행에 일부 제한이 있습니다.
              </p>
              <div className="mt-1.5 flex items-center gap-3 text-[11px] print:text-[9px]">
                <span className="font-bold text-gray-900">[필수]</span>
                <span>
                  위와 같이 개인정보의 수집 및 이용에 동의합니까?
                </span>
                <span className="ml-auto flex items-center gap-2">
                  <span>{req.privacyAgree ? "■" : "□"} 동의</span>
                  <span>{req.privacyAgree ? "□" : "■"} 미동의</span>
                </span>
              </div>
            </div>

            {/* ── 6. 전자 동의 확인 ── */}
            <div className="mt-2 rounded border border-gray-300 bg-gray-50 px-3 py-2 print:mt-1.5 print:px-2 print:py-1">
              <h4 className="text-[10px] font-bold text-gray-700 print:text-[8px]">
                [전자 동의 확인]
              </h4>
              <div className="mt-1 flex flex-wrap gap-x-6 gap-y-0.5 text-[11px] text-gray-800 print:text-[8px]">
                <span>신청 일시: {consentDate}</span>
                <span>
                  개인정보 동의: {req.privacyAgree ? "동의" : "미동의"}
                </span>
                <span>서약 동의: {req.pledgeAgree ? "동의" : "미동의"}</span>
              </div>
              <p className="mt-0.5 text-[9px] text-gray-500 print:text-[7px]">
                본 신청서는 온라인 대관 신청 시 전자적 방식으로 동의한 내용이며,
                신청자의 성명·연락처·동의 일시를 기반으로 서명을 대체합니다.
              </p>
            </div>

            {/* ── 서명란 ── */}
            <div className="mt-3 text-center text-xs text-gray-900 print:mt-2 print:text-[10px]">
              <p>
                위와 같이 서초여성가족플라자 서초센터 우리동네 갤러리 대관을
                신청합니다.
              </p>
              <p className="mt-2">{printDate}</p>
              <p className="mt-2">
                신청자: <b>{req.applicantName}</b> &nbsp;&nbsp; (전자 동의 완료)
              </p>
            </div>

            {/* ── 푸터 ── */}
            <div className="mt-4 border-t border-gray-300 pt-2 text-[10px] text-gray-600 print:mt-2 print:pt-1 print:text-[8px]">
              {req.requestId && (
                <p className="mt-0.5 text-gray-400">
                  신청번호: {req.requestId} | 출력일: {printDate}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════ */}
        {/* ═══ PAGE 2: 대관규정 서약서 ═══ */}
        {/* ════════════════════════════════════════════ */}
        <div className="page-section mt-10 print:mt-0">
          {/* 화면에서 신청서와 서약서 사이 구분선 (인쇄 시 숨김) */}
          <div className="no-print mb-6 border-t-4 border-dashed border-gray-300 pt-4 text-center text-xs text-gray-400">
            ─── 서약서 (인쇄 시 2페이지) ───
          </div>

          {/* ── 문서 헤더 ── */}
          <div className="text-center">
            <h1 className="text-sm font-bold text-gray-900 print:text-xs">
              서초여성가족플라자 서초센터
            </h1>
            <h2 className="mt-0.5 text-base font-extrabold text-gray-900 print:text-sm">
              {PLEDGE_TITLE}
            </h2>
          </div>

          {/* ── 서약 서문 ── */}
          <p className="mt-3 text-xs leading-relaxed text-gray-900 print:mt-2 print:text-[9px] print:leading-snug">
            {PLEDGE_INTRO}
          </p>

          {/* ── 서약 조항 (가~사) ── */}
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

          {/* ── 운영시간 안내 ── */}
          <div className="mt-3 print:mt-2">
            <h4 className="text-xs font-bold text-gray-900 print:text-[9px]">
              ※ {categoryLabel} 운영시간 안내
            </h4>
            <table className="mt-1 w-full border-collapse text-[11px] print:text-[9px]">
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
            <p className="mt-0.5 text-[10px] text-gray-500 print:text-[8px]">
              ※ 기관 휴관 상황 시 운영 불가
            </p>
          </div>

          {/* ── 서약 푸터 ── */}
          <p className="mt-3 text-xs font-semibold text-gray-900 print:mt-2 print:text-[9px]">
            {PLEDGE_FOOTER}
          </p>

          {/* ── 전자 서약 확인란 ── */}
          <div className="mt-3 rounded border border-gray-300 bg-gray-50 px-3 py-2 print:mt-2 print:px-2 print:py-1.5">
            <h4 className="text-[10px] font-bold text-gray-700 print:text-[8px]">
              [전자 서약 확인]
            </h4>
            <table className="mt-1 w-full border-collapse text-[11px] print:text-[9px]">
              <tbody>
                <tr>
                  <th className={TH} style={{ width: "18%" }}>
                    서약 일시
                  </th>
                  <td className={TD}>{consentDate}</td>
                  <th className={TH} style={{ width: "14%" }}>
                    연락처
                  </th>
                  <td className={TD}>{req.phone}</td>
                </tr>
                <tr>
                  <th className={TH}>서약자</th>
                  <td className={TD}>
                    <b>{req.applicantName}</b>
                    {req.orgName ? ` (${req.orgName})` : ""}
                  </td>
                  <th className={TH}>대관 시설</th>
                  <td className={TD}>
                    {room?.name ?? req.roomId} ({categoryLabel})
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="mt-1 text-[9px] text-gray-500 print:text-[7px]">
              본 서약은 온라인 대관 신청 시 전자적 방식으로 동의한 내용이며,
              신청자의 성명·연락처·동의 일시를 기반으로 서명을 대체합니다.
            </p>
          </div>

          {/* ── 서명란 ── */}
          <div className="mt-3 text-center text-xs text-gray-900 print:mt-2 print:text-[10px]">
            <p>{printDate}</p>
            <p className="mt-2">
              서약자: <b>{req.applicantName}</b> &nbsp;&nbsp; (전자 동의 완료)
            </p>
          </div>

          {/* ── 푸터 ── */}
          <div className="mt-4 border-t border-gray-300 pt-2 text-center text-xs font-bold text-gray-900 print:mt-2 print:pt-1 print:text-[10px]">
            서초여성가족플라자 서초센터장 귀하
          </div>

          <div className="mt-2 text-[10px] text-gray-500 print:text-[8px]">
            {req.requestId && (
              <p className="mt-0.5 text-gray-400">
                신청번호: {req.requestId} | 출력일: {printDate}
              </p>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
