"use client";

import { useState, type ReactNode } from "react";
import SpaceBooking from "@/components/SpaceBooking";
import SpaceBookingGalleryRange from "@/components/SpaceBookingGalleryRange";
import { cn } from "@/lib/cn";
import { CARD_BASE, BUTTON_BASE, BUTTON_VARIANT } from "@/components/ui/presets";
import { getRoom } from "@/lib/space";

type TabId = "status" | "info" | "rule";

type Slot = { start: string; end: string; available: boolean };

type AvailabilityMeta = {
  reasonCode: string | null;
  reasonMessage: string | null;
  totalSlots: number;
  availableSlots: number;
};

type BookingState = {
  selectedDate: string;
  onSelectDate: (ymd: string) => void;
  slots: Slot[];
  busy: boolean;
  meta?: AvailabilityMeta;
};

export default function SpaceDetailTabs({
  roomId,
  booking,
}: {
  roomId: string;
  booking: BookingState;
}) {
  const [tab, setTab] = useState<TabId>("status");
  const room = getRoom(roomId);
  const isGallery = roomId === "gallery";

  return (
    <div>
      <div className={cn(CARD_BASE, "p-2 flex flex-wrap justify-center gap-2")}>
        <TabButton active={tab === "status"} onClick={() => setTab("status")}>
          신청현황
        </TabButton>
        <TabButton active={tab === "info"} onClick={() => setTab("info")}>
          공간정보 및 시설안내
        </TabButton>
        <TabButton active={tab === "rule"} onClick={() => setTab("rule")}>
          취소/환불규정
        </TabButton>
      </div>

      <div className="mt-6">
        {tab === "status" ? (
          roomId === "gallery" ? (
            <SpaceBookingGalleryRange />
          ) : (
            <SpaceBooking
              roomId={roomId}
              selectedDate={booking.selectedDate}
              onSelectDate={booking.onSelectDate}
              slots={booking.slots}
              busy={booking.busy}
              meta={booking.meta}
              durationLimitHours={room?.durationLimitHours ?? 6}
            />
          )
        ) : tab === "info" ? (
          isGallery ? <GalleryInfoTab room={room} /> : <LectureInfoTab room={room} />
        ) : (
          isGallery ? <GalleryRuleTab room={room} /> : <LectureRuleTab room={room} />
        )}
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────
   갤러리 - 공간정보 및 시설안내
   ─────────────────────────────────────────── */
function GalleryInfoTab({ room }: { room: ReturnType<typeof getRoom> }) {
  return (
    <div className={cn(CARD_BASE, "p-5 text-sm text-gray-800")}>
      <SectionTitle>공간정보 및 시설안내</SectionTitle>

      {/* 기본 정보 */}
      <div className="mt-4 grid gap-3 rounded-lg border bg-slate-50 p-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <InfoRow label="공간명" value="우리동네 갤러리" />
          <InfoRow label="위치" value="서초센터 4층 (북카페 일대)" />
          <InfoRow label="수용인원" value={room ? `최대 ${room.capacity}명` : "-"} />
          <InfoRow label="문의" value={room ? `${room.contactName} (${room.contactPhone})` : "-"} />
        </div>
      </div>

      <div className="mt-5 grid gap-4">
        {/* 운영 시간 */}
        <div className="rounded-lg border p-4">
          <h4 className="mb-2 text-sm font-semibold">운영 시간</h4>
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-slate-700">구분</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-700">시간</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr><td className="px-3 py-2">평일 (월~금)</td><td className="px-3 py-2">09:00 ~ 18:00</td></tr>
                <tr><td className="px-3 py-2">야간 (화요일)</td><td className="px-3 py-2">18:00 ~ 20:00</td></tr>
                <tr><td className="px-3 py-2">토요일</td><td className="px-3 py-2">09:00 ~ 13:00</td></tr>
                <tr><td className="px-3 py-2 text-slate-500">일요일·공휴일</td><td className="px-3 py-2 text-slate-500">휴관</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* 대관비 */}
        <div className="rounded-lg border p-4">
          <h4 className="mb-2 text-sm font-semibold">대관비 기준 (1일 기준)</h4>
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-slate-700">구분</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-700">대관료</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr><td className="px-3 py-2">평일 (월~금)</td><td className="px-3 py-2 font-semibold">20,000원</td></tr>
                <tr><td className="px-3 py-2">토요일</td><td className="px-3 py-2 font-semibold">10,000원</td></tr>
              </tbody>
            </table>
          </div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-600">
            <li>할인 및 바우처 적용 불가</li>
            <li>준비(세팅)일 1일 무료 지원</li>
          </ul>
        </div>

        {/* 전시 참고사항 */}
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <h4 className="mb-2 text-sm font-semibold text-blue-900">전시 참고사항</h4>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-blue-800">
            <li>신청자가 직접 설치(준비, 세팅) 및 철수를 진행하며, 작품 보관·지원 및 관리 인력 제공 불가</li>
            <li>와이어 걸이(고리)를 활용한 형식의 작품만 전시 가능 (고리를 걸 수 있는 장치 필요)</li>
            <li>액자 형태 작품: 가로/세로 최대 60cm, 최대 15점까지 전시 가능</li>
            <li>작품 크기·무게에 따라 전시 불가 시 사전 담당자 상담 필요</li>
            <li>전시 마지막 날 <b>17시까지 철수 완료</b> 필수</li>
            <li>홍보 콘텐츠 제작을 위해 준비일 이전에 전시 고리 사진 파일을 서초센터 메일로 공유 필요</li>
          </ul>
        </div>

        {/* 신청 절차 */}
        <div className="rounded-lg border p-4">
          <h4 className="mb-2 text-sm font-semibold">신청 및 승인 절차</h4>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-gray-700">
            <li>대관 신청서 양식을 통해 전시 목적, 장르, 내용 등을 작성하여 이메일 또는 센터 방문 접수</li>
            <li>센터는 3일 이내에 검토 후 승인/반려 결과를 안내합니다.</li>
            <li>대관비 결제 시 신청 접수 완료 (동일 날짜 신청자 중복 발생 시 결제 완료 우선)</li>
            <li>센터 방문하여 현장답사 및 미팅 후 대관서 제출 가능 (필요시 신청 당일 대관비 결제까지 가능)</li>
          </ol>
        </div>

        <p className="text-xs text-slate-600">
          ※ 본 안내는 이용 편의를 위한 요약본이며, 세부 기준은 센터 운영규정 및 내부 기준에 따릅니다.
        </p>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────
   강의실/스튜디오 - 공간정보 및 시설안내
   ─────────────────────────────────────────── */
function LectureInfoTab({ room }: { room: ReturnType<typeof getRoom> }) {
  return (
    <div className={cn(CARD_BASE, "p-5 text-sm text-gray-800")}>
      <SectionTitle>공간정보 및 시설안내</SectionTitle>

      <div className="mt-4 grid gap-3 rounded-lg border bg-slate-50 p-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <InfoRow label="공간명" value={room?.name ?? "-"} />
          <InfoRow label="위치" value={room ? `${room.floor}층` : "-"} />
          <InfoRow label="수용인원" value={room ? `최대 ${room.capacity}명` : "-"} />
          <InfoRow
            label="이용시간"
            value={`최소 1시간 / 최대 ${room?.durationLimitHours ?? 6}시간 (30분 단위)`}
          />
          <InfoRow
            label="이용요금"
            value={
              room
                ? room.feeKRW > 0
                  ? `${room.feeKRW.toLocaleString()}원/시간`
                  : "별도 협의"
                : "-"
            }
          />
          <InfoRow
            label="문의"
            value={room ? `${room.contactName} (${room.contactPhone})` : "-"}
          />
        </div>
        <p className="text-xs text-slate-600">
          ※ 공간별 비치물품 및 이용 가능 범위는 현장 운영 상황에 따라 달라질 수 있습니다.
        </p>
      </div>

      <div className="mt-5 grid gap-4">
        <div className="rounded-lg border p-4">
          <h4 className="mb-2 text-sm font-semibold">이용 대상 및 사용 범위</h4>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-gray-700">
            <li>본 공간은 센터 대관 승인 절차를 거친 개인/단체에 한하여 이용할 수 있습니다.</li>
            <li>공간 사용 목적(교육, 회의, 프로그램 운영 등)이 센터 운영 취지에 부합하지 않거나, 운영상 부적절하다고 판단될 경우 승인이 제한될 수 있습니다.</li>
            <li>상업적 판매, 정치·종교 목적 행사 등 센터 운영 원칙에 반하는 이용은 제한될 수 있습니다.</li>
          </ul>
        </div>

        <div className="rounded-lg border p-4">
          <h4 className="mb-2 text-sm font-semibold">기본 비치 및 이용 안내</h4>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-gray-700">
            <li>기본 비치물품(테이블·의자 등) 및 제공 설비는 공간별로 상이할 수 있습니다.</li>
            <li>시설물(가구·장비) 이동이 필요한 경우, 안전사고 예방을 위해 사전에 센터와 협의해 주시기 바랍니다.</li>
            <li>이용자는 사용 전·후 시설 상태를 확인하고, 이용 종료 후 원상복구 및 정리정돈(쓰레기 수거, 의자 정렬 등)을 완료해야 합니다.</li>
            <li>소음, 냄새 유발, 위험물 반입, 시설 훼손 우려 행위 등 타 이용자에게 불편을 초래할 수 있는 행위는 제한될 수 있습니다.</li>
          </ul>
        </div>

        <div className="rounded-lg border p-4">
          <h4 className="mb-2 text-sm font-semibold">공간별 비치물품</h4>
          {room?.equipment && room.equipment.length > 0 ? (
            <div className="grid gap-3">
              {room.equipment.map((sec, idx) => (
                <div key={`${sec.title}-${idx}`} className="rounded-md bg-slate-50 p-3">
                  <p className="text-xs font-bold text-slate-700">{sec.title}</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
                    {sec.items.map((it, j) => (
                      <li key={`${idx}-${j}`}>{it}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-700">
              비치물품 정보는 준비 중입니다. 자세한 사항은 센터로 문의해 주시기 바랍니다.
            </p>
          )}

          <p className="mt-3 text-xs text-slate-600">
            ※ 비치물품 및 제공 설비는 현장 운영 상황에 따라 변동될 수 있습니다.
          </p>
        </div>

        <div className="rounded-lg border p-4">
          <h4 className="mb-2 text-sm font-semibold">신청 및 승인 절차</h4>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-gray-700">
            <li>원하는 공간·일시를 선택하여 온라인으로 대관 신청합니다.</li>
            <li>센터는 신청 내용을 바탕으로 일정·안전·운영 적정성 등을 검토합니다.</li>
            <li>승인(또는 반려) 결과는 신청 시 입력한 연락처/이메일 등으로 안내됩니다.</li>
            <li>승인된 예약은 이용 당일 안내된 시간에 따라 입·퇴실을 진행합니다.</li>
            <li>운영상 필요 시 센터는 추가 자료 요청 또는 일정 조정을 안내할 수 있습니다.</li>
          </ol>
        </div>

        <p className="text-xs text-slate-600">
          ※ 본 안내는 이용 편의를 위한 요약본이며, 세부 기준은 센터 운영규정 및 내부 기준에 따릅니다.
        </p>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────
   갤러리 - 취소/환불규정
   ─────────────────────────────────────────── */
function GalleryRuleTab({ room }: { room: ReturnType<typeof getRoom> }) {
  return (
    <div className={cn(CARD_BASE, "p-5 text-sm text-gray-800")}>
      <SectionTitle>취소/환불규정</SectionTitle>

      <div className="mt-4 grid gap-4">
        <div className="rounded-lg border p-4">
          <h4 className="mb-2 text-sm font-semibold">환불 기준</h4>
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-slate-700">취소 시점</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-700">환불 비율</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr><td className="px-3 py-2">사용일 3일 전까지</td><td className="px-3 py-2 font-semibold text-green-700">전액 환불</td></tr>
                <tr><td className="px-3 py-2">사용일 2일 전까지</td><td className="px-3 py-2 font-semibold">90% 환불</td></tr>
                <tr><td className="px-3 py-2">사용일 1일 전까지</td><td className="px-3 py-2 font-semibold">80% 환불</td></tr>
                <tr><td className="px-3 py-2 text-red-600">사용일 당일 이후</td><td className="px-3 py-2 font-semibold text-red-600">환불 불가</td></tr>
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-600">
            ※ 운영일 기준 (일요일·공휴일 제외)
          </p>
        </div>

        <div className="rounded-lg border p-4">
          <h4 className="mb-2 text-sm font-semibold">환불 절차</h4>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-gray-700">
            <li>센터 방문하여 환불신청서 작성 및 제출 (양식 별도 안내)</li>
            <li>우편, 메일 등 비대면 접수 불가</li>
          </ul>
        </div>

        <div className="rounded-lg border p-4">
          <h4 className="mb-2 text-sm font-semibold">대관 취소(센터 사정) 및 이용 제한</h4>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-gray-700">
            <li>천재지변, 시설 점검, 안전상 필요 등 불가피한 사유로 일정이 조정될 수 있습니다.</li>
            <li>시설물 훼손, 안전수칙 위반, 허위 신청 등 운영상 문제가 확인될 경우 이용이 제한될 수 있습니다.</li>
            <li>대관 진행 중 발견 시 바로 취소되며 대관비는 환불 불가합니다.</li>
          </ul>
        </div>

        <div className="rounded-lg border bg-slate-50 p-4">
          <h4 className="mb-2 text-sm font-semibold">문의</h4>
          <p className="text-sm text-gray-700">
            취소/환불 관련 문의: {room ? `${room.contactName} (${room.contactPhone})` : "센터 문의처"}
          </p>
        </div>

        <p className="text-xs text-slate-600">
          ※ 본 규정은 요약 안내이며, 세부 기준은 센터 운영규정 및 내부 기준에 따릅니다.
        </p>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────
   강의실/스튜디오 - 취소/환불규정
   ─────────────────────────────────────────── */
function LectureRuleTab({ room }: { room: ReturnType<typeof getRoom> }) {
  return (
    <div className={cn(CARD_BASE, "p-5 text-sm text-gray-800")}>
      <SectionTitle>취소/환불규정</SectionTitle>

      <div className="mt-4 grid gap-4">
        <div className="rounded-lg border p-4">
          <h4 className="mb-2 text-sm font-semibold">취소 안내</h4>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-gray-700">
            <li>대관 취소는 <span className="font-semibold">신청현황</span>에서 취소 요청을 진행할 수 있습니다.</li>
            <li>승인 완료 건의 취소는 운영 일정 및 타 이용자에게 영향을 줄 수 있으므로, 가급적 조기에 요청해 주시기 바랍니다.</li>
            <li>긴급 취소 또는 시스템 오류가 있는 경우, 센터 문의처로 연락해 주시기 바랍니다.</li>
          </ul>
        </div>

        <div className="rounded-lg border p-4">
          <h4 className="mb-2 text-sm font-semibold">환불 안내</h4>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-gray-700">
            <li>
              {room && room.feeKRW > 0
                ? "대관료가 발생하는 경우, 환불은 센터 내부 규정 및 회계 처리 기준에 따라 진행됩니다."
                : "본 공간의 대관 이용료는 별도 협의 대상이며, 환불 절차는 센터 안내 및 규정에 따라 진행됩니다."}
            </li>
            <li>결제 수단(카드/계좌이체 등)에 따라 환불 처리 기간이 달라질 수 있습니다.</li>
            <li>환불 진행 시 담당자 안내에 따라 증빙 서류 제출을 요청드릴 수 있습니다.</li>
          </ul>
        </div>

        <div className="rounded-lg border p-4">
          <h4 className="mb-2 text-sm font-semibold">대관 취소(센터 사정) 및 이용 제한</h4>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-gray-700">
            <li>천재지변, 시설 점검, 안전상 필요 등 불가피한 사유로 일정이 조정될 수 있습니다.</li>
            <li>시설물 훼손, 안전수칙 위반, 허위 신청 등 운영상 문제가 확인될 경우 이용이 제한될 수 있습니다.</li>
            <li>필요 시 센터는 대관 취소 또는 일정 변경을 요청드릴 수 있으며, 관련 내용은 별도 안내합니다.</li>
          </ul>
        </div>

        <div className="rounded-lg border bg-slate-50 p-4">
          <h4 className="mb-2 text-sm font-semibold">문의</h4>
          <p className="text-sm text-gray-700">
            취소/환불 관련 문의는 공간정보에 안내된 연락처로 문의해 주세요.
          </p>
        </div>

        <p className="text-xs text-slate-600">
          ※ 본 규정은 요약 안내이며, 세부 기준은 센터 운영규정 및 내부 기준에 따릅니다.
        </p>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────
   공통 UI 컴포넌트
   ─────────────────────────────────────────── */

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-block h-2 w-2 rounded-full bg-[rgb(var(--brand-accent))]" />
      <h3 className="text-base font-bold tracking-tight">{children}</h3>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-2">
      <span className="text-xs font-semibold text-slate-600">{label}</span>
      <span className="text-sm font-semibold text-slate-900">{value}</span>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(BUTTON_BASE, active ? BUTTON_VARIANT.primary : BUTTON_VARIANT.outline, "rounded-full px-4 py-2.5 text-sm", active ? "shadow" : "")}
    >
      {children}
    </button>
  );
}
