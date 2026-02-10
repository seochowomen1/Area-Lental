import { toMinutes } from "./datetime";

import { z } from "zod";
import { UPLOAD } from "@/lib/config";
import { TIME_CONSTANTS } from "@/lib/constants";

/**
 * HTML checkbox(FormData) 값 파싱
 * - 체크됨: "on" (또는 "true"/"1")
 * - 미체크: null -> caller에서 "false"로 채움
 *
 * ⚠️ z.coerce.boolean()은 Boolean("false") === true 이므로 사용 금지.
 */
const CheckboxBoolean = z.preprocess((v) => {
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    return s === "on" || s === "true" || s === "1";
  }
  return Boolean(v);
}, z.boolean());

export const RequestInputSchema = z.object({
  roomId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),

  applicantName: z.string().min(2).max(30),
  birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  address: z.string().min(2).max(200),
  phone: z.string().min(9).max(20),
  email: z.string().email(),

  orgName: z.string().min(1).max(80),
  headcount: z.coerce.number().int().min(1).max(500),

  laptop: CheckboxBoolean.default(false),
  projector: CheckboxBoolean.default(false),
  audio: CheckboxBoolean.default(false),

  /** E-스튜디오 촬영장비 */
  mirrorless: CheckboxBoolean.default(false),
  camcorder: CheckboxBoolean.default(false),
  wirelessMic: CheckboxBoolean.default(false),
  pinMic: CheckboxBoolean.default(false),
  rodeMic: CheckboxBoolean.default(false),
  electronicBoard: CheckboxBoolean.default(false),

  purpose: z.string().min(5).max(1000),

  privacyAgree: CheckboxBoolean,
  pledgeAgree: CheckboxBoolean,
  pledgeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pledgeName: z.string().min(2).max(30)
}).superRefine((v, ctx) => {
  if (!v.privacyAgree) ctx.addIssue({ code: "custom", path: ["privacyAgree"], message: "개인정보 수집·이용 동의는 필수입니다." });
  if (!v.pledgeAgree) ctx.addIssue({ code: "custom", path: ["pledgeAgree"], message: "대관 규정 서약 동의는 필수입니다." });

  const sMin = toMinutes(v.startTime);
  const eMin = toMinutes(v.endTime);
  if (!Number.isFinite(sMin) || !Number.isFinite(eMin)) {
    ctx.addIssue({ code: "custom", path: ["startTime"], message: "시작/종료 시간이 올바르지 않습니다." });
    return;
  }

  if (sMin >= eMin) {
    ctx.addIssue({ code: "custom", path: ["endTime"], message: "종료 시간은 시작 시간보다 늦어야 합니다." });
    return;
  }

  const diff = eMin - sMin;
  if (sMin % TIME_CONSTANTS.TIME_SLOT_INTERVAL !== 0 || eMin % TIME_CONSTANTS.TIME_SLOT_INTERVAL !== 0) {
    ctx.addIssue({ code: "custom", path: ["startTime"], message: "시간은 30분 단위로만 선택할 수 있습니다." });
  }
  if (diff < TIME_CONSTANTS.MIN_RENTAL_MINUTES) {
    ctx.addIssue({ code: "custom", path: ["endTime"], message: "최소 1시간 이상 선택해야 합니다." });
  }
  if (diff > TIME_CONSTANTS.MAX_RENTAL_MINUTES) {
    ctx.addIssue({ code: "custom", path: ["endTime"], message: "최대 6시간까지만 신청할 수 있습니다." });
  }
  if (diff % TIME_CONSTANTS.TIME_SLOT_INTERVAL !== 0) {
    ctx.addIssue({ code: "custom", path: ["endTime"], message: "이용시간은 30분 단위로만 선택할 수 있습니다." });
  }

  if (UPLOAD.maxFiles !== 3) {
    ctx.addIssue({ code: "custom", path: ["_"], message: "업로드 제한 설정이 올바르지 않습니다." });
  }
});

export type RequestInput = z.infer<typeof RequestInputSchema>;

/**
 * 우리동네 갤러리 신청용 입력 스키마(B안)
 * - 기간(startDate/endDate) 기반 회차 생성은 /api/requests에서 재생성/검증 예정
 * - 현 단계에서는 기존 저장 구조 호환을 위해 date/startTime/endTime 필드도 유지합니다.
 * - 강의실(시간 단위)과 달리 갤러리는 일(日) 단위 운영이므로 1~6시간 제한을 두지 않습니다.
 */
export const GalleryRequestInputSchema = z
  .object({
    roomId: z.string().min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),

    applicantName: z.string().min(2).max(30),
    birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    address: z.string().min(2).max(200),
    phone: z.string().min(9).max(20),
    email: z.string().email(),

    orgName: z.string().min(1).max(80),
    headcount: z.coerce.number().int().min(1).max(500),

    // 갤러리는 장비 옵션 불가(항상 false)
    laptop: CheckboxBoolean.default(false),
    projector: CheckboxBoolean.default(false),
    audio: CheckboxBoolean.default(false),
    mirrorless: CheckboxBoolean.default(false),
    camcorder: CheckboxBoolean.default(false),
    wirelessMic: CheckboxBoolean.default(false),
    pinMic: CheckboxBoolean.default(false),
    rodeMic: CheckboxBoolean.default(false),
    electronicBoard: CheckboxBoolean.default(false),

    // 갤러리 전용 필드는 서버 저장 확장 시 활용(현재는 추가 데이터로 전달 가능)
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "시작일 형식을 확인해 주세요."),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "종료일 형식을 확인해 주세요."),
    exhibitionTitle: z.string().min(1, "전시명은 필수입니다.").max(80),
    exhibitionPurpose: z.string().max(1000).optional(),
    genreContent: z.string().max(1000).optional(),
    awarenessPath: z.string().max(200).optional(),
    specialNotes: z.string().max(1000).optional(),

    // 호환: 관리자 확인용 텍스트(갤러리 전용 필드를 합쳐서 구성)
    purpose: z.string().min(1).max(2000),

    privacyAgree: CheckboxBoolean,
    pledgeAgree: CheckboxBoolean,
    pledgeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    pledgeName: z.string().min(2).max(30)
  })
  .superRefine((v, ctx) => {
    if (!v.privacyAgree) ctx.addIssue({ code: "custom", path: ["privacyAgree"], message: "개인정보 수집·이용 동의는 필수입니다." });
    if (!v.pledgeAgree) ctx.addIssue({ code: "custom", path: ["pledgeAgree"], message: "대관 규정 서약 동의는 필수입니다." });

    if (v.endDate < v.startDate) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "종료일은 시작일보다 빠를 수 없습니다." });
    }

    const sMin = toMinutes(v.startTime);
    const eMin = toMinutes(v.endTime);
    if (!Number.isFinite(sMin) || !Number.isFinite(eMin)) {
      ctx.addIssue({ code: "custom", path: ["startTime"], message: "시작/종료 시간이 올바르지 않습니다." });
      return;
    }
    if (sMin >= eMin) {
      ctx.addIssue({ code: "custom", path: ["endTime"], message: "종료 시간은 시작 시간보다 늦어야 합니다." });
    }

    // 장비 옵션 완전 차단
    if (v.laptop || v.projector || v.audio) {
      ctx.addIssue({ code: "custom", path: ["laptop"], message: "갤러리 신청은 장비 옵션을 선택할 수 없습니다." });
    }
  });

export type GalleryRequestInput = z.infer<typeof GalleryRequestInputSchema>;
