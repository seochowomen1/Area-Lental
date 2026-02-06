"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import Button from "@/components/ui/Button";
import { FieldHelp, FieldLabel, Input, Select } from "@/components/ui/Field";
// Notice는 Settings 상단 안내 영역에서만 사용 (개별 폼에서는 헬퍼텍스트로 통일)

import { operatingRangesForDate } from "@/lib/operating";
import { dayOfWeek, toMinutes } from "@/lib/datetime";

import type { BlockTime, Room } from "@/lib/types";

type ToastState = { type: "success" | "error"; message: string };

type Props = {
  rooms: Room[];
  isSubmitting: boolean;
  resetAfterSuccess: boolean;
  onCreate: (payload: Omit<BlockTime, "id">) => Promise<string | void>;
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

export default function AdminBlockForm({ rooms, isSubmitting, resetAfterSuccess, onCreate, onToast }: Props) {
  const formRef = useRef<HTMLFormElement | null>(null);

  const [roomId, setRoomId] = useState<string>(rooms[0]?.id ?? "all");
  const [date, setDate] = useState<string>("");
  const [startTime, setStartTime] = useState<string>("");
  const [endTime, setEndTime] = useState<string>("");

  const isGallery = roomId === "gallery";

  const galleryHours = useMemo(() => {
    if (!date) return null;
    const dow = dayOfWeek(date);
    if (dow === 0) return null;
    if (dow === 6) return { startTime: "09:00", endTime: "13:00" };
    return { startTime: "10:00", endTime: "18:00" };
  }, [date]);

  const ranges = useMemo(() => {
    if (!date) return [];
    if (isGallery) {
      return galleryHours ? [{ start: galleryHours.startTime, end: galleryHours.endTime }] : [];
    }
    return operatingRangesForDate(date);
  }, [date, isGallery, galleryHours]);

  const startOptions = useMemo(() => {
    if (!ranges.length) return [] as string[];
    const set = new Set<string>();
    for (const r of ranges) {
      const rs = toMinutes(r.start);
      const re = toMinutes(r.end);
      for (let t = rs; t <= re - 30; t += 30) set.add(minToHm(t));
    }
    return Array.from(set).sort((a, b) => toMinutes(a) - toMinutes(b));
  }, [ranges]);

  const endOptions = useMemo(() => {
    if (!startTime) return [] as string[];
    const st = toMinutes(startTime);
    const r = ranges.find((rg) => toMinutes(rg.start) <= st && st < toMinutes(rg.end));
    if (!r) return [] as string[];
    const cap = toMinutes(r.end);
    const arr: string[] = [];
    for (let t = st + 30; t <= cap; t += 30) arr.push(minToHm(t));
    return arr;
  }, [ranges, startTime]);

  useEffect(() => {
    if (isGallery) {
      if (!date || !galleryHours) {
        setStartTime("");
        setEndTime("");
        return;
      }
      setStartTime(galleryHours.startTime);
      setEndTime(galleryHours.endTime);
      return;
    }
    if (!date || !startOptions.length) {
      setStartTime("");
      setEndTime("");
      return;
    }

    const safeStart = startOptions.includes(startTime) ? startTime : startOptions[0];
    if (safeStart !== startTime) setStartTime(safeStart);

    const safeEnd = endOptions.includes(endTime) ? endTime : endOptions[0];
    if (safeEnd && safeEnd !== endTime) setEndTime(safeEnd);
  }, [date, startOptions, endOptions, isGallery, galleryHours]);

  const canSubmit = isGallery ? Boolean(date) && Boolean(galleryHours) : Boolean(date) && Boolean(startTime) && Boolean(endTime);

  const showAllWarning = roomId === "all";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || isSubmitting) return;
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);

    try {
      const createdId = await onCreate({
        roomId,
        date,
        startTime,
        endTime,
        reason: String(fd.get("reason") ?? "")
      });

      if (resetAfterSuccess) {
        form.reset();
        setRoomId(rooms[0]?.id ?? "all");
        setDate("");
        // start/end 는 date 변경에 의해 자동 초기화
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
            전체 선택 시 모든 강의실에 동일한 차단시간이 적용됩니다.
          </FieldHelp>
        ) : null}
      </div>

      <div className="md:col-span-3">
        <FieldLabel>날짜</FieldLabel>
        <Input type="date" name="date" required value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      <div className="md:col-span-2">
        <FieldLabel>시작</FieldLabel>
        {isGallery ? (
          <>
            <Input readOnly value={startTime || "-"} />
            <FieldHelp>갤러리는 일 단위 차단으로, 운영시간이 자동 적용됩니다.</FieldHelp>
          </>
        ) : (
          <>
            <Select
              name="startTime"
              required
              disabled={!date || !startOptions.length}
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            >
              {!date ? <option value="">날짜를 먼저 선택하세요</option> : null}
              {date && !startOptions.length ? <option value="">운영시간 없음</option> : null}
              {startOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
            <FieldHelp>운영시간 내 30분 단위</FieldHelp>
          </>
        )}
      </div>

      <div className="md:col-span-2">
        <FieldLabel>종료</FieldLabel>
        {isGallery ? (
          <Input readOnly value={endTime || "-"} />
        ) : (
          <>
            <Select
              name="endTime"
              required
              disabled={!date || !endOptions.length}
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            >
              {!endOptions.length ? <option value="">--:--</option> : null}
              {endOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
            <FieldHelp>시작시간 이후(동일 운영 구간 내)</FieldHelp>
          </>
        )}
      </div>

      <div className="md:col-span-2">
        <FieldLabel>사유(선택)</FieldLabel>
        <Input name="reason" placeholder="예: 행사/점검" />
      </div>

      <div className="md:col-span-12">
        <Button type="submit" disabled={!canSubmit || isSubmitting} className="w-full">
          {isSubmitting ? "등록 중..." : "차단시간 추가"}
        </Button>
      </div>
    </form>
  );
}
