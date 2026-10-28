"use client";

/**
 * 신청서 값·오류·이어서 쓰기·이탈 확인 (audit-fix-3 3-4 · 02_ui_apply §2-8 S1·S2)
 * - `날짜·시간 바꾸기`로 갔다 돌아오면 같은 탭 메모리의 값을 그대로(개인정보 포함 · 저장소 아님)
 * - 아니면 sessionStorage 초안(개인정보 아닌 칸만)이 있으면 S2 상자 → 고르기 전까지 칸은 빈 채
 * - 값이 바뀔 때마다 초안 저장(S2 결정 전에는 저장하지 않음)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { defaultApplyValues, type ApplyErrors, type ApplyFieldKey, type ApplyFormValues } from "@/lib/apply/form";
import {
  applyDraftToValues,
  clearDraft,
  draftHasContent,
  forgetValues,
  loadDraft,
  pickDraft,
  rememberValues,
  saveDraft,
  takeRememberedValues,
  type ApplyDraft,
} from "@/lib/apply/draft";
import type { ScheduleSession } from "@/lib/apply/schedule";
import { useLeaveGuard } from "@/components/apply/useLeaveGuard";

export function useApplyForm(roomId: string, extra: { sessions?: readonly ScheduleSession[]; period?: { startDate: string; endDate: string } }) {
  const defaults = useMemo(() => defaultApplyValues(roomId), [roomId]);
  const [values, setValues] = useState<ApplyFormValues>(defaults);
  const [errors, setErrors] = useState<ApplyErrors>({});
  const [pendingDraft, setPendingDraft] = useState<ApplyDraft | null>(null);
  const [ready, setReady] = useState(false);
  const extraRef = useRef(extra);
  extraRef.current = extra;

  useEffect(() => {
    const remembered = takeRememberedValues(roomId);
    if (remembered) {
      setValues(remembered);
    } else {
      const d = loadDraft(roomId);
      if (draftHasContent(d, defaults)) setPendingDraft(d);
    }
    setReady(true);
  }, [roomId, defaults]);

  // 초안 저장(개인정보 아닌 칸만)
  useEffect(() => {
    if (!ready || pendingDraft) return;
    const t = window.setTimeout(() => {
      const d = pickDraft(roomId, values, extraRef.current);
      if (draftHasContent(d, defaults)) saveDraft(d);
    }, 400);
    return () => window.clearTimeout(t);
  }, [ready, pendingDraft, roomId, values, defaults]);

  const patch = useCallback((p: Partial<ApplyFormValues>) => {
    setValues((v) => ({ ...v, ...p }));
    setErrors((e) => {
      const keys = Object.keys(p) as ApplyFieldKey[];
      if (!keys.some((k) => e[k])) return e;
      const next = { ...e };
      for (const k of keys) delete next[k];
      return next;
    });
  }, []);

  const resume = useCallback(() => {
    if (pendingDraft) setValues((v) => applyDraftToValues(v, pendingDraft));
    setPendingDraft(null);
  }, [pendingDraft]);

  const fresh = useCallback(() => {
    clearDraft(roomId);
    setPendingDraft(null);
  }, [roomId]);

  const dirty = useMemo(() => JSON.stringify(values) !== JSON.stringify(defaults), [values, defaults]);
  const guard = useLeaveGuard(dirty);

  /** `날짜·시간 바꾸기` 직전 */
  const rememberForChange = useCallback(() => rememberValues(roomId, values), [roomId, values]);

  /** 신청 성공 */
  const finish = useCallback(() => {
    guard.release();
    clearDraft(roomId);
    forgetValues(roomId);
  }, [guard, roomId]);

  return { values, setValues, patch, errors, setErrors, pendingDraft, resume, fresh, guard, rememberForChange, finish };
}
