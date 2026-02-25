"use client";

import { useEffect } from "react";
import { todayYmdSeoul } from "@/lib/datetime";
import Button from "@/components/ui/Button";
import { FieldLabel, Input, Select } from "@/components/ui/Field";

interface Session {
  date: string;
  startTime: string;
  endTime: string;
}

interface ExtraSessionModalProps {
  open: boolean;
  selectedDate: string | null;
  startTime: string;
  endTime: string;
  allSessions: Session[];
  addDate: string;
  addStartTime: string;
  addEndTime: string;
  addStartOptions: string[];
  addEndOptions: string[];
  sessionError: string | null;
  onClose: () => void;
  onAddDateChange: (v: string) => void;
  onAddStartTimeChange: (v: string) => void;
  onAddEndTimeChange: (v: string) => void;
  onAddSession: () => void;
  onRemoveSession: (s: Session) => void;
}

export default function ExtraSessionModal({
  open,
  selectedDate,
  startTime,
  endTime,
  allSessions,
  addDate,
  addStartTime,
  addEndTime,
  addStartOptions,
  addEndOptions,
  sessionError,
  onClose,
  onAddDateChange,
  onAddStartTimeChange,
  onAddEndTimeChange,
  onAddSession,
  onRemoveSession,
}: ExtraSessionModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="extra-session-modal-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        aria-label="모달 닫기"
        onClick={onClose}
        tabIndex={-1}
      />

      <div className="relative w-full max-w-lg overflow-hidden rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl">
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h3 id="extra-session-modal-title" className="text-base font-bold text-slate-900">대관 일정 추가</h3>
            <p className="mt-0.5 text-xs text-slate-500">여러 회차를 한 번에 신청할 수 있습니다</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            aria-label="닫기"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
        </div>

        <div className="max-h-[70vh] overflow-auto">
          {/* 에러 */}
          {sessionError ? (
            <div className="px-5 pt-4">
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                {sessionError}
              </div>
            </div>
          ) : null}

          {/* 입력 영역 */}
          <div className="px-5 py-4 space-y-3">
            <div>
              <FieldLabel htmlFor="addDate" className="text-xs">날짜</FieldLabel>
              <Input
                id="addDate"
                type="date"
                value={addDate}
                min={todayYmdSeoul()}
                disabled={!selectedDate}
                onChange={(e) => onAddDateChange(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel htmlFor="addStartTime" className="text-xs">시작 시간</FieldLabel>
                <Select
                  id="addStartTime"
                  value={addStartTime}
                  disabled={!selectedDate || !addDate}
                  onChange={(e) => onAddStartTimeChange(e.target.value)}
                >
                  {addStartOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                </Select>
              </div>
              <div>
                <FieldLabel htmlFor="addEndTime" className="text-xs">종료 시간</FieldLabel>
                <Select
                  id="addEndTime"
                  value={addEndTime}
                  disabled={!selectedDate || !addDate}
                  onChange={(e) => onAddEndTimeChange(e.target.value)}
                >
                  {addEndOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                </Select>
              </div>
            </div>

            <Button
              variant="outline"
              className="h-10 w-full"
              disabled={!selectedDate || !addDate || !addStartTime || !addEndTime}
              onClick={onAddSession}
              type="button"
            >
              + 일정 추가
            </Button>
          </div>

          {/* 구분선 + 일정 목록 */}
          <div className="border-t border-slate-100 bg-slate-50/80 px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-700">선택된 일정</span>
              <span className="rounded-full bg-[rgb(var(--brand-primary)/0.1)] px-2.5 py-0.5 text-xs font-bold text-[rgb(var(--brand-primary))]">
                {allSessions.length}회차
              </span>
            </div>

            {allSessions.length > 0 ? (
              <div className="space-y-2">
                {allSessions.map((s, idx) => {
                  const isBase = s.date === selectedDate && s.startTime === startTime && s.endTime === endTime;
                  return (
                    <div
                      key={`${s.date}|${s.startTime}|${s.endTime}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600">
                          {idx + 1}
                        </span>
                        <div className="text-xs">
                          <span className="font-semibold text-slate-900">{s.date}</span>
                          <span className="ml-1.5 text-slate-600">{s.startTime} ~ {s.endTime}</span>
                        </div>
                        {isBase && (
                          <span className="rounded bg-blue-50 border border-blue-200 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">기본</span>
                        )}
                      </div>

                      {!isBase ? (
                        <button
                          type="button"
                          className="shrink-0 rounded-md border border-slate-200 bg-white p-1 text-slate-400 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-500"
                          onClick={() => onRemoveSession(s)}
                          aria-label={`삭제: ${s.date}`}
                        >
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M10.5 3.5l-7 7M3.5 3.5l7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                        </button>
                      ) : (
                        <span className="text-[10px] text-slate-400">기본</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-200 bg-white/60 p-4 text-center text-xs text-slate-500">
                날짜와 시간을 선택 후<br />&ldquo;일정 추가&rdquo; 버튼을 눌러 주세요
              </div>
            )}
          </div>
        </div>

        {/* 하단 완료 버튼 */}
        <div className="border-t border-slate-100 px-5 py-3">
          <Button
            type="button"
            variant="primary"
            className="w-full py-2.5"
            onClick={onClose}
          >
            완료 ({allSessions.length}회차)
          </Button>
        </div>
      </div>
    </div>
  );
}
