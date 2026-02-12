import nodemailer from "nodemailer";
import { getBaseEnv, getSmtpEnvOptional, isMockMode } from "@/lib/env";
import type { RentalRequest } from "@/lib/types";
import { computeFeesForBundle, computeFeesForRequest, formatKRW, getSelectedEquipmentDetails } from "@/lib/pricing";
import { ROOMS_BY_ID } from "@/lib/space";
import { getTemplate, renderTemplate, type TemplateCategory, type TemplateStatus } from "@/lib/emailTemplates";

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

function maskPhone(phone: string) {
  if (phone.length < 7) return phone;
  return phone.slice(0, 3) + "****" + phone.slice(-2);
}

async function maybeSend(mail: { to: string; subject: string; text: string }) {
  const base = getBaseEnv();
  if (isMockMode()) {
    console.log("\n[MOCK EMAIL]", { ...mail, preview: mail.text.slice(0, 160) + "..." });
    return;
  }
  const tr = transporter();
  if (!tr) {
    // SMTP 미설정 상태에서는 메일 발송을 생략하되, 흐름이 깨지지 않도록 함
    console.warn("[MAIL] SMTP 미설정으로 발송 생략", { to: mail.to, subject: mail.subject, appBaseUrl: base.APP_BASE_URL });
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
    ? `[대관신청] ${req.roomName} / ${formatWhenSingle(req)} / ${req.applicantName}`
    : `[대관신청] ${req.roomName} / ${req.date} ${req.startTime}-${req.endTime} / ${req.applicantName}`;
  const text =
`새 대관 신청이 등록되었습니다.

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
    ? `[대관신청] ${first.roomName} / 전시 ${list.length}일 / ${first.applicantName}`
    : `[대관신청] ${first.roomName} / ${list.length}회차 / ${first.applicantName}`;
  const sessions = list.map((r, i) => `  ${i + 1}. ${formatSession(r)}`).join("\n");

  const eqLabel = isGallery(first) ? "장비" : getRoomCategory(first) === "studio" ? "촬영장비(회차별 동일)" : "기자재(회차별 동일)";

  const text =
`새 대관 신청(묶음)이 등록되었습니다.

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
  const subject = `[신청완료] ${cat} 대관 신청 (${req.requestId})`;
  const eqText = !isGallery(req) ? `\n- ${getRoomCategory(req) === "studio" ? "촬영장비" : "기자재"}: ${formatEquipmentForEmail(req)}` : "";
  const text =
`안녕하세요. 서초여성가족플라자 서초센터입니다.

${cat} 대관 신청이 정상적으로 완료되었습니다.
담당자 검토 후 승인/반려 결과를 이메일로 안내드리겠습니다.

- 신청번호: ${req.requestId}
- 공간(${cat}): ${req.roomName}
- ${isGallery(req) ? "전시기간" : "일시"}: ${formatWhenSingle(req)}${eqText}

감사합니다.
`;
  await maybeSend({ to: req.email, subject, text });
}

export async function sendApplicantReceivedEmailBatch(reqs: RentalRequest[]) {
  const list = (Array.isArray(reqs) ? reqs : []).slice().sort((a, b) => (a.batchSeq ?? 0) - (b.batchSeq ?? 0));
  if (list.length === 0) return;
  const first = list[0];
  const cat = spaceCategoryLabel(first);
  const subject = `[신청완료] ${cat} 대관 신청 (${first.requestId})`;
  const sessions = list.map((r, i) => `  ${i + 1}. ${formatSession(r)}`).join("\n");
  const eqText = !isGallery(first) ? `\n- ${getRoomCategory(first) === "studio" ? "촬영장비" : "기자재"}: ${formatEquipmentForEmail(first)}` : "";
  const text =
`안녕하세요. 서초여성가족플라자 서초센터입니다.

${cat} 대관 신청이 정상적으로 완료되었습니다.
담당자 검토 후 승인/반려 결과를 이메일로 안내드리겠습니다.

- 대표 신청번호: ${first.requestId}
- 공간(${cat}): ${first.roomName}
- ${isGallery(first) ? "전시일 수" : "회차 수"}: ${list.length}${isGallery(first) ? "일" : "회"}${eqText}

[${isGallery(first) ? "전시일(일 단위)" : "이용일시"}]
${sessions}

감사합니다.
`;
  await maybeSend({ to: first.email, subject, text });
}

/** 단일 건 결정 메일 내용을 생성합니다 (발송하지 않음) */
export async function generateDecisionEmailContent(req: RentalRequest): Promise<{ to: string; subject: string; body: string } | null> {
  if (!req.email) return null;
  const cat = spaceCategoryLabel(req);
  const catId = getRoomCategory(req) as TemplateCategory;
  const status = req.status as TemplateStatus;
  const base = getBaseEnv();
  const resultUrl = `${base.APP_BASE_URL}/result?requestId=${encodeURIComponent(req.requestId)}`;

  const fee = computeFeesForRequest(req);
  const feeBlock =
`[이용 요금]
- 대관료: ${formatKRW(fee.rentalFeeKRW)}
- 장비사용료: ${formatKRW(fee.equipmentFeeKRW)}
- 총 금액: ${formatKRW(fee.totalFeeKRW)}
- 할인: ${fee.discountAmountKRW > 0 ? `${fee.discountRatePct.toFixed(2)}% (${formatKRW(fee.discountAmountKRW)})` : "-"}
- 할인 사유: ${fee.discountReason || "-"}
- 최종금액: ${formatKRW(fee.finalFeeKRW)}`;

  // 커스텀 템플릿 사용
  if (["승인", "반려", "취소"].includes(status)) {
    const template = await getTemplate(catId, status);
    const vars: Record<string, string> = {
      "신청번호": req.requestId,
      "공간": req.roomName,
      "카테고리": cat,
      "일시": formatWhenSingle(req),
      "신청자": req.applicantName,
      "상태": req.status,
      "요금정보": req.status === "승인" ? feeBlock : "",
      "반려사유": req.rejectReason || "(사유 미입력)",
      "조회링크": resultUrl,
    };
    const rendered = renderTemplate(template, vars);
    return { to: req.email, subject: rendered.subject, body: rendered.body };
  }

  // Fallback (접수 등)
  const subject = `[${req.status}] ${cat} 대관 신청 결과 (${req.requestId})`;
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

  return { to: req.email, subject, body };
}

export async function sendApplicantDecisionEmail(req: RentalRequest) {
  const content = await generateDecisionEmailContent(req);
  if (!content) return;
  await maybeSend({ to: content.to, subject: content.subject, text: content.body });
}

/** 묶음 건 결정 메일 내용을 생성합니다 (발송하지 않음) */
export function generateBatchDecisionEmailContent(reqs: RentalRequest[]): { to: string; subject: string; body: string } | null {
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

  const subject = `[${displayStatus}] ${cat} 대관 신청 결과 (${first.requestId})`;

  const base = getBaseEnv();
  const resultUrl = `${base.APP_BASE_URL}/result?requestId=${encodeURIComponent(first.requestId)}`;

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
- 대관료 합계: ${formatKRW(bundleFee.rentalFeeKRW)}
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

  const body =
    header +
    "\n" +
    (feeAvailable ? feeBlock + "\n" : "") +
    tail +
`결과는 아래 페이지에서도 확인할 수 있습니다.
${resultUrl}

감사합니다.
`;

  return { to: first.email, subject, body };
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
