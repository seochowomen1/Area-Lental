export type RequestStatus = "접수" | "승인" | "반려" | "취소";

/** 접수 경로 (서면 접수 등록 기능 · 2026-10-19) */
export type IntakeChannel = "online" | "visit" | "email" | "fax";

/** 결제 상태 — 빈값은 미결제로 해석 (결제 링크·결제 확인 기록 · 2026-10-26) */
export type PaymentStatus = "" | "미결제" | "결제완료" | "환불";
/** 결제 방식 */
export type PaymentMethod = "홈페이지 온라인" | "현장 카드" | "현장 현금" | "계좌이체";

/**
 * 결제 기록 필드 — 묶음(batchId)은 전 행 동일 값(할인 필드와 같은 동기화 규칙)
 * 결제 기록(paymentStatus 이하)은 회계 증빙이므로 개인정보 파기 대상에서 제외한다.
 */
export type PaymentFields = {
  /** 홈페이지 강좌 결제 링크 (seochowomen.kr 호스트만) */
  paymentLinkUrl?: string;
  /** 결제 기한 YYYY-MM-DD = 홈페이지 접수기간 종료일 · 자동 취소 판정 기준 */
  paymentDueDate?: string;
  /** 홈페이지 웹게시 처리일 YYYY-MM-DD */
  homepagePostedAt?: string;
  /** 홈페이지 마감·미게시 처리일 YYYY-MM-DD */
  homepageClosedAt?: string;
  /** 결제 링크 포함 메일 발송 시각(ISO) */
  paymentNoticeSentAt?: string;
  /** D-1 리마인드 발송 시각(ISO) */
  paymentReminderSentAt?: string;
  /** 결제 기한 경과 자동 취소 시각(ISO) — 있으면 "자동 취소됨" */
  autoCancelledAt?: string;
  paymentStatus?: PaymentStatus;
  paymentMethod?: PaymentMethod | "";
  /** 결제일 YYYY-MM-DD */
  paidAt?: string;
  /** 결제 확인 금액(원) */
  paidAmountKRW?: number;
  /** 영수증·승인번호 앞자리·금액 차이 사유 등 */
  paymentNote?: string;
  /** 결제 기록 시각(ISO) */
  paymentConfirmedAt?: string;
  /** 결제 기록자(시설총무) */
  paymentConfirmedBy?: string;
  /** 환불일 YYYY-MM-DD */
  refundedAt?: string;
  refundAmountKRW?: number;
  refundReason?: string;
};

/** 결제 필드 키 목록 — 시트 헤더(REQUEST_OPTIONAL_HEADERS)와 updateRequestPayment가 같은 출처를 쓴다 */
export const PAYMENT_FIELD_KEYS = [
  "paymentLinkUrl",
  "paymentDueDate",
  "homepagePostedAt",
  "homepageClosedAt",
  "paymentNoticeSentAt",
  "paymentReminderSentAt",
  "autoCancelledAt",
  "paymentStatus",
  "paymentMethod",
  "paidAt",
  "paidAmountKRW",
  "paymentNote",
  "paymentConfirmedAt",
  "paymentConfirmedBy",
  "refundedAt",
  "refundAmountKRW",
  "refundReason",
] as const satisfies readonly (keyof PaymentFields)[];

/** 숫자형 결제 필드 */
export const PAYMENT_NUMERIC_KEYS: ReadonlySet<string> = new Set(["paidAmountKRW", "refundAmountKRW"]);

/** 갤러리 이용료 다시 계산(audit-fix-2 R2) — 이 1행의 일수 3열 + galleryAuditJson만 바꾼다 */
export type GalleryFeeUpdate = {
  requestId: string;
  weekdayCount: number;
  saturdayCount: number;
  exhibitionDayCount: number;
  galleryAuditJson: string;
};

/** 결제 필드 갱신 패치 — null 또는 "" 은 "비움" */
export type PaymentPatch = { [K in keyof PaymentFields]?: PaymentFields[K] | null };

export type RentalRequest = PaymentFields & {
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

  /** 접수 경로 — online(앱 신청) · visit(방문 서면) · email(이메일 서면) · fax(팩스·우편 서면). 없으면 online (2026-10-19) */
  intakeChannel?: IntakeChannel;
  /** 서면 접수 시 실제 신청(접수)일 YYYY-MM-DD — 없으면 createdAt 기준 */
  appliedAt?: string;
  /** 서면 접수 등록 메모(원본 보관 위치 등) */
  intakeNote?: string;

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
  /** 외부 시스템에서 동기화된 항목이면 출처(예: "classroom" = 서초센터 업무 시스템 강의실 일정표) */
  source?: string;
  /** 출처 쪽 식별자(분기:강좌ID:요일|날짜) */
  sourceId?: string;
  /** 마지막 동기화 시각(ISO) */
  syncedAt?: string;
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

