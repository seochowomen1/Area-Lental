export type RequestStatus = "접수" | "승인" | "반려" | "취소";

export type RentalRequest = {
  requestId: string;
  createdAt: string;

  /** 여러 날짜를 1회 신청으로 묶어 처리하기 위한 ID (없으면 단건) */
  batchId?: string;
  /** batch 내 순번 (1부터) */
  batchSeq?: number;
  /** batch 전체 건수 */
  batchSize?: number;

  roomId: string;
  roomName: string;

  date: string;
  startTime: string;
  endTime: string;

  /** 우리동네 갤러리: 준비(세팅)일 여부 */
  isPrepDay?: boolean;
  /** 우리동네 갤러리: 전시 시작일 */
  startDate?: string;
  /** 우리동네 갤러리: 전시 종료일 */
  endDate?: string;

  /** 우리동네 갤러리: 전시명 */
  exhibitionTitle?: string;
  /** 우리동네 갤러리: 전시목적 */
  exhibitionPurpose?: string;
  /** 우리동네 갤러리: 장르·내용 */
  genreContent?: string;
  /** 우리동네 갤러리: 인지경로 */
  awarenessPath?: string;
  /** 우리동네 갤러리: 특이사항 */
  specialNotes?: string;

  /** 우리동네 갤러리: 서버 생성(감사) 정보 */
  galleryGeneratedAt?: string;
  /** 우리동네 갤러리: 서버 생성 버전(호환/추적용) */
  galleryGenerationVersion?: string;
  /** 우리동네 갤러리: 전시일수(평일) */
  galleryWeekdayCount?: number;
  /** 우리동네 갤러리: 전시일수(토) */
  gallerySaturdayCount?: number;
  /** 우리동네 갤러리: 전시일수(준비일 제외) */
  galleryExhibitionDayCount?: number;
  /** 우리동네 갤러리: 준비(세팅)일(YYYY-MM-DD) */
  galleryPrepDate?: string;
  /** 우리동네 갤러리: 감사 로그(JSON 문자열, 선택) */
  galleryAuditJson?: string;
  /** 우리동네 갤러리: 철수시간(HH:MM, 종료일 기준) */
  galleryRemovalTime?: string;

  applicantName: string;
  birth: string;
  address: string;
  phone: string;
  email: string;

  orgName: string;
  headcount: number;

  equipment: {
    laptop: boolean;
    projector: boolean;
    audio: boolean;
    /** E-스튜디오 촬영장비 */
    mirrorless?: boolean;
    camcorder?: boolean;
    wirelessMic?: boolean;
    pinMic?: boolean;
    rodeMic?: boolean;
    electronicBoard?: boolean;
  };

  purpose: string;

  attachments: string[];
  privacyAgree: boolean;
  pledgeAgree: boolean;
  pledgeDate: string;
  pledgeName: string;

  /** 할인률(%) - 관리자 입력 */
  discountRatePct?: number;
  /** 할인금액(원) - 관리자 입력 */
  discountAmountKRW?: number;
  /** 할인 사유 - 관리자 입력 */
  discountReason?: string;

  status: RequestStatus;
  adminMemo: string;
  rejectReason: string;
  decidedAt: string;
  decidedBy: string;
};

export type ClassSchedule = {
  id: string;
  roomId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  title: string;
  effectiveFrom: string;
  effectiveTo: string;
};

export type BlockTime = {
  id: string;
  roomId: string;
  date: string;
  /** 갤러리 등 일 단위 차단 시 종료일 (YYYY-MM-DD) */
  endDate?: string;
  startTime: string;
  endTime: string;
  reason: string;
};

// BlockedSlot은 BlockTime의 별칭 (database.ts와의 호환성)
export type BlockedSlot = BlockTime;

// 화면에서 사용하는 최소 강의실 타입(id/name)
export type Room = {
  id: string;
  name: string;
};

