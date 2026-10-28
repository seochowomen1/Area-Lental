"use client";

/**
 * 서면 등록 — 강의실·E-스튜디오 일정(편집 가능 · 3-4 ⑧ Q6)
 * 공간 · 회차(날짜·시작·끝, 최대 BATCH_MAX_SESSIONS) · 회차 문제(planLecture — 지난 날짜·시각 검사는 서면이라 뺌)
 */
import { FieldLabel, Input, Select } from "@/components/ui/Field";
import { REQUEST_LIMITS } from "@/lib/constants";
import type { LecturePlan } from "@/lib/rules/lecturePlan";
import type { SpaceRoom } from "@/lib/space";
import type { ScheduleSession } from "@/lib/apply/schedule";

const TIMES: string[] = (() => {
  const out: string[] = [];
  for (let t = 9 * 60; t <= 21 * 60; t += 30) out.push(`${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`);
  return out;
})();

/** 서면 등록 화면에서 보여 줄 회차 문제(지난 날짜·시각 제외 — 서버도 서면이면 뺀다) */
export function offlineIssues(plan: LecturePlan, index: number): string[] {
  return plan.issues.filter((i) => i.index === index && i.code !== "PAST_DATE").map((i) => i.message);
}

export default function OfflineLectureSchedule({
  rooms,
  roomId,
  onRoomChange,
  sessions,
  onSessionsChange,
  plan,
}: {
  rooms: SpaceRoom[];
  roomId: string;
  onRoomChange: (id: string) => void;
  sessions: ScheduleSession[];
  onSessionsChange: (s: ScheduleSession[]) => void;
  plan: LecturePlan;
}) {
  const set = (i: number, patch: Partial<ScheduleSession>) => onSessionsChange(sessions.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  return (
    <div className="space-y-4">
      {rooms.length > 1 ? (
        <div className="max-w-sm">
          <FieldLabel htmlFor="offline-room">공간 *</FieldLabel>
          <Select id="offline-room" value={roomId} onChange={(e) => onRoomChange(e.target.value)}>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.floor}층 {r.name}
              </option>
            ))}
          </Select>
        </div>
      ) : null}
      <div className="space-y-3">
        {sessions.map((s, i) => {
          const problems = s.date && s.startTime && s.endTime ? offlineIssues(plan, plan.sessions.findIndex((p) => p.date === s.date && p.startTime === s.startTime)) : [];
          return (
            <div key={i} className="rounded-xl border border-slate-200 p-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px_120px_auto] sm:items-end">
                <div>
                  <FieldLabel htmlFor={i === 0 ? "sessionDate" : `sessionDate-${i}`}>{i + 1}회 날짜 *</FieldLabel>
                  <Input id={i === 0 ? "sessionDate" : `sessionDate-${i}`} type="date" value={s.date} onChange={(e) => set(i, { date: e.target.value })} />
                </div>
                <div>
                  <FieldLabel htmlFor={`sessionStart-${i}`}>시작 *</FieldLabel>
                  <Select id={`sessionStart-${i}`} value={s.startTime} onChange={(e) => set(i, { startTime: e.target.value })}>
                    <option value="">선택</option>
                    {TIMES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <FieldLabel htmlFor={`sessionEnd-${i}`}>끝 *</FieldLabel>
                  <Select id={`sessionEnd-${i}`} value={s.endTime} onChange={(e) => set(i, { endTime: e.target.value })}>
                    <option value="">선택</option>
                    {TIMES.filter((t) => !s.startTime || t > s.startTime).map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </Select>
                </div>
                {sessions.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => onSessionsChange(sessions.filter((_, j) => j !== i))}
                    className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-ink hover:bg-slate-50"
                  >
                    빼기
                  </button>
                ) : null}
              </div>
              {problems.map((p) => (
                <p key={p} className="mt-1 text-sm font-semibold text-red-700">
                  {p}
                </p>
              ))}
            </div>
          );
        })}
      </div>
      {sessions.length < REQUEST_LIMITS.BATCH_MAX_SESSIONS ? (
        <button
          type="button"
          onClick={() => {
            const last = sessions[sessions.length - 1];
            onSessionsChange([...sessions, { date: "", startTime: last?.startTime ?? "", endTime: last?.endTime ?? "" }]);
          }}
          className="inline-flex min-h-[44px] items-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-ink hover:bg-slate-50"
        >
          ＋ 회차 더하기
        </button>
      ) : (
        <p className="text-sm text-slate-600">한 번에 최대 {REQUEST_LIMITS.BATCH_MAX_SESSIONS}회까지 신청할 수 있습니다.</p>
      )}
    </div>
  );
}
