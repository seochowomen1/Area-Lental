"use client";

import type { RequestInput } from "@/lib/schema";
import { getRoom } from "@/lib/space";
import SiteHeader from "@/components/SiteHeader";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Notice from "@/components/ui/Notice";
import { SECTION_TITLE } from "@/components/ui/presets";

function fmtDuration(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m}분`;
  return m ? `${h}시간 ${m}분` : `${h}시간`;
}

interface Session {
  date: string;
  startTime: string;
  endTime: string;
}

interface BundleSummary {
  sessionCount: number;
  totalDurationMin: number;
  rentalSum: number;
  equipmentSum: number;
  total: number;
}

interface ConfirmationViewProps {
  confirmData: RequestInput;
  extraSessions: Session[];
  error: string | null;
  batchError: string | null;
  submitting: boolean;
  isStudioRoom: boolean;
  bundle: BundleSummary;
  onSubmit: () => void;
  onBack: () => void;
}

export default function ConfirmationView({
  confirmData,
  extraSessions,
  error,
  batchError,
  submitting,
  isStudioRoom,
  bundle,
  onSubmit,
  onBack,
}: ConfirmationViewProps) {
  const confirmRoom = getRoom(confirmData.roomId);
  const confirmSessions = [
    { date: confirmData.date, startTime: confirmData.startTime, endTime: confirmData.endTime },
    ...extraSessions,
  ]
    .filter((s) => s.date && s.startTime && s.endTime)
    .sort((a, b) => (a.date !== b.date ? a.date.localeCompare(b.date) : a.startTime.localeCompare(b.startTime)));

  return (
    <div>
      <SiteHeader title="신청 내용 확인" backHref="/space" backLabel="목록" />
      <main className="mx-auto max-w-2xl px-4 pb-16 pt-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-slate-900">신청 내용 확인</h2>
          <p className="mt-2 text-sm text-slate-600">아래 내용을 확인하신 후 제출해 주세요.</p>
        </div>

        {error && (
          <div className="mt-4">
            <Notice variant="danger" title="처리 중 오류가 발생했습니다" pad="md">{error}</Notice>
          </div>
        )}
        {batchError && (
          <div className="mt-4">
            <Notice variant="warn" title="일부 회차는 신청할 수 없습니다" pad="md">
              <div className="whitespace-pre-line text-sm">{batchError}</div>
            </Notice>
          </div>
        )}

        <div className="mt-6 space-y-4">
          {/* 대관 일시 */}
          <Card pad="lg">
            <h3 className={SECTION_TITLE}>대관 일시</h3>
            <div className="mt-3 divide-y divide-slate-100">
              <div className="flex justify-between py-2.5">
                <span className="text-sm text-slate-500">공간</span>
                <span className="text-sm font-semibold text-slate-900">{confirmRoom?.name ?? confirmData.roomId}</span>
              </div>
              {confirmSessions.map((s, i) => (
                <div key={`${s.date}|${s.startTime}`} className="flex justify-between py-2.5">
                  <span className="text-sm text-slate-500">{confirmSessions.length > 1 ? `${i + 1}회차` : "일시"}</span>
                  <span className="text-sm font-semibold text-slate-900">{s.date} {s.startTime}~{s.endTime}</span>
                </div>
              ))}
              <div className="flex justify-between py-2.5">
                <span className="text-sm text-slate-500">총 이용시간</span>
                <span className="text-sm font-semibold text-slate-900">
                  {fmtDuration(bundle.totalDurationMin)}
                  {bundle.sessionCount > 1 ? ` (${bundle.sessionCount}회차)` : ""}
                </span>
              </div>
            </div>
          </Card>

          {/* 신청자 정보 */}
          <Card pad="lg">
            <h3 className={SECTION_TITLE}>신청자 정보</h3>
            <div className="mt-3 divide-y divide-slate-100">
              {([
                ["성명", confirmData.applicantName],
                ["생년월일", confirmData.birth],
                ["주소", confirmData.address],
                ["연락처", confirmData.phone],
                ["이메일", confirmData.email],
              ] as const).map(([label, value]) => (
                <div key={label} className="flex justify-between py-2.5">
                  <span className="text-sm text-slate-500 shrink-0">{label}</span>
                  <span className="text-sm font-semibold text-slate-900 text-right">{value}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* 단체/행사 정보 (E-스튜디오 제외) */}
          {confirmRoom?.category !== "studio" && (
            <Card pad="lg">
              <h3 className={SECTION_TITLE}>단체/행사 정보</h3>
              <div className="mt-3 divide-y divide-slate-100">
                <div className="flex justify-between py-2.5">
                  <span className="text-sm text-slate-500">단체명</span>
                  <span className="text-sm font-semibold text-slate-900">{confirmData.orgName}</span>
                </div>
                <div className="flex justify-between py-2.5">
                  <span className="text-sm text-slate-500">인원</span>
                  <span className="text-sm font-semibold text-slate-900">{confirmData.headcount}명</span>
                </div>
                <div className="py-2.5">
                  <span className="text-sm text-slate-500">사용 목적/행사 내용</span>
                  <p className="mt-1.5 text-sm text-slate-900 whitespace-pre-line rounded-lg bg-slate-50 px-3 py-2">{confirmData.purpose}</p>
                </div>
              </div>
            </Card>
          )}

          {/* 장비 사용 */}
          <Card pad="lg">
            <h3 className={SECTION_TITLE}>{isStudioRoom ? "촬영장비 사용" : "장비 사용"}</h3>
            <div className="mt-3">
              {isStudioRoom ? (
                confirmData.mirrorless || confirmData.camcorder || confirmData.wirelessMic || confirmData.pinMic || confirmData.rodeMic || confirmData.electronicBoard ? (
                  <div className="flex flex-wrap gap-2">
                    {confirmData.mirrorless && <span className="rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-sm text-blue-800">미러리스</span>}
                    {confirmData.camcorder && <span className="rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-sm text-blue-800">캠코더</span>}
                    {confirmData.wirelessMic && <span className="rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-sm text-blue-800">무선 마이크</span>}
                    {confirmData.pinMic && <span className="rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-sm text-blue-800">핀 마이크</span>}
                    {confirmData.rodeMic && <span className="rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-sm text-blue-800">로데 마이크</span>}
                    {confirmData.electronicBoard && <span className="rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-sm text-blue-800">전자칠판</span>}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">선택 없음</p>
                )
              ) : (
                confirmData.laptop || confirmData.projector || confirmData.audio ? (
                  <div className="flex flex-wrap gap-2">
                    {confirmData.laptop && <span className="rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-sm text-blue-800">노트북</span>}
                    {confirmData.projector && <span className="rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-sm text-blue-800">프로젝터</span>}
                    {confirmData.audio && <span className="rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-sm text-blue-800">음향</span>}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">선택 없음</p>
                )
              )}
            </div>
          </Card>

          {/* 예상 이용요금 */}
          <Card pad="lg">
            <h3 className={SECTION_TITLE}>예상 이용요금</h3>
            <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-blue-50/80 via-white to-white shadow-sm">
              <div className="px-4 py-3 space-y-2">
                <div className="flex items-center justify-between text-sm text-slate-600">
                  <span>대관료{bundle.sessionCount > 1 ? ` (${bundle.sessionCount}회차)` : ""}</span>
                  <span className="font-semibold text-slate-800 tabular-nums">{bundle.rentalSum.toLocaleString()}원</span>
                </div>
                <div className="flex items-center justify-between text-sm text-slate-600">
                  <span>장비 사용료</span>
                  <span className="font-semibold text-slate-800 tabular-nums">{bundle.equipmentSum.toLocaleString()}원</span>
                </div>
              </div>
              <div className="mx-4 mb-3 flex items-center justify-between rounded-xl bg-[rgb(var(--brand-primary)/0.06)] px-4 py-3">
                <span className="text-sm font-bold text-slate-900">총 금액</span>
                <span className="text-lg font-extrabold text-[rgb(var(--brand-primary))]">{bundle.total.toLocaleString()}원</span>
              </div>
            </div>
          </Card>

          {/* 버튼 */}
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1 py-3" onClick={onBack}>
              수정하기
            </Button>
            <Button type="button" variant="primary" className="flex-1 py-3" disabled={submitting} onClick={onSubmit}>
              {submitting ? "제출 중..." : "최종 제출"}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
