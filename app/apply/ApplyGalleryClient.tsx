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
    else sessions.push({ date: cur, startTime: "10:00", endTime: "18:00" });
    cur = addDays(cur, 1);
  }

  // 준비일 세션은 전시 시작일과 겹치지 않도록 별도 추가(일요일 제외는 이미 처리됨)
  if (prepDate && prepDate < startDate) {
    const dow = dayOfWeekLocal(prepDate);
    if (dow !== 0) {
      if (dow === 6) sessions.unshift({ date: prepDate, startTime: "09:00", endTime: "13:00" });
      else sessions.unshift({ date: prepDate, startTime: "10:00", endTime: "18:00" });
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
      startTime: "10:00",
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

      // purpose는 전시 정보 필드에서 자동 구성(useEffect로 동기화)
      purpose: "전시 신청",
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

  // purpose를 전시 정보 필드에서 자동 구성 (스키마 validation 통과를 위해)
  useEffect(() => {
    const purpose = composePurpose({ exhibitionPurpose, genreContent, awarenessPath, specialNotes });
    setValue("purpose", purpose, { shouldValidate: true, shouldDirty: true });
  }, [exhibitionPurpose, genreContent, awarenessPath, specialNotes, setValue]);

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
    } else {
      setValue("startTime", "10:00", { shouldValidate: true, shouldDirty: true });
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
            <div className="text-sm text-gray-700">평일 10:00~18:00 / 토 09:00~13:00 / 일 휴관</div>
            <div className="text-sm text-gray-700">일요일은 자동 제외됩니다. 공휴일은 자동 제외되지 않으며(Blocks로 처리), 준비(세팅)일 1일은 무료로 포함됩니다.</div>
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
                <Link href="/space?category=gallery" className="text-sm font-medium text-blue-700 hover:underline">
                  갤러리 안내 보기
                </Link>
              </div>
              {hasSundayInRange ? (
                <p className="mt-2 text-xs text-gray-600">선택한 기간에 일요일이 포함되어 있으면 자동으로 제외됩니다.</p>
              ) : null}
            </div>
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
                <FieldLabel htmlFor="exhibitionPurpose">전시목적</FieldLabel>
                <Textarea id="exhibitionPurpose" rows={3} placeholder="예: 지역 주민 대상 문화예술 공유" {...register("exhibitionPurpose")} />
                {errors.exhibitionPurpose?.message ? <FieldHelp className="text-red-600">{errors.exhibitionPurpose.message}</FieldHelp> : null}
              </div>

              <div>
                <FieldLabel htmlFor="genreContent">장르·내용</FieldLabel>
                <Textarea id="genreContent" rows={3} placeholder="예: 사진/회화/공예 등, 주요 전시 내용" {...register("genreContent")} />
                {errors.genreContent?.message ? <FieldHelp className="text-red-600">{errors.genreContent.message}</FieldHelp> : null}
              </div>

              <div>
                <FieldLabel htmlFor="awarenessPath">인지경로</FieldLabel>
                <Input id="awarenessPath" placeholder="예: 홈페이지, SNS, 지인 추천" {...register("awarenessPath")} />
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

          <div className="space-y-2">
            {sessionCount === 0 && (startDate || endDate) ? (
              <Notice variant="warn">전시 기간(시작일·종료일)을 올바르게 입력해 주세요. 회차가 0회이면 신청할 수 없습니다.</Notice>
            ) : null}
            {sessionCount === 0 && !startDate && !endDate ? (
              <Notice variant="warn">전시 기간(시작일·종료일)을 먼저 선택해 주세요.</Notice>
            ) : null}
            <div className="flex items-center justify-between gap-3">
              <Link href="/space?category=gallery" className="text-sm font-medium text-gray-700 hover:underline">
                ← 공간 선택으로 돌아가기
              </Link>
              <Button type="submit" disabled={submitting || !exhibitionTitle || sessionCount === 0}>
                {submitting ? "등록 중…" : "신청하기"}
              </Button>
            </div>
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
      </main>
    </div>
  );
}
