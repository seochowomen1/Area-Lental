"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import Button from "@/components/ui/Button";
import { FieldHelp, FieldLabel, Input, Select } from "@/components/ui/Field";
// Notice는 Settings 상단 안내 영역에서만 사용 (개별 폼에서는 헬퍼텍스트로 통일)

import { operatingRangesForDayOfWeek, validateOperatingHoursByDayOfWeek } from "@/lib/operating";
import { toMinutes } from "@/lib/datetime";

import type { ClassSchedule, Room } from "@/lib/types";

type DayOpt = { value: number; label: string };
type ToastState = { type: "success" | "error"; message: string };

type Props = {
  rooms: Room[];
  dayOptions: DayOpt[];
  isSubmitting: boolean;
  resetAfterSuccess: boolean;
  onCreate: (payload: Omit<ClassSchedule, "id">) => Promise<string | void>;
  onToast?: (t: ToastState) => void;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function minToHm(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

export default function AdminScheduleForm({ rooms, dayOptions, isSubmitting, resetAfterSuccess, onCreate, onToast }: Props) {
  const formRef = useRef<HTMLFormElement | null>(null);

  const [roomId, setRoomId] = useState<string>(rooms[0]?.id ?? "all");
  const [dayOfWeek, setDayOfWeek] = useState<number>(dayOptions[0]?.value ?? 1);
  const [startTime, setStartTime] = useState<string>("");
  const [endTime, setEndTime] = useState<string>("");

  const ranges = useMemo(() => operatingRangesForDayOfWeek(dayOfWeek), [dayOfWeek]);

  // 시작 옵션: 운영시간 내 30분 단위(end-30 까지)
  const startOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of ranges) {
      const rs = toMinutes(r.start);
      const re = toMinutes(r.end);
      for (let t = rs; t <= re - 30; t += 30) {
        const s = minToHm(t);
        const e = minToHm(t + 30);
        if (validateOperatingHoursByDayOfWeek(dayOfWeek, s, e).ok) set.add(s);
      }
    }
    return Array.from(set).sort((a, b) => toMinutes(a) - toMinutes(b));
  }, [ranges, dayOfWeek]);

  // 종료 옵션: 시작시간이 속한 운영 구간 안에서만(화요일 주간/야간 분리)
  const endOptions = useMemo(() => {
    if (!startTime) return [] as string[];
    const st = toMinutes(startTime);
    const r = ranges.find((rg) => toMinutes(rg.start) <= st && st < toMinutes(rg.end));
    if (!r) return [] as string[];

    const arr: string[] = [];
    const cap = toMinutes(r.end);
    for (let t = st + 30; t <= cap; t += 30) {
      const e = minToHm(t);
      if (validateOperatingHoursByDayOfWeek(dayOfWeek, startTime, e).ok) arr.push(e);
    }
    return arr;
  }, [ranges, startTime, dayOfWeek]);

  // day 변경/옵션 변경 시 값 자동 보정
  useEffect(() => {
    if (!startOptions.length) {
      setStartTime("");
      setEndTime("");
      return;
    }
    const safeStart = startOptions.includes(startTime) ? startTime : startOptions[0];
    if (safeStart !== startTime) setStartTime(safeStart);

    const safeEnd = endOptions.includes(endTime) ? endTime : endOptions[0];
    if (safeEnd && safeEnd !== endTime) setEndTime(safeEnd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayOfWeek, startOptions, endOptions]);

  const canSubmit = Boolean(startTime) && Boolean(endTime);

  const showAllWarning = roomId === "all";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || isSubmitting) return;
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);

    const effectiveFrom = String(fd.get("effectiveFrom") ?? "").trim();
    const effectiveTo = String(fd.get("effectiveTo") ?? "").trim();

    if (!effectiveFrom || !effectiveTo) {
      onToast?.({ type: "error", message: "시작 날짜와 종료 날짜를 모두 선택해 주세요." });
      return;
    }

    try {
      const createdId = await onCreate({
        roomId,
        dayOfWeek,
        startTime,
        endTime,
        title: String(fd.get("title") ?? ""),
        effectiveFrom,
        effectiveTo
      });

      // 성공: 필요 시 입력 초기화
      if (resetAfterSuccess) {
        form.reset();
        setRoomId(rooms[0]?.id ?? "all");
        setDayOfWeek(dayOptions[0]?.value ?? 1);
        // start/end는 effect가 옵션 기준으로 자동 보정
      }
      return createdId;
    } catch (err: any) {
      onToast?.({ type: "error", message: err?.message ?? "등록에 실패했습니다." });
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 md:grid-cols-12">
      <div className="md:col-span-3">
        <FieldLabel>강의실</FieldLabel>
        <Select name="roomId" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
        {showAllWarning ? (
          <FieldHelp className="text-xs text-red-600">
            전체 선택 시 모든 강의실에 동일한 수업시간이 적용됩니다.
          </FieldHelp>
        ) : null}
      </div>

      <div className="md:col-span-2">
        <FieldLabel>요일</FieldLabel>
        <Select name="dayOfWeek" value={dayOfWeek} onChange={(e) => setDayOfWeek(parseInt(e.target.value, 10))}>
          {dayOptions.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="md:col-span-2">
        <FieldLabel>시작</FieldLabel>
        <Select
          name="startTime"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          required
          disabled={!startOptions.length}
        >
          {!startOptions.length ? <option value="">운영시간 없음</option> : null}
          {startOptions.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
        <FieldHelp>운영시간 내 30분 단위</FieldHelp>
      </div>

      <div className="md:col-span-2">
        <FieldLabel>종료</FieldLabel>
        <Select name="endTime" value={endTime} onChange={(e) => setEndTime(e.target.value)} required disabled={!endOptions.length}>
          {!endOptions.length ? <option value="">--:--</option> : null}
          {endOptions.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
        <FieldHelp>시작시간 이후(동일 운영 구간 내)</FieldHelp>
      </div>

      <div className="md:col-span-3">
        <FieldLabel>제목(선택)</FieldLabel>
        <Input name="title" placeholder="예: 정규강좌" />
      </div>

      <div className="md:col-span-3">
        <FieldLabel>시작 날짜 *</FieldLabel>
        <Input type="date" name="effectiveFrom" required />
      </div>

      <div className="md:col-span-3">
        <FieldLabel>종료 날짜 *</FieldLabel>
        <Input type="date" name="effectiveTo" required />
      </div>

      <div className="md:col-span-6 flex items-end">
        <Button type="submit" disabled={!canSubmit || isSubmitting} className="w-full">
          {isSubmitting ? "등록 중..." : "수업시간 추가"}
        </Button>
      </div>
    </form>
  );
}
