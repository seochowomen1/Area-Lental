/**
 * 2단계 PC 오른쪽 열 안내 카드 — 운영시간 + 비치물품(강의실·스튜디오) / 전시 참고(갤러리)
 * 2026-11-06 사용자 피드백: 요약 카드가 짧아 오른쪽 열 아래가 비어 보임 → 달력을 보기 전에 알아야 할 것만 짧게.
 * 자세한 규정은 본문의 `비치물품·이용 규정 보기` 접힘(RoomGuideContent)에 그대로 있다. 훅 없음(서버·클라이언트 공용).
 */
import { OPERATING_RULES } from "@/lib/config";
import { GALLERY_RULES } from "@/lib/constants";
import type { SpaceRoom } from "@/lib/space";
import { GALLERY_MAX_ARTWORKS } from "@/components/apply/RoomInfo";
import { A_CARD } from "@/components/apply/ui";

type Row = { label: string; value: string };

/** 갤러리는 건물 운영시간(lib/space.ts 갤러리 `운영 시간` 항목과 같은 값), 강의실·스튜디오는 OPERATING_RULES */
function hoursRows(room: SpaceRoom): Row[] {
  if (room.category === "gallery") {
    return [
      { label: "평일", value: "09:00~18:00" },
      { label: "화요일", value: "09:00~20:00" },
      { label: "토요일", value: "09:00~13:00" },
      { label: "일·공휴일", value: "휴관" },
    ];
  }
  return [
    { label: "평일", value: `${OPERATING_RULES.weekday.start}~${OPERATING_RULES.weekday.end}` },
    { label: "화요일", value: `${OPERATING_RULES.tuesday.start}~${OPERATING_RULES.tuesday.end}` },
    { label: "토요일", value: `${OPERATING_RULES.saturday.start}~${OPERATING_RULES.saturday.end}` },
    { label: "일·공휴일", value: "휴관" },
  ];
}

function basicItems(room: SpaceRoom): string[] {
  const sec = room.equipment?.find((s) => s.title.startsWith("기본 비치"));
  return sec?.items ?? [];
}

export default function RoomQuickInfo({ room }: { room: SpaceRoom }) {
  const isGallery = room.category === "gallery";
  const isStudio = room.category === "studio";
  const items = basicItems(room);
  const notes: string[] = isGallery
    ? [
        `와이어 걸이(고리) 작품만 · 액자 가로·세로 60cm 이하 · 최대 ${GALLERY_MAX_ARTWORKS}점`,
        `철거는 마지막 날 평일 ${GALLERY_RULES.TEARDOWN_DEADLINE.WEEKDAY} · 토 ${GALLERY_RULES.TEARDOWN_DEADLINE.SATURDAY} 이전`,
        "준비일(시작 전날) 1일 무료 · 설치·철수는 직접",
      ]
    : [
        `한 번에 최대 ${room.durationLimitHours}시간 (30분 단위)`,
        ...(isStudio ? ["촬영 장비는 별도 사용료 · 신청서에서 고릅니다"] : []),
      ];

  return (
    <section aria-labelledby="quick-info-title" className={`${A_CARD} p-5`}>
      <h2 id="quick-info-title" className="text-[15px] font-bold leading-6 text-ink-3">
        운영시간
      </h2>
      <dl className="mt-1.5 grid grid-cols-[76px_1fr] gap-y-0.5">
        {hoursRows(room).map((r) => (
          <div key={r.label} className="contents">
            <dt className="text-[15px] font-semibold leading-7 text-ink-2">{r.label}</dt>
            <dd className="text-[17px] font-bold leading-7 tabular-nums text-ink">{r.value}</dd>
          </div>
        ))}
      </dl>

      {!isGallery && items.length ? (
        <>
          <h2 className="mt-4 text-[15px] font-bold leading-6 text-ink-3">비치물품</h2>
          <p className="mt-1 text-[16px] leading-7 text-ink">{items.join(" · ")}</p>
        </>
      ) : null}

      <h2 className="mt-4 text-[15px] font-bold leading-6 text-ink-3">{isGallery ? "전시 참고" : "이용 참고"}</h2>
      <ul className="mt-1 space-y-0.5 text-[15px] leading-6 text-ink-2">
        {notes.map((t) => (
          <li key={t} className="flex gap-1.5">
            <span aria-hidden="true" className="shrink-0">·</span>
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
