"use client";

/**
 * 3단계 신청서 쓰기 — 강의실·E-스튜디오 (audit-fix-3 3-4 · 02_ui_apply §2-5 ~ §2-8 · §3)
 * 일정(회차)은 2단계에서 고른 주소 값 그대로. 서버로 보내는 데이터 형식은 3-4 전과 같다(lib/apply/form buildLectureRaw).
 * 회차 규칙·요금 = planLecture(nowHm · 공휴일 목록 포함) — 서버와 같은 함수.
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getRoom } from "@/lib/space";
import { kstNow } from "@/lib/rules/ymd";
import { planLecture } from "@/lib/rules/lecturePlan";
import { useBookedMonths } from "@/lib/client/useBookedDates";
import { birthLabel, parseBirth8 } from "@/lib/apply/birth";
import {
  applyKindOf,
  buildLectureRaw,
  FIELD_LABELS,
  LECTURE_EQUIP_KEYS,
  orderedErrorKeys,
  PUBLIC_EQUIP_LABELS,
  rawToFormData,
  STUDIO_EQUIP_KEYS,
  validateApply,
} from "@/lib/apply/form";
import { formatSessionLine, formatSessionsSummary, spaceHrefWithSessions, type ScheduleSession } from "@/lib/apply/schedule";
import { issueForSession, postApply, requestIdFromHref, saveDoneSummary, type ScheduleIssue } from "@/lib/apply/submit";
import ApplyFrame, { KEEP_TEXT } from "@/components/apply/ApplyFrame";
import ApplicantFields from "@/components/apply/ApplicantFields";
import ConfirmSheet from "@/components/apply/ConfirmSheet";
import ConsentBlock from "@/components/apply/ConsentBlock";
import EquipmentFields from "@/components/apply/EquipmentFields";
import FeeSummary, { lectureFeeLines } from "@/components/apply/FeeSummary";
import MissingFieldsSummary, { type MissingField } from "@/components/apply/MissingFieldsSummary";
import ResumeDraftBox from "@/components/apply/ResumeDraftBox";
import ScheduleSummary from "@/components/apply/ScheduleSummary";
import { OrgField, UsageFields } from "@/components/apply/UsageFields";
import { useApplyForm } from "@/components/apply/useApplyForm";
import { A_BTN_PRIMARY, A_H1, A_HELP, A_SECTION_TITLE } from "@/components/apply/ui";

export default function ApplyClient({ roomId, sessions }: { roomId: string; sessions: ScheduleSession[] }) {
  const router = useRouter();
  const room = getRoom(roomId)!;
  const kind = applyKindOf(roomId);
  const isStudio = kind === "studio";
  const equipKeys = isStudio ? STUDIO_EQUIP_KEYS : LECTURE_EQUIP_KEYS;
  const form = useApplyForm(roomId, { sessions });
  const { values, patch, errors, setErrors } = form;

  const [now, setNow] = useState(() => kstNow());
  useEffect(() => {
    const t = window.setInterval(() => setNow(kstNow()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const months = useMemo(() => Array.from(new Set(sessions.map((s) => s.date.slice(0, 7)))), [sessions]);
  const bm = useBookedMonths(roomId, months);
  const today = bm.today || now.ymd;
  const headcountNum = parseInt(values.headcount, 10);
  const plan = useMemo(
    () =>
      planLecture({
        roomId,
        sessions,
        headcount: isStudio && Number.isFinite(headcountNum) ? headcountNum : undefined,
        equipment: Object.fromEntries(equipKeys.map((k) => [k, values.equipment[k]])),
        holidays: bm.holidaySet,
        holidayNames: bm.holidayNames,
        todayYmd: today,
        nowHm: now.hm,
      }),
    [roomId, sessions, isStudio, headcountNum, equipKeys, values.equipment, bm.holidaySet, bm.holidayNames, today, now.hm]
  );

  const [view, setView] = useState<"input" | "confirm">("input");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ message: string; issues: ScheduleIssue[] } | null>(null);
  const [missing, setMissing] = useState<MissingField[]>([]);

  const scheduleSections = [
    {
      title: `신청 날짜 · ${sessions.length}회`,
      lines: sessions.map((s, i) => ({
        key: `${s.date}|${s.startTime}`,
        text: formatSessionLine(s),
        problem: conflict ? issueForSession(conflict.issues, s) : plan.sessions[i]?.issues[0] ?? null,
      })),
    },
  ];
  const feeLines = lectureFeeLines(roomId, plan, values, equipKeys);
  const fee = <FeeSummary title="예상 이용료" lines={feeLines} total={plan.totalFeeKRW} target="예약" />;
  const changeHref = spaceHrefWithSessions(roomId, sessions);

  function check(): boolean {
    const raw = buildLectureRaw(values, { roomId, sessions, pledgeDate: today });
    const errs = validateApply(kind, values, raw);
    setErrors(errs);
    const items: MissingField[] = [];
    if (plan.issues.length) items.push({ key: "schedule", label: "신청 날짜", targetId: "schedule-card" });
    for (const k of orderedErrorKeys(errs)) items.push({ key: k, label: FIELD_LABELS[k], targetId: k });
    setMissing(items);
    return items.length === 0;
  }

  function toConfirm() {
    setConflict(null);
    if (!check()) return;
    setSubmitError(null);
    setView("confirm");
  }

  async function submit() {
    setSubmitting(true);
    setSubmitError(null);
    const raw = buildLectureRaw(values, { roomId, sessions, pledgeDate: today });
    const r = await postApply(rawToFormData(raw, sessions), { screenFeeKRW: plan.totalFeeKRW });
    if (r.kind === "ok") {
      saveDoneSummary({ requestId: requestIdFromHref(r.href), roomName: room.name, schedule: formatSessionsSummary(sessions), feeLabel: "예상 이용료" });
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
  const pickedEquip = equipKeys.filter((k) => values.equipment[k]).map((k) => PUBLIC_EQUIP_LABELS[k]);

  return (
    <ApplyFrame
      roomId={roomId}
      step1Href={isStudio ? "/" : `/space?category=lecture&floor=${room.floor}`}
      step2Href={changeHref}
      modal={form.guard.modal}
    >
      {view === "confirm" ? (
        <ConfirmSheet
          schedule={<ScheduleSummary roomName={room.name} floor={room.floor} image={room.image} sections={scheduleSections} />}
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
              title: "이용 정보",
              rows: [
                { label: "단체 이름", value: values.orgName },
                { label: "인원", value: values.headcount ? `${values.headcount}명` : "" },
                { label: "사용 목적", value: values.purpose },
                { label: isStudio ? "촬영 장비" : "장비", value: pickedEquip.join(" · ") },
              ],
            },
            {
              title: "동의",
              rows: [
                { label: "개인정보", value: "수집·이용에 동의함" },
                { label: "서약", value: "대관규정 서약서에 동의함" },
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
            <h1 className={A_H1}>신청서 쓰기</h1>
            {form.pendingDraft ? <ResumeDraftBox onResume={form.resume} onFresh={form.fresh} /> : null}
            <ScheduleSummary
              roomName={room.name}
              floor={room.floor}
              image={room.image}
              sections={scheduleSections}
              changeHref={changeHref}
              onBeforeChange={form.rememberForChange}
              conflictMessage={conflict?.message ?? null}
            />
            {conflict ? <p className={A_HELP}>{KEEP_TEXT}</p> : null}
          </div>
          <ApplicantFields values={values} errors={errors} onChange={patch} />
          <section aria-labelledby="sec-usage" className="space-y-5">
            <h2 id="sec-usage" className={A_SECTION_TITLE}>
              이용 정보
            </h2>
            <OrgField values={values} errors={errors} onChange={patch} />
            <UsageFields values={values} errors={errors} onChange={patch} isStudio={isStudio} capacity={room.capacity} />
            <EquipmentFields values={values} onChange={patch} isStudio={isStudio} />
          </section>
          <ConsentBlock
            roomId={roomId}
            privacyAgree={values.privacyAgree}
            pledgeAgree={values.pledgeAgree}
            onChange={patch}
            privacyError={errors.privacyAgree}
            pledgeError={errors.pledgeAgree}
          />
          {fee}
          <div className="space-y-3">
            <MissingFieldsSummary items={missing.filter((m) => m.key === "schedule" ? plan.issues.length > 0 : Boolean(errors[m.key as keyof typeof errors]))} />
            <button type="button" className={A_BTN_PRIMARY} onClick={toConfirm}>
              신청 내용 확인
            </button>
          </div>
        </div>
      )}
    </ApplyFrame>
  );
}
