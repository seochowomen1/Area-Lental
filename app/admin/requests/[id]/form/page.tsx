import { redirect } from "next/navigation";

import PrintActions from "./PrintActions";

import { assertAdminAuth } from "@/lib/adminAuth";
import { pickFeeBasisSessions } from "@/lib/bundle";
import { getDatabase } from "@/lib/database";
import { dayOfWeek } from "@/lib/datetime";
import {
  computeBaseTotalKRW,
  computeFeesForBundle,
  computeFeesForRequest,
  computeDurationHours,
  formatKRW,
} from "@/lib/pricing";
import { EQUIPMENT_FEE_KRW } from "@/lib/config";
import {
  getCategoryLabel,
  getRoom,
  getRoomsByCategory,
  normalizeRoomCategory,
  type SpaceRoom,
} from "@/lib/space";
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

/* ── Shared table cell styles ── */
const TH = "border border-gray-400 bg-gray-50 px-3 py-2 text-left text-xs font-bold text-gray-900 whitespace-nowrap";
const TD = "border border-gray-400 px-3 py-2 text-sm text-gray-900";
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
        <p className="text-gray-600">신청번호 <b>{params.id}</b>에 해당하는 데이터가 없습니다.</p>
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

  // 대관 신청서는 강의실 전용
  if (normalizedCategory !== "lecture") {
    redirect(
      `/admin/requests/${encodeURIComponent(req.requestId)}?category=${encodeURIComponent(normalizedCategory)}`
    );
  }

  const categoryLabel = getCategoryLabel(normalizedCategory);
  const isGallery = req.roomId === "gallery";
  const isStudio = (room?.category ?? "lecture") === "studio";

  /* ── batch / session ── */
  const batchList = req.batchId ? await db.getRequestsByBatchId(req.batchId) : [];
  const sessions = req.batchId ? sortSessions(batchList.length ? batchList : [req]) : [req];
  const isBatch = !!req.batchId;

  /* ── gallery stats ── */
  const galleryExhibitionSessions = isGallery ? sessions.filter((s) => !s.isPrepDay) : [];
  const galleryWeekdayCount = isGallery
    ? galleryExhibitionSessions.filter((s) => {
        const d = dayOfWeek(s.date);
        return d >= 1 && d <= 5;
      }).length
    : 0;
  const gallerySaturdayCount = isGallery
    ? galleryExhibitionSessions.filter((s) => dayOfWeek(s.date) === 6).length
    : 0;
  const galleryPrepDate = isGallery ? sessions.find((s) => s.isPrepDay)?.date ?? "" : "";

  /* ── fee ── */
  const feeBasisSessions = isBatch ? pickFeeBasisSessions(sessions) : sessions;
  const feeBasis = isBatch
    ? computeFeesForBundle(feeBasisSessions)
    : computeFeesForRequest(req);

  /* ── room list for selection table ── */
  const categoryRooms = getRoomsByCategory(normalizedCategory);

  /* ── group rooms by section ── */
  type RoomGroup = { label: string; rooms: SpaceRoom[] };
  let roomGroups: RoomGroup[];
  if (isStudio) {
    roomGroups = [{ label: "E-스튜디오", rooms: categoryRooms }];
  } else if (isGallery) {
    roomGroups = [{ label: "우리동네 갤러리", rooms: categoryRooms }];
  } else {
    // 강의실: split into 특수(capacity >= 25 or feeKRW >= 100000) and 일반
    const special = categoryRooms.filter((r) => r.feeKRW >= 100000);
    const general = categoryRooms.filter((r) => r.feeKRW < 100000);
    roomGroups = [];
    if (special.length) roomGroups.push({ label: "강당 및 특수강의실", rooms: special });
    if (general.length) roomGroups.push({ label: "일반 강의실", rooms: general });
  }

  /* ── equipment items (studio has its own set) ── */
  const equipmentItems = isGallery
    ? []
    : [
        { key: "laptop" as const, label: "노트북", fee: EQUIPMENT_FEE_KRW.laptop },
        { key: "projector" as const, label: "빔프로젝트", fee: EQUIPMENT_FEE_KRW.projector },
        { key: "audio" as const, label: "음향장비", fee: EQUIPMENT_FEE_KRW.audio },
      ];

  /* ── date/time display ── */
  const dateDisplay = isGallery
    ? `${req.startDate || sessions.find((s) => !s.isPrepDay)?.date || ""} ~ ${req.endDate || sessions.filter((s) => !s.isPrepDay).slice(-1)[0]?.date || ""}`
    : isBatch
      ? `${sessions[0].date} ~ ${sessions[sessions.length - 1].date} (${sessions.length}회)`
      : req.date;
  const timeDisplay = isGallery
    ? `평일 ${galleryWeekdayCount}일 · 토 ${gallerySaturdayCount}일${galleryPrepDate ? ` / 준비일 ${galleryPrepDate}` : ""}`
    : isBatch
      ? sessions.map((s, i) => `${i + 1}회 ${s.date} ${s.startTime}~${s.endTime}`).join(", ")
      : `${req.startTime} ~ ${req.endTime}`;

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
          <p className="text-xs text-gray-500">[별첨1]</p>
          <h1 className="mt-2 text-base font-bold text-gray-900">
            서초여성가족플라자 서초센터
          </h1>
          <h2 className="mt-1 text-lg font-extrabold text-gray-900">
            &lsquo;센터 {categoryLabel}&rsquo; 대관 신청서
          </h2>
        </div>

        {/* ═══ 1. 신청자 정보 ═══ */}
        <table className="mt-5 w-full border-collapse text-sm">
          <tbody>
            <tr>
              <th className={TH} style={{ width: "15%" }}>신청자명</th>
              <td className={TD} style={{ width: "35%" }}>{req.applicantName}</td>
              <th className={TH} style={{ width: "15%" }}>생년월일</th>
              <td className={TD} style={{ width: "35%" }}>{req.birth || "-"}</td>
            </tr>
            <tr>
              <th className={TH}>연락처</th>
              <td className={TD}>{req.phone}</td>
              <th className={TH}>E-mail</th>
              <td className={TD}>{req.email}</td>
            </tr>
            <tr>
              <th className={TH}>주소</th>
              <td className={TD} colSpan={3}>{req.address || "-"}</td>
            </tr>
            <tr>
              <th className={TH}>단체명</th>
              <td className={TD}>{req.orgName || "-"}</td>
              <th className={TH}>참여인원</th>
              <td className={TD}>{req.headcount}명</td>
            </tr>
          </tbody>
        </table>

        {/* ═══ 2. 공간 선택 테이블 ═══ */}
        {!isGallery && (
          <table className="mt-4 w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={TH} style={{ width: "22%" }}>구분</th>
                <th className={TH}>공간명</th>
                <th className={TH} style={{ width: "14%" }}>최대수용인원</th>
                <th className={TH} style={{ width: "10%" }}>선택</th>
                <th className={TH} style={{ width: "18%" }}>대관료(시간당)</th>
              </tr>
            </thead>
            <tbody>
              {roomGroups.map((group) => {
                /* 같은 요금끼리 rowSpan 처리 */
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
                      <th className={TH} rowSpan={group.rooms.length} style={{ textAlign: "center", verticalAlign: "middle" }}>
                        {group.label}
                      </th>
                    )}
                    <td className={TD}>{r.name}</td>
                    <td className={`${TD} text-center`}>{r.capacity}명</td>
                    <td className={`${TD} text-center text-base`}>
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
              {equipmentItems.length > 0 && (
                <>
                  {equipmentItems.map((eq, idx) => (
                    <tr key={eq.key}>
                      {idx === 0 && (
                        <th className={TH} rowSpan={equipmentItems.length} style={{ textAlign: "center", verticalAlign: "middle" }}>
                          기자재
                        </th>
                      )}
                      <td className={TD}>{eq.label}</td>
                      <td className={`${TD} text-center`}>-</td>
                      <td className={`${TD} text-center text-base`}>
                        {req.equipment?.[eq.key] ? "■" : "□"}
                      </td>
                      {idx === 0 && (
                        <td className={TD_R} rowSpan={equipmentItems.length}>
                          {formatKRW(equipmentItems[0].fee)}
                        </td>
                      )}
                    </tr>
                  ))}
                </>
              )}
            </tbody>
          </table>
        )}

        {/* ═══ 2-1. 갤러리 전용 테이블 ═══ */}
        {isGallery && (
          <table className="mt-4 w-full border-collapse text-sm">
            <tbody>
              <tr>
                <th className={TH} style={{ width: "20%" }}>전시명</th>
                <td className={TD} colSpan={3}>{req.exhibitionTitle || "-"}</td>
              </tr>
              <tr>
                <th className={TH}>전시 기간</th>
                <td className={TD}>{dateDisplay}</td>
                <th className={TH} style={{ width: "15%" }}>전시일수</th>
                <td className={TD}>
                  평일 {galleryWeekdayCount}일 · 토 {gallerySaturdayCount}일
                  (총 {galleryExhibitionSessions.length}일)
                </td>
              </tr>
              {galleryPrepDate && (
                <tr>
                  <th className={TH}>준비(세팅)일</th>
                  <td className={TD} colSpan={3}>{galleryPrepDate} (무료)</td>
                </tr>
              )}
              {req.exhibitionPurpose && (
                <tr>
                  <th className={TH}>전시 목적</th>
                  <td className={TD} colSpan={3}>{req.exhibitionPurpose}</td>
                </tr>
              )}
              {req.genreContent && (
                <tr>
                  <th className={TH}>장르·내용</th>
                  <td className={TD} colSpan={3}>{req.genreContent}</td>
                </tr>
              )}
              {req.awarenessPath && (
                <tr>
                  <th className={TH}>인지 경로</th>
                  <td className={TD} colSpan={3}>{req.awarenessPath}</td>
                </tr>
              )}
              {req.specialNotes && (
                <tr>
                  <th className={TH}>특이사항</th>
                  <td className={TD} colSpan={3}>{req.specialNotes}</td>
                </tr>
              )}
              <tr>
                <th className={TH}>대관료 안내</th>
                <td className={TD} colSpan={3}>
                  평일 20,000원/일 · 토 10,000원/일 · 준비(세팅)일 1일 무료
                </td>
              </tr>
            </tbody>
          </table>
        )}

        {/* ═══ 3. 이용목적 / 대관일시 / 대관비용 ═══ */}
        <table className="mt-4 w-full border-collapse text-sm">
          <tbody>
            {!isGallery && (
              <tr>
                <th className={TH} style={{ width: "20%" }}>
                  이용목적<br />
                  <span className="font-normal text-gray-500">(상세기재)</span>
                </th>
                <td className={TD} colSpan={3} style={{ minHeight: "48px" }}>
                  <div className="font-semibold">{req.purpose || "-"}</div>
                </td>
              </tr>
            )}
            <tr>
              <th className={TH} style={{ width: "20%" }}>
                대관일시<br />
                <span className="font-normal text-gray-500">(일자/시간)</span>
              </th>
              <td className={TD} colSpan={3}>
                {isGallery ? (
                  <span>{dateDisplay}</span>
                ) : isBatch ? (
                  <div className="space-y-0.5">
                    {sessions.map((s, i) => (
                      <div key={s.requestId}>
                        {i + 1}회: {s.date} &nbsp; {s.startTime} ~ {s.endTime}
                        {` (${computeDurationHours(s.startTime, s.endTime)}시간)`}
                      </div>
                    ))}
                  </div>
                ) : (
                  <span>
                    {req.date} &nbsp; {req.startTime} ~ {req.endTime}
                    {` (${computeDurationHours(req.startTime, req.endTime)}시간)`}
                  </span>
                )}
              </td>
            </tr>
            <tr>
              <th className={TH}>
                대관비용<br />
                <span className="font-normal text-gray-500">(※담당자 기재)</span>
              </th>
              <td className={TD} colSpan={3}>
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-semibold">{formatKRW(baseFeeKRW)}</span>
                  {feeBasis.discountAmountKRW > 0 && (
                    <>
                      <span className="text-gray-500">→</span>
                      <span className="font-extrabold">{formatKRW(feeBasis.finalFeeKRW)}</span>
                      <span className="text-xs text-gray-600">({discountStr})</span>
                    </>
                  )}
                </div>
                {feeBasis.discountReason && (
                  <div className="mt-0.5 text-xs text-gray-600">사유: {feeBasis.discountReason}</div>
                )}
              </td>
            </tr>
          </tbody>
        </table>

        {/* ═══ 4. 배치 회차 상세 (다회차일 때만) ═══ */}
        {isBatch && !isGallery && (
          <table className="mt-4 w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={TH}>회차</th>
                <th className={TH}>일자</th>
                <th className={TH}>시간</th>
                <th className={TH}>상태</th>
                <th className={TH} style={{ textAlign: "right" }}>기본 이용료</th>
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

        {/* ═══ 4-1. 갤러리 배치 회차 상세 ═══ */}
        {isBatch && isGallery && (
          <table className="mt-4 w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={TH}>회차</th>
                <th className={TH}>일자</th>
                <th className={TH}>구분</th>
                <th className={TH}>상태</th>
                <th className={TH} style={{ textAlign: "right" }}>대관료</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s, i) => {
                const base = computeBaseTotalKRW(s);
                return (
                  <tr key={s.requestId}>
                    <td className={`${TD} text-center`}>{i + 1}</td>
                    <td className={TD}>{s.date}</td>
                    <td className={`${TD} text-center`}>{s.isPrepDay ? "준비일" : "전시일"}</td>
                    <td className={`${TD} text-center`}>{s.status}</td>
                    <td className={TD_R}>{s.isPrepDay ? "무료" : formatKRW(base.totalFeeKRW)}</td>
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

        {/* ═══ 5. 개인정보 수집·이용 안내 ═══ */}
        <div className="mt-5 rounded border border-gray-400 px-4 py-3">
          <h3 className="text-center text-xs font-bold text-gray-900">
            개인정보 수집 · 이용에 관한 안내 (* 필수항목)
          </h3>
          <table className="mt-2 w-full border-collapse text-[11px]">
            <thead>
              <tr>
                <th className="border border-gray-300 bg-gray-50 px-2 py-1.5 text-center font-bold">개인정보 수집 · 이용 목적</th>
                <th className="border border-gray-300 bg-gray-50 px-2 py-1.5 text-center font-bold">수집하려는 개인정보 항목</th>
                <th className="border border-gray-300 bg-gray-50 px-2 py-1.5 text-center font-bold">개인정보의 보유 및 이용 기간</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-300 px-2 py-1.5 text-center">
                  시설 대관 신청업무 처리 및<br />의사소통 경로 확보
                </td>
                <td className="border border-gray-300 px-2 py-1.5 text-center">
                  이름(또는 단체명), 대표자 성명,<br />연락처, 성별, E-mail, 주소, 생년월일
                </td>
                <td className="border border-gray-300 px-2 py-1.5 text-center">
                  수집일로부터 3년 및 대관목적<br />달성 시 지체없이 해당정보 파기
                </td>
              </tr>
            </tbody>
          </table>
          <p className="mt-2 text-[10px] text-gray-600 leading-relaxed">
            ※ 개인정보 수집이용에 대한 동의를 거부할 권리가 있으며, 거부 시 대관 신청·진행에 일부 제한이 있습니다.
          </p>

          <div className="mt-3 flex items-center gap-4 text-xs">
            <span className="font-bold text-gray-900">[필수]</span>
            <span>위와 같이 개인정보의 수집 및 이용에 동의합니까?</span>
            <span className="ml-auto flex items-center gap-3">
              <span>{req.privacyAgree ? "■" : "□"} 동의</span>
              <span>{req.privacyAgree ? "□" : "■"} 미동의</span>
            </span>
          </div>
        </div>

        {/* ═══ 6. 전자 동의 확인란 ═══ */}
        <div className="mt-5 rounded-lg border border-gray-300 bg-gray-50 px-4 py-3">
          <h4 className="text-xs font-bold text-gray-700">[전자 동의 확인]</h4>
          <p className="mt-1 text-[10px] text-gray-500 leading-relaxed">
            본 신청서는 온라인 대관 신청 시 전자적 방식으로 동의한 내용이며,
            신청자의 성명·연락처·동의 일시를 기반으로 서명을 대체합니다.
          </p>
          <div className="mt-2 flex flex-wrap gap-x-8 gap-y-1 text-xs text-gray-800">
            <span>신청 일시: {consentDate}</span>
            <span>개인정보 동의: {req.privacyAgree ? "동의" : "미동의"}</span>
            <span>서약 동의: {req.pledgeAgree ? "동의" : "미동의"}</span>
          </div>
        </div>

        <div className="mt-5 text-center text-sm text-gray-900">
          <p>
            위와 같이 서초여성가족플라자 서초센터 {categoryLabel} 대관을 신청합니다.
          </p>
          <p className="mt-4">{printDate}</p>
          <p className="mt-4">
            신청자: <b>{req.applicantName}</b> &nbsp;&nbsp; (전자 동의 완료)
          </p>
        </div>

        {/* ═══ 7. 푸터 ═══ */}
        <div className="mt-8 border-t border-gray-300 pt-3 text-xs text-gray-600">
          <p>*문의 : 서초여성가족플라자 서초센터 02-522-5291</p>
          <p>*대관규정 서약서 별도 첨부</p>
          {req.requestId && (
            <p className="mt-1 text-gray-400">신청번호: {req.requestId} | 출력일: {printDate}</p>
          )}
        </div>
      </main>
    </>
  );
}
