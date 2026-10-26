/**
 * 복지종합시스템PLUS(프로그램관리)·홈페이지(등록대기강좌) 등록용 복사 텍스트 (2026-10-26)
 *
 * 줄 순서 = 복지종합시스템 화면 순서 → 홈페이지 폼 순서 (01_spec ③-(가)-1 원문).
 * 사람이 읽고 한 줄씩 붙여넣는 용도라 JSON이 아니다. fields는 2단계(크롬 확장·북마클릿)용.
 *
 * 공휴일 제외는 isHolidayCached(동기)를 쓰므로, 호출 전에 해당 월을 ensureHolidaysLoaded로 읽어 둔다.
 */

import type { RentalRequest } from "@/lib/types";
import { dayOfWeek, toMinutes } from "@/lib/datetime";
import { isHolidayCached } from "@/lib/holidays";
import { approvedFee, latestApprovedDate, addDaysYmd, PAYMENT_DUE_DEFAULT_DAYS } from "@/lib/payment";

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;
/** 요일 표기 순서 월→일 */
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

/** 이름 가운데 글자 마스킹: 김* · 이*영 · 남**수 (홈페이지 강좌명 관행). 단체명에는 쓰지 않는다 */
export function maskNameMiddle(name: string): string {
  const s = String(name ?? "").trim();
  if (s.length <= 1) return s;
  if (s.length === 2) return `${s[0]}*`;
  return `${s[0]}${"*".repeat(s.length - 2)}${s[s.length - 1]}`;
}

/** "2026-10-29" → "26.10.29.(목)" (0 채우기 없음 · 요일 한 글자) */
export function formatShortDateKo(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd || "";
  const [y, m, d] = ymd.split("-");
  return `${y.slice(2)}.${parseInt(m, 10)}.${parseInt(d, 10)}.(${WEEKDAY_KO[dayOfWeek(ymd)]})`;
}

/** 시작~종료 표기 (같으면 한 번만) */
export function formatShortRangeKo(from: string, to: string): string {
  if (!to || from === to) return formatShortDateKo(from);
  return `${formatShortDateKo(from)}~${formatShortDateKo(to)}`;
}

/** 단체 신청 여부: orgName이 있고 "개인"·"-"가 아님 */
export function isOrgApplicant(orgName: string | undefined): boolean {
  const s = String(orgName ?? "").trim();
  return !!s && s !== "개인" && s !== "-";
}

/** 프로그램명 괄호 안 이름: 단체면 단체명 그대로, 개인이면 가운데 마스킹 */
export function displayNameFor(r: Pick<RentalRequest, "orgName" | "applicantName">): string {
  return isOrgApplicant(r.orgName) ? String(r.orgName).trim() : maskNameMiddle(r.applicantName);
}

/** 요일 집합(월→일 순) — 날짜 배열에서 */
export function weekdaysOf(dates: string[]): string[] {
  const set = new Set<number>(dates.map((d) => dayOfWeek(d)));
  return WEEKDAY_ORDER.filter((n) => set.has(n)).map((n) => WEEKDAY_KO[n]);
}

/** 갤러리 전시일 목록: startDate~endDate에서 일요일·공휴일·준비일 제외 */
export function galleryExhibitionDates(startDate: string, endDate: string, prepDate?: string): string[] {
  const out: string[] = [];
  let cur = startDate;
  let safety = 0;
  while (cur <= endDate && safety++ < 400) {
    if (dayOfWeek(cur) !== 0 && !isHolidayCached(cur) && cur !== prepDate) out.push(cur);
    cur = addDaysYmd(cur, 1);
  }
  return out;
}

/** 천 단위 쉼표(원 단위 표기 없음 — 입력 칸이 숫자) */
export function formatAmount(n: number): string {
  return Math.max(0, Math.round(n)).toLocaleString("ko-KR");
}

export type WelfareCopyFields = {
  welfare: {
    programName: string;
    year: string;
    category: string;
    categoryCode: string;
    weekdays: string[];
    startTime: string;
    endTime: string;
    timeNote: string;
    paid: boolean;
    pgType: string;
    periodMonths: number;
    periodDays: number;
    amountKRW: number;
    capacity: number;
    closeWhenFull: boolean;
    receiptFrom: string;
    receiptTo: string;
    startDate: string;
    content: string;
  };
  homepage: {
    category1: string;
    category2: string;
    term: number;
    webPost: string;
    closed: string;
    semester: string;
    courseFrom: string;
    courseTo: string;
    receiptFrom: string;
    receiptTo: string;
    receiptTime: string;
    target: string;
  };
  basis: "approved" | "all";
  approvedCount: number;
  totalCount: number;
  requestId: string;
  batchId: string;
  generatedAt: string;
};

export type WelfareCopy = { text: string; fields: WelfareCopyFields };

/** 복지종합시스템 프로그램명 — 메일 결제 안내 블록에서도 재사용 */
export function buildProgramName(sessions: RentalRequest[]): string {
  const list = sessions.filter(Boolean);
  if (!list.length) return "";
  const first = list[0];
  const isGallery = first.roomId === "gallery";
  const { from, to } = usageRange(list);
  const prefix = isGallery ? "[전시]" : "[대관]";
  const room = String(first.roomName || first.roomId).replace(/\s+/g, "");
  return `${prefix}${formatShortRangeKo(from, to)} ${room}(${displayNameFor(first)})`;
}

/** 이용 시작·종료일 — 갤러리 1행형은 startDate/endDate, 그 외 회차 날짜(준비일 제외) */
function usageRange(list: RentalRequest[]): { from: string; to: string } {
  const first = list[0];
  if (first.roomId === "gallery" && !first.batchId && first.startDate && first.endDate) {
    return { from: first.startDate, to: first.endDate };
  }
  const dates = list.filter((r) => !r.isPrepDay).map((r) => r.date).filter(Boolean).sort();
  const all = dates.length ? dates : list.map((r) => r.date).filter(Boolean).sort();
  return { from: all[0] ?? "", to: all[all.length - 1] ?? "" };
}

/**
 * 복사 텍스트·필드 생성
 * @param sessions 묶음(또는 단건) 회차 전체
 * @param opts.todayYmd 승인 0건일 때 접수 시작일 · 복사 시각 표기
 */
export function buildWelfareCopy(
  sessions: RentalRequest[],
  opts: { todayYmd: string; nowIso?: string; copiedAtText?: string }
): WelfareCopy {
  const list = sessions.filter(Boolean);
  if (!list.length) throw new Error("회차가 없습니다.");
  const first = list[0];
  const isGallery = first.roomId === "gallery";

  const { feeKRW, basis, approved } = approvedFee(list);
  const basisList = approved.length ? approved : list;
  const { from: usageFrom, to: usageTo } = usageRange(basisList);

  // 요일·시간·기간
  let weekdays: string[];
  let startTime = "09:00";
  let endTime = "18:00";
  let timeNote = "";
  let periodDays: number;
  if (isGallery) {
    if (!first.batchId && first.startDate && first.endDate) {
      const dates = galleryExhibitionDates(first.startDate, first.endDate, first.galleryPrepDate);
      weekdays = weekdaysOf(dates);
      periodDays = first.galleryExhibitionDayCount || dates.length;
    } else {
      // 레거시 다행형: 준비일 제외 회차 날짜
      const dates = basisList.filter((r) => !r.isPrepDay).map((r) => r.date);
      weekdays = weekdaysOf(dates);
      periodDays = dates.length;
    }
  } else {
    const dates = basisList.map((r) => r.date);
    weekdays = weekdaysOf(dates);
    periodDays = basisList.length;
    const starts = basisList.map((r) => r.startTime).filter(Boolean);
    const ends = basisList.map((r) => r.endTime).filter(Boolean);
    if (starts.length && ends.length) {
      startTime = starts.slice().sort((a, b) => toMinutes(a) - toMinutes(b))[0];
      endTime = ends.slice().sort((a, b) => toMinutes(b) - toMinutes(a))[0];
      const distinct = new Set(basisList.map((r) => `${r.startTime}~${r.endTime}`));
      if (distinct.size > 1) {
        const parts = basisList
          .slice()
          .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))
          .map((r) => `${formatShortDateKo(r.date)} ${r.startTime}~${r.endTime}`);
        timeNote = `※ 회차별 시간 상이: ${parts.join(" · ")}`;
      }
    }
  }

  // 접수기간: 시작 = 승인일(가장 늦은 decidedAt) · 종료 = paymentDueDate ?? 승인일+7
  const approvedDate = latestApprovedDate(list);
  const receiptFrom = approvedDate || opts.todayYmd;
  const storedDue = list.find((r) => r.paymentDueDate)?.paymentDueDate ?? "";
  const receiptTo = storedDue || addDaysYmd(receiptFrom, PAYMENT_DUE_DEFAULT_DAYS);

  const programName = buildProgramName(basisList);
  const year = (usageFrom || opts.todayYmd).slice(0, 4);
  const paid = feeKRW > 0;

  const fields: WelfareCopyFields = {
    welfare: {
      programName,
      year,
      category: "문화나눔",
      categoryCode: "04-07",
      weekdays,
      startTime,
      endTime,
      timeNote,
      paid,
      pgType: "단기",
      periodMonths: 0,
      periodDays,
      amountKRW: feeKRW,
      capacity: 1,
      closeWhenFull: true,
      receiptFrom,
      receiptTo,
      startDate: usageFrom,
      content: programName,
    },
    homepage: {
      category1: "26.기타",
      category2: "1.기타",
      term: 1,
      webPost: "게시",
      closed: "진행",
      semester: "3개월 접수",
      courseFrom: usageFrom,
      courseTo: usageTo,
      receiptFrom,
      receiptTo,
      receiptTime: "09:00",
      target: "제한없음",
    },
    basis,
    approvedCount: approved.length,
    totalCount: list.length,
    requestId: first.requestId,
    batchId: (first.batchId ?? "").trim(),
    generatedAt: opts.nowIso ?? new Date().toISOString(),
  };

  const lines: string[] = [];
  if (basis === "all") {
    lines.push(`※ 승인 전 복사: 전체 ${list.length}회 기준 금액입니다. 승인 후 다시 복사하세요.`);
  }
  lines.push("■ 복지종합시스템PLUS > 유료이용자 > 프로그램관리");
  lines.push(`프로그램명: ${programName}`);
  lines.push("식권발행여부: 미체크");
  lines.push(`년도: ${year}`);
  lines.push("프로그램분류: 문화나눔 (04-07)");
  lines.push("사회복지통합관리표준코드: (공란)");
  lines.push(`요일: ${weekdays.join(", ")}`);
  lines.push(`시간: ${startTime} ~ ${endTime}`);
  if (timeNote) lines.push(timeNote);
  lines.push(`유/무료구분: ${paid ? "유료" : "무료"}`);
  lines.push("P/G구분: 단기");
  lines.push(`기간: 0개월 ${periodDays}일`);
  lines.push(`금액: ${formatAmount(feeKRW)}`);
  lines.push("인원: 목표(년) 1명 / 마감(월) 1명 · 마감시 접수 불가능");
  lines.push(`접수기간: ${receiptFrom} ~ ${receiptTo}`);
  lines.push(`개강일자: ${usageFrom}`);
  lines.push("입장권판매: 아님");
  lines.push(`내용: ${programName}`);
  lines.push("비고 / 교육장소: (공란)");
  lines.push("");
  lines.push("■ 홈페이지 관리자 > 등록대기강좌 > 등록하기");
  lines.push("카테고리: 26.기타 / 1.기타");
  lines.push("기수: 1");
  lines.push("웹게시: 게시");
  lines.push("마감여부: 진행");
  lines.push("학기구분: 3개월 접수");
  lines.push(`강의기간: ${usageFrom} ~ ${usageTo}`);
  lines.push(`접수기간: ${receiptFrom} ~ ${receiptTo}`);
  lines.push("접수시간: 09:00");
  lines.push("대상: 제한없음");
  lines.push("장소 / 강사: (공란)");
  lines.push("");
  const basisText = basis === "approved" ? "승인 회차 기준 금액" : `전체 ${list.length}회 기준 금액`;
  const copiedAt = opts.copiedAtText ?? kstMinuteText(fields.generatedAt);
  lines.push(`※ 대관 앱 신청번호 ${first.requestId} · ${basisText} · 복사 ${copiedAt}`);

  return { text: lines.join("\n"), fields };
}

/** ISO → "2026-10-26 14:02" (KST) */
function kstMinuteText(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const k = new Date(t + 9 * 60 * 60 * 1000).toISOString();
  return `${k.slice(0, 10)} ${k.slice(11, 16)}`;
}
