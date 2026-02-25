"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { SpaceRoom } from "@/lib/space";
import { cn } from "@/lib/cn";
import Card from "@/components/ui/Card";
import Notice from "@/components/ui/Notice";
import { BUTTON_BASE, BUTTON_VARIANT } from "@/components/ui/presets";

function RoomCard({ room }: { room: SpaceRoom }) {
  return (
    <Link
      href={`/space/${room.id}`}
      className={cn(
        "group overflow-hidden rounded-xl border border-slate-200 bg-white",
        "shadow-[0_1px_0_rgba(0,0,0,0.02)] transition",
        "hover:border-[rgb(var(--brand-primary))]/40 hover:shadow-[0_14px_34px_rgba(0,0,0,0.08)]"
      )}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-100">
        {/* 이미지 추가 방법: public/room/... 에 넣고 room.image를 "/room/파일명.jpg" 로 설정 */}
        {room.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={room.image}
            alt={room.name}
            className="h-full w-full object-cover transition group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-slate-500">
            이미지 준비중
          </div>
        )}

        <span className="absolute left-3 top-3 rounded-full bg-[rgb(var(--brand-primary))] px-3 py-1 text-xs font-semibold text-white shadow">
          대관신청 필수
        </span>
      </div>

      <div className="p-4">
        <h3 className="font-semibold tracking-[-0.01em] text-slate-900">{room.name}</h3>
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-slate-600">
          <div className="flex items-center justify-between">
            <span>수용인원</span>
            <span className="font-medium text-slate-900">최대 {room.capacity}명</span>
          </div>
          <div className="flex items-center justify-between">
            <span>이용시간</span>
            {room.category === "gallery" ? (
              <span className="font-medium text-slate-900">최소 1일</span>
            ) : (
              <span className="font-medium text-slate-900">최소 1시간</span>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span>대관료</span>
            <span className="font-medium text-slate-900">
              {room.category === "gallery" ? "평일 20,000원/일 · 토 10,000원/일" : room.feeKRW > 0 ? `${room.feeKRW.toLocaleString()}원/시간` : "별도 협의"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>위치</span>
            <span className="font-medium text-slate-900">{room.floor}층</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

type FloorTab = { id: string; label: string };

export default function SpaceFloorTabs({
  floors,
  rooms,
}: {
  floors: FloorTab[];
  rooms: SpaceRoom[];
}) {
  const [selected, setSelected] = useState(floors[0]?.id ?? "4");

  const filtered = useMemo(
    () => selected === "all" ? rooms : rooms.filter((r) => r.floor === selected),
    [rooms, selected],
  );

  return (
    <div>
      {floors.length > 1 ? (
        <div className="mx-auto w-full max-w-4xl">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-800">층 선택</div>
            <div className="text-xs text-slate-500">원하는 층을 선택해 공간을 확인하세요</div>
          </div>

          <Card pad="sm" className="flex w-full justify-center gap-2">
            {floors.map((f) => {
              const active = selected === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setSelected(f.id)}
                  className={cn(
                    BUTTON_BASE,
                    active ? BUTTON_VARIANT.primary : BUTTON_VARIANT.outline,
                    "rounded-full px-5 py-2.5 text-sm",
                    active ? "shadow" : ""
                  )}
                >
                  {f.label}
                </button>
              );
            })}
          </Card>
        </div>
      ) : null}

      {/*
        ✅ 반응형 카드 배치 규칙
        - 모바일(기본): 1열
        - 웹/태블릿(sm 이상): 2열 (가독성 유지)
        - lg 이상에서 4열로 늘어나던 설정은 제거
      */}
      <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
        {filtered.map((room) => (
          <RoomCard key={room.id} room={room} />
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="mt-6">
          <Notice variant="info" title="안내">
            선택한 층에 등록된 공간이 없습니다.
          </Notice>
        </div>
      ) : null}
    </div>
  );
}
