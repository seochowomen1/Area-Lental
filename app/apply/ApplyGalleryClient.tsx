"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { GalleryRequestInputSchema, type GalleryRequestInput } from "@/lib/schema";
import { todayYmdSeoul } from "@/lib/datetime";
import SiteHeader from "@/components/SiteHeader";
import PledgeModal from "@/components/PledgeModal";
import PrivacyModal from "@/components/PrivacyModal";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Notice from "@/components/ui/Notice";
import Checkbox from "@/components/ui/Checkbox";
import { FieldHelp, FieldLabel, Input, Textarea } from "@/components/ui/Field";

// 갤러리 신청(B안): 기간(start/end) 선택 → 회차 자동 생성
// - 일요일 자동 제외
// - 준비(세팅)일 1일 무료: 시작일 이전 1일(일요일이면 직전 영업일)
// - 공휴일 자동 제외 X (Blocks로 처리)

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

type SessionInput = { date: string; startTime: string; endTime: string };

function buildGallerySessions(startDate: string, endDate: string): {
  prepDate: string | null;
  sessions: SessionInput[];
} {
  if (!isYmd(startDate) || !isYmd(endDate) || endDate < startDate) {
    return { prepDate: null, sessions: [] };
  }

  // 준비일: 시작일 이전 1일(일요일이면 직전 영업일로 역추적)
  let prep = addDays(startDate, -1);
  while (isYmd(prep) && dayOfWeekLocal(prep) === 0) {
    prep = addDays(prep, -1);
  }
  const prepDate = isYmd(prep) ? prep : null;

  const sessions: SessionInput[] = [];
  // 전시 기간(포함)
  let cur = startDate;
  const safetyCap = 400; // 기술 안전장치(전시기간 제한은 없음)
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

  // 준비일 세션은 전시 시작일과 겹치지 않도록 별도 추가(일요일 제외는 이미 처리됨)
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

function composePurpose(fields: { exhibitionPurpose?: string; genreContent?: string; awarenessPath?: string; specialNotes?: string }) {
  // RequestInputSchema의 purpose(min 5) 충족 + 관리자 확인 편의
  const lines: string[] = [];
  if (fields.exhibitionPurpose?.trim()) lines.push(`전시 목적: ${fields.exhibitionPurpose.trim()}`);
  if (fields.genreContent?.trim()) lines.push(`장르·내용: ${fields.genreContent.trim()}`);
  if (fields.awarenessPath?.trim()) lines.push(`인지 경로: ${fields.awarenessPath.trim()}`);
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

  const fixedPledgeDate = useMemo(() => todayYmdSeoul(), []);

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

      // 전시 정보
      exhibitionTitle: "",
      exhibitionPurpose: "",
      genreContent: "",
      awarenessPath: "",
      specialNotes: "",
    }
  });

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
  const exhibitionTitle = watch("exhibitionTitle");
  const exhibitionPurpose = watch("exhibitionPurpose");
  const genreContent = watch("genreContent");
  const awarenessPath = watch("awarenessPath");
  const specialNotes = watch("specialNotes");

  const sessionsBundle = useMemo(() => buildGallerySessions(startDate, endDate), [startDate, endDate]);

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
        composePurpose({ exhibitionPurpose, genreContent, awarenessPath, specialNotes })
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
      const qp = new URLSearchParams();
      if (requestId) qp.set("requestId", requestId);
      if (batchId) qp.set("batchId", batchId);
      if (Number.isFinite(count) && count > 1) qp.set("count", String(count));
      router.push(qp.toString() ? `/success?${qp.toString()}` : "/success");
    } catch (e: any) {
      setError(e?.message ?? "신청 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  const sessionCount = sessionsBundle.sessions.length;

  // 대관비 자동 계산: 평일 20,000원/일, 토요일 10,000원/일, 준비일 무료
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

  return (
    <div className="min-h-screen bg-gray-50">
      <SiteHeader title="갤러리 대관 신청" />

      <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">갤러리 대관 신청</h1>
          <p className="mt-2 text-sm text-gray-600">우리동네 갤러리(4층) 전시 대관 신청서입니다.</p>
        </div>

        <Notice>
          <div className="space-y-1">
            <div className="font-medium text-gray-900">운영시간</div>
            <div className="text-sm text-gray-700">평일 09:00~18:00 / 화 야간 18:00~20:00 / 토 09:00~13:00 / 일 휴관</div>
            <div className="text-sm text-gray-700">일요일은 자동 제외되며, 준비(세팅)일 1일은 무료로 포함됩니다.</div>
          </div>
        </Notice>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-6">
          <Card>
            <h2 className="text-base font-semibold text-gray-900">전시 기간</h2>
            <p className="mt-1 text-sm text-gray-600">기간을 선택하면 회차가 자동 생성됩니다.</p>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="startDate">시작일</FieldLabel>
                <Input id="startDate" type="date" {...register("startDate")} />
                {errors.startDate?.message ? <FieldHelp className="text-red-600">{errors.startDate.message}</FieldHelp> : null}
              </div>

              <div>
                <FieldLabel htmlFor="endDate">종료일</FieldLabel>
                <Input id="endDate" type="date" {...register("endDate")} />
                {errors.endDate?.message ? <FieldHelp className="text-red-600">{errors.endDate.message}</FieldHelp> : null}
              </div>
            </div>

            <div className="mt-4 rounded-xl bg-white/60 p-4 ring-1 ring-gray-200">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm text-gray-700">
                  자동 생성 회차: <span className="font-semibold text-gray-900">{sessionCount || 0}회</span>
                  {sessionsBundle.prepDate ? (
                    <span className="ml-2 text-gray-600">(준비일 포함: {sessionsBundle.prepDate})</span>
                  ) : null}
                </div>
                <button type="button" onClick={() => setGalleryInfoOpen(true)} className="text-sm font-medium text-blue-700 hover:underline">
                  갤러리 안내 보기
                </button>
              </div>
              {hasSundayInRange ? (
                <p className="mt-2 text-xs text-gray-600">선택한 기간에 일요일이 포함되어 있으면 자동으로 제외됩니다.</p>
              ) : null}
            </div>

            {/* 대관비 자동 계산 */}
            {sessionCount > 0 && (
              <div className="mt-4">
                <Notice variant="info" title="예상 대관비">
                  <div className="space-y-1.5 text-sm text-slate-700">
                    {feeBreakdown.weekdays > 0 && (
                      <div className="flex items-center justify-between">
                        <span>평일 {feeBreakdown.weekdays}일 × 20,000원</span>
                        <span className="font-semibold">{(feeBreakdown.weekdays * 20000).toLocaleString()}원</span>
                      </div>
                    )}
                    {feeBreakdown.saturdays > 0 && (
                      <div className="flex items-center justify-between">
                        <span>토요일 {feeBreakdown.saturdays}일 × 10,000원</span>
                        <span className="font-semibold">{(feeBreakdown.saturdays * 10000).toLocaleString()}원</span>
                      </div>
                    )}
                    {feeBreakdown.prepDays > 0 && (
                      <div className="flex items-center justify-between text-slate-500">
                        <span>준비일 {feeBreakdown.prepDays}일</span>
                        <span>무료</span>
                      </div>
                    )}
                    <div className="mt-2 flex items-center justify-between border-t pt-2">
                      <span className="font-semibold text-slate-900">합계</span>
                      <span className="text-base font-bold text-slate-900">{feeBreakdown.total.toLocaleString()}원</span>
                    </div>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-500">※ 할인 및 바우처 적용 불가</p>
                </Notice>
              </div>
            )}
          </Card>

          <Card>
            <h2 className="text-base font-semibold text-gray-900">전시 정보</h2>
            <p className="mt-1 text-sm text-gray-600">전시 운영에 필요한 정보를 입력해 주세요.</p>

            <div className="mt-4 space-y-4">
              <div>
                <FieldLabel htmlFor="exhibitionTitle">전시명(필수)</FieldLabel>
                <Input id="exhibitionTitle" placeholder="예: 2026 서초 작가전" {...register("exhibitionTitle")} />
                {errors.exhibitionTitle?.message ? <FieldHelp className="text-red-600">{errors.exhibitionTitle.message}</FieldHelp> : null}
              </div>

              <div>
                <FieldLabel htmlFor="exhibitionPurpose">전시 목적</FieldLabel>
                <Textarea id="exhibitionPurpose" rows={3} placeholder="예: 지역 주민 대상 문화예술 공유" {...register("exhibitionPurpose")} />
                {errors.exhibitionPurpose?.message ? <FieldHelp className="text-red-600">{errors.exhibitionPurpose.message}</FieldHelp> : null}
              </div>

              <div>
                <FieldLabel htmlFor="genreContent">장르·내용</FieldLabel>
                <Textarea id="genreContent" rows={3} placeholder="예: 사진/회화/공예 등, 주요 전시 내용" {...register("genreContent")} />
                {errors.genreContent?.message ? <FieldHelp className="text-red-600">{errors.genreContent.message}</FieldHelp> : null}
              </div>

              <div>
                <FieldLabel htmlFor="awarenessPath">인지 경로</FieldLabel>
                <select
                  id="awarenessPath"
                  className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  {...register("awarenessPath")}
                  defaultValue=""
                >
                  <option value="">선택해 주세요</option>
                  <option value="서초센터 홈페이지">서초센터 홈페이지</option>
                  <option value="센터 내 홍보 리플릿">센터 내 홍보 리플릿</option>
                  <option value="서초구청 홈페이지">서초구청 홈페이지</option>
                  <option value="지인 소개">지인 소개</option>
                  <option value="기타">기타</option>
                </select>
                {errors.awarenessPath?.message ? <FieldHelp className="text-red-600">{errors.awarenessPath.message}</FieldHelp> : null}
              </div>

              <div>
                <FieldLabel htmlFor="specialNotes">특이사항</FieldLabel>
                <Textarea id="specialNotes" rows={3} placeholder="예: 설치물/운영 인력/안전 관련 특이사항" {...register("specialNotes")} />
                {errors.specialNotes?.message ? <FieldHelp className="text-red-600">{errors.specialNotes.message}</FieldHelp> : null}
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="text-base font-semibold text-gray-900">신청자 정보</h2>
            <p className="mt-1 text-sm text-gray-600">담당자에게 연락할 정보를 입력해 주세요.</p>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="applicantName">신청자 성명</FieldLabel>
                <Input id="applicantName" {...register("applicantName")} />
                {errors.applicantName?.message ? <FieldHelp className="text-red-600">{errors.applicantName.message}</FieldHelp> : null}
              </div>
              <div>
                <FieldLabel htmlFor="birth">생년월일</FieldLabel>
                <Input id="birth" type="date" {...register("birth")} />
                {errors.birth?.message ? <FieldHelp className="text-red-600">{errors.birth.message}</FieldHelp> : null}
              </div>
              <div>
                <FieldLabel htmlFor="phone">연락처</FieldLabel>
                <Input id="phone" placeholder="예: 010-1234-5678" {...register("phone")} />
                {errors.phone?.message ? <FieldHelp className="text-red-600">{errors.phone.message}</FieldHelp> : null}
              </div>
              <div>
                <FieldLabel htmlFor="email">이메일</FieldLabel>
                <Input id="email" type="email" placeholder="example@domain.com" {...register("email")} />
                {errors.email?.message ? <FieldHelp className="text-red-600">{errors.email.message}</FieldHelp> : null}
              </div>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <FieldLabel htmlFor="orgName">단체명</FieldLabel>
                <Input id="orgName" placeholder="개인 신청 시 '개인'으로 입력" {...register("orgName")} />
                {errors.orgName?.message ? <FieldHelp className="text-red-600">{errors.orgName.message}</FieldHelp> : null}
              </div>

              <div>
                <FieldLabel htmlFor="address">주소</FieldLabel>
                <Input id="address" placeholder="예: 서울시 서초구 …" {...register("address")} />
                {errors.address?.message ? <FieldHelp className="text-red-600">{errors.address.message}</FieldHelp> : null}
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="text-base font-semibold text-gray-900">동의 및 서약</h2>
            <p className="mt-1 text-sm text-gray-600">필수 항목입니다.</p>

            <div className="mt-4 space-y-3">
              {/* privacyAgree는 모달 동의/비동의로만 결정 (ApplyClient 패턴 통일) */}
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

              {/* pledgeAgree는 모달 동의/비동의로만 결정 (ApplyClient 패턴 통일) */}
              <div className="pt-1" />
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
              <FieldHelp className="mt-1">* 체크 시 서약서 내용을 확인한 후 동의 여부가 반영됩니다.</FieldHelp>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <FieldLabel htmlFor="pledgeDate">서약일</FieldLabel>
                  <input type="hidden" {...register("pledgeDate")} />
                  <Input id="pledgeDate" type="text" readOnly value={fixedPledgeDate} className="bg-slate-50 text-slate-700" />
                </div>
                <div>
                  <FieldLabel htmlFor="pledgeName">서약자 성명</FieldLabel>
                  <Input id="pledgeName" {...register("pledgeName")} />
                  {errors.pledgeName?.message ? <FieldHelp className="text-red-600">{errors.pledgeName.message}</FieldHelp> : null}
                </div>
              </div>
            </div>
          </Card>

          {batchError ? <Notice variant="warn"><pre className="whitespace-pre-wrap text-sm">{batchError}</pre></Notice> : null}
          {error ? <Notice variant="danger">{error}</Notice> : null}

          {/* 갤러리: 장비/할인 UI 제거(완전 차단) */}
          <input type="hidden" value="false" {...register("laptop")} />
          <input type="hidden" value="false" {...register("projector")} />
          <input type="hidden" value="false" {...register("audio")} />

          <div className="flex items-center justify-between gap-3">
            <Link href="/space?category=gallery" className="text-sm font-medium text-gray-700 hover:underline">
              ← 공간 선택으로 돌아가기
            </Link>
            <Button type="submit" disabled={submitting || !exhibitionTitle || sessionCount === 0}>
              {submitting ? "등록 중…" : "신청하기"}
            </Button>
          </div>

          <p className="text-xs text-gray-500">신청 후 담당자 검토를 거쳐 승인/반려 결과를 이메일로 안내드립니다.</p>
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
          roomId="gallery"
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
                  <tr><td className="px-3 py-2">평일 (월~금)</td><td className="px-3 py-2">09:00 ~ 18:00</td></tr>
                  <tr><td className="px-3 py-2">야간 (화요일)</td><td className="px-3 py-2">18:00 ~ 20:00</td></tr>
                  <tr><td className="px-3 py-2">토요일</td><td className="px-3 py-2">09:00 ~ 13:00</td></tr>
                  <tr><td className="px-3 py-2 text-slate-500">일요일·공휴일</td><td className="px-3 py-2 text-slate-500">휴관</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 대관비 */}
          <div>
            <h4 className="font-semibold mb-2">대관비 기준 (1일 기준)</h4>
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
