import nodemailer from "nodemailer";
import { getBaseEnv, getSmtpEnvOptional, isMockMode } from "@/lib/env";
import type { RentalRequest } from "@/lib/types";
import { computeFeesForBundle, computeFeesForRequest, formatKRW, getSelectedEquipmentDetails } from "@/lib/pricing";
import { ROOMS_BY_ID } from "@/lib/space";
import { getTemplate, renderTemplate, applyGalleryWording, type TemplateCategory, type TemplateStatus } from "@/lib/emailTemplates";
import { maskPhone, maskEmail } from "@/lib/mask";
import { bundleKey, formatDueDateKo, paymentRep } from "@/lib/payment";
import { APPLICANT_TOKEN_TTL, createApplicantLinkToken } from "@/lib/publicLinkToken";
import { buildProgramName } from "@/lib/welfareCopy";

/* ───────────────── 결제 안내 블록 (2026-10-26 · 01_spec ③-(나)) ───────────────── */

/**
 * 승인 메일 [결제 안내] 블록 — 승인 ≥1 · paymentLinkUrl 있을 때만. 블록에는 "대관" 단어가 없다.
 * (강좌명의 "[대관]" 접두사는 데이터이므로 갤러리 문구 변환 대상이 아니며, 변수 값으로 들어가 템플릿 변환과 분리된다)
 */
export function buildPaymentNoticeBlock(sessions: RentalRequest[]): string {
  const approved = sessions.filter((r) => r.status === "승인");
  if (!approved.length) return "";
  const rep = paymentRep(sessions);
  const link = rep?.paymentLinkUrl ?? "";
  if (!link) return "";
  const due = rep?.paymentDueDate ?? "";
  const programName = buildProgramName(approved);
  return [
    "[결제 안내]",
    "- 결제 방법: 서초여성가족플라자 홈페이지에서 온라인 결제",
    `- 결제 링크: ${link}`,
    due ? `- 결제 기한: ${formatDueDateKo(due)}까지` : "",
    "- 링크가 열리지 않으면 홈페이지 > 강좌 신청 > 강좌목록(카테고리 '기타')에서",
    `  "${programName}" 를 찾아 신청·결제해 주세요.`,
    "- 결제 기한까지 결제가 확인되지 않으면 신청이 자동 취소됩니다.",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

/** 템플릿에 {{결제안내}}가 있으면 그 자리, 없으면 {{요금정보}} 값 끝에 이어 붙인다 */
function mergePaymentNotice(templateBody: string, feeBlock: string, noticeBlock: string): { 요금정보: string; 결제안내: string } {
  if (!noticeBlock) return { 요금정보: feeBlock, 결제안내: "" };
  if (templateBody.includes("{{결제안내}}")) return { 요금정보: feeBlock, 결제안내: noticeBlock };
  return { 요금정보: feeBlock ? `${feeBlock}\n\n${noticeBlock}` : noticeBlock, 결제안내: "" };
}

/** 자동 취소 메일 [자동 취소 안내] 블록 */
export function buildAutoCancelBlock(dueDate: string): string {
  return [
    "[자동 취소 안내]",
    `- 사유: 결제 기한(${dueDate}) 경과로 자동 취소`,
    "- 결제 기한까지 결제가 확인되지 않아 신청이 자동 취소되었습니다.",
    "- 다시 이용을 원하시면 새로 신청해 주세요. 이미 결제하셨다면 센터로 연락해 주세요.",
  ].join("\n");
}

/** 템플릿에 {{취소사유}}가 없으면 "처리상태" 줄 뒤에 블록 삽입 */
function insertAfterStatusLine(body: string, block: string): string {
  const lines = body.split("\n");
  const idx = lines.findIndex((l) => l.includes("처리상태"));
  if (idx < 0) return `${body.trimEnd()}\n\n${block}\n`;
  lines.splice(idx + 1, 0, "", block);
  return lines.join("\n");
}

function isGallery(r: RentalRequest) {
  return r.roomId === "gallery";
}

function formatSession(r: RentalRequest) {
  if (isGallery(r)) {
    const tag = r.isPrepDay ? "준비일(무료)" : "전시일";
    return `${r.date} (${tag})`;
  }
  return `${r.date} ${r.startTime}-${r.endTime}`;
}

function formatWhenSingle(r: RentalRequest) {
  if (isGallery(r)) {
    const from = r.startDate ?? r.date;
    const to = r.endDate ?? r.date;
    return `${from} ~ ${to}`;
  }
  return `${r.date} ${r.startTime}-${r.endTime}`;
}

function summarizeStatus(list: RentalRequest[]) {
  const statuses = new Set(list.map((r) => r.status));
  if (statuses.size === 1) return list[0].status;
  // 혼합 상태인 경우(부분 처리)
  if ([...statuses].includes("반려")) return "반려";
  if ([...statuses].includes("승인")) return "접수";
  return "접수";
}

function transporter() {
  if (isMockMode()) return null;

  const smtp = getSmtpEnvOptional();
  if (!smtp) return null;

  return nodemailer.createTransport({
    host: smtp.SMTP_HOST,
    port: parseInt(smtp.SMTP_PORT, 10),
    secure: parseInt(smtp.SMTP_PORT, 10) === 465,
    auth: { user: smtp.SMTP_USER, pass: smtp.SMTP_PASS }
  });
}

function getRoomCategory(r: RentalRequest): "lecture" | "studio" | "gallery" {
  if (r.roomId === "gallery") return "gallery";
  const room = ROOMS_BY_ID[r.roomId];
  if (room?.category === "studio") return "studio";
  return "lecture";
}

function spaceCategoryLabel(r: RentalRequest): string {
  const cat = getRoomCategory(r);
  if (cat === "studio") return "E-스튜디오";
  if (cat === "gallery") return "우리동네 갤러리";
  return "강의실";
}

function formatEquipmentForEmail(r: RentalRequest): string {
  const cat = getRoomCategory(r);
  if (cat === "gallery") return "해당없음";
  const details = getSelectedEquipmentDetails(r.equipment, cat);
  if (details.length === 0) return "선택 없음";
  return details.map((eq) => `${eq.label} (${formatKRW(eq.feeKRW)})`).join(", ");
}

/**
 * 신청자 메일 속 조회 링크 — 그 신청(묶음) 전용 7일 토큰 포함 (audit-fix-1 ⑤-6)
 * 메일함은 본인 소유이므로 매직 링크와 같은 수준. 토큰 발급이 실패하면 토큰 없는 링크(신청번호만).
 */
function applicantResultUrl(r: RentalRequest): string {
  const base = getBaseEnv();
  const url = `${base.APP_BASE_URL}/result?requestId=${encodeURIComponent(r.requestId)}`;
  if (!r.email) return url;
  try {
    const { token } = createApplicantLinkToken({
      email: r.email,
      scope: "req",
      group: bundleKey(r),
      ttlSeconds: APPLICANT_TOKEN_TTL.MAIL_RESULT,
    });
    return `${url}&token=${encodeURIComponent(token)}`;
  } catch {
    return url;
  }
}

async function maybeSend(mail: { to: string; subject: string; text: string }) {
  const base = getBaseEnv();
  if (isMockMode()) {
    console.log("\n[MOCK EMAIL]", { to: maskEmail(mail.to), subject: mail.subject });
    // 로컬 검증용(기본 끔): MOCK_EMAIL_SHOW_BODY=1 이면 본문(조회 링크 포함)을 출력
    if (process.env.MOCK_EMAIL_SHOW_BODY === "1") console.log(mail.text);
    return;
  }
  const tr = transporter();
  if (!tr) {
    // SMTP 미설정 상태에서는 메일 발송을 생략하되, 흐름이 깨지지 않도록 함
    console.warn("[MAIL] SMTP 미설정으로 발송 생략", { to: maskEmail(mail.to), subject: mail.subject });
    return;
  }

  await tr.sendMail({
    from: getSmtpEnvOptional()!.SMTP_FROM,
    to: mail.to,
    subject: mail.subject,
    text: mail.text
  });
}

/**
 * 신청자 "내 예약 조회" 링크 발송(매직링크)
 * - email 주소만으로 링크를 발송하고, 링크(토큰)로 인증하여 조회합니다.
 */
export async function sendApplicantMyReservationsLinkEmail(args: {
  to: string;
  linkUrl: string;
  expiresMinutes: number;
}) {
  const subject = `[내 예약 조회] 링크가 도착했습니다`;
  const text =
`안녕하세요. 서초여성가족플라자 서초센터입니다.

아래 링크를 클릭하시면 "내 예약"을 확인하실 수 있습니다.
※ 링크는 발송 시점부터 ${args.expiresMinutes}분 동안 유효합니다.

${args.linkUrl}

감사합니다.
`;

  await maybeSend({ to: args.to, subject, text });
}

export async function sendAdminNewRequestEmail(req: RentalRequest) {
  const base = getBaseEnv();
  const cat = spaceCategoryLabel(req);
  const url = `${base.APP_BASE_URL}/admin/requests/${encodeURIComponent(req.requestId)}`;
  const atts = Array.isArray(req.attachments) ? req.attachments : [];

  const subject = isGallery(req)
    ? `[전시신청] ${req.roomName} / ${formatWhenSingle(req)} / ${req.requestId}`
    : `[대관신청] ${req.roomName} / ${req.date} ${req.startTime}-${req.endTime} / ${req.requestId}`;
  const text =
`새 ${isGallery(req) ? "전시" : "대관"} 신청이 등록되었습니다.

- 신청번호: ${req.requestId}
- 공간(${cat}): ${req.roomName}
- ${isGallery(req) ? "전시기간" : "일시"}: ${formatWhenSingle(req)}
- 신청자: ${req.applicantName} (${maskPhone(req.phone)})
- 단체/인원: ${req.orgName} / ${req.headcount}명
- ${isGallery(req) ? "장비" : getRoomCategory(req) === "studio" ? "촬영장비" : "기자재"}: ${formatEquipmentForEmail(req)}
- 첨부: ${atts.length ? atts.join("\n  - ") : "없음"}

관리자에서 확인: ${url}
`;

  const smtp = getSmtpEnvOptional();
  const to = smtp?.ADMIN_NOTIFY_EMAIL ?? "admin@example.com";
  await maybeSend({ to, subject, text });
}

export async function sendAdminNewRequestEmailBatch(reqs: RentalRequest[]) {
  const list = (Array.isArray(reqs) ? reqs : []).slice().sort((a, b) => (a.batchSeq ?? 0) - (b.batchSeq ?? 0));
  if (list.length === 0) return;

  const base = getBaseEnv();
  const first = list[0];
  const cat = spaceCategoryLabel(first);

  const url = `${base.APP_BASE_URL}/admin/requests/${encodeURIComponent(first.requestId)}`;

  const subject = isGallery(first)
    ? `[전시신청] ${first.roomName} / 전시 ${list.length}일 / ${first.requestId}`
    : `[대관신청] ${first.roomName} / ${list.length}회차 / ${first.requestId}`;
  const sessions = list.map((r, i) => `  ${i + 1}. ${formatSession(r)}`).join("\n");

  const eqLabel = isGallery(first) ? "장비" : getRoomCategory(first) === "studio" ? "촬영장비(회차별 동일)" : "기자재(회차별 동일)";

  const text =
`새 ${isGallery(first) ? "전시" : "대관"} 신청(묶음)이 등록되었습니다.

- 대표 신청번호: ${first.requestId}
- ${isGallery(first) ? "전시일 수" : "회차 수"}: ${list.length}${isGallery(first) ? "일" : "회"}
- 공간(${cat}): ${first.roomName}
- 신청자: ${first.applicantName} (${maskPhone(first.phone)})
- 단체/인원: ${first.orgName} / ${first.headcount}명
- ${eqLabel}: ${formatEquipmentForEmail(first)}

[${isGallery(first) ? "전시일(일 단위)" : "이용일시"}]
${sessions}

관리자에서 확인: ${url}
`;

  const smtp = getSmtpEnvOptional();
  const to = smtp?.ADMIN_NOTIFY_EMAIL ?? "admin@example.com";
  await maybeSend({ to, subject, text });
}

export async function sendApplicantReceivedEmail(req: RentalRequest) {
  const cat = spaceCategoryLabel(req);
  const catId = getRoomCategory(req) as TemplateCategory;
  const eqLine = !isGallery(req) ? `- ${getRoomCategory(req) === "studio" ? "촬영장비" : "기자재"}: ${formatEquipmentForEmail(req)}` : "";

  const template = await getTemplate(catId, "접수");
  const vars: Record<string, string> = {
    "신청번호": req.requestId,
    "공간": req.roomName,
    "카테고리": cat,
    "일시": formatWhenSingle(req),
    "신청자": req.applicantName,
    "상태": "접수",
    "장비정보": eqLine,
    "요금정보": "",
    "반려사유": "",
    "조회링크": "",
  };
  const rendered = renderTemplate(template, vars);
  await maybeSend({ to: req.email, subject: rendered.subject, text: rendered.body });
}

export async function sendApplicantReceivedEmailBatch(reqs: RentalRequest[]) {
  const list = (Array.isArray(reqs) ? reqs : []).slice().sort((a, b) => (a.batchSeq ?? 0) - (b.batchSeq ?? 0));
  if (list.length === 0) return;
  const first = list[0];
  const cat = spaceCategoryLabel(first);
  const catId = getRoomCategory(first) as TemplateCategory;
  const sessions = list.map((r, i) => `  ${i + 1}. ${formatSession(r)}`).join("\n");
  const eqLine = !isGallery(first) ? `- ${getRoomCategory(first) === "studio" ? "촬영장비" : "기자재"}: ${formatEquipmentForEmail(first)}` : "";
  const sessionsBlock = `[${isGallery(first) ? "전시일(일 단위)" : "이용일시"}]\n${sessions}`;

  const template = await getTemplate(catId, "접수");
  const vars: Record<string, string> = {
    "신청번호": first.requestId,
    "공간": first.roomName,
    "카테고리": cat,
    "일시": `${list.length}${isGallery(first) ? "일" : "회"}\n\n${sessionsBlock}`,
    "신청자": first.applicantName,
    "상태": "접수",
    "장비정보": eqLine,
    "요금정보": "",
    "반려사유": "",
    "조회링크": "",
  };
  const rendered = renderTemplate(template, vars);
  await maybeSend({ to: first.email, subject: rendered.subject, text: rendered.body });
}

export type DecisionEmailContent = { to: string; subject: string; body: string; paymentGuideIncluded: boolean };

/** 단일 건 결정 메일 내용을 생성합니다 (발송하지 않음) */
export async function generateDecisionEmailContent(req: RentalRequest): Promise<DecisionEmailContent | null> {
  if (!req.email) return null;
  const cat = spaceCategoryLabel(req);
  const catId = getRoomCategory(req) as TemplateCategory;
  const status = req.status as TemplateStatus;
  const resultUrl = applicantResultUrl(req);

  const fee = computeFeesForRequest(req);
  const feeBlock =
`[이용 요금]
- ${isGallery(req) ? "이용료" : "대관료"}: ${formatKRW(fee.rentalFeeKRW)}
- 장비사용료: ${formatKRW(fee.equipmentFeeKRW)}
- 총 금액: ${formatKRW(fee.totalFeeKRW)}
- 할인: ${fee.discountAmountKRW > 0 ? `${fee.discountRatePct.toFixed(2)}% (${formatKRW(fee.discountAmountKRW)})` : "-"}
- 할인 사유: ${fee.discountReason || "-"}
- 최종금액: ${formatKRW(fee.finalFeeKRW)}`;

  // 커스텀 템플릿 사용
  if (["접수", "승인", "반려", "취소"].includes(status)) {
    const eqLine = !isGallery(req) ? `- ${getRoomCategory(req) === "studio" ? "촬영장비" : "기자재"}: ${formatEquipmentForEmail(req)}` : "";
    const template = await getTemplate(catId, status);
    const noticeBlock = req.status === "승인" ? buildPaymentNoticeBlock([req]) : "";
    const merged = mergePaymentNotice(template.body, req.status === "승인" ? feeBlock : "", noticeBlock);
    const vars: Record<string, string> = {
      "신청번호": req.requestId,
      "공간": req.roomName,
      "카테고리": cat,
      "일시": formatWhenSingle(req),
      "신청자": req.applicantName,
      "상태": req.status,
      "요금정보": merged.요금정보,
      "결제안내": merged.결제안내,
      "반려사유": req.rejectReason || "(사유 미입력)",
      "조회링크": resultUrl,
      "장비정보": eqLine,
      "취소사유": req.status === "취소" ? (req.rejectReason || "") : "",
    };
    const rendered = renderTemplate(template, vars);
    return { to: req.email, subject: rendered.subject, body: rendered.body, paymentGuideIncluded: !!noticeBlock };
  }

  // Fallback (접수 등)
  const subject = `[${req.status}] ${cat} ${isGallery(req) ? "전시" : "대관"} 신청 결과 (${req.requestId})`;
  const body =
`안녕하세요. 서초여성가족플라자 서초센터입니다.

- 신청번호: ${req.requestId}
- 공간(${cat}): ${req.roomName}
- ${isGallery(req) ? "전시기간" : "일시"}: ${formatWhenSingle(req)}
- 처리상태: ${req.status}

승인/반려 결과는 아래 페이지에서도 확인할 수 있습니다.
${resultUrl}

감사합니다.
`;

  return { to: req.email, subject, body, paymentGuideIncluded: false };
}

export async function sendApplicantDecisionEmail(req: RentalRequest) {
  const content = await generateDecisionEmailContent(req);
  if (!content) return;
  await maybeSend({ to: content.to, subject: content.subject, text: content.body });
}

/** 묶음 건 결정 메일 내용을 생성합니다 (발송하지 않음) */
export function generateBatchDecisionEmailContent(reqs: RentalRequest[]): DecisionEmailContent | null {
  const list = (Array.isArray(reqs) ? reqs : []).slice().sort((a, b) => (a.batchSeq ?? 0) - (b.batchSeq ?? 0));
  if (list.length === 0) return null;
  const first = list[0];
  if (!first.email) return null;
  const cat = spaceCategoryLabel(first);

  const approvedList = list.filter((r) => r.status === "승인");
  const rejectedList = list.filter((r) => r.status === "반려");
  const pendingCount = list.length - approvedList.length - rejectedList.length;

  let displayStatus = "접수";
  if (approvedList.length === list.length) displayStatus = "승인";
  else if (rejectedList.length === list.length) displayStatus = "반려";
  else if (pendingCount > 0) displayStatus = "접수";
  else displayStatus = "부분처리";

  const subject = `[${displayStatus}] ${cat} ${isGallery(first) ? "전시" : "대관"} 신청 결과 (${first.requestId})`;

  const resultUrl = applicantResultUrl(first);

  const sessions = list
    .map((r, i) => {
      const reason = r.status === "반려" ? ` / 사유: ${r.rejectReason || "(미입력)"}` : "";
      return `  ${i + 1}. ${formatSession(r)} [${r.status}]${reason}`;
    })
    .join("\n");

  const feeAvailable = approvedList.length > 0;
  const feeBasis = feeAvailable ? approvedList : list;
  const bundleFee = feeAvailable ? computeFeesForBundle(feeBasis) : null;
  const feeTitleNote = feeAvailable && approvedList.length < list.length ? ` (승인 ${approvedList.length}회 기준)` : "";
  const eqText = !isGallery(first) ? `- ${getRoomCategory(first) === "studio" ? "촬영장비" : "기자재"}: ${formatEquipmentForEmail(first)}\n` : "";
  const feeBlock = bundleFee
    ?
`[이용 요금${feeTitleNote}]
- ${isGallery(first) ? "이용료" : "대관료"} 합계: ${formatKRW(bundleFee.rentalFeeKRW)}
- 장비사용료 합계: ${formatKRW(bundleFee.equipmentFeeKRW)}
- 총 금액: ${formatKRW(bundleFee.totalFeeKRW)}
- 할인: ${bundleFee.discountAmountKRW > 0 ? `${bundleFee.discountRatePct.toFixed(2)}% (${formatKRW(bundleFee.discountAmountKRW)})` : "-"}
- 할인 사유: ${bundleFee.discountReason || "-"}
- 최종금액: ${formatKRW(bundleFee.finalFeeKRW)}
`
    : "";

  const header =
`안녕하세요. 서초여성가족플라자 서초센터입니다.

- 대표 신청번호: ${first.requestId}
- 공간(${cat}): ${first.roomName}
- ${isGallery(first) ? "전시일 수" : "회차 수"}: ${list.length}${isGallery(first) ? "일" : "회"}
${eqText}- 처리상태: ${displayStatus}

[${isGallery(first) ? "전시일(일 단위)" : "이용일시"}]
${sessions}
`;

  const tail = rejectedList.length > 0
    ? `\n반려된 회차가 있습니다. (사유는 위 회차별 현황에 함께 표기했습니다.)\n`
    : "\n";

  // 결제 안내 블록 (승인 ≥1 · 링크 있음) — 요금 블록 바로 뒤
  const noticeBlock = feeAvailable ? buildPaymentNoticeBlock(list) : "";

  const body =
    header +
    "\n" +
    (feeAvailable ? feeBlock + "\n" : "") +
    (noticeBlock ? noticeBlock + "\n\n" : "") +
    tail +
`결과는 아래 페이지에서도 확인할 수 있습니다.
${resultUrl}

감사합니다.
`;

  return { to: first.email, subject, body, paymentGuideIncluded: !!noticeBlock };
}

/* ───────────────── 결제 기한 자동 취소 · 리마인드 메일 (2026-10-26) ───────────────── */

/**
 * 결제 기한 경과 자동 취소 메일 — 묶음 1통(대표 이메일)
 * - 기존 "취소" 템플릿 + {{취소사유}} 변수(없으면 "처리상태" 줄 뒤 블록 삽입) · 갤러리 문구 변환
 * - 묶음은 {{일시}}에 취소된(승인됐던) 회차 목록
 */
export async function sendApplicantAutoCancelEmail(cancelledSessions: RentalRequest[], dueDate: string) {
  const content = await generateAutoCancelEmailContent(cancelledSessions, dueDate);
  if (!content) return;
  await maybeSend({ to: content.to, subject: content.subject, text: content.body });
}

/** 자동 취소 메일 내용 생성 (발송하지 않음 · 테스트용 분리) */
export async function generateAutoCancelEmailContent(
  cancelledSessions: RentalRequest[],
  dueDate: string
): Promise<{ to: string; subject: string; body: string } | null> {
  const list = (Array.isArray(cancelledSessions) ? cancelledSessions : []).slice().sort((a, b) => (a.batchSeq ?? 0) - (b.batchSeq ?? 0));
  if (!list.length) return null;
  const first = list[0];
  if (!first.email) return null;
  const cat = spaceCategoryLabel(first);
  const catId = getRoomCategory(first) as TemplateCategory;
  const resultUrl = applicantResultUrl(first);
  const block = buildAutoCancelBlock(dueDate);

  const when =
    list.length === 1
      ? formatWhenSingle(first)
      : `${list.length}${isGallery(first) ? "일" : "회"}\n\n[${isGallery(first) ? "전시일(일 단위)" : "이용일시"}]\n${list.map((r, i) => `  ${i + 1}. ${formatSession(r)}`).join("\n")}`;

  const template = await getTemplate(catId, "취소");
  const hasVar = template.body.includes("{{취소사유}}");
  const vars: Record<string, string> = {
    "신청번호": first.requestId,
    "공간": first.roomName,
    "카테고리": cat,
    "일시": when,
    "신청자": first.applicantName,
    "상태": "취소",
    "요금정보": "",
    "결제안내": "",
    "반려사유": "",
    "조회링크": resultUrl,
    "장비정보": "",
    "취소사유": hasVar ? block : "",
  };
  const rendered = renderTemplate(template, vars);
  const body = hasVar ? rendered.body : insertAfterStatusLine(rendered.body, block);
  return { to: first.email, subject: rendered.subject, body };
}

/** D-1 결제 기한 리마인드 — 묶음 1통 · 갤러리 문구 변환 */
export async function sendApplicantPaymentReminderEmail(approvedSessions: RentalRequest[], dueDate: string) {
  const content = generateReminderEmailContent(approvedSessions, dueDate);
  if (!content) return;
  await maybeSend({ to: content.to, subject: content.subject, text: content.body });
}

/** 리마인드 메일 내용 생성 (발송하지 않음 · 테스트용 분리) */
export function generateReminderEmailContent(approvedSessions: RentalRequest[], dueDate: string): { to: string; subject: string; body: string } | null {
  const list = (Array.isArray(approvedSessions) ? approvedSessions : []).slice().sort((a, b) => (a.batchSeq ?? 0) - (b.batchSeq ?? 0));
  if (!list.length) return null;
  const first = list[0];
  if (!first.email) return null;
  const rep = paymentRep(list);
  const link = rep?.paymentLinkUrl ?? "";
  const when =
    list.length === 1
      ? formatWhenSingle(first)
      : `${list.length}${isGallery(first) ? "일" : "회"} (${list.map((r) => formatSession(r)).join(", ")})`;

  const subject = `[결제 안내] 내일(${dueDate})까지 결제해 주세요 (${first.requestId})`;
  const text =
`안녕하세요. 서초여성가족플라자 서초센터입니다.

아래 신청의 결제 기한이 내일(${dueDate})까지입니다.
- 신청번호: ${first.requestId}
- 공간: ${first.roomName}
- 일시: ${when}
- 결제 링크: ${link}

결제 기한까지 결제가 확인되지 않으면 신청이 자동 취소됩니다.
이미 결제하셨다면 이 메일은 무시하셔도 됩니다.

감사합니다.
`;
  const body = isGallery(first) ? applyGalleryWording(text) : text;
  return { to: first.email, subject, body };
}

/** 크론 실행 결과 관리자 요약 메일 — 신청번호·공간·기한만(개인정보 없음) */
export async function sendAdminPaymentDeadlineSummaryEmail(result: {
  today: string;
  candidates: number;
  cancelled: Array<{ key: string; requestIds: string[]; roomName: string; paymentDueDate: string; approvedCount: number; mailOk: boolean | null }>;
  skippedOverCap: number;
  skippedStale?: number;
  reminders: { enabled: boolean; sent: number; failed: number };
  errors: Array<{ key: string; stage: string; message: string }>;
}) {
  const stale = result.skippedStale ?? 0;
  const smtp = getSmtpEnvOptional();
  const to = smtp?.ADMIN_NOTIFY_EMAIL ?? "admin@example.com";
  const base = getBaseEnv();
  const subject = `[결제 기한 자동 취소] ${result.today} · 취소 ${result.cancelled.length}건${result.skippedOverCap ? ` · 미처리 ${result.skippedOverCap}건` : ""}${result.errors.length ? ` · 오류 ${result.errors.length}건` : ""}`;
  const lines = result.cancelled.map(
    (c) => `  - ${c.requestIds[0]}${c.requestIds.length > 1 ? ` 외 ${c.requestIds.length - 1}건` : ""} · ${c.roomName} · 기한 ${c.paymentDueDate} · 메일 ${c.mailOk ? "발송" : "실패"}`
  );
  const text =
`결제 기한 경과 자동 취소 실행 결과입니다. (${result.today})

- 대상 ${result.candidates}건 · 취소 ${result.cancelled.length}건 · 상한 초과로 다음 실행에 넘긴 건 ${result.skippedOverCap}건
${stale ? `- 묶음 안 회차끼리 결제 기한·기록이 달라 건너뛴 묶음 ${stale}건 — 상세 화면에서 기한을 다시 저장해 주세요
` : ""}- 리마인드: ${result.reminders.enabled ? `발송 ${result.reminders.sent} · 실패 ${result.reminders.failed}` : "꺼짐"}

[취소된 신청 — 복지종합시스템·홈페이지 강좌는 자동으로 닫히지 않습니다. 마감·미게시로 바꾼 뒤 상세 4단계를 눌러 주세요]
${lines.length ? lines.join("\n") : "  (없음)"}
${result.errors.length ? `\n[오류]\n${result.errors.map((e) => `  - ${e.key} · ${e.stage} · ${e.message}`).join("\n")}\n` : ""}
관리자: ${base.APP_BASE_URL}/admin
`;
  await maybeSend({ to, subject, text });
}

export async function sendApplicantDecisionEmailBatch(reqs: RentalRequest[]) {
  const content = generateBatchDecisionEmailContent(reqs);
  if (!content) return;
  await maybeSend({ to: content.to, subject: content.subject, text: content.body });
}

/** 관리자가 수정한 내용으로 메일을 발송합니다 */
export async function sendCustomDecisionEmail(to: string, subject: string, body: string) {
  await maybeSend({ to, subject, text: body });
}

/**
 * 시트 백업 실패 관리자 알림 (audit-fix-3 3-1) — 오류 코드·시각만(셀 값·개인정보 없음)
 */
export async function sendAdminBackupFailEmail(args: { at: string; code: string; lastSuccessAt: string | null }) {
  const smtp = getSmtpEnvOptional();
  const to = smtp?.ADMIN_NOTIFY_EMAIL ?? "admin@example.com";
  const base = getBaseEnv();
  const subject = `[대관 앱] 시트 백업 실패 · ${args.at}`;
  const text =
`매일 새벽 시트 백업이 실패했습니다.

- 시각: ${args.at}
- 원인 코드: ${args.code}
- 마지막 성공: ${args.lastSuccessAt ?? "없음"}

관리자 화면 > 설정 맨 위에서 [지금 백업]을 눌러 다시 시도해 주세요.
계속 실패하면 Google 드라이브 연결(첨부 업로드와 같은 설정)을 확인해야 합니다.

관리자: ${base.APP_BASE_URL}/admin/settings
`;
  await maybeSend({ to, subject, text });
}
