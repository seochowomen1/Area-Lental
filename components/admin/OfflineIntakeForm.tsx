"use client";

/**
 * 관리자 서면 신청 등록 (2026-10-19 · 3-4 블록 공유 · ⑧ Q6 강의실·E-스튜디오까지)
 * - 맨 위 접수 방법·접수일·메모 → 신청자(ApplicantFields · 생년월일 8자리) → 일정(편집) → 이용/전시 정보(공용 블록) → 서면 동의 확인
 * - 저장 행 형식은 그대로: 갤러리 purpose 합치기(전시명·접수 줄 포함)는 3-4 전 서면 등록과 같고,
 *   강의실·E-스튜디오는 온라인 신청과 같은 키(buildLectureRaw) + 서면 메타.
 */
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { FieldHelp, FieldLabel, Input, Select } from "@/components/ui/Field";
import MissingFieldsSummary, { type MissingField } from "@/components/apply/MissingFieldsSummary";
import ApplicantFields from "@/components/apply/ApplicantFields";
import ExhibitFields from "@/components/apply/ExhibitFields";
import EquipmentFields from "@/components/apply/EquipmentFields";
import FeeSummary, { lectureFeeLines } from "@/components/apply/FeeSummary";
import { OrgField, UsageFields } from "@/components/apply/UsageFields";
import { A_INPUT, AField } from "@/components/apply/ui";
import OfflineGallerySchedulePart, { prepAfterStart, type OfflineGallerySchedule } from "@/components/admin/OfflineGallerySchedule";
import OfflineLectureSchedule, { offlineIssues } from "@/components/admin/OfflineLectureSchedule";
import { AUTH_STORE_BUSY_CODE, AUTH_STORE_BUSY_MESSAGE } from "@/lib/adminConstants";
import { INTAKE_CHANNEL_OPTIONS } from "@/lib/labels";
import { getRoomsByCategory } from "@/lib/space";
import { isYmd, todayYmdKst } from "@/lib/rules/ymd";
import { planLecture } from "@/lib/rules/lecturePlan";
import { useBookedMonths } from "@/lib/client/useBookedDates";
import {
  applyKindOf,
  buildGalleryRaw,
  buildLectureRaw,
  defaultApplyValues,
  FIELD_LABELS,
  LECTURE_EQUIP_KEYS,
  orderedErrorKeys,
  rawToFormData,
  STUDIO_EQUIP_KEYS,
  validateApply,
  type ApplyErrors,
  type ApplyFieldKey,
  type ApplyFormValues,
} from "@/lib/apply/form";
import type { ScheduleSession } from "@/lib/apply/schedule";

export default function OfflineIntakeForm({ category }: { category: "gallery" | "lecture" | "studio" }) {
  const router = useRouter();
  const today = todayYmdKst();
  const rooms = useMemo(() => getRoomsByCategory(category), [category]);
  const [roomId, setRoomId] = useState(rooms[0]?.id ?? "gallery");
  const kind = applyKindOf(roomId);
  const isGallery = kind === "gallery";
  const isStudio = kind === "studio";
  const equipKeys = isStudio ? STUDIO_EQUIP_KEYS : LECTURE_EQUIP_KEYS;

  // 접수 정보
  const [intakeChannel, setIntakeChannel] = useState<string>("visit");
  const [appliedAt, setAppliedAt] = useState<string>(today);
  const [intakeNote, setIntakeNote] = useState<string>("");

  // 공용 블록 값(갤러리 단체 이름 기본 "개인" — 3-4 전과 같음)
  const [values, setValues] = useState<ApplyFormValues>(() => ({ ...defaultApplyValues(rooms[0]?.id ?? "gallery"), orgName: category === "gallery" ? "개인" : "" }));
  const patch = useCallback((p: Partial<ApplyFormValues>) => setValues((v) => ({ ...v, ...p })), []);

  // 일정
  const [gallery, setGallery] = useState<OfflineGallerySchedule>({ startDate: "", endDate: "", prepDate: "", prepAfter: false });
  const [sessions, setSessions] = useState<ScheduleSession[]>([{ date: "", startTime: "", endTime: "" }]);
  const complete = sessions.filter((s) => isYmd(s.date) && s.startTime && s.endTime);
  const bm = useBookedMonths(roomId, isGallery ? [] : Array.from(new Set(complete.map((s) => s.date.slice(0, 7)))));
  const plan = useMemo(
    () =>
      planLecture({
        roomId,
        sessions: complete,
        headcount: isStudio && Number.isFinite(parseInt(values.headcount, 10)) ? parseInt(values.headcount, 10) : undefined,
        equipment: Object.fromEntries(equipKeys.map((k) => [k, values.equipment[k]])),
        holidays: bm.holidaySet,
        holidayNames: bm.holidayNames,
        todayYmd: today,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roomId, JSON.stringify(complete), isStudio, values.headcount, values.equipment, equipKeys, bm.holidaySet, bm.holidayNames, today]
  );

  // 서면 동의
  const [privacyPaper, setPrivacyPaper] = useState(false);
  const [pledgePaper, setPledgePaper] = useState(false);
  const [pledgeDate, setPledgeDate] = useState("");
  const [pledgeName, setPledgeName] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [issues, setIssues] = useState<string[]>([]);
  const [tried, setTried] = useState(false);

  const effPledgeDate = pledgeDate || appliedAt;
  const effPledgeName = (pledgeName || values.applicantName).trim();

  function buildRaw(): Record<string, string> {
    if (isGallery) {
      const r = buildGalleryRaw(values, { startDate: gallery.startDate, endDate: gallery.endDate, prepDate: gallery.prepDate, sessions: [], pledgeDate: effPledgeDate });
      // 3-4 전 서면 등록의 purpose·시간·인원 형식 그대로
      r.endTime = new Date(`${gallery.startDate}T00:00:00Z`).getUTCDay() === 6 ? "13:00" : "18:00";
      r.headcount = values.headcount || "1";
      r.orgName = values.orgName.trim() || "개인";
      r.awarenessPath = values.awarenessPath.trim();
      r.purpose = [
        `전시명: ${values.exhibitionTitle.trim()}`,
        values.exhibitionPurpose.trim() ? `전시 목적: ${values.exhibitionPurpose.trim()}` : "",
        values.genreContent.trim() ? `장르·내용: ${values.genreContent.trim()}` : "",
        values.awarenessPath.trim() ? `인지 경로: ${values.awarenessPath.trim()}` : "",
        values.specialNotes.trim() ? `특이사항: ${values.specialNotes.trim()}` : "",
        gallery.prepDate ? `준비일: ${gallery.prepDate}${gallery.prepAfter ? ` (앞 전시 철거 후 ${prepAfterStart(gallery.prepDate)} 이후)` : ""}` : "준비일: 없음",
        `철수 예정: 종료일 ${values.galleryRemovalTime}`,
        `접수: 서면(${INTAKE_CHANNEL_OPTIONS.find((o) => o.value === intakeChannel)?.label ?? intakeChannel}) ${appliedAt}`,
      ]
        .filter(Boolean)
        .join("\n");
      r.pledgeName = effPledgeName;
      return r;
    }
    const r = buildLectureRaw(values, { roomId, sessions: complete, pledgeDate: effPledgeDate });
    r.pledgeName = effPledgeName;
    return r;
  }

  /** 칸 오류 + 빠진 항목(처음 [등록]을 누른 뒤부터 입력할 때마다 다시 계산) */
  function compute(): { errs: ApplyErrors; items: MissingField[] } {
    const r = buildRaw();
    const v = { ...values, privacyAgree: true, pledgeAgree: true };
    const errs = validateApply(kind, v, { ...r, privacyAgree: "true", pledgeAgree: "true" });
    const items: MissingField[] = [];
    if (!isYmd(appliedAt)) items.push({ key: "appliedAt", label: "접수일", targetId: "appliedAt" });
    for (const k of orderedErrorKeys(errs).filter((k): k is ApplyFieldKey => k !== "privacyAgree" && k !== "pledgeAgree")) {
      items.push({ key: k, label: FIELD_LABELS[k], targetId: k });
    }
    if (isGallery) {
      if (!isYmd(gallery.startDate) || !isYmd(gallery.endDate) || gallery.endDate < gallery.startDate)
        items.push({ key: "period", label: "전시 기간", targetId: isYmd(gallery.startDate) ? "endDate" : "startDate" });
    } else {
      if (!complete.length || complete.length !== sessions.length) items.push({ key: "sessions", label: "날짜·시간", targetId: "sessionDate" });
      else if (complete.some((_, i) => offlineIssues(plan, i).length)) items.push({ key: "sessions", label: "날짜·시간", targetId: "sessionDate" });
    }
    if (!privacyPaper) items.push({ key: "privacyPaper", label: "개인정보 동의서 확인", targetId: "privacyPaper" });
    if (!pledgePaper) items.push({ key: "pledgePaper", label: "서약서 확인", targetId: "pledgePaper" });
    if (!isYmd(effPledgeDate)) items.push({ key: "pledgeDate", label: "서약일", targetId: "pledgeDate" });
    if (effPledgeName.length < 2) items.push({ key: "pledgeName", label: "서약자 성명", targetId: "pledgeName" });
    return { errs, items };
  }
  const live = tried ? compute() : null;
  const errors: ApplyErrors = live?.errs ?? {};
  const missing: MissingField[] = live?.items ?? [];

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    if (compute().items.length) return;
    setSubmitting(true);
    setError("");
    setIssues([]);
    try {
      const r = buildRaw();
      r.privacyAgree = "true";
      r.pledgeAgree = "true";
      r.pledgeDate = effPledgeDate;
      const fd = rawToFormData(r, isGallery ? [] : complete);
      if (isGallery) fd.delete("sessions"); // 갤러리는 서버가 기간으로 회차를 만든다(3-4 전과 같음)
      fd.set("intake", "offline");
      fd.set("intakeChannel", intakeChannel);
      fd.set("appliedAt", appliedAt);
      fd.set("intakeNote", intakeNote.trim());
      for (const f of files) fd.append("attachments", f);

      const res = await fetch("/api/requests", { method: "POST", body: fd, credentials: "include" });
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
        if (Array.isArray(data?.issues)) setIssues(data.issues.map((i: { date?: string; message?: string }) => `${i.date ?? ""} ${i.message ?? ""}`.trim()));
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

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <Card>
        <h2 className={sectionTitle}>접수 정보 (서면)</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <FieldLabel htmlFor="intakeChannel">접수 방법 *</FieldLabel>
            <Select id="intakeChannel" value={intakeChannel} onChange={(e) => setIntakeChannel(e.target.value)}>
              {INTAKE_CHANNEL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <FieldLabel htmlFor="appliedAt">접수일 *</FieldLabel>
            <Input id="appliedAt" type="date" max={today} value={appliedAt} onChange={(e) => setAppliedAt(e.target.value)} />
            <FieldHelp>종이 신청서에 적힌 신청일. 신청서 출력물과 기안 데이터의 신청일자로 쓰입니다.</FieldHelp>
          </div>
          <div>
            <FieldLabel htmlFor="intakeNote">메모</FieldLabel>
            <Input id="intakeNote" value={intakeNote} onChange={(e) => setIntakeNote(e.target.value)} placeholder="예: 원본 서명본 시설총무 보관" maxLength={200} />
          </div>
        </div>
      </Card>

      <Card>
        <ApplicantFields values={values} errors={errors} onChange={patch} title="신청자 정보" emailHelp="승인·결제 안내 메일 발송에 쓰입니다. 접수 확인 메일은 보내지 않습니다." />
      </Card>

      <Card>
        <h2 className={sectionTitle}>{isGallery ? "전시 기간" : "날짜·시간"}</h2>
        {isGallery ? (
          <OfflineGallerySchedulePart onChange={setGallery} />
        ) : (
          <>
            <OfflineLectureSchedule rooms={rooms} roomId={roomId} onRoomChange={setRoomId} sessions={sessions} onSessionsChange={setSessions} plan={plan} />
            {complete.length ? <FeeSummary className="mt-4" title="예상 이용료" lines={lectureFeeLines(roomId, plan, values, equipKeys)} total={plan.totalFeeKRW} target="예약" /> : null}
          </>
        )}
      </Card>

      <Card>
        {isGallery ? (
          <div className="space-y-5">
            <ExhibitFields values={values} errors={errors} onChange={patch} endDate={gallery.endDate} />
            <AField id="headcount" label="참여 인원" optional>
              <input id="headcount" inputMode="numeric" className={`${A_INPUT} w-[120px]`} value={values.headcount} onChange={(e) => patch({ headcount: e.target.value.replace(/\D/g, "").slice(0, 3) })} />
            </AField>
          </div>
        ) : (
          <section className="space-y-5">
            <h2 className="text-[20px] font-extrabold leading-[30px] text-ink">이용 정보</h2>
            <OrgField values={values} errors={errors} onChange={patch} />
            <UsageFields values={values} errors={errors} onChange={patch} isStudio={isStudio} />
            <EquipmentFields values={values} onChange={patch} isStudio={isStudio} />
          </section>
        )}
      </Card>

      <Card>
        <h2 className={sectionTitle}>서면 동의 확인 · 원본 첨부</h2>
        <div className="space-y-2 text-sm text-slate-800">
          <label className="flex items-start gap-2">
            <input id="privacyPaper" type="checkbox" className="mt-1 h-5 w-5" checked={privacyPaper} onChange={(e) => setPrivacyPaper(e.target.checked)} />
            <span>
              종이 신청서의 <b>개인정보 수집·이용 동의</b>란에 신청자가 동의 표시(체크·서명)한 것을 확인했습니다. *
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input id="pledgePaper" type="checkbox" className="mt-1 h-5 w-5" checked={pledgePaper} onChange={(e) => setPledgePaper(e.target.checked)} />
            <span>
              신청자가 서명한 <b>{isGallery ? "전시 이용규정 서약서" : "대관규정 서약서"}</b>를 받았고 원본을 센터에서 보관합니다. *
            </span>
          </label>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <FieldLabel htmlFor="pledgeDate">서약일 *</FieldLabel>
            <Input id="pledgeDate" type="date" max={today} value={effPledgeDate} onChange={(e) => setPledgeDate(e.target.value)} />
          </div>
          <div>
            <FieldLabel htmlFor="pledgeName">서약자 성명 *</FieldLabel>
            <Input id="pledgeName" value={pledgeName || values.applicantName} onChange={(e) => setPledgeName(e.target.value)} maxLength={30} />
          </div>
          <div className="md:col-span-2">
            <FieldLabel htmlFor="attachments">신청서·서약서 스캔본 첨부 (선택 · PDF/JPG/PNG · 건당 10MB)</FieldLabel>
            <Input id="attachments" type="file" multiple accept="application/pdf,image/jpeg,image/png" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
            {files.length > 0 && <FieldHelp>{files.map((f) => f.name).join(", ")}</FieldHelp>}
          </div>
        </div>
      </Card>

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <p className="font-semibold">{error}</p>
          {issues.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-xs">
              {issues.map((i, idx) => (
                <li key={idx}>{i}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!submitting ? <MissingFieldsSummary items={missing} /> : null}
      <div className="flex flex-wrap items-center justify-end gap-3">
        <span className="text-[13px] text-slate-500">등록 후 상세 화면에서 승인 처리와 안내 메일을 진행합니다.</span>
        <Button type="submit" variant="primary" disabled={submitting}>
          {submitting ? "등록 중…" : "서면 신청 등록"}
        </Button>
      </div>
    </form>
  );
}
