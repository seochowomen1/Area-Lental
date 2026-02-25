"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { GalleryRequestInputSchema, type GalleryRequestInput } from "@/lib/schema";
import { todayYmdSeoul } from "@/lib/datetime";
import SiteHeader from "@/components/SiteHeader";
import PledgeModal from "@/components/PledgeModal";
import PrivacyModal from "@/components/PrivacyModal";
import OperatingHoursNotice from "@/components/OperatingHoursNotice";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Notice from "@/components/ui/Notice";
import Checkbox from "@/components/ui/Checkbox";
import { FieldHelp, FieldLabel, Input, Select, Textarea } from "@/components/ui/Field";
import { SECTION_DESC, SECTION_TITLE } from "@/components/ui/presets";

// 갤러리 신청(B안): 기간(start/end) 선택 → 회차 자동 생성
// - 일요일 자동 제외
// - 준비(세팅)일 1일 무료: 시작일 이전 1일(일요일이면 직전 영업일)
// - 공휴일 자동 제외 X (Blocks로 처리)

function formatPhoneKR(input: string) {
  const digits = input.replace(/\D/g, "").slice(0, 11);
  if (!digits) return "";

  // 02 지역번호(서울)
  if (digits.startsWith("02")) {
    const rest = digits.slice(2);
    if (rest.length <= 3) return `02-${rest}`;
    if (rest.length <= 7) return `02-${rest.slice(0, 3)}-${rest.slice(3)}`;
    return `02-${rest.slice(0, 4)}-${rest.slice(4, 8)}`;
  }

  // 휴대폰/기타(보통 3-3/4-4)
  const a = digits.slice(0, 3);
  const b = digits.slice(3);
  if (b.length <= 4) return `${a}-${b}`;
  if (b.length <= 7) return `${a}-${b.slice(0, 3)}-${b.slice(3)}`;
  return `${a}-${b.slice(0, 4)}-${b.slice(4, 8)}`;
}

const ymdRegex = /^\d{4}-\d{2}-\d{2}$/;

function isYmd(s: string) {
  return ymdRegex.test(s);
}

function toDateLocal(ymd: string) {
  // YYYY-MM-DD는 브라우저에서 로컬 타임존 기준으로 처리(사용자=Seoul)
  return new Date(`${ymd}T00:00:00`);
}

function addDays(ymd: string, days: number) {
  const d = toDateLocal(ymd);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function dayOfWeekLocal(ymd: string) {
  return toDateLocal(ymd).getDay();
}

// NOTE:
// GalleryRequestInputSchema는 superRefine를 포함하므로(ZodEffects), .extend()가 불가능합니다.
// 따라서 gallery 신청 폼은 base schema를 그대로 사용하고, 추가 검증(최대 30일)만 superRefine로 보강합니다.
type GalleryApplyValues = GalleryRequestInput;

function diffDaysInclusive(startYmd: string, endYmd: string) {
  const s = toDateLocal(startYmd).getTime();
  const e = toDateLocal(endYmd).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e)) return 0;
  const days = Math.floor((e - s) / (24 * 60 * 60 * 1000)) + 1;
  return days;
}

const GalleryApplySchema = GalleryRequestInputSchema.superRefine((v, ctx) => {
  // 기간 최대 30일(포함)
  if (isYmd(v.startDate) && isYmd(v.endDate) && v.endDate >= v.startDate) {
    const days = diffDaysInclusive(v.startDate, v.endDate);
    if (days > 30) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "전시 기간은 최대 30일까지 신청할 수 있습니다." });
    }
  }
});

const DOW_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;
function dowLabel(ymd: string): string {
  return DOW_LABELS[dayOfWeekLocal(ymd)] ?? "";
}

/**
 * 전시 시작일 기준으로 준비일 후보를 반환합니다.
 * 일요일(휴관)은 제외하며, 기본 7개까지 반환합니다.
 */
function getAvailablePrepDates(startDate: string, count = 7): string[] {
  if (!isYmd(startDate)) return [];
  const today = todayYmdSeoul();
  const dates: string[] = [];
  let cur = addDays(startDate, -1);
  let safety = 0;
  while (dates.length < count && safety++ < 30) {
    // 과거 날짜는 후보에서 제외
    if (cur < today) break;
    if (dayOfWeekLocal(cur) !== 0) {
      dates.push(cur);
    }
    cur = addDays(cur, -1);
  }
  return dates;
}

/**
 * 준비일 후보에서 예약 충돌이 있는 날짜를 만나면 해당 날짜 이후(과거 방향)를 모두 제거합니다.
 * 예: 후보=[2/11, 2/10, 2/9, 2/8, 2/7, 2/6, 2/5], 2/6 충돌
 *   → 결과=[2/11, 2/10, 2/9, 2/8, 2/7] (2/6 이후 전부 잘림)
 */
function filterPrepDatesByConflict(candidates: string[], bookedDates: Set<string>): string[] {
  const result: string[] = [];
  for (const d of candidates) {
    if (bookedDates.has(d)) break;
    result.push(d);
  }
  return result;
}

type SessionInput = { date: string; startTime: string; endTime: string };

function buildGallerySessions(startDate: string, endDate: string, selectedPrepDate?: string): {
  prepDate: string | null;
  sessions: SessionInput[];
} {
  if (!isYmd(startDate) || !isYmd(endDate) || endDate < startDate) {
    return { prepDate: null, sessions: [] };
  }

  // 준비일 결정
  const prepDate = (selectedPrepDate && isYmd(selectedPrepDate)) ? selectedPrepDate : null;

  const sessions: SessionInput[] = [];
  // 전시 기간(포함)
  let cur = startDate;
  const safetyCap = 400;
  let count = 0;
  while (cur <= endDate) {
    if (count++ > safetyCap) break;
    const dow = dayOfWeekLocal(cur);
    if (dow === 0) {
      cur = addDays(cur, 1);
      continue;
    }
    if (dow === 6) sessions.push({ date: cur, startTime: "09:00", endTime: "13:00" });
    else if (dow === 2) sessions.push({ date: cur, startTime: "09:00", endTime: "20:00" });
    else sessions.push({ date: cur, startTime: "09:00", endTime: "18:00" });
    cur = addDays(cur, 1);
  }

  // 준비일 세션 추가
  if (prepDate && prepDate < startDate) {
    const dow = dayOfWeekLocal(prepDate);
    if (dow !== 0) {
      if (dow === 6) sessions.unshift({ date: prepDate, startTime: "09:00", endTime: "13:00" });
      else if (dow === 2) sessions.unshift({ date: prepDate, startTime: "09:00", endTime: "20:00" });
      else sessions.unshift({ date: prepDate, startTime: "09:00", endTime: "18:00" });
    }
  }

  // de-dup + sort
  const uniq = new Map<string, SessionInput>();
  for (const s of sessions) uniq.set(`${s.date}|${s.startTime}|${s.endTime}`, s);
  const out = Array.from(uniq.values()).sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
  return { prepDate, sessions: out };
}

function composePurpose(fields: { exhibitionPurpose?: string; genreContent?: string; awarenessPath?: string; specialNotes?: string; galleryRemovalTime?: string; galleryPrepDate?: string }) {
  // RequestInputSchema의 purpose(min 5) 충족 + 담당자 확인 편의
  const lines: string[] = [];
  if (fields.exhibitionPurpose?.trim()) lines.push(`전시 목적: ${fields.exhibitionPurpose.trim()}`);
  if (fields.genreContent?.trim()) lines.push(`장르·내용: ${fields.genreContent.trim()}`);
  if (fields.awarenessPath?.trim()) lines.push(`인지 경로: ${fields.awarenessPath.trim()}`);
  if (fields.galleryPrepDate?.trim()) lines.push(`준비일: ${fields.galleryPrepDate.trim()}`);
  if (fields.galleryRemovalTime?.trim()) lines.push(`철수 예정: 종료일 ${fields.galleryRemovalTime.trim()}`);
  if (fields.specialNotes?.trim()) lines.push(`특이사항: ${fields.specialNotes.trim()}`);
  const joined = lines.join("\n").trim();
  return joined.length >= 5 ? joined : "전시 신청";
}

export default function ApplyGalleryClient() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);

  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [pledgeOpen, setPledgeOpen] = useState(false);
  const [galleryInfoOpen, setGalleryInfoOpen] = useState(false);
  const [confirmData, setConfirmData] = useState<GalleryApplyValues | null>(null);

  // 생년월일 3칸 입력
  const [birthYear, setBirthYear] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [birthDay, setBirthDay] = useState("");
  const birthMonthRef = useRef<HTMLInputElement>(null);
  const birthDayRef = useRef<HTMLInputElement>(null);

  const fixedPledgeDate = useMemo(() => todayYmdSeoul(), []);
  const minStartDate = useMemo(() => addDays(todayYmdSeoul(), 1), []);

  const qpStart = searchParams.get("startDate") ?? "";
  const qpEnd = searchParams.get("endDate") ?? "";

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    clearErrors,
    formState: { errors }
  } = useForm<GalleryApplyValues>({
    resolver: zodResolver(GalleryApplySchema),
    defaultValues: {
      // GalleryRequestInputSchema 필수값(갤러리 UI에서는 숨김/고정)
      roomId: "gallery",
      date: qpStart || "",
      startTime: "09:00",
      endTime: "18:00",
      headcount: 1,
      laptop: false,
      projector: false,
      audio: false,

      // 서약/동의
      pledgeDate: fixedPledgeDate,
      privacyAgree: false,
      pledgeAgree: false,

      // 갤러리 기간
      startDate: qpStart,
      endDate: qpEnd,

      // 철수시간
      galleryRemovalTime: "",

      // 준비일 (기본값은 startDate 설정 후 useEffect에서 채움)
      galleryPrepDate: "",

      // 전시 정보
      exhibitionTitle: "",
      exhibitionPurpose: "",
      genreContent: "",
      awarenessPath: "",
      specialNotes: "",

      // purpose는 전시 정보 필드에서 자동 구성(useEffect로 동기화)
      purpose: "전시 신청",
    }
  });

  // 생년월일 수동 입력 → RHF 동기화
  const handleBirthSync = useCallback((y: string, m: string, d: string) => {
    if (y.length === 4 && m.length >= 1 && d.length >= 1) {
      const mm = m.padStart(2, "0");
      const dd = d.padStart(2, "0");
      setValue("birth", `${y}-${mm}-${dd}`, { shouldValidate: true, shouldDirty: true });
    }
  }, [setValue]);

  // roomId는 항상 gallery로 고정
  useEffect(() => {
    setValue("roomId", "gallery", { shouldValidate: true, shouldDirty: true });
  }, [setValue]);

  // pledgeDate는 신청 당일로 고정
  useEffect(() => {
    setValue("pledgeDate", fixedPledgeDate, { shouldValidate: true });
  }, [fixedPledgeDate, setValue]);

  const startDate = watch("startDate");
  const endDate = watch("endDate");
  const privacyAgree = watch("privacyAgree");
  const pledgeAgree = watch("pledgeAgree");
  const applicantName = watch("applicantName");
  const exhibitionTitle = watch("exhibitionTitle");
  const exhibitionPurpose = watch("exhibitionPurpose");
  const genreContent = watch("genreContent");
  const awarenessPath = watch("awarenessPath");
  const specialNotes = watch("specialNotes");
  const galleryRemovalTime = watch("galleryRemovalTime");
  const galleryPrepDate = watch("galleryPrepDate");

  // 준비일 후보에 대한 예약 충돌 조회
  const [prepBookedDates, setPrepBookedDates] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isYmd(startDate)) {
      setPrepBookedDates(new Set());
      return;
    }
    const candidates = getAvailablePrepDates(startDate);
    if (!candidates.length) return;

    // 후보가 걸치는 월 목록을 구해서 예약 현황 조회
    const months = new Set<string>();
    for (const d of candidates) months.add(d.slice(0, 7));

    const fetches = Array.from(months).map((m) =>
      fetch(`/api/booked-dates?roomId=gallery&month=${m}`)
        .then((r) => r.json())
        .then((data) => (data.ok && Array.isArray(data.bookedDates) ? (data.bookedDates as string[]) : []))
        .catch(() => [] as string[])
    );
    Promise.all(fetches).then((results) => {
      const all = new Set<string>();
      for (const dates of results) for (const d of dates) all.add(d);
      setPrepBookedDates(all);
    });
  }, [startDate]);

  // 충돌 필터링: 충돌 날짜를 만나면 거기서 잘림 (그 날짜 이전은 선택 불가)
  const filteredPrepDates = useMemo(
    () => filterPrepDatesByConflict(getAvailablePrepDates(startDate), prepBookedDates),
    [startDate, prepBookedDates]
  );

  // filteredPrepDates가 바뀌면 기본 준비일을 자동 선택 (현재 선택이 유효하면 유지)
  useEffect(() => {
    if (galleryPrepDate && filteredPrepDates.includes(galleryPrepDate)) return;
    if (filteredPrepDates.length > 0) {
      setValue("galleryPrepDate", filteredPrepDates[0], { shouldValidate: true, shouldDirty: true });
    } else {
      setValue("galleryPrepDate", "", { shouldValidate: true, shouldDirty: true });
    }
  }, [filteredPrepDates, galleryPrepDate, setValue]);

  // 편의: 신청자 성명 → 서약자 성명 자동 채움(기본값)
  // - 서약자 성명을 직접 수정하면 이후에는 자동 동기화하지 않습니다.
  const pledgeAutoFillRef = useRef<boolean>(true);

  useEffect(() => {
    if (!pledgeAutoFillRef.current) return;
    if (!applicantName) return;
    setValue("pledgeName", applicantName, { shouldValidate: true, shouldDirty: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicantName, setValue]);

  // purpose를 전시 정보 필드에서 자동 구성 (스키마 validation 통과를 위해)
  useEffect(() => {
    const purpose = composePurpose({ exhibitionPurpose, genreContent, awarenessPath, specialNotes, galleryRemovalTime, galleryPrepDate });
    setValue("purpose", purpose, { shouldValidate: true, shouldDirty: true });
  }, [exhibitionPurpose, genreContent, awarenessPath, specialNotes, galleryRemovalTime, galleryPrepDate, setValue]);

  const sessionsBundle = useMemo(() => buildGallerySessions(startDate, endDate, galleryPrepDate), [startDate, endDate, galleryPrepDate]);

  // 서버의 기본 스키마(date/start/end) 요구를 만족하기 위해: 전시 시작일의 시간을 기본값으로 동기화
  useEffect(() => {
    if (!isYmd(startDate)) return;
    const dow = dayOfWeekLocal(startDate);
    if (dow === 0) return;
    setValue("date", startDate, { shouldValidate: true, shouldDirty: true });
    if (dow === 6) {
      setValue("startTime", "09:00", { shouldValidate: true, shouldDirty: true });
      setValue("endTime", "13:00", { shouldValidate: true, shouldDirty: true });
    } else if (dow === 2) {
      setValue("startTime", "09:00", { shouldValidate: true, shouldDirty: true });
      setValue("endTime", "20:00", { shouldValidate: true, shouldDirty: true });
    } else {
      setValue("startTime", "09:00", { shouldValidate: true, shouldDirty: true });
      setValue("endTime", "18:00", { shouldValidate: true, shouldDirty: true });
    }
  }, [startDate, setValue]);

  function handleConfirm(values: GalleryApplyValues) {
    setError(null);
    setBatchError(null);
    setConfirmData(values);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submitConfirmed() {
    if (!confirmData) return;
    await onSubmit(confirmData);
  }

  async function onSubmit(values: GalleryApplyValues) {
    setError(null);
    setBatchError(null);
    setSubmitting(true);

    try {
      const fd = new FormData();

      // RequestInputSchema 필드
      Object.entries(values).forEach(([k, v]) => {
        if (typeof v === "boolean") fd.set(k, v ? "true" : "false");
        else fd.set(k, String(v));
      });

      // 갤러리: 장비 옵션은 UI/저장/계산 모두 금지(서버에서도 강제 예정)
      fd.set("laptop", "false");
      fd.set("projector", "false");
      fd.set("audio", "false");

      // 기존 저장 구조 호환: purpose 구성
      fd.set(
        "purpose",
        composePurpose({ exhibitionPurpose, genreContent, awarenessPath, specialNotes, galleryRemovalTime, galleryPrepDate })
      );

      // 회차 자동 생성(서버에서 재생성/검증 단계는 추후 /api/requests에서 확장)
      fd.set("sessions", JSON.stringify(sessionsBundle.sessions));

      const res = await fetch("/api/requests", { method: "POST", body: fd });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.code === "BATCH_CONFLICT" && Array.isArray(data?.issues)) {
          const lines = data.issues
            .map((it: any) => `• ${it.date}${it.startTime && it.endTime ? ` ${it.startTime}-${it.endTime}` : ""}: ${it.message}`)
            .join("\n");
          setBatchError(lines);
        }
        throw new Error(data?.message ?? "신청에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      }

      const data = await res.json().catch(() => null);
      const requestId = data?.requestId;
      const batchId = String(data?.batchId ?? "");
      const count = Number(data?.count ?? 1);
      const token = String(data?.token ?? "");

      // localStorage에 토큰 저장 (이메일 인증 없이 내 신청 조회 가능)
      if (token) {
        try { localStorage.setItem("applicantToken", token); } catch {}
      }

      const qp = new URLSearchParams();
      if (requestId) qp.set("requestId", requestId);
      if (batchId) qp.set("batchId", batchId);
      if (Number.isFinite(count) && count > 1) qp.set("count", String(count));
      if (token) qp.set("token", token);
      router.push(qp.toString() ? `/success?${qp.toString()}` : "/success");
    } catch (e: any) {
      setError(e?.message ?? "신청 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  const sessionCount = sessionsBundle.sessions.length;

  // 대관료 자동 계산: 평일 20,000원/일, 토요일 10,000원/일, 준비일 무료
  const feeBreakdown = useMemo(() => {
    if (!sessionsBundle.sessions.length) return { weekdays: 0, saturdays: 0, prepDays: 0, total: 0 };
    let weekdays = 0;
    let saturdays = 0;
    let prepDays = 0;
    for (const s of sessionsBundle.sessions) {
      const isPrepDay = s.date === sessionsBundle.prepDate;
      if (isPrepDay) {
        prepDays++;
        continue;
      }
      const dow = dayOfWeekLocal(s.date);
      if (dow === 6) saturdays++;
      else weekdays++;
    }
    const total = weekdays * 20000 + saturdays * 10000;
    return { weekdays, saturdays, prepDays, total };
  }, [sessionsBundle]);

  const hasSundayInRange = useMemo(() => {
    if (!isYmd(startDate) || !isYmd(endDate) || endDate < startDate) return false;
    let cur = startDate;
    let cap = 0;
    while (cur <= endDate) {
      if (cap++ > 400) break;
      if (dayOfWeekLocal(cur) === 0) return true;
      cur = addDays(cur, 1);
    }
    return false;
  }, [startDate, endDate]);

  // ─── 확인 화면 ───
  if (confirmData) {
    return (
      <div>
        <SiteHeader title="신청 내용 확인" backHref="/space?category=gallery" backLabel="목록" />
        <main className="mx-auto max-w-2xl px-4 pb-16 pt-8">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-slate-900">신청 내용 확인</h2>
            <p className="mt-2 text-sm text-slate-600">아래 내용을 확인하신 후 제출해 주세요.</p>
          </div>

          {error && (
            <div className="mt-4">
              <Notice variant="danger" title="처리 중 오류가 발생했습니다" pad="md">{error}</Notice>
            </div>
          )}
          {batchError && (
            <div className="mt-4">
              <Notice variant="warn" title="일부 회차는 신청할 수 없습니다" pad="md">
                <div className="whitespace-pre-line text-sm">{batchError}</div>
              </Notice>
            </div>
          )}

          <div className="mt-6 space-y-4">
            {/* 전시 기간 */}
            <Card pad="lg">
              <h3 className={SECTION_TITLE}>전시 기간</h3>
              <div className="mt-3 divide-y divide-slate-100">
                <div className="flex justify-between py-2.5">
                  <span className="text-sm text-slate-500">공간</span>
                  <span className="text-sm font-semibold text-slate-900">우리동네 갤러리</span>
                </div>
                <div className="flex justify-between py-2.5">
                  <span className="text-sm text-slate-500">전시 기간</span>
                  <span className="text-sm font-semibold text-slate-900">{confirmData.startDate} ~ {confirmData.endDate}</span>
                </div>
                <div className="flex justify-between py-2.5">
                  <span className="text-sm text-slate-500">전시 준비일</span>
                  <span className="text-sm font-semibold text-slate-900">
                    {sessionsBundle.prepDate
                      ? `${sessionsBundle.prepDate} (${dowLabel(sessionsBundle.prepDate)}) — 무료`
                      : "없음"}
                  </span>
                </div>
                <div className="flex justify-between py-2.5">
                  <span className="text-sm text-slate-500">철수 일시</span>
                  <span className="text-sm font-semibold text-slate-900">{confirmData.endDate} {confirmData.galleryRemovalTime}</span>
                </div>
                <div className="flex justify-between py-2.5">
                  <span className="text-sm text-slate-500">총 회차</span>
                  <span className="text-sm font-semibold text-slate-900">{sessionCount}회</span>
                </div>
              </div>
            </Card>

            {/* 신청자 정보 */}
            <Card pad="lg">
              <h3 className={SECTION_TITLE}>신청자 정보</h3>
              <div className="mt-3 divide-y divide-slate-100">
                {([
                  ["성명", confirmData.applicantName],
                  ["생년월일", confirmData.birth],
                  ["주소", confirmData.address],
                  ["연락처", confirmData.phone],
                  ["이메일", confirmData.email],
                  ["단체명", confirmData.orgName],
                ] as const).map(([label, value]) => (
                  <div key={label} className="flex justify-between py-2.5">
                    <span className="text-sm text-slate-500 shrink-0">{label}</span>
                    <span className="text-sm font-semibold text-slate-900 text-right">{value}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                이메일은 대관 승인 여부 및 신청 조회 등에 활용되므로 반드시 정확히 입력해 주세요.
              </p>
            </Card>

            {/* 전시 정보 */}
            <Card pad="lg">
              <h3 className={SECTION_TITLE}>전시 정보</h3>
              <div className="mt-3 divide-y divide-slate-100">
                <div className="flex justify-between py-2.5">
                  <span className="text-sm text-slate-500">전시명</span>
                  <span className="text-sm font-semibold text-slate-900">{confirmData.exhibitionTitle}</span>
                </div>
                {confirmData.exhibitionPurpose && (
                  <div className="py-2.5">
                    <span className="text-sm text-slate-500">전시 목적</span>
                    <p className="mt-1.5 text-sm text-slate-900 whitespace-pre-line rounded-lg bg-slate-50 px-3 py-2">{confirmData.exhibitionPurpose}</p>
                  </div>
                )}
                {confirmData.genreContent && (
                  <div className="py-2.5">
                    <span className="text-sm text-slate-500">장르·내용</span>
                    <p className="mt-1.5 text-sm text-slate-900 whitespace-pre-line rounded-lg bg-slate-50 px-3 py-2">{confirmData.genreContent}</p>
                  </div>
                )}
                {confirmData.awarenessPath && (
                  <div className="flex justify-between py-2.5">
                    <span className="text-sm text-slate-500">인지 경로</span>
                    <span className="text-sm font-semibold text-slate-900">{confirmData.awarenessPath}</span>
                  </div>
                )}
                {confirmData.specialNotes && (
                  <div className="py-2.5">
                    <span className="text-sm text-slate-500">특이사항</span>
                    <p className="mt-1.5 text-sm text-slate-900 whitespace-pre-line rounded-lg bg-slate-50 px-3 py-2">{confirmData.specialNotes}</p>
                  </div>
                )}
              </div>
            </Card>

            {/* 예상 대관료 */}
            <Card pad="lg">
              <h3 className={SECTION_TITLE}>예상 대관료</h3>
              <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-blue-50/80 via-white to-white shadow-sm">
                <div className="px-4 py-3 space-y-2">
                  {feeBreakdown.weekdays > 0 && (
                    <div className="flex items-center justify-between text-sm text-slate-600">
                      <span>평일 {feeBreakdown.weekdays}일 x 20,000원</span>
                      <span className="font-semibold text-slate-800 tabular-nums">{(feeBreakdown.weekdays * 20000).toLocaleString()}원</span>
                    </div>
                  )}
                  {feeBreakdown.saturdays > 0 && (
                    <div className="flex items-center justify-between text-sm text-slate-600">
                      <span>토요일 {feeBreakdown.saturdays}일 x 10,000원</span>
                      <span className="font-semibold text-slate-800 tabular-nums">{(feeBreakdown.saturdays * 10000).toLocaleString()}원</span>
                    </div>
                  )}
                  {feeBreakdown.prepDays > 0 && sessionsBundle.prepDate && (
                    <div className="flex items-center justify-between text-sm text-emerald-600">
                      <span>준비일 {feeBreakdown.prepDays}일 ({sessionsBundle.prepDate} {dowLabel(sessionsBundle.prepDate)})</span>
                      <span className="font-medium">무료</span>
                    </div>
                  )}
                </div>
                <div className="mx-4 mb-3 flex items-center justify-between rounded-xl bg-[rgb(var(--brand-primary)/0.06)] px-4 py-3">
                  <span className="text-sm font-bold text-slate-900">합계</span>
                  <span className="text-lg font-extrabold text-[rgb(var(--brand-primary))]">{feeBreakdown.total.toLocaleString()}원</span>
                </div>
              </div>
            </Card>

            {/* 버튼 */}
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" className="flex-1 py-3" onClick={() => setConfirmData(null)}>
                수정하기
              </Button>
              <Button type="button" variant="primary" className="flex-1 py-3" disabled={submitting} onClick={submitConfirmed}>
                {submitting ? "제출 중..." : "최종 제출"}
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div>
      <SiteHeader title="우리동네 갤러리 대관 신청" backHref="/space?category=gallery" backLabel="목록" />

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-8">
        <h2 className="text-2xl font-bold">우리동네 갤러리 대관 신청서 작성</h2>
        <p className={SECTION_DESC}>온라인으로 신청서를 작성하면 담당자 검토/승인 절차를 거쳐 확정됩니다.</p>

        <div className="mt-4">
          <OperatingHoursNotice roomId="gallery" />
        </div>

        <div className="mt-5">
          <Notice title="신청 전 확인" variant="info" pad="md">
            <ul className="list-disc space-y-1 pl-5">
              <li>우리동네 갤러리는 <b>일 단위</b>로 신청하며, 시간 선택 없이 기간만 지정합니다.</li>
              <li>일요일은 자동 제외되며, 준비(세팅)일 1일은 <b>무료</b>로 사용 가능합니다. (날짜 선택 가능)</li>
              <li>전시 기간은 최대 <b>30일</b>까지 신청 가능합니다.</li>
              <li>전시 마지막 날 <b>17시까지 철수 완료</b> 필수입니다.</li>
              <li>상세 화면의 &ldquo;공간정보 및 시설안내 / 취소·환불규정&rdquo;을 확인한 후 신청해 주세요.</li>
            </ul>
          </Notice>
        </div>

        <form onSubmit={handleSubmit(handleConfirm)} className="mt-6 space-y-8">
          {/* hidden - roomId/date/start/end are driven by UI */}
          <input type="hidden" {...register("roomId")} />
          <input type="hidden" {...register("date")} />
          <input type="hidden" {...register("startTime")} />
          <input type="hidden" {...register("endTime")} />
          <input type="hidden" value="false" {...register("laptop")} />
          <input type="hidden" value="false" {...register("projector")} />
          <input type="hidden" value="false" {...register("audio")} />

          {error ? (
            <Notice variant="danger" title="처리 중 오류가 발생했습니다" pad="md">
              {error}
            </Notice>
          ) : null}

          {batchError ? (
            <Notice variant="warn" title="일부 회차는 신청할 수 없습니다" pad="md">
              <div className="whitespace-pre-line text-sm">{batchError}</div>
            </Notice>
          ) : null}

          <Card pad="lg">
            <h3 className={SECTION_TITLE}>전시 기간</h3>
            <p className={SECTION_DESC}>기간을 선택하면 회차가 자동 생성됩니다.</p>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="startDate">시작일 *</FieldLabel>
                <Input id="startDate" type="date" min={minStartDate} {...register("startDate")} />
                {errors.startDate?.message ? <FieldHelp className="text-red-600">{errors.startDate.message}</FieldHelp> : null}
              </div>

              <div>
                <FieldLabel htmlFor="endDate">종료일 *</FieldLabel>
                <Input id="endDate" type="date" {...register("endDate")} />
                {errors.endDate?.message ? <FieldHelp className="text-red-600">{errors.endDate.message}</FieldHelp> : null}
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm text-slate-700">
                  자동 생성 회차: <span className="font-semibold text-slate-900">{sessionCount || 0}회</span>
                </div>
                <button type="button" onClick={() => setGalleryInfoOpen(true)} className="text-sm font-semibold text-[rgb(var(--brand-primary))] hover:underline">
                  우리동네 갤러리 안내 보기
                </button>
              </div>
              {isYmd(startDate) && filteredPrepDates.length > 0 && (
                <div className="mt-3 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-emerald-900">전시 준비일 (무료)</span>
                  </div>
                  <p className="mt-1 text-xs text-emerald-800">
                    전시 시작 전 준비(세팅)를 위한 1일을 무료로 사용할 수 있습니다. 필요 없으면 &lsquo;준비일 없음&rsquo;을 선택하세요.
                  </p>
                  <div className="mt-2">
                    <Select
                      id="galleryPrepDate"
                      {...register("galleryPrepDate")}
                    >
                      {filteredPrepDates.map((d) => (
                        <option key={d} value={d}>
                          {d} ({dowLabel(d)})
                        </option>
                      ))}
                      <option value="">준비일 없음</option>
                    </Select>
                  </div>
                  {errors.galleryPrepDate?.message ? <FieldHelp className="text-red-600">{errors.galleryPrepDate.message}</FieldHelp> : null}
                </div>
              )}
              {hasSundayInRange ? (
                <p className="mt-2 text-xs text-slate-600">선택한 기간에 일요일이 포함되어 있으면 자동으로 제외됩니다.</p>
              ) : null}
            </div>

            {/* 대관료 자동 계산 */}
            {sessionCount > 0 && (
              <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-blue-50/80 via-white to-white shadow-sm">
                <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5">
                  <span className="text-base">💰</span>
                  <span className="text-sm font-bold text-slate-800">예상 대관료</span>
                </div>
                <div className="px-4 py-3">
                  <div className="space-y-2">
                    {feeBreakdown.weekdays > 0 && (
                      <div className="flex items-center justify-between text-sm text-slate-600">
                        <span>평일 {feeBreakdown.weekdays}일 × 20,000원</span>
                        <span className="font-semibold text-slate-800">{(feeBreakdown.weekdays * 20000).toLocaleString()}원</span>
                      </div>
                    )}
                    {feeBreakdown.saturdays > 0 && (
                      <div className="flex items-center justify-between text-sm text-slate-600">
                        <span>토요일 {feeBreakdown.saturdays}일 × 10,000원</span>
                        <span className="font-semibold text-slate-800">{(feeBreakdown.saturdays * 10000).toLocaleString()}원</span>
                      </div>
                    )}
                    {feeBreakdown.prepDays > 0 && sessionsBundle.prepDate && (
                      <div className="flex items-center justify-between text-sm text-emerald-600">
                        <span>준비일 {feeBreakdown.prepDays}일 ({sessionsBundle.prepDate} {dowLabel(sessionsBundle.prepDate)})</span>
                        <span className="font-medium">무료</span>
                      </div>
                    )}
                  </div>
                  <div className="mt-3 flex items-center justify-between rounded-xl bg-[rgb(var(--brand-primary)/0.06)] px-4 py-3">
                    <span className="text-sm font-bold text-slate-900">합계</span>
                    <span className="text-lg font-extrabold text-[rgb(var(--brand-primary))]">{feeBreakdown.total.toLocaleString()}원</span>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-400">※ 할인 및 바우처 적용 불가</p>
                </div>
              </div>
            )}

            <FieldHelp className="mt-2">
              ※ 일요일은 자동 제외되며, 공휴일은 담당자 차단으로 관리됩니다.
            </FieldHelp>

            {/* 철수시간 설정 */}
            {isYmd(endDate) && (
              <div className="mt-5 rounded-xl border-2 border-orange-300 bg-orange-50 p-4">
                <h4 className="text-sm font-bold text-orange-900">대관 철수 안내</h4>
                <p className="mt-1 text-xs text-orange-800">
                  전시 마지막 날({endDate}) <b>17시까지</b> 철수를 완료해야 합니다. 철수 예정 시간을 설정해 주세요.
                </p>
                <div className="mt-3 grid grid-cols-2 gap-4">
                  <div>
                    <FieldLabel>철수 일자</FieldLabel>
                    <Input type="text" value={endDate} readOnly className="bg-white/70 text-slate-700" />
                  </div>
                  <div>
                    <FieldLabel htmlFor="galleryRemovalTime">철수 시간 *</FieldLabel>
                    <Select id="galleryRemovalTime" {...register("galleryRemovalTime")}>
                      <option value="">선택해 주세요</option>
                      <option value="09:00">09:00</option>
                      <option value="09:30">09:30</option>
                      <option value="10:00">10:00</option>
                      <option value="10:30">10:30</option>
                      <option value="11:00">11:00</option>
                      <option value="11:30">11:30</option>
                      <option value="12:00">12:00</option>
                      <option value="12:30">12:30</option>
                      <option value="13:00">13:00</option>
                      <option value="13:30">13:30</option>
                      <option value="14:00">14:00</option>
                      <option value="14:30">14:30</option>
                      <option value="15:00">15:00</option>
                      <option value="15:30">15:30</option>
                      <option value="16:00">16:00</option>
                      <option value="16:30">16:30</option>
                      <option value="17:00">17:00</option>
                    </Select>
                    {errors.galleryRemovalTime?.message ? <FieldHelp className="text-red-600">{errors.galleryRemovalTime.message}</FieldHelp> : null}
                  </div>
                </div>
              </div>
            )}
          </Card>

          <Card pad="lg">
            <h3 className={SECTION_TITLE}>신청자 정보</h3>
            <p className={SECTION_DESC}>담당자에게 연락할 정보를 입력해 주세요.</p>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="applicantName">성명 *</FieldLabel>
                <Input id="applicantName" {...register("applicantName")} placeholder="홍길동" />
                {errors.applicantName?.message ? <FieldHelp className="text-red-600">{errors.applicantName.message}</FieldHelp> : null}
              </div>

              <div>
                <FieldLabel htmlFor="birthYear">생년월일 *</FieldLabel>
                <input type="hidden" {...register("birth")} />
                <div className="flex items-center gap-1">
                  <input
                    id="birthYear"
                    className="w-20 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-center outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300"
                    maxLength={4}
                    placeholder="YYYY"
                    inputMode="numeric"
                    value={birthYear}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                      setBirthYear(v);
                      if (v.length === 4) birthMonthRef.current?.focus();
                      handleBirthSync(v, birthMonth, birthDay);
                    }}
                  />
                  <span className="text-slate-400">-</span>
                  <input
                    ref={birthMonthRef}
                    className="w-14 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-center outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300"
                    maxLength={2}
                    placeholder="MM"
                    inputMode="numeric"
                    value={birthMonth}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, "").slice(0, 2);
                      setBirthMonth(v);
                      if (v.length === 2) birthDayRef.current?.focus();
                      handleBirthSync(birthYear, v, birthDay);
                    }}
                  />
                  <span className="text-slate-400">-</span>
                  <input
                    ref={birthDayRef}
                    className="w-14 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-center outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300"
                    maxLength={2}
                    placeholder="DD"
                    inputMode="numeric"
                    value={birthDay}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, "").slice(0, 2);
                      setBirthDay(v);
                      handleBirthSync(birthYear, birthMonth, v);
                    }}
                  />
                </div>
                {errors.birth?.message ? <FieldHelp className="text-red-600">{errors.birth.message}</FieldHelp> : null}
              </div>

              <div className="md:col-span-2">
                <FieldLabel htmlFor="address">주소 *</FieldLabel>
                <Input id="address" {...register("address")} placeholder="서울특별시 서초구 서운로26길 3, 4층" />
                {errors.address?.message ? <FieldHelp className="text-red-600">{errors.address.message}</FieldHelp> : null}
              </div>

              <div>
                <FieldLabel htmlFor="phone">연락처 *</FieldLabel>
                <Input
                  id="phone"
                  placeholder="010-0000-0000"
                  inputMode="numeric"
                  autoComplete="tel"
                  {...register("phone", {
                    onChange: (e) => {
                      const formatted = formatPhoneKR((e.target as HTMLInputElement).value);
                      setValue("phone", formatted, { shouldDirty: true, shouldValidate: true });
                    },
                  })}
                />
                {errors.phone?.message ? <FieldHelp className="text-red-600">{errors.phone.message}</FieldHelp> : null}
              </div>

              <div>
                <FieldLabel htmlFor="email">이메일 *</FieldLabel>
                <Input id="email" type="email" {...register("email")} placeholder="example@email.com" />
                {errors.email?.message ? <FieldHelp className="text-red-600">{errors.email.message}</FieldHelp> : null}
              </div>
            </div>

            <div className="mt-4">
              <FieldLabel htmlFor="orgName">단체명 *</FieldLabel>
              <Input id="orgName" {...register("orgName")} placeholder={`개인 신청 시 \u0027개인\u0027으로 입력`} />
              {errors.orgName?.message ? <FieldHelp className="text-red-600">{errors.orgName.message}</FieldHelp> : null}
            </div>
          </Card>

          <Card pad="lg">
            <h3 className={SECTION_TITLE}>전시 정보</h3>
            <p className={SECTION_DESC}>전시 운영에 필요한 정보를 입력해 주세요.</p>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="md:col-span-2">
                <FieldLabel htmlFor="exhibitionTitle">전시명 *</FieldLabel>
                <Input id="exhibitionTitle" placeholder="예: 2026 서초 작가전" {...register("exhibitionTitle")} />
                {errors.exhibitionTitle?.message ? <FieldHelp className="text-red-600">{errors.exhibitionTitle.message}</FieldHelp> : null}
              </div>

              <div className="md:col-span-2">
                <FieldLabel htmlFor="exhibitionPurpose">전시 목적</FieldLabel>
                <Textarea id="exhibitionPurpose" rows={3} placeholder="예: 지역 주민 대상 문화예술 공유" {...register("exhibitionPurpose")} />
                {errors.exhibitionPurpose?.message ? <FieldHelp className="text-red-600">{errors.exhibitionPurpose.message}</FieldHelp> : null}
              </div>

              <div className="md:col-span-2">
                <FieldLabel htmlFor="genreContent">장르·내용</FieldLabel>
                <Textarea id="genreContent" rows={3} placeholder="예: 사진/회화/공예 등, 주요 전시 내용" {...register("genreContent")} />
                {errors.genreContent?.message ? <FieldHelp className="text-red-600">{errors.genreContent.message}</FieldHelp> : null}
              </div>

              <div>
                <FieldLabel htmlFor="awarenessPath">인지 경로</FieldLabel>
                <Select id="awarenessPath" {...register("awarenessPath")}>
                  <option value="">선택해 주세요</option>
                  <option value="서초센터 홈페이지">서초센터 홈페이지</option>
                  <option value="센터 내 홍보 리플릿">센터 내 홍보 리플릿</option>
                  <option value="서초구청 홈페이지">서초구청 홈페이지</option>
                  <option value="지인 소개">지인 소개</option>
                  <option value="기타">기타</option>
                </Select>
                {errors.awarenessPath?.message ? <FieldHelp className="text-red-600">{errors.awarenessPath.message}</FieldHelp> : null}
              </div>

              <div className="md:col-span-2">
                <FieldLabel htmlFor="specialNotes">특이사항</FieldLabel>
                <Textarea id="specialNotes" rows={3} placeholder="예: 설치물/운영 인력/안전 관련 특이사항" {...register("specialNotes")} />
                {errors.specialNotes?.message ? <FieldHelp className="text-red-600">{errors.specialNotes.message}</FieldHelp> : null}
              </div>
            </div>
          </Card>

          <Card pad="lg">
            <h3 className={SECTION_TITLE}>동의/서약</h3>
            <div className="mt-4">
              <input type="hidden" {...register("privacyAgree")} />
              <Checkbox
                checked={!!privacyAgree}
                readOnly
                onClick={(e) => {
                  e.preventDefault();
                  setPrivacyOpen(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setPrivacyOpen(true);
                  }
                }}
                label="개인정보 수집·이용에 동의합니다. (필수)"
                error={errors.privacyAgree?.message}
              />
              <FieldHelp className="mt-1">* 체크 시 안내 내용을 확인한 후 동의 여부가 반영됩니다.</FieldHelp>
            </div>
            <div className="mt-4">
              <input type="hidden" {...register("pledgeAgree")} />
              <Checkbox
                checked={!!pledgeAgree}
                readOnly
                onClick={(e) => {
                  e.preventDefault();
                  setPledgeOpen(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setPledgeOpen(true);
                  }
                }}
                label="서약 내용에 동의합니다. (필수)"
                error={errors.pledgeAgree?.message}
              />
              <FieldHelp className="mt-1">
                * 체크 시 서약서 내용을 확인한 후 동의 여부가 반영됩니다.
              </FieldHelp>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="pledgeDate">서약 일자 *</FieldLabel>
                <input type="hidden" {...register("pledgeDate")} />
                <Input id="pledgeDate" type="text" value={fixedPledgeDate} readOnly className="bg-slate-50 text-slate-700" />
                {errors.pledgeDate?.message ? <FieldHelp className="text-red-600">{errors.pledgeDate.message}</FieldHelp> : null}
              </div>

              <div>
                <FieldLabel htmlFor="pledgeName">서약자 성명 *</FieldLabel>
                <Input
                  id="pledgeName"
                  {...register("pledgeName", {
                    onChange: (e) => {
                      pledgeAutoFillRef.current = (e.target as HTMLInputElement).value.trim() === "";
                    },
                  })}
                />
                {errors.pledgeName?.message ? <FieldHelp className="text-red-600">{errors.pledgeName.message}</FieldHelp> : null}
              </div>
            </div>
          </Card>

          {sessionCount === 0 && (startDate || endDate) ? (
            <Notice variant="warn">전시 기간(시작일·종료일)을 올바르게 입력해 주세요. 회차가 0회이면 신청할 수 없습니다.</Notice>
          ) : null}
          {sessionCount === 0 && !startDate && !endDate ? (
            <Notice variant="warn">전시 기간(시작일·종료일)을 먼저 선택해 주세요.</Notice>
          ) : null}
          <Button type="submit" variant="primary" disabled={submitting || !exhibitionTitle || sessionCount === 0 || !galleryRemovalTime} className="w-full py-3 shadow-sm hover:opacity-90">
            {submitting ? "신청 중..." : "신청하기"}
          </Button>
        </form>

        <PrivacyModal
          open={privacyOpen}
          onClose={() => setPrivacyOpen(false)}
          onAgree={() => {
            setValue("privacyAgree", true, { shouldValidate: true, shouldDirty: true });
            clearErrors("privacyAgree");
          }}
          onDisagree={() => {
            setValue("privacyAgree", false, { shouldValidate: true, shouldDirty: true });
          }}
        />

        <PledgeModal
          open={pledgeOpen}
          onClose={() => setPledgeOpen(false)}
          onAgree={() => {
            setValue("pledgeAgree", true, { shouldValidate: true, shouldDirty: true });
            clearErrors("pledgeAgree");
          }}
          onDisagree={() => {
            setValue("pledgeAgree", false, { shouldValidate: true, shouldDirty: true });
          }}
        />

        <GalleryInfoModal open={galleryInfoOpen} onClose={() => setGalleryInfoOpen(false)} />
      </main>
    </div>
  );
}

/* 갤러리 안내 팝업 */
function GalleryInfoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="닫기"
        onClick={onClose}
        tabIndex={-1}
      />

      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h3 className="text-base font-semibold">우리동네 갤러리 안내</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-gray-600 hover:bg-gray-100"
          >
            닫기
          </button>
        </div>

        <div className="max-h-[70vh] overflow-auto px-5 py-4 space-y-4 text-sm text-gray-800">
          {/* 운영 시간 */}
          <div>
            <h4 className="font-semibold mb-2">운영 시간</h4>
            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-slate-700">구분</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-700">시간</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  <tr><td className="px-3 py-2">평일 (월/수~금)</td><td className="px-3 py-2">09:00 ~ 18:00</td></tr>
                  <tr><td className="px-3 py-2">화요일</td><td className="px-3 py-2">09:00 ~ 20:00</td></tr>
                  <tr><td className="px-3 py-2">토요일</td><td className="px-3 py-2">09:00 ~ 13:00</td></tr>
                  <tr><td className="px-3 py-2 text-slate-500">일요일·공휴일</td><td className="px-3 py-2 text-slate-500">휴관</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 대관료 */}
          <div>
            <h4 className="font-semibold mb-2">대관료 기준 (1일 기준)</h4>
            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-slate-700">구분</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-700">대관료</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  <tr><td className="px-3 py-2">평일 (월~금)</td><td className="px-3 py-2 font-semibold">20,000원</td></tr>
                  <tr><td className="px-3 py-2">토요일</td><td className="px-3 py-2 font-semibold">10,000원</td></tr>
                </tbody>
              </table>
            </div>
            <p className="mt-1 text-xs text-slate-600">※ 할인 및 바우처 적용 불가 / 준비(세팅)일 1일 무료 지원</p>
          </div>

          {/* 전시 참고사항 */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <h4 className="font-semibold mb-2 text-blue-900">전시 참고사항</h4>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-blue-800">
              <li>신청자가 직접 설치(준비, 세팅) 및 철수 진행 (작품 보관·지원·관리 인력 제공 불가)</li>
              <li>와이어 걸이(고리)를 활용한 형식의 작품만 전시 가능</li>
              <li>액자 형태 작품: 가로/세로 최대 60cm, 최대 15점</li>
              <li>작품 크기·무게에 따라 전시 불가 시 사전 담당자 상담 필요</li>
              <li>전시 마지막 날 <b>17시까지 철수 완료</b> 필수</li>
              <li>홍보 콘텐츠 제작을 위해 준비일 이전에 전시 고리 사진 파일을 서초센터 메일로 공유 필요</li>
            </ul>
          </div>

          {/* 환불 규정 */}
          <div>
            <h4 className="font-semibold mb-2">환불 규정</h4>
            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-slate-700">취소 시점</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-700">환불 비율</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  <tr><td className="px-3 py-2">사용일 3일 전까지</td><td className="px-3 py-2 font-semibold text-green-700">전액 환불</td></tr>
                  <tr><td className="px-3 py-2">사용일 2일 전까지</td><td className="px-3 py-2 font-semibold">90% 환불</td></tr>
                  <tr><td className="px-3 py-2">사용일 1일 전까지</td><td className="px-3 py-2 font-semibold">80% 환불</td></tr>
                  <tr><td className="px-3 py-2 text-red-600">사용일 당일 이후</td><td className="px-3 py-2 font-semibold text-red-600">환불 불가</td></tr>
                </tbody>
              </table>
            </div>
            <p className="mt-1 text-xs text-slate-600">※ 환불 절차: 센터 방문 → 환불신청서 작성 및 제출 (비대면 접수 불가)</p>
          </div>

          {/* 신청 제한 */}
          <div>
            <h4 className="font-semibold mb-2">신청 제한 사항</h4>
            <ul className="list-disc space-y-1.5 pl-5 text-gray-700">
              <li>부적절한 목적, 시설 훼손 우려, 종교 포교, 정치적 목적, 영리적 목적</li>
              <li>작품 판매, 세미나, 퍼포먼스, 기타 판촉행사 등 부대행사 진행</li>
              <li>대관 규정 미진 시 대관 중 발견 시 즉시 취소 및 환불 불가</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
