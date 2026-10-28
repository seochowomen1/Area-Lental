"use client";

/**
 * 3단계 전시 신청서 쓰기 — 우리동네 갤러리 (audit-fix-3 3-4 · 02_ui_apply §3 · G2)
 * 기간·준비일은 2단계에서 고른 주소 값. 회차·금액 = planGallery(서버와 같은 함수).
 * 화면에 "대관" 글자 없음. 서버로 보내는 데이터 형식은 3-4 전과 같다(lib/apply/form buildGalleryRaw).
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getRoom } from "@/lib/space";
import { addDays, formatKoDate, kstNow } from "@/lib/rules/ymd";
import { availablePrepDates, planGallery, resolveGalleryPrep } from "@/lib/galleryPlan";
import { galleryMonthsForRange, useGalleryMonthData } from "@/lib/useGalleryMonthData";
import { galleryPrepAfterText } from "@/lib/galleryCalendar";
import { birthLabel, parseBirth8 } from "@/lib/apply/birth";
import { buildGalleryRaw, FIELD_LABELS, orderedErrorKeys, rawToFormData, validateApply } from "@/lib/apply/form";
import { formatPeriod, spaceHrefWithPeriod } from "@/lib/apply/schedule";
import { postApply, requestIdFromHref, saveDoneSummary, type ScheduleIssue } from "@/lib/apply/submit";
import HolidayUnavailableNotice from "@/components/HolidayUnavailableNotice";
import { NO_PREP_TEXT } from "@/components/apply/GalleryPeriodPicker";
import ApplyFrame, { KEEP_TEXT } from "@/components/apply/ApplyFrame";
import ApplicantFields from "@/components/apply/ApplicantFields";
import ConfirmSheet from "@/components/apply/ConfirmSheet";
import ConsentBlock from "@/components/apply/ConsentBlock";
import ExhibitFields from "@/components/apply/ExhibitFields";
import FeeSummary, { galleryFeeLines } from "@/components/apply/FeeSummary";
import MissingFieldsSummary, { type MissingField } from "@/components/apply/MissingFieldsSummary";
import ResumeDraftBox from "@/components/apply/ResumeDraftBox";
import ScheduleSummary from "@/components/apply/ScheduleSummary";
import { useApplyForm } from "@/components/apply/useApplyForm";
import { A_BTN_PRIMARY, A_H1, A_HELP } from "@/components/apply/ui";

export default function ApplyGalleryClient({ startDate, endDate, prepDate }: { startDate: string; endDate: string; prepDate: string | null }) {
  const router = useRouter();
  const room = getRoom("gallery")!;
  const form = useApplyForm("gallery", { period: { startDate, endDate } });
  const { values, patch, errors, setErrors } = form;
  const months = useMemo(() => galleryMonthsForRange(startDate, endDate), [startDate, endDate]);
  const md = useGalleryMonthData(months);
  const today = kstNow().ymd;

  // 준비일: 2단계 값이 후보 안이면 그대로, 아니면 기본 준비일(예전 신청서와 같은 판단)
  const prep = useMemo(() => {
    const ctx = { holidays: md.holidaySet, booked: md.booked, exhibitionEnds: md.exhibitionEnds, prepOnly: md.prepOnly, today };
    // 주소의 준비일이 내일 이후 후보이고 비어 있으면(또는 앞 전시 마지막 날이면) 그대로
    const candidates = availablePrepDates(startDate, md.holidaySet, 7, addDays(today, 1));
    if (prepDate && candidates.includes(prepDate) && !md.prepOnly.has(prepDate)) {
      if (!md.booked.has(prepDate)) return { date: prepDate, after: false };
      if (md.exhibitionEnds.has(prepDate)) return { date: prepDate, after: true };
    }
    // 아니면 기본 준비일(재검수 R-3) — 그것도 안 되면 준비일 없음 → 신청 불가 안내
    const r = resolveGalleryPrep(startDate, ctx);
    return r ? { date: r.date, after: r.afterExhibition } : { date: "", after: false };
  }, [startDate, prepDate, md.holidaySet, md.booked, md.exhibitionEnds, md.prepOnly, today]);
  const noPrep = md.status === "ok" && !prep.date;

  const plan = useMemo(
    () => planGallery({ startDate, endDate, prepDate: prep.date || null, prepAfterExhibition: prep.after, holidays: md.holidaySet }),
    [startDate, endDate, prep, md.holidaySet]
  );

  const [view, setView] = useState<"input" | "confirm">("input");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ message: string; issues: ScheduleIssue[] } | null>(null);
  const [missing, setMissing] = useState<MissingField[]>([]);

  const period = formatPeriod(startDate, endDate);
  const sections = [
    { title: `전시 기간 · ${plan.exhibitionDayCount}일`, lines: [{ key: "period", text: period }] },
    ...(prep.date
      ? [{ title: "준비일 · 무료", lines: [{ key: "prep", text: `${formatKoDate(prep.date)}${prep.after ? ` ${galleryPrepAfterText(prep.date)}` : ""}` }] }]
      : []),
  ];
  const fee = (
    <>
      {md.status === "ok" && md.holidayStatus === "unavailable" ? <HolidayUnavailableNotice /> : null}
      <FeeSummary title="예상 전시 공간 이용료" lines={galleryFeeLines(plan)} total={plan.totalFeeKRW} target="전시" />
    </>
  );
  const changeHref = spaceHrefWithPeriod(startDate, endDate);

  function raw() {
    return buildGalleryRaw(values, { startDate, endDate, prepDate: prep.date, sessions: plan.sessions, pledgeDate: today });
  }

  function toConfirm() {
    if (noPrep) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setConflict(null);
    const errs = validateApply("gallery", values, raw());
    setErrors(errs);
    const items: MissingField[] = orderedErrorKeys(errs).map((k) => ({ key: k, label: FIELD_LABELS[k], targetId: k }));
    setMissing(items);
    if (items.length) return;
    setSubmitError(null);
    setView("confirm");
  }

  async function submit() {
    setSubmitting(true);
    setSubmitError(null);
    const r = await postApply(rawToFormData(raw(), plan.sessions), { category: "gallery", screenFeeKRW: md.status === "ok" ? plan.totalFeeKRW : null });
    if (r.kind === "ok") {
      saveDoneSummary({ requestId: requestIdFromHref(r.href), roomName: room.name, schedule: period, feeLabel: "예상 전시 공간 이용료" });
      form.finish();
      router.push(r.href);
      return;
    }
    setSubmitting(false);
    if (r.kind === "schedule") {
      setConflict({ message: r.message, issues: r.issues });
      setView("input");
      window.setTimeout(() => {
        window.scrollTo({ top: 0 });
        document.getElementById("schedule-card")?.focus({ preventScroll: true });
      }, 0);
      return;
    }
    setSubmitError(r.message);
  }

  const birth = parseBirth8(values.birthDigits);
  const scheduleCard = (withChange: boolean) => (
    <ScheduleSummary
      roomName={room.name}
      floor={room.floor}
      image={room.image}
      sections={sections}
      changeHref={withChange ? changeHref : undefined}
      changeLabel="전시 기간 바꾸기"
      onBeforeChange={form.rememberForChange}
      conflictMessage={withChange ? conflict?.message ?? null : null}
    />
  );

  return (
    <ApplyFrame roomId="gallery" step1Href="/" step2Href={changeHref} modal={form.guard.modal}>
      {view === "confirm" ? (
        <ConfirmSheet
          schedule={scheduleCard(false)}
          cards={[
            {
              title: "신청하시는 분",
              rows: [
                { label: "이름", value: values.applicantName },
                { label: "생년월일", value: birth.ok ? birthLabel(birth.ymd) : "" },
                { label: "휴대폰 번호", value: values.phone },
                { label: "이메일", value: values.email },
                { label: "주소", value: values.address },
              ],
            },
            {
              title: "전시 정보",
              rows: [
                { label: "전시 이름", value: values.exhibitionTitle },
                { label: "철수 시간", value: values.galleryRemovalTime ? `${formatKoDate(endDate)} ${values.galleryRemovalTime}` : "" },
                { label: "단체 이름", value: values.orgName },
                { label: "장르·내용", value: values.genreContent },
                { label: "전시 목적", value: values.exhibitionPurpose },
                { label: "알게 된 경로", value: values.awarenessPath },
                { label: "특이사항", value: values.specialNotes },
              ],
            },
            {
              title: "동의",
              rows: [
                { label: "개인정보", value: "수집·이용에 동의함" },
                { label: "서약", value: "전시 운영규정 서약서에 동의함" },
              ],
            },
          ]}
          fee={fee}
          submitting={submitting}
          error={submitError}
          onSubmit={submit}
          onEdit={() => {
            setView("input");
            window.setTimeout(() => window.scrollTo({ top: 0 }), 0);
          }}
        />
      ) : (
        <div className="space-y-8">
          <div className="space-y-4">
            <h1 className={A_H1}>전시 신청서 쓰기</h1>
            {form.pendingDraft ? <ResumeDraftBox onResume={form.resume} onFresh={form.fresh} /> : null}
            {scheduleCard(true)}
            {noPrep ? (
              <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[17px] font-bold leading-7 text-amber-900">
                {NO_PREP_TEXT} 위 [전시 기간 바꾸기]를 눌러 주세요.
              </div>
            ) : null}
            {conflict ? <p className={A_HELP}>{KEEP_TEXT}</p> : null}
          </div>
          <ApplicantFields values={values} errors={errors} onChange={patch} />
          <ExhibitFields values={values} errors={errors} onChange={patch} endDate={endDate} />
          <ConsentBlock
            roomId="gallery"
            privacyAgree={values.privacyAgree}
            pledgeAgree={values.pledgeAgree}
            onChange={patch}
            privacyError={errors.privacyAgree}
            pledgeError={errors.pledgeAgree}
          />
          {fee}
          <div className="space-y-3">
            <MissingFieldsSummary items={missing.filter((m) => Boolean(errors[m.key as keyof typeof errors]))} />
            <button type="button" className={A_BTN_PRIMARY} onClick={toConfirm}>
              신청 내용 확인
            </button>
          </div>
        </div>
      )}
    </ApplyFrame>
  );
}
