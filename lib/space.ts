/**
 * 공간(강의실) 데이터 정의 - Single Source of Truth
 * 
 * 이 파일은 모든 공간 관련 데이터의 단일 소스입니다.
 * 다른 파일에서 공간 데이터가 필요한 경우 이 파일을 import하여 사용하세요.
 */

export type FloorId = "4" | "5" | "6" | "7";

/**
 * 공간 카테고리
 * - lecture: 강의실(기본)
 * - studio: E-스튜디오
 * - gallery: 우리동네 갤러리(향후)
 */
export type RoomCategory = "lecture" | "studio" | "gallery";

/**
 * 공간별 비치물품/설비 섹션
 * - title: 섹션 제목(예: "기본 비치", "기자재", "특이사항")
 * - items: 항목 목록
 */
export type RoomEquipmentSection = {
  title: string;
  items: string[];
};

/**
 * 공간(강의실) 정보
 */
export type SpaceRoom = {
  id: string;
  floor: FloorId;
  name: string;
  /** 홈 카테고리/목록 필터용 (기본: lecture) */
  category?: RoomCategory;
  capacity: number;
  durationLimitHours: number;
  feeKRW: number;
  contactName: string;
  contactPhone: string;
  /** 공간 이미지 경로 (e.g., "/rooms/bookcafe.jpg") */
  image?: string;
  /** 공간 설명 또는 특이사항 */
  note?: string;
  /** 공간별 비치물품/설비 정보 (상세 탭에서 자동 표시) */
  equipment?: RoomEquipmentSection[];
};

/**
 * 층 정보 타입
 */
export type Floor = { id: FloorId; label: string };

/**
 * 층 목록
 */
export const FLOORS: Floor[] = [
  { id: "4", label: "4층" },
  { id: "5", label: "5층" },
  { id: "6", label: "6층" },
  { id: "7", label: "7층" }
];

/**
 * 전체 공간 목록
 * 
 * ⚠️ 주의: 공간을 추가/수정/삭제할 때는 이 배열만 수정하면 됩니다.
 * 다른 파일(lib/floors.ts, lib/config.ts)은 이 데이터를 참조합니다.
 */
export const ROOMS: SpaceRoom[] = [
  {
    id: "bookcafe",
    floor: "4",
    name: "북카페",
    capacity: 20,
    durationLimitHours: 6,
    // 시간당 대관료
    feeKRW: 70000,
    contactName: "관리자",
    contactPhone: "02-0000-0000",
    image: "/rooms/bookcafe.png",
    note: "조용한 독서 및 소규모 모임에 적합한 공간입니다.",
    equipment: [
      {
        title: "기본 비치",
        items: ["테이블", "의자", "전원(콘센트)", "냉·난방", "조명"],
      },
      {
        title: "이용 유의",
        items: [
          "가구·비치물품의 이동이 필요한 경우 사전에 센터와 협의해 주시기 바랍니다.",
          "현장 운영 상황에 따라 비치물품은 변동될 수 있습니다.",
        ],
      },
    ],
  },
  {
    id: "classroom_all",
    floor: "4",
    name: "모두의교실",
    capacity: 30,
    durationLimitHours: 6,
    // 시간당 대관료
    feeKRW: 100000,
    contactName: "관리자",
    contactPhone: "02-0000-0000",
    image: "/rooms/classroom_all.png",
    note: "다양한 활동이 가능한 다목적 공간입니다.",
    equipment: [
      {
        title: "기본 비치",
        items: ["테이블", "의자", "전원(콘센트)", "냉·난방", "조명"],
      },
      {
        title: "이용 유의",
        items: [
          "가구·비치물품의 이동이 필요한 경우 사전에 센터와 협의해 주시기 바랍니다.",
          "현장 운영 상황에 따라 비치물품은 변동될 수 있습니다.",
        ],
      },
    ],
  },


  {
    id: "gallery",
    floor: "4",
    name: "우리동네 갤러리",
    category: "gallery",
    capacity: 30,
    // 전시 기간(일 단위) 대관: 요금은 별도 정책(평일/토) 적용
    durationLimitHours: 0,
    feeKRW: 0,
    contactName: "관리자",
    contactPhone: "02-0000-0000",
    note: "4층(북카페 일대) 전시 공간입니다. 전시 기간(일 단위)으로 신청하며, 시작일 이전 준비(세팅) 1일은 무료로 포함됩니다.",
    equipment: [
      {
        title: "운영 시간",
        items: [
          "평일 09:00~18:00 / 화 야간 18:00~20:00 / 토 09:00~13:00 / 일·공휴일 휴관",
        ],
      },
      {
        title: "대관 안내",
        items: [
          "평일 20,000원/일, 토요일 10,000원/일 (할인 및 바우처 적용 불가)",
          "준비(세팅)일 1일 무료 지원 (전시 시작일 이전, 휴관일 제외)",
          "전시 마지막 날 17시까지 철수 완료 필수",
        ],
      },
      {
        title: "전시 참고사항",
        items: [
          "신청자 직접 설치·철수 (작품 보관·지원·관리 인력 제공 불가)",
          "와이어 걸이(고리) 형식 작품만 전시 가능",
          "액자 형태: 가로/세로 최대 60cm, 최대 15점",
          "작품 크기·무게에 따라 전시 불가 시 사전 담당자 상담 필요",
        ],
      },
    ],
  },

  {
    id: "sangsang1",
    floor: "5",
    name: "상상교실 1",
    capacity: 20,
    durationLimitHours: 6,
    // 시간당 대관료
    feeKRW: 70000,
    contactName: "관리자",
    contactPhone: "02-0000-0000",
    equipment: [
      { title: "기본 비치", items: ["테이블", "의자", "화이트보드(또는 보드)", "전원(콘센트)", "냉·난방", "조명"] },
      { title: "이용 유의", items: ["현장 운영 상황에 따라 비치물품은 변동될 수 있습니다."] },
    ],
  },
  {
    id: "sangsang2",
    floor: "5",
    name: "상상교실 2",
    capacity: 20,
    durationLimitHours: 6,
    // 시간당 대관료
    feeKRW: 50000,
    contactName: "관리자",
    contactPhone: "02-0000-0000",
    equipment: [
      { title: "기본 비치", items: ["테이블", "의자", "화이트보드(또는 보드)", "전원(콘센트)", "냉·난방", "조명"] },
      { title: "이용 유의", items: ["현장 운영 상황에 따라 비치물품은 변동될 수 있습니다."] },
    ],
  },
  {
    id: "sangsang3",
    floor: "5",
    name: "상상교실 3",
    capacity: 20,
    durationLimitHours: 6,
    // 시간당 대관료
    feeKRW: 70000,
    contactName: "관리자",
    contactPhone: "02-0000-0000",
    equipment: [
      { title: "기본 비치", items: ["테이블", "의자", "화이트보드(또는 보드)", "전원(콘센트)", "냉·난방", "조명"] },
      { title: "이용 유의", items: ["현장 운영 상황에 따라 비치물품은 변동될 수 있습니다."] },
    ],
  },
  {
    id: "media",
    floor: "5",
    name: "E-스튜디오",
    category: "studio",
    capacity: 12,
    durationLimitHours: 6,
    // 시간당 대관료 (기본 인원 2명)
    feeKRW: 20000,
    contactName: "관리자",
    contactPhone: "02-0000-0000",
    note: "촬영·녹음·편집 등 미디어 활동을 지원하는 스튜디오 공간입니다. 기본 2인 이상 인원 추가 시 시간당 5,000원이 추가됩니다.",
    equipment: [
      { title: "기본 비치", items: ["테이블", "의자", "전원(콘센트)", "냉·난방", "조명"] },
      {
        title: "촬영 장비 (별도 사용료)",
        items: [
          "미러리스 소니 알파 A6400 (배터리+128G SD+충전기) — 10,000원",
          "캠코더 Sony FDR-AX700 — 10,000원",
          "보야 듀얼 채널 무선 마이크 5개 — 10,000원",
          "보야 핀 마이크 1개 — 5,000원",
          "로데 비디오 마이크 + 스탠드 PSA1 — 10,000원",
          "전자칠판(65인치) + 모니터링 모니터(43인치) + LG노트북 — 20,000원",
        ],
      },
      {
        title: "이용 안내",
        items: [
          "이용시간 인접 시 추가금액: 시간당 5,000원 (기본 2인 초과)",
          "유료장비는 대관이용시간 기간 중 1일 1회만 과금",
          "대관신청 신청서 접수하면 매월로 접수되며, 담당자 확인하여 변동사항 및 비용 안내",
          "대관료 결제 후 확인이 되어야 예약 확정 (준비해야 할 사항이 있으면 사전 안내)",
          "촬영장은 저장형 카메라용 SD카드 또는 여장하드를 반드시 준비",
        ],
      },
    ],
  },
  {
    id: "it",
    floor: "5",
    name: "IT강의실",
    capacity: 18,
    durationLimitHours: 6,
    // 시간당 대관료
    feeKRW: 100000,
    contactName: "관리자",
    contactPhone: "02-0000-0000",
    equipment: [
      { title: "기본 비치", items: ["테이블", "의자", "전원(콘센트)", "냉·난방", "조명"] },
      { title: "기자재(운영 상황에 따라 제공)", items: ["PC/주변기기 제공 여부는 운영 상황에 따라 달라질 수 있습니다."] },
      { title: "이용 유의", items: ["개인 계정 정보 및 자료 보호를 위해 로그아웃/자료 삭제 등 보안 수칙을 준수해 주시기 바랍니다."] },
    ],
  },

  {
    id: "art",
    floor: "6",
    name: "아트실",
    capacity: 20,
    durationLimitHours: 6,
    // 시간당 대관료
    feeKRW: 70000,
    contactName: "관리자",
    contactPhone: "02-0000-0000",
    equipment: [
      { title: "기본 비치", items: ["테이블", "의자", "전원(콘센트)", "냉·난방", "조명"] },
      { title: "이용 유의", items: ["미술 재료(물감/접착제 등) 사용 시 오염 방지를 위한 보호 조치를 부탁드립니다.", "이용 종료 후 원상복구 및 정리정돈을 완료해 주시기 바랍니다."] },
    ],
  },

  {
    id: "healing",
    floor: "7",
    name: "힐링강의실",
    capacity: 20,
    durationLimitHours: 6,
    // 시간당 대관료
    feeKRW: 100000,
    contactName: "관리자",
    contactPhone: "02-0000-0000",
    equipment: [
      { title: "기본 비치", items: ["테이블(운영 형태에 따라 상이)", "의자", "전원(콘센트)", "냉·난방", "조명"] },
      { title: "이용 유의", items: ["프로그램 성격상 조용한 이용을 부탁드립니다.", "현장 운영 상황에 따라 좌석/배치 형태는 변경될 수 있습니다."] },
    ],
  },
  {
    id: "maru",
    floor: "7",
    name: "마루강의실",
    capacity: 25,
    durationLimitHours: 6,
    // 시간당 대관료
    feeKRW: 100000,
    contactName: "관리자",
    contactPhone: "02-0000-0000",
    equipment: [
      { title: "기본 비치", items: ["전원(콘센트)", "냉·난방", "조명"] },
      { title: "이용 유의", items: ["마루 바닥 보호를 위해 실내화 착용 등 센터 안내에 따라 이용해 주시기 바랍니다."] },
    ],
  }
];

/**
 * ID로 공간 조회
 */
export function getRoom(roomId: string): SpaceRoom | null {
  return ROOMS.find((r) => r.id === roomId) ?? null;
}

/**
 * ID로 빠른 조회를 위한 맵
 */
export const ROOMS_BY_ID: Record<string, SpaceRoom> = Object.fromEntries(
  ROOMS.map((r) => [r.id, r])
);

/**
 * 층별로 그룹화된 공간 목록
 */
export const ROOMS_BY_FLOOR: Record<FloorId, SpaceRoom[]> = {
  "4": ROOMS.filter(r => r.floor === "4"),
  "5": ROOMS.filter(r => r.floor === "5"),
  "6": ROOMS.filter(r => r.floor === "6"),
  "7": ROOMS.filter(r => r.floor === "7")
};

/**
 * 관리자 페이지 필터용 공간 목록 (전체 옵션 포함)
 */
export const ROOMS_WITH_ALL = [
  { id: "all", name: "전체" },
  ...ROOMS.map(r => ({ id: r.id, name: r.name }))
];

/**
 * 공간 ID로 층 ID 조회
 */
export function getFloorIdByRoomId(roomId: string): FloorId | null {
  const room = getRoom(roomId);
  return room?.floor ?? null;
}

/**
 * 층 정보 조회
 */
export function getFloor(floorId: FloorId): Floor | null {
  return FLOORS.find(f => f.id === floorId) ?? null;
}

/**
 * querystring 등 외부 입력값을 안전하게 카테고리로 정규화
 */
export function normalizeRoomCategory(input?: string | null): RoomCategory {
  const c = String(input ?? "").trim().toLowerCase();
  if (c === "studio" || c === "e-studio" || c === "estudio" || c === "e_studio") return "studio";
  if (c === "gallery") return "gallery";
  return "lecture";
}

/**
 * 카테고리별 공간 목록
 * - category가 없으면 lecture(강의실)로 간주합니다.
 */
export function getRoomsByCategory(category?: string | null): SpaceRoom[] {
  const cat = normalizeRoomCategory(category);
  return ROOMS.filter((r) => (r.category ?? "lecture") === cat);
}

export function getCategoryLabel(category?: RoomCategory): string {
  const c = category ?? "lecture";
  if (c === "studio") return "E-스튜디오";
  if (c === "gallery") return "우리동네 갤러리";
  return "강의실";
}
