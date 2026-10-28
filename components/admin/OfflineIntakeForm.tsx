"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import Button from "@/components/ui/Button";
import MissingFieldsSummary, { type MissingField } from "@/components/apply/MissingFieldsSummary";
import { AUTH_STORE_BUSY_CODE, AUTH_STORE_BUSY_MESSAGE } from "@/lib/adminConstants";
import Card from "@/components/ui/Card";
import { FieldHelp, FieldLabel, Input, Select, Textarea } from "@/components/ui/Field";
import { GALLERY_FEE_KRW, GALLERY_RULES } from "@/lib/constants";
import { INTAKE_CHANNEL_OPTIONS } from "@/lib/labels";
import { addDays, dayOfWeek, dowLabel, isYmd, todayYmdKst } from "@/lib/rules/ymd";

/* ───────── 날짜 유틸은 lib/rules/ymd.ts 1벌 (3-3) ───────── */
const dow = dayOfWeek;
/** 오늘 — 서버(접수일 검사 todayYmdSeoul)와 같은 KST 기준 */
const todayYmd = todayYmdKst;
function teardownDeadline(ymd: string) {
  return dow(ymd) === 6 ? GALLERY_RULES.TEARDOWN_DEADLINE.SATURDAY : GALLERY_RULES.TEARDOWN_DEADLINE.WEEKDAY;
}
function prepAfterStart(ymd: string) {
  return dow(ymd) === 6 ? GALLERY_RULES.PREP_AFTER.SATURDAY : GALLERY_RULES.PREP_AFTER.WEEKDAY;
}
function timeOptions(from: string, to: string) {
  const [fh, fm] = from.split(":").map((v) => parseInt(v, 10));
  const [th, tm] = to.split(":").map((v) => parseInt(v, 10));
  const out: string[] = [];
  for (let t = fh * 60 + fm; t <= th * 60 + tm; t += 30) {
    out.push(`${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`);
  }
  return out;
}

type MonthInfo = { booked: Set<string>; ends: Set<string>; holidays: Map<string, string> };

export default function OfflineIntakeForm({ category }: { category: string }) {
  const router = useRouter();
  const today = todayYmd();

  // 접수 정보
  const [intakeChannel, setIntakeChannel] = useState<string>("visit");
  const [appliedAt, setAppliedAt] = useState<string>(today);
  const [intakeNote, setIntakeNote] = useState<string>("");

  // 신청자
  const [applicantName, setApplicantName] = useState("");
  const [birth, setBirth] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [orgName, setOrgName] = useState("개인");
  const [headcount, setHeadcount] = useState("1");

  // 전시
  const [exhibitionTitle, setExhibitionTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [galleryPrepDate, setGalleryPrepDate] = useState("");
  const [prepTouched, setPrepTouched] = useState(false);
  const [galleryRemovalTime, setGalleryRemovalTime] = useState("");
  const [exhibitionPurpose, setExhibitionPurpose] = useState("");
  const [genreContent, setGenreContent] = useState("");
  const [awarenessPath, setAwarenessPath] = useState("");
  const [specialNotes, setSpecialNotes] = useState("");

  // 서면 동의
  const [privacyPaper, setPrivacyPaper] = useState(false);
  const [pledgePaper, setPledgePaper] = useState(false);
  const [pledgeDate, setPledgeDate] = useState(today);
  const [pledgeName, setPledgeName] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>("");
  const [issues, setIssues] = useState<string[]>([]);

  // 서약일·서약자 기본값 = 접수일·신청자명(직접 고치면 유지)
  const [pledgeDateTouched, setPledgeDateTouched] = useState(false);
  const [pledgeNameTouched, setPledgeNameTouched] = useState(false);
  useEffect(() => { if (!pledgeDateTouched) setPledgeDate(appliedAt); }, [appliedAt, pledgeDateTouched]);
  useEffect(() => { if (!pledgeNameTouched) setPledgeName(applicantName); }, [applicantName, pledgeNameTouched]);

  // 월별 예약 현황(공휴일·마감·철거일) — 준비일 전월부터 종료월까지
  const [monthInfo, setMonthInfo] = useState<Map<string, MonthInfo>>(new Map());
  const monthsNeeded = useMemo(() => {
    if (!isYmd(startDate)) return [] as string[];
    const set = new Set<string>();
    set.add(addDays(startDate, -14).slice(0, 7));
    set.add(startDate.slice(0, 7));
    if (isYmd(endDate)) set.add(endDate.slice(0, 7));
    return Array.from(set);
  }, [startDate, endDate]);
  useEffect(() => {
    let alive = true;
    const missing = monthsNeeded.filter((m) => !monthInfo.has(m));
    if (!missing.length) return;
    Promise.all(
      missing.map((m) =>
        fetch(`/api/booked-dates?roomId=gallery&month=${m}`)
          .then((r) => r.json())
          .then((data) => {
            const info: MonthInfo = { booked: new Set(), ends: new Set(), holidays: new Map() };
            if (data?.ok) {
              for (const d of data.bookedDates ?? []) info.booked.add(d);
              for (const d of data.exhibitionEndDates ?? []) info.ends.add(d);
              for (const h of data.holidays ?? []) info.holidays.set(h.date, h.name);
            }
            return [m, info] as const;
          })
          .catch(() => [m, { booked: new Set<string>(), ends: new Set<string>(), holidays: new Map<string, string>() }] as const)
      )
    ).then((entries) => {
      if (!alive) return;
      setMonthInfo((prev) => {
        const next = new Map(prev);
        for (const [m, info] of entries) next.set(m, info);
        return next;
      });
    });
    return () => { alive = false; };
  }, [monthsNeeded, monthInfo]);

  const merged = useMemo(() => {
    const booked = new Set<string>();
    const ends = new Set<string>();
    const holidays = new Map<string, string>();
    for (const info of monthInfo.values()) {
      for (const d of info.booked) booked.add(d);
      for (const d of info.ends) ends.add(d);
      for (const [d, n] of info.holidays) holidays.set(d, n);
    }
    return { booked, ends, holidays };
  }, [monthInfo]);

  // 전시일수·이용료 (일요일·공휴일 제외 · 평일 20,000 · 토 10,000 · 준비일 무료)
  const fee = useMemo(() => {
    if (!isYmd(startDate) || !isYmd(endDate) || endDate < startDate) return { weekdays: 0, saturdays: 0, total: 0, conflicts: [] as string[] };
    let weekdays = 0, saturdays = 0;
    const conflicts: string[] = [];
    let cur = startDate, guard = 0;
    while (cur <= endDate && guard++ < 400) {
      const d = dow(cur);
      if (d !== 0 && !merged.holidays.has(cur)) {
        if (d === 6) saturdays++; else weekdays++;
        if (merged.booked.has(cur)) conflicts.push(cur);
      }
      cur = addDays(cur, 1);
    }
    return { weekdays, saturdays, total: weekdays * GALLERY_FEE_KRW.WEEKDAY + saturdays * GALLERY_FEE_KRW.SATURDAY, conflicts };
  }, [startDate, endDate, merged]);

  // 준비일 후보: 시작 직전 운영일부터 7개 — 마감일(전시 중간)을 만나면 그 이전은 제외, 철거일은 "17:00 이후"로 허용
  const prepCandidates = useMemo(() => {
    if (!isYmd(startDate)) return [] as { date: string; after: boolean }[];
    const out: { date: string; after: boolean }[] = [];
    let cur = addDays(startDate, -1), guard = 0;
    while (out.length < 7 && guard++ < 30) {
      if (dow(cur) !== 0 && !merged.holidays.has(cur)) {
        if (merged.booked.has(cur)) {
          if (merged.ends.has(cur)) { out.push({ date: cur, after: true }); cur = addDays(cur, -1); continue; }
          break;
        }
        out.push({ date: cur, after: false });
      }
      cur = addDays(cur, -1);
    }
    return out;
  }, [startDate, merged]);
  useEffect(() => {
    if (prepTouched && (galleryPrepDate === "" || prepCandidates.some((c) => c.date === galleryPrepDate))) return;
    setGalleryPrepDate(prepCandidates[0]?.date ?? "");
  }, [prepCandidates, galleryPrepDate, prepTouched]);
  const prepAfter = prepCandidates.find((c) => c.date === galleryPrepDate)?.after ?? false;

  // 철수 시간 옵션: 종료일 요일별 기한(평일 16:00 · 토 11:00)
  const removalOptions = useMemo(() => (isYmd(endDate) ? timeOptions("09:00", teardownDeadline(endDate)) : []), [endDate]);
  useEffect(() => {
    if (galleryRemovalTime && !removalOptions.includes(galleryRemovalTime)) setGalleryRemovalTime("");
  }, [removalOptions, galleryRemovalTime]);

  const canSubmit =
    !submitting &&
    applicantName.trim().length >= 2 && isYmd(birth) && address.trim().length >= 2 && phone.trim().length >= 9 && email.includes("@") &&
    exhibitionTitle.trim().length > 0 && isYmd(startDate) && isYmd(endDate) && endDate >= startDate && !!galleryRemovalTime &&
    isYmd(appliedAt) && privacyPaper && pledgePaper && isYmd(pledgeDate) && pledgeName.trim().length >= 2;

  /** ③-D 서면 등록 비활성 이유 — MissingFieldsSummary와 같은 형식 */
  const missingFields: MissingField[] = [];
  if (applicantName.trim().length < 2) missingFields.push({ key: "applicantName", label: "성명", targetId: "applicantName" });
  if (!isYmd(birth)) missingFields.push({ key: "birth", label: "생년월일", targetId: "birth" });
  if (address.trim().length < 2) missingFields.push({ key: "address", label: "주소", targetId: "address" });
  if (phone.trim().length < 9) missingFields.push({ key: "phone", label: "연락처", targetId: "phone" });
  if (!email.includes("@")) missingFields.push({ key: "email", label: "이메일", targetId: "email" });
  if (exhibitionTitle.trim().length === 0) missingFields.push({ key: "exhibitionTitle", label: "전시명", targetId: "exhibitionTitle" });
  if (!isYmd(startDate) || !isYmd(endDate) || endDate < startDate) missingFields.push({ key: "period", label: "전시 기간", targetId: isYmd(startDate) ? "endDate" : "startDate" });
  if (!galleryRemovalTime) missingFields.push({ key: "galleryRemovalTime", label: "철수 시간", targetId: isYmd(endDate) ? "galleryRemovalTime" : "endDate" });
  if (!isYmd(appliedAt)) missingFields.push({ key: "appliedAt", label: "접수일", targetId: "appliedAt" });
  if (!privacyPaper) missingFields.push({ key: "privacyPaper", label: "개인정보 동의서 확인", targetId: "privacyPaper" });
  if (!pledgePaper) missingFields.push({ key: "pledgePaper", label: "서약서 확인", targetId: "pledgePaper" });
  if (!isYmd(pledgeDate)) missingFields.push({ key: "pledgeDate", label: "서약일", targetId: "pledgeDate" });
  if (pledgeName.trim().length < 2) missingFields.push({ key: "pledgeName", label: "서약자 성명", targetId: "pledgeName" });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true); setError(""); setIssues([]);
    try {
      const purposeLines = [
        `전시명: ${exhibitionTitle.trim()}`,
        exhibitionPurpose.trim() ? `전시 목적: ${exhibitionPurpose.trim()}` : "",
        genreContent.trim() ? `장르·내용: ${genreContent.trim()}` : "",
        awarenessPath.trim() ? `인지 경로: ${awarenessPath.trim()}` : "",
        specialNotes.trim() ? `특이사항: ${specialNotes.trim()}` : "",
        galleryPrepDate ? `준비일: ${galleryPrepDate}${prepAfter ? ` (앞 전시 철거 후 ${prepAfterStart(galleryPrepDate)} 이후)` : ""}` : "준비일: 없음",
        `철수 예정: 종료일 ${galleryRemovalTime}`,
        `접수: 서면(${INTAKE_CHANNEL_OPTIONS.find((o) => o.value === intakeChannel)?.label ?? intakeChannel}) ${appliedAt}`,
      ].filter(Boolean).join("\n");

      const fd = new FormData();
      fd.set("intake", "offline");
      fd.set("intakeChannel", intakeChannel);
      fd.set("appliedAt", appliedAt);
      fd.set("intakeNote", intakeNote.trim());
      fd.set("roomId", "gallery");
      fd.set("date", startDate);
      fd.set("startTime", "09:00");
      fd.set("endTime", dow(startDate) === 6 ? "13:00" : "18:00");
      fd.set("applicantName", applicantName.trim());
      fd.set("birth", birth);
      fd.set("address", address.trim());
      fd.set("phone", phone.trim());
      fd.set("email", email.trim());
      fd.set("orgName", orgName.trim() || "개인");
      fd.set("headcount", headcount || "1");
      fd.set("startDate", startDate);
      fd.set("endDate", endDate);
      fd.set("exhibitionTitle", exhibitionTitle.trim());
      fd.set("exhibitionPurpose", exhibitionPurpose.trim());
      fd.set("genreContent", genreContent.trim());
      fd.set("awarenessPath", awarenessPath.trim());
      fd.set("specialNotes", specialNotes.trim());
      fd.set("galleryRemovalTime", galleryRemovalTime);
      fd.set("galleryPrepDate", galleryPrepDate);
      fd.set("purpose", purposeLines);
      fd.set("privacyAgree", "true");
      fd.set("pledgeAgree", "true");
      fd.set("pledgeDate", pledgeDate);
      fd.set("pledgeName", pledgeName.trim());
      for (const f of files) fd.append("attachments", f);

      const res = await fetch("/api/requests", { method: "POST", body: fd, credentials: "include" });
      // R3: 접속 확인 지연(503)은 로그인으로 보내지 않고 G-1 문구
      if (res.status === 503) {
        const b = await res.clone().json().catch(() => null);
        if (b?.code === AUTH_STORE_BUSY_CODE) {
          setError(AUTH_STORE_BUSY_MESSAGE);
          return;
        }
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setError(data?.message ?? `등록에 실패했습니다. (${res.status})`);
        if (Array.isArray(data?.issues)) {
          setIssues(data.issues.map((i: { date?: string; message?: string }) => `${i.date ?? ""} ${i.message ?? ""}`.trim()));
        }
        return;
      }
      router.push(`/admin/requests/${encodeURIComponent(data.requestId)}?category=${encodeURIComponent(category)}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "등록 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  const sectionTitle = "mb-3 text-sm font-bold text-slate-800";
  const grid2 = "grid grid-cols-1 gap-4 md:grid-cols-2";

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {/* 접수 정보 */}
      <Card>
        <h2 className={sectionTitle}>1. 접수 정보 (서면)</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <FieldLabel htmlFor="intakeChannel">접수 경로 *</FieldLabel>
            <Select id="intakeChannel" value={intakeChannel} onChange={(e) => setIntakeChannel(e.target.value)}>
              {INTAKE_CHANNEL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </div>
          <div>
            <FieldLabel htmlFor="appliedAt">신청(접수)일 *</FieldLabel>
            <Input id="appliedAt" type="date" max={today} value={appliedAt} onChange={(e) => setAppliedAt(e.target.value)} />
            <FieldHelp>종이 신청서에 적힌 신청일. 신청서 출력물과 기안 데이터의 신청일자로 쓰입니다.</FieldHelp>
          </div>
          <div>
            <FieldLabel htmlFor="intakeNote">등록 메모</FieldLabel>
            <Input id="intakeNote" value={intakeNote} onChange={(e) => setIntakeNote(e.target.value)} placeholder="예: 원본 서명본 시설총무 보관" maxLength={200} />
          </div>
        </div>
      </Card>

      {/* 신청자 */}
      <Card>
        <h2 className={sectionTitle}>2. 신청자 정보</h2>
        <div className={grid2}>
          <div>
            <FieldLabel htmlFor="applicantName">성명 *</FieldLabel>
            <Input id="applicantName" value={applicantName} onChange={(e) => setApplicantName(e.target.value)} maxLength={30} />
          </div>
          <div>
            <FieldLabel htmlFor="birth">생년월일 *</FieldLabel>
            <Input id="birth" type="date" value={birth} onChange={(e) => setBirth(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <FieldLabel htmlFor="address">주소 *</FieldLabel>
            <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={200} placeholder="서초구민 우선 승인 — 구 단위까지 확인" />
          </div>
          <div>
            <FieldLabel htmlFor="phone">연락처 *</FieldLabel>
            <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="010-0000-0000" maxLength={20} />
          </div>
          <div>
            <FieldLabel htmlFor="email">이메일 *</FieldLabel>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <FieldHelp>승인·결제 안내 메일 발송에 쓰입니다. 접수 확인 메일은 보내지 않습니다.</FieldHelp>
          </div>
          <div>
            <FieldLabel htmlFor="orgName">단체명</FieldLabel>
            <Input id="orgName" value={orgName} onChange={(e) => setOrgName(e.target.value)} maxLength={80} placeholder="개인 전시면 '개인'" />
          </div>
          <div>
            <FieldLabel htmlFor="headcount">참여 인원</FieldLabel>
            <Input id="headcount" type="number" min={1} max={500} value={headcount} onChange={(e) => setHeadcount(e.target.value)} />
          </div>
        </div>
      </Card>

      {/* 전시 */}
      <Card>
        <h2 className={sectionTitle}>3. 전시 정보</h2>
        <div className={grid2}>
          <div className="md:col-span-2">
            <FieldLabel htmlFor="exhibitionTitle">전시명 *</FieldLabel>
            <Input id="exhibitionTitle" value={exhibitionTitle} onChange={(e) => setExhibitionTitle(e.target.value)} maxLength={80} />
          </div>
          <div>
            <FieldLabel htmlFor="startDate">전시 시작일 *</FieldLabel>
            <Input id="startDate" type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPrepTouched(false); }} />
          </div>
          <div>
            <FieldLabel htmlFor="endDate">전시 종료일 *</FieldLabel>
            <Input id="endDate" type="date" min={startDate || undefined} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            <FieldHelp>일요일·공휴일은 자동 제외 · 최대 30일</FieldHelp>
          </div>
          <div>
            <FieldLabel htmlFor="galleryPrepDate">준비(세팅)일 — 무료</FieldLabel>
            <Select id="galleryPrepDate" value={galleryPrepDate} onChange={(e) => { setGalleryPrepDate(e.target.value); setPrepTouched(true); }} disabled={!isYmd(startDate)}>
              {prepCandidates.map((c) => (
                <option key={c.date} value={c.date}>
                  {c.date} ({dowLabel(c.date)}){c.after ? ` · 앞 전시 철거 후 ${prepAfterStart(c.date)} 이후` : ""}
                </option>
              ))}
              <option value="">준비일 없음</option>
            </Select>
            {prepAfter ? <FieldHelp className="text-emerald-800">앞 전시가 있는 날이라 철거 후 {prepAfterStart(galleryPrepDate)}부터 세팅 가능합니다.</FieldHelp> : null}
          </div>
          <div>
            <FieldLabel htmlFor="galleryRemovalTime">철수 시간 * {isYmd(endDate) ? `(${dowLabel(endDate)} · ${teardownDeadline(endDate)} 이전)` : ""}</FieldLabel>
            <Select id="galleryRemovalTime" value={galleryRemovalTime} onChange={(e) => setGalleryRemovalTime(e.target.value)} disabled={!isYmd(endDate)}>
              <option value="">선택해 주세요</option>
              {removalOptions.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
            <FieldHelp>규정: 전시 마지막 날 평일 16:00 · 토요일 11:00 이전 철거 완료</FieldHelp>
          </div>
          <div className="md:col-span-2">
            <FieldLabel htmlFor="exhibitionPurpose">전시 목적</FieldLabel>
            <Textarea id="exhibitionPurpose" rows={2} value={exhibitionPurpose} onChange={(e) => setExhibitionPurpose(e.target.value)} maxLength={1000} />
          </div>
          <div className="md:col-span-2">
            <FieldLabel htmlFor="genreContent">장르 및 전시 내용</FieldLabel>
            <Textarea id="genreContent" rows={2} value={genreContent} onChange={(e) => setGenreContent(e.target.value)} maxLength={1000} placeholder="예: 서양화 / 인물화 위주 약 10~15점" />
          </div>
          <div>
            <FieldLabel htmlFor="awarenessPath">인지 경로</FieldLabel>
            <Input id="awarenessPath" value={awarenessPath} onChange={(e) => setAwarenessPath(e.target.value)} maxLength={200} placeholder="예: 기타(수강생)" />
          </div>
          <div>
            <FieldLabel htmlFor="specialNotes">특이사항</FieldLabel>
            <Input id="specialNotes" value={specialNotes} onChange={(e) => setSpecialNotes(e.target.value)} maxLength={1000} />
          </div>
        </div>

        {/* 요금 미리보기 */}
        {isYmd(startDate) && isYmd(endDate) && endDate >= startDate && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-slate-700">
              <span>평일 {fee.weekdays}일 × {GALLERY_FEE_KRW.WEEKDAY.toLocaleString()}원</span>
              <span>토요일 {fee.saturdays}일 × {GALLERY_FEE_KRW.SATURDAY.toLocaleString()}원</span>
              <span className="font-bold text-slate-900">예상 이용료 {fee.total.toLocaleString()}원</span>
              <span className="text-xs text-slate-500">(서버에서 다시 계산해 저장)</span>
            </div>
            {fee.conflicts.length > 0 && (
              <p className="mt-2 text-xs font-semibold text-red-600">
                이미 마감된 날짜가 기간에 포함돼 있습니다: {fee.conflicts.join(", ")} — 등록 시 일정 충돌로 거부됩니다.
              </p>
            )}
          </div>
        )}
      </Card>

      {/* 서면 동의·첨부 */}
      <Card>
        <h2 className={sectionTitle}>4. 서면 동의 확인 · 원본 첨부</h2>
        <div className="space-y-2 text-sm text-slate-800">
          <label className="flex items-start gap-2">
            <input id="privacyPaper" type="checkbox" className="mt-1 h-5 w-5" checked={privacyPaper} onChange={(e) => setPrivacyPaper(e.target.checked)} />
            <span>종이 신청서의 <b>개인정보 수집·이용 동의</b>란에 신청자가 동의 표시(체크·서명)한 것을 확인했습니다. *</span>
          </label>
          <label className="flex items-start gap-2">
            <input id="pledgePaper" type="checkbox" className="mt-1 h-5 w-5" checked={pledgePaper} onChange={(e) => setPledgePaper(e.target.checked)} />
            <span>신청자가 서명한 <b>전시 이용규정 서약서</b>를 받았고 원본을 센터에서 보관합니다. *</span>
          </label>
        </div>
        <div className={`${grid2} mt-4`}>
          <div>
            <FieldLabel htmlFor="pledgeDate">서약일 *</FieldLabel>
            <Input id="pledgeDate" type="date" max={today} value={pledgeDate} onChange={(e) => { setPledgeDate(e.target.value); setPledgeDateTouched(true); }} />
          </div>
          <div>
            <FieldLabel htmlFor="pledgeName">서약자 성명 *</FieldLabel>
            <Input id="pledgeName" value={pledgeName} onChange={(e) => { setPledgeName(e.target.value); setPledgeNameTouched(true); }} maxLength={30} />
          </div>
          <div className="md:col-span-2">
            <FieldLabel htmlFor="attachments">신청서·서약서 스캔본 첨부 (선택 · PDF/JPG/PNG · 건당 10MB)</FieldLabel>
            <Input id="attachments" type="file" multiple accept="application/pdf,image/jpeg,image/png" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
            {files.length > 0 && <FieldHelp>{files.map((f) => f.name).join(", ")}</FieldHelp>}
          </div>
        </div>
      </Card>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <p className="font-semibold">{error}</p>
          {issues.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-xs">
              {issues.map((i, idx) => <li key={idx}>{i}</li>)}
            </ul>
          )}
        </div>
      )}

      {!submitting && missingFields.length > 0 ? <MissingFieldsSummary items={missingFields} /> : null}
      <div className="flex flex-wrap items-center justify-end gap-3">
        <span className="text-[13px] text-slate-500">등록 후 상세 화면에서 승인 처리와 안내 메일을 진행합니다.</span>
        <Button type="submit" variant="primary" disabled={!canSubmit}>
          {submitting ? "등록 중…" : "서면 신청 등록"}
        </Button>
      </div>
    </form>
  );
}
