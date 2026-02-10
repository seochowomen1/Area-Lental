"use client";

import { useEffect, useMemo, useState } from "react";
import SpaceDetailTabs from "@/components/SpaceDetailTabs";
import OperatingHoursNotice from "@/components/OperatingHoursNotice";
import type { SpaceRoom } from "@/lib/space";
import { STUDIO_EQUIPMENT_FEE_KRW, STUDIO_EQUIPMENT_LABELS } from "@/lib/config";

type Slot = { start: string; end: string; available: boolean };

type AvailabilityMeta = {
  reasonCode: string | null;
  reasonMessage: string | null;
  totalSlots: number;
  availableSlots: number;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function fmtYMD(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function addDays(d: Date, delta: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + delta);
}


function nextValidDate(from: Date) {
  // 규칙: 과거 날짜 불가, 일요일(0) 불가
  const today = new Date();
  const todayYmd = fmtYMD(today);
  for (let i = 0; i < 60; i++) {
    const cand = addDays(from, i);
    const candYmd = fmtYMD(cand);
    if (candYmd < todayYmd) continue;
    if (cand.getDay() === 0) continue;
    return cand;
  }
  return from;
}

function pickHighlightItems(room: SpaceRoom) {
  // 갤러리는 '비치물품' 하이라이트를 고정 노출(정책/안내 문구가 섞이지 않도록 분리)
  if (room.id === "gallery") {
    return ["레일등", "전시용 와이어", "전시용 사다리"];
  }

  const sections = room.equipment ?? [];
  if (sections.length === 0) return [] as string[];

  // 1) "기본" 섹션 우선
  const base = sections.find((s) => s.title.includes("기본")) ?? sections[0];
  const raw = base.items ?? [];

  // 너무 긴 문장(유의사항 등)은 하이라이트에 부적합하니 제외
  const short = raw
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((x) => x.length <= 18);

  const picked = (short.length > 0 ? short : raw.slice(0, 8)).slice(0, 6);

  // 중복 제거
  return Array.from(new Set(picked));
}

export default function SpaceDetailShell({ room }: { room: SpaceRoom }) {
  const isGallery = room.id === "gallery";
  const [selectedDate, setSelectedDate] = useState(() => fmtYMD(nextValidDate(new Date())));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [busy, setBusy] = useState(false);
  const [meta, setMeta] = useState<AvailabilityMeta>({
    reasonCode: null,
    reasonMessage: null,
    totalSlots: 0,
    availableSlots: 0,
  });

  const isStudio = room.category === "studio";

  // 모바일(좁은 화면)에서 좌측 카드 영역은 접었다 펼 수 있게(스크롤/가독성 개선)
  const [openEquip, setOpenEquip] = useState(false);
  // E-스튜디오 촬영장비(유료) 팝업
  const [showStudioEquipPopup, setShowStudioEquipPopup] = useState(false);

  // load slots for selected date
  useEffect(() => {
    if (isGallery) {
      setSlots([]);
      setMeta({ reasonCode: null, reasonMessage: null, totalSlots: 0, availableSlots: 0 });
      setBusy(false);
      return;
    }
    let alive = true;
    (async () => {
      setBusy(true);
      try {
        const res = await fetch(
          `/api/availability?roomId=${encodeURIComponent(room.id)}&date=${encodeURIComponent(selectedDate)}`,
          { cache: "no-store" }
        );
        const data = await res.json();
        if (!alive) return;
        setSlots(data?.slots ?? []);
        setMeta({
          reasonCode: data?.reasonCode ?? null,
          reasonMessage: data?.reasonMessage ?? null,
          totalSlots: Number(data?.totalSlots ?? 0),
          availableSlots: Number(data?.availableSlots ?? 0),
        });
      } catch {
        if (!alive) return;
        setSlots([]);
        setMeta({ reasonCode: null, reasonMessage: "예약 가능 정보를 불러오지 못했습니다.", totalSlots: 0, availableSlots: 0 });
      } finally {
        if (!alive) return;
        setBusy(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [room.id, selectedDate, isGallery]);

  const highlightItems = useMemo(() => pickHighlightItems(room), [room]);

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 pt-8">
      {/*
        리스트(/space) 페이지는 내부 콘텐츠(층 선택/카드 그리드)를 한 단계 더 좁힌(max-w-4xl)
        래퍼로 감싸 중앙 정렬 느낌이 강합니다.
        상세(/space/[roomId])도 동일한 시각적 균형을 위해 내부 레이아웃을 한 단계 좁혀
        좌우 여백을 확보합니다.
      */}
      <div className="mx-auto w-full max-w-5xl">
        <section className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[360px_minmax(0,1fr)]">
        {/* LEFT: 이미지 + 요약 패널 */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_0_rgba(0,0,0,0.02)]">
          <div className="aspect-[4/3] w-full bg-gray-100">
            {room.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={room.image} alt={room.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-gray-500">이미지 준비중</div>
            )}
          </div>

          {/* 아래 공백 영역 활용 */}
          <div className="border-t p-4">
            {/* 1) 비치물품 하이라이트 (모바일: 접기/펼치기) */}
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <button
                type="button"
                onClick={() => setOpenEquip((v) => !v)}
                className="flex w-full items-center justify-between gap-3 lg:pointer-events-none"
                aria-expanded={openEquip}
              >
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-[rgb(var(--brand-accent))]" />
                  <h3 className="text-sm font-bold text-slate-900">비치물품</h3>
                </div>
                <span className="text-xs font-semibold text-slate-500 lg:hidden">{openEquip ? "접기" : "펼치기"}</span>
              </button>

              <div className={(openEquip ? "" : "hidden") + " mt-3 lg:block"}>
                {highlightItems.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {highlightItems.map((it) => (
                      <span
                        key={it}
                        className="inline-flex items-center gap-1 rounded-full border bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700"
                        title={it}
                      >
                        <span className="inline-block h-2 w-2 rounded-full bg-[rgb(var(--brand-primary))]" />
                        {it}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-600">
                    비치물품 정보는 준비 중입니다. 자세한 사항은 공간정보 및 시설안내 탭을 확인해 주세요.
                  </p>
                )}

                {/* E-스튜디오: 촬영장비(유료) 버튼 */}
                {isStudio && (
                  <button
                    type="button"
                    onClick={() => setShowStudioEquipPopup(true)}
                    className="mt-3 flex w-full items-center justify-between rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-left transition-colors hover:bg-orange-100"
                  >
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-2 w-2 rounded-full bg-orange-400" />
                      <span className="text-xs font-bold text-orange-800">촬영장비</span>
                      <span className="rounded bg-orange-200 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700">유료</span>
                    </div>
                    <span className="text-[11px] font-semibold text-orange-600">상세보기 &rsaquo;</span>
                  </button>
                )}

                <p className="mt-3 text-[11px] text-slate-500">
                  ※ 비치물품 및 제공 설비는 현장 운영 상황에 따라 변동될 수 있습니다.
                </p>
              </div>
            </div>

            {/* 2) 운영시간 안내 */}
            <div className="mt-4">
              <OperatingHoursNotice variant="compact" roomId={room.id} />
            </div>
          </div>
        </div>

        {/* RIGHT: 상세 정보 + 탭 */}
        <div>
          <h1 className="text-2xl font-bold">{room.name}</h1>

          <div className="mt-4 grid grid-cols-1 gap-2 text-sm text-gray-700 sm:grid-cols-2">
            <div className="flex justify-between rounded-md border bg-white px-3 py-2">
              <span className="text-gray-500">수용인원</span>
              <span className="font-medium">최대 {room.capacity}명</span>
            </div>
            <div className="flex justify-between rounded-md border bg-white px-3 py-2">
              <span className="text-gray-500">이용시간</span>
              <span className="font-medium">최소 1시간</span>
            </div>
            <div className="flex justify-between rounded-md border bg-white px-3 py-2">
              <span className="text-gray-500">대관료</span>
              <span className="font-medium">{room.feeKRW > 0 ? `${room.feeKRW.toLocaleString()}원/시간` : "별도 협의"}</span>
            </div>
            <div className="flex justify-between rounded-md border bg-white px-3 py-2">
              <span className="text-gray-500">위치</span>
              <span className="font-medium">{room.floor}층</span>
            </div>
          </div>

          <div className="mt-8">
            <SpaceDetailTabs
              roomId={room.id}
              booking={{
                selectedDate,
                onSelectDate: setSelectedDate,
                slots,
                busy,
                meta,
              }}
            />
          </div>
        </div>
        </section>
      </div>
      {/* ── E-스튜디오 촬영장비(유료) 팝업 ── */}
      {showStudioEquipPopup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setShowStudioEquipPopup(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">촬영장비 안내</h3>
                <span className="rounded bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-700">유료</span>
              </div>
              <button
                type="button"
                onClick={() => setShowStudioEquipPopup(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                aria-label="닫기"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              </button>
            </div>

            {/* 장비 목록 테이블 */}
            <div className="px-5 py-4">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="pb-2 text-left text-xs font-semibold text-slate-500">장비명</th>
                    <th className="pb-2 text-right text-xs font-semibold text-slate-500">사용료</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(Object.keys(STUDIO_EQUIPMENT_FEE_KRW) as Array<keyof typeof STUDIO_EQUIPMENT_FEE_KRW>).map((key) => (
                    <tr key={key}>
                      <td className="py-2.5 pr-3 text-[13px] leading-snug text-slate-800">{STUDIO_EQUIPMENT_LABELS[key]}</td>
                      <td className="whitespace-nowrap py-2.5 text-right text-[13px] font-semibold tabular-nums text-slate-900">
                        {STUDIO_EQUIPMENT_FEE_KRW[key].toLocaleString()}원
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 안내 문구 */}
            <div className="border-t bg-slate-50 px-5 py-3 text-[11px] leading-relaxed text-slate-500">
              <p>※ 촬영장비는 대관 이용시간 중 1일 1회 과금됩니다.</p>
              <p>※ 대관 신청 시 필요한 장비를 선택할 수 있습니다.</p>
            </div>

            {/* 닫기 버튼 */}
            <div className="border-t px-5 py-3">
              <button
                type="button"
                onClick={() => setShowStudioEquipPopup(false)}
                className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
