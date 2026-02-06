"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { RequestInputSchema, type RequestInput } from "@/lib/schema";
import { EQUIPMENT_FEE_KRW } from "@/lib/config";
import { operatingRangesForDate, isTuesdayNightOverlap } from "@/lib/operating";
import { toMinutes, todayYmdSeoul } from "@/lib/datetime";
import { FLOORS } from "@/lib/floors";
import { getRoom } from "@/lib/space";
import SiteHeader from "@/components/SiteHeader";
import PledgeModal from "@/components/PledgeModal";
import PrivacyModal from "@/components/PrivacyModal";
import OperatingHoursNotice from "@/components/OperatingHoursNotice";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Notice from "@/components/ui/Notice";
import Checkbox from "@/components/ui/Checkbox";
import { FieldHelp, FieldLabel, Input, Select, Textarea } from "@/components/ui/Field";
import { SECTION_DESC, SECTION_TITLE } from "@/components/ui/presets";

function fromMinutes(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function fmtDuration(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m}분`;
  return m ? `${h}시간 ${m}분` : `${h}시간`;
}

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

export default function ApplyClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [extraOpen, setExtraOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [pledgeOpen, setPledgeOpen] = useState(false);
  const [prefillLocked, setPrefillLocked] = useState(false);

  // ✅ 여러 회차(날짜/시간이 달라도 됨)를 1회 신청으로 묶기(강의실 동일)
  type ExtraSession = { date: string; startTime: string; endTime: string };
  const [extraSessions, setExtraSessions] = useState<ExtraSession[]>([]);
  const [addDate, setAddDate] = useState<string>("");
  const [addStartTime, setAddStartTime] = useState<string>("");
  const [addEndTime, setAddEndTime] = useState<string>("");

  const [floorId, setFloorId] = useState<"4" | "5" | "6" | "7">("4");
  const floor = useMemo(() => FLOORS.find((f) => f.id === floorId)!, [floorId]);
  const [roomId, setRoomId] = useState<string>(floor.rooms[0].id);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError: setFormError,
    clearErrors,
    formState: { errors },
  } = useForm<RequestInput>({
    resolver: zodResolver(RequestInputSchema),
    defaultValues: {
      roomId: roomId,
      date: "",
      startTime: "10:00",
      endTime: "12:00",
      headcount: 10,
      laptop: false,
      projector: false,
      audio: false,
      privacyAgree: false,
      pledgeAgree: false,
    },
  });

  // 서약 일자는 신청 당일로 고정(사용자가 변경하지 않음)
  const fixedPledgeDate = useMemo(() => todayYmdSeoul(), []);
  useEffect(() => {
    setValue("pledgeDate", fixedPledgeDate, { shouldValidate: true });
  }, [fixedPledgeDate, setValue]);

  // querystring(roomId/date/start/end)로 들어오는 경우: 신청서 기본값 자동 세팅(상세 → 신청서 흐름)
  useEffect(() => {
    const qpRoomId = searchParams.get("roomId");
    const qpDate = searchParams.get("date");
    const qpStart = searchParams.get("start");
    const qpEnd = searchParams.get("end");

    if (qpRoomId) {
      // roomId로 floor를 역추적해 동기화
      const matchedFloor = FLOORS.find((f) => f.rooms.some((r) => r.id === qpRoomId));
      if (matchedFloor) setFloorId(matchedFloor.id as any);
      setRoomId(qpRoomId);
      setValue("roomId", qpRoomId, { shouldValidate: true, shouldDirty: true });
    }

    if (qpDate) setValue("date", qpDate, { shouldValidate: true, shouldDirty: true });
    if (qpStart) setValue("startTime", qpStart, { shouldValidate: true, shouldDirty: true });
    if (qpEnd) setValue("endTime", qpEnd, { shouldValidate: true, shouldDirty: true });

    const locked = !!(qpRoomId && qpDate && qpStart && qpEnd);
    setPrefillLocked(locked);
  }, [searchParams, setValue]);

  // floor 변경 시 room 목록/선택값 동기화
  useEffect(() => {
    // 현재 선택된 room이 해당 층에 없다면(=층 이동), 첫 방으로 보정
    const stillExists = floor.rooms.some((r) => r.id === roomId);
    if (stillExists) return;
    const first = floor.rooms[0]?.id ?? "";
    setRoomId(first);
    setValue("roomId", first, { shouldValidate: true, shouldDirty: true });
  }, [floorId, floor, roomId, setValue]);

  // room 변경 시 RHF와 동기화
  useEffect(() => {
    setValue("roomId", roomId, { shouldValidate: true, shouldDirty: true });
  }, [roomId, setValue]);

  const selectedDate = watch("date") || null;
  const startTime = watch("startTime");
  const endTime = watch("endTime");
  const pledgeAgree = watch("pledgeAgree");
  const privacyAgree = watch("privacyAgree");
  const applicantName = watch("applicantName");
  const pledgeName = watch("pledgeName");

  // 기본 회차와 동일한 값은 추가 회차 목록에서 제거
  useEffect(() => {
    if (!selectedDate || !startTime || !endTime) return;
    setExtraSessions((prev) => prev.filter((s) => !(s.date === selectedDate && s.startTime === startTime && s.endTime === endTime)));
  }, [selectedDate, startTime, endTime]);

  // 강의실 변경 시 추가 회차 초기화(묶음 신청은 동일 강의실 기준)
  const roomKeyRef = useRef<string>(roomId);
  useEffect(() => {
    if (roomKeyRef.current === roomId) return;
    roomKeyRef.current = roomId;
    if (extraSessions.length === 0) return;
    setExtraSessions([]);
    setBatchError("강의실 변경으로 추가 회차가 초기화되었습니다. 필요 시 다시 추가해 주세요.");
  }, [roomId, extraSessions.length]);

  // 추가 회차 입력 기본값: 현재 선택값을 따라감(초기 1회만)
  useEffect(() => {
    if (selectedDate && !addDate) setAddDate(selectedDate);
  }, [selectedDate, addDate]);
  useEffect(() => {
    if (startTime && !addStartTime) setAddStartTime(startTime);
  }, [startTime, addStartTime]);
  useEffect(() => {
    if (endTime && !addEndTime) setAddEndTime(endTime);
  }, [endTime, addEndTime]);

  // 추가 회차 모달(ESC로 닫기)
  useEffect(() => {
    if (!extraOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setExtraOpen(false);
        setSessionError(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [extraOpen]);

  // 편의: 신청자 성명 → 서약자 성명 자동 채움(기본값)
  // - 서약자 성명을 직접 수정하면 이후에는 자동 동기화하지 않습니다.
  const pledgeAutoFillRef = useRef<boolean>(true);
  const prevApplicantNameRef = useRef<string>("");

  useEffect(() => {
    const prev = prevApplicantNameRef.current;
    prevApplicantNameRef.current = applicantName || "";

    if (!applicantName) return;

    // 서약자 성명이 비어있으면 자동 채움
    if (!pledgeName) {
      pledgeAutoFillRef.current = true;
      setValue("pledgeName", applicantName, { shouldValidate: true, shouldDirty: true });
      return;
    }

    // 이전에도 자동 채움 상태였고, 사용자가 수정하지 않은(=이전 성명과 동일) 경우에만 따라가게 함
    if (pledgeAutoFillRef.current && prev && pledgeName === prev && applicantName !== prev) {
      setValue("pledgeName", applicantName, { shouldValidate: true, shouldDirty: true });
    }
  }, [applicantName, pledgeName, setValue]);

  const isTueNight = useMemo(() => {
    return isTuesdayNightOverlap(selectedDate, startTime, endTime);
  }, [selectedDate, startTime, endTime]);

  const allowedRanges = useMemo(() => {
    if (!selectedDate) return operatingRangesForDate("2099-12-31"); // fallback(평일 규칙 반환)
    return operatingRangesForDate(selectedDate);
  }, [selectedDate]);

  const startOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of allowedRanges) {
      const rs = toMinutes(r.start);
      const re = toMinutes(r.end);
      for (let t = rs; t + 60 <= re; t += 30) {
        // start는 end-1시간(최소)까지만
        set.add(fromMinutes(t));
      }
    }
    return Array.from(set).sort();
  }, [allowedRanges]);

  const endOptions = useMemo(() => {
    // startTime이 속한 구간을 찾아서 그 안에서만 종료시간을 뽑는다(화요일 야간/주간 분리 대응)
    const stM = toMinutes(startTime);

    const r = allowedRanges.find((rg) => toMinutes(rg.start) <= stM && stM < toMinutes(rg.end)) ?? allowedRanges[0];
    if (!r) return [] as string[];

    // 최소 1시간, 최대 6시간(360분), 30분 단위
    const cap = Math.min(toMinutes(r.end), stM + 360);
    const ends: string[] = [];
    for (let t = stM + 60; t <= cap; t += 30) {
      ends.push(fromMinutes(t));
    }
    return ends;
  }, [allowedRanges, startTime]);

  // 추가 회차용 시간 옵션(운영시간 규칙만 반영)
  const addAllowedRanges = useMemo(() => {
    const d = addDate || selectedDate;
    if (!d) return operatingRangesForDate("2099-12-31");
    return operatingRangesForDate(d);
  }, [addDate, selectedDate]);

  const addStartOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of addAllowedRanges) {
      const rs = toMinutes(r.start);
      const re = toMinutes(r.end);
      for (let t = rs; t + 60 <= re; t += 30) set.add(fromMinutes(t));
    }
    return Array.from(set).sort();
  }, [addAllowedRanges]);

  const addEndOptions = useMemo(() => {
    const stM = toMinutes(addStartTime);
    const r = addAllowedRanges.find((rg) => toMinutes(rg.start) <= stM && stM < toMinutes(rg.end)) ?? addAllowedRanges[0];
    if (!r) return [] as string[];
    const cap = Math.min(toMinutes(r.end), stM + 360);
    const ends: string[] = [];
    for (let t = stM + 60; t <= cap; t += 30) ends.push(fromMinutes(t));
    return ends;
  }, [addAllowedRanges, addStartTime]);

  useEffect(() => {
    if (!addDate) return;
    const safeStart = addStartOptions.includes(addStartTime) ? addStartTime : addStartOptions[0];
    if (safeStart && safeStart !== addStartTime) setAddStartTime(safeStart);

    const safeEndList = (() => {
      const st = safeStart ?? addStartOptions[0];
      const stM = toMinutes(st);
      const r = addAllowedRanges.find((rg) => toMinutes(rg.start) <= stM && stM < toMinutes(rg.end)) ?? addAllowedRanges[0];
      if (!r) return [] as string[];
      const arr: string[] = [];
      const cap = Math.min(toMinutes(r.end), stM + 360);
      for (let t = stM + 60; t <= cap; t += 30) arr.push(fromMinutes(t));
      return arr;
    })();

    const safeEnd = safeEndList.includes(addEndTime) ? addEndTime : safeEndList[0];
    if (safeEnd && safeEnd !== addEndTime) setAddEndTime(safeEnd);
  }, [addDate, addStartOptions, addAllowedRanges, addStartTime, addEndTime]);

  const durationMinutes = useMemo(() => {
    if (!startTime || !endTime) return 0;
    const d = toMinutes(endTime) - toMinutes(startTime);
    return Number.isFinite(d) ? Math.max(0, d) : 0;
  }, [startTime, endTime]);

  // 날짜/시간 옵션이 바뀔 때(=날짜 선택/변경) 현재 값이 허용범위 밖이면 자동 보정
  useEffect(() => {
    if (prefillLocked) return;
    if (!selectedDate) return;

    const safeStart = startOptions.includes(startTime) ? startTime : startOptions[0];
    if (safeStart && safeStart !== startTime) {
      setValue("startTime", safeStart, { shouldValidate: true, shouldDirty: true });
    }

    const safeEndList = (() => {
      const st = safeStart ?? startOptions[0];
      const stM = toMinutes(st);
      const r = allowedRanges.find((rg) => toMinutes(rg.start) <= stM && stM < toMinutes(rg.end)) ?? allowedRanges[0];
      if (!r) return [] as string[];
      const arr: string[] = [];
      const cap = Math.min(toMinutes(r.end), stM + 360);
      for (let t = stM + 60; t <= cap; t += 30) arr.push(fromMinutes(t));
      return arr;
    })();

    const safeEnd = safeEndList.includes(endTime) ? endTime : safeEndList[0];
    if (safeEnd && safeEnd !== endTime) {
      setValue("endTime", safeEnd, { shouldValidate: true, shouldDirty: true });
    }
  }, [prefillLocked, selectedDate, startOptions, allowedRanges, startTime, endTime, setValue]);

  const equipment = watch(["laptop", "projector", "audio"]);
  const equipmentFee =
    (equipment[0] ? EQUIPMENT_FEE_KRW.laptop : 0) +
    (equipment[1] ? EQUIPMENT_FEE_KRW.projector : 0) +
    (equipment[2] ? EQUIPMENT_FEE_KRW.audio : 0);

  const roomMeta = useMemo(() => getRoom(roomId), [roomId]);
  const hourlyFee = roomMeta?.feeKRW ?? 0;
  const rentalFee = useMemo(() => {
    if (!hourlyFee || !durationMinutes) return 0;
    // 30분 단위이므로 (feeKRW * minutes / 60)은 사실상 정수로 떨어짐
    return Math.round((hourlyFee * durationMinutes) / 60);
  }, [hourlyFee, durationMinutes]);

  async function onSubmit(values: RequestInput) {
    setError(null);
    setBatchError(null);
    setSubmitting(true);
    try {
      const fd = new FormData();

      Object.entries(values).forEach(([k, v]) => {
        if (typeof v === "boolean") fd.set(k, v ? "true" : "false");
        else fd.set(k, String(v));
      });

      // 여러 회차(날짜/시간) 전달: 서버에서 회차별 운영시간/충돌 검증 후 batch로 저장
      const sessions = [
        { date: values.date, startTime: values.startTime, endTime: values.endTime },
        ...extraSessions,
      ].filter((s) => s.date && s.startTime && s.endTime);
      fd.set("sessions", JSON.stringify(sessions));

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

  const allSessions = useMemo(() => {
    const base = selectedDate && startTime && endTime ? [{ date: selectedDate, startTime, endTime }] : [];
    const merged = [...base, ...extraSessions];
    // 정렬: 날짜 → 시작시간
    return merged
      .filter((s) => s.date && s.startTime && s.endTime)
      .sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.startTime.localeCompare(b.startTime);
      });
  }, [selectedDate, startTime, endTime, extraSessions]);

  const bundle = useMemo(() => {
    const sessions = allSessions;
    const sessionCount = sessions.length;
    let totalDurationMin = 0;
    let rentalSum = 0;
    for (const s of sessions) {
      const dur = toMinutes(s.endTime) - toMinutes(s.startTime);
      if (!Number.isFinite(dur) || dur <= 0) continue;
      totalDurationMin += dur;
      if (hourlyFee > 0) rentalSum += Math.round((hourlyFee * dur) / 60);
    }
    const equipmentSum = equipmentFee * sessionCount;
    const total = rentalSum + equipmentSum;
    return { sessionCount, totalDurationMin, rentalSum, equipmentSum, total };
  }, [allSessions, hourlyFee, equipmentFee]);


  function addSession() {
    setSessionError(null);
    const d = String(addDate || "").trim();
    const st = String(addStartTime || "").trim();
    const en = String(addEndTime || "").trim();
    if (!d || !st || !en) {
      setSessionError("추가 회차의 날짜/시간을 선택해 주세요.");
      return;
    }
    const dd = new Date(d + "T00:00:00");
    if (dd.getDay() === 0) {
      setSessionError("일요일은 휴관일로 선택할 수 없습니다.");
      return;
    }
    const stM = toMinutes(st);
    const enM = toMinutes(en);
    if (!Number.isFinite(stM) || !Number.isFinite(enM) || enM <= stM) {
      setSessionError("추가 회차의 시간 설정이 올바르지 않습니다.");
      return;
    }
    const dur = enM - stM;
    if (dur < 60) {
      setSessionError("최소 1시간 이상 선택해 주세요.");
      return;
    }
    if (dur > 360) {
      setSessionError("최대 6시간까지 선택할 수 있습니다.");
      return;
    }

    const ranges = operatingRangesForDate(d);
    const within = ranges.some((r) => {
      const rs = toMinutes(r.start);
      const re = toMinutes(r.end);
      return stM >= rs && enM <= re;
    });
    if (!within) {
      setSessionError("선택한 날짜의 운영시간을 벗어납니다.");
      return;
    }

    // 중복/겹침 방지(같은 날짜 내 겹치면 불가)
    const candidate = { date: d, startTime: st, endTime: en };
    const current = allSessions;
    if (current.some((s) => s.date === candidate.date && s.startTime === candidate.startTime && s.endTime === candidate.endTime)) {
      setSessionError("이미 추가된 회차입니다.");
      return;
    }
    const overlap = current
      .filter((s) => s.date === candidate.date)
      .some((s) => {
        const a1 = toMinutes(s.startTime);
        const a2 = toMinutes(s.endTime);
        return stM < a2 && enM > a1;
      });
    if (overlap) {
      setSessionError("같은 날짜에 겹치는 시간대가 있어 추가할 수 없습니다.");
      return;
    }
    if (current.length >= 20) {
      setSessionError("최대 20회차까지 한 번에 신청할 수 있습니다.");
      return;
    }

    setExtraSessions((prev) => [...prev, candidate]);
  }

  function removeExtraSession(s: { date: string; startTime: string; endTime: string }) {
    setExtraSessions((prev) => prev.filter((x) => !(x.date === s.date && x.startTime === s.startTime && x.endTime === s.endTime)));
  }

  return (
    <div>
      <SiteHeader title="대관신청" backHref="/space" backLabel="목록" />

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-8">
        <h2 className="text-2xl font-bold">대관신청서 작성</h2>
        <p className={SECTION_DESC}>온라인으로 신청서를 작성하면 관리자 검토/승인 절차를 거쳐 확정됩니다.</p>

        <div className="mt-4">
          <OperatingHoursNotice />
        </div>

        <div className="mt-5">
          <Notice title="신청 전 확인" variant="info" pad="md">
            <ul className="list-disc space-y-1 pl-5">
              <li>
                시간은 <b>30분 단위</b>로 선택되며, 최소 1시간~최대 6시간까지 신청 가능합니다.
              </li>
              <li>“대관 일정 추가하기”를 이용하면 <b>여러 날짜/시간</b>을 한 번에 신청할 수 있습니다.</li>
              <li>신청 시 ‘정규 수업시간/관리자 차단/기 승인 일정’과 충돌하면 자동으로 신청이 제한됩니다.</li>
              <li>상세 화면의 “공간정보 및 시설안내 / 취소·환불규정”을 확인한 후 신청해 주세요.</li>
            </ul>
          </Notice>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-8">
          {/* hidden - date/roomId are driven by UI */}
          <input type="hidden" {...register("roomId")} />
          <input type="hidden" {...register("date")} />

          {error ? (
            <Notice variant="danger" title="처리 중 오류가 발생했습니다" pad="md">
              {error}
            </Notice>
          ) : null}

          {batchError ? (
            <Notice variant="warn" title="일부 회차는 신청할 수 없습니다" pad="md">
              <div className="whitespace-pre-line text-sm">{batchError}</div>
            </Notice>
          ) : null}

          <Card pad="lg">
            <div className="flex items-center justify-between gap-3">
              <h3 className={SECTION_TITLE}>대관 일시</h3>
              {prefillLocked ? (
                <Link
                  href={`/space/${encodeURIComponent(roomId)}`}
                  className="text-xs font-semibold text-[rgb(var(--brand-primary))] hover:underline"
                >
                  시간/날짜 변경
                </Link>
              ) : null}
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="floor">층</FieldLabel>
                <Select
                  id="floor"
                  value={floorId}
                  onChange={(e) => setFloorId(e.target.value as any)}
                  disabled={prefillLocked}
                >
                  {FLOORS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <FieldLabel htmlFor="room">강의실</FieldLabel>
                <Select
                  id="room"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  disabled={prefillLocked}
                >
                  {floor.rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <FieldLabel htmlFor="date">날짜 *</FieldLabel>
                <Input
                  id="date"
                  type="date"
                  value={selectedDate ?? ""}
                  disabled={prefillLocked}
                  min={todayYmdSeoul()}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) {
                      setValue("date", "", { shouldValidate: true, shouldDirty: true });
                      return;
                    }
                    const d = new Date(v + "T00:00:00");
                    if (d.getDay() === 0) {
                      setValue("date", "", { shouldValidate: true, shouldDirty: true });
                      setFormError("date", { type: "manual", message: "일요일은 휴관일로 선택할 수 없습니다." });
                      return;
                    }
                    clearErrors("date");
                    setValue("date", v, { shouldValidate: true, shouldDirty: true });
                  }}
                />
                {errors.date ? <FieldHelp className="text-red-600">{errors.date.message}</FieldHelp> : null}
                {!prefillLocked ? <FieldHelp>* 일요일은 휴관입니다.</FieldHelp> : null}

                {/* 여러 회차(날짜/시간) 묶음 신청 */}
                <div className="mt-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 w-full px-3 sm:w-auto"
                    disabled={!selectedDate}
                    onClick={() => {
                      if (!selectedDate) return;
                      setBatchError(null);
                      setSessionError(null);
                      setExtraOpen(true);
                    }}
                  >
                    대관 일정 추가하기
                  </Button>

                  {extraSessions.length > 0 ? (
                    <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
                      <div className="divide-y divide-slate-100">
                        {allSessions.map((s) => {
                          const isBase = s.date === selectedDate && s.startTime === startTime && s.endTime === endTime;
                          return (
                            <div
                              key={`${s.date}|${s.startTime}|${s.endTime}`}
                              className="flex items-center justify-between gap-3 px-4 py-3 text-xs text-slate-700"
                            >
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-semibold text-slate-900">{s.date}</span>
                                  <span className="text-slate-700">{s.startTime}~{s.endTime}</span>
                                  {isBase ? (
                                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600">
                                      기본
                                    </span>
                                  ) : null}
                                </div>
                              </div>

                              {!isBase ? (
                                <button
                                  type="button"
                                  className="shrink-0 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-600 hover:bg-slate-50"
                                  onClick={() => removeExtraSession(s)}
                                  aria-label={`회차 삭제: ${s.date} ${s.startTime}-${s.endTime}`}
                                >
                                  삭제
                                </button>
                              ) : (
                                <span className="text-[10px] text-slate-400">삭제 불가</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabel htmlFor="startTime">시작 시간 *</FieldLabel>
                  <Select
                    id="startTime"
                    {...register("startTime")}
                    disabled={prefillLocked || !selectedDate}
                  >
                    {startOptions.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </Select>
                  {errors.startTime ? (
                    <FieldHelp className="text-red-600">{errors.startTime.message}</FieldHelp>
                  ) : null}
                </div>

                <div>
                  <FieldLabel htmlFor="endTime">종료 시간 *</FieldLabel>
                  <Select id="endTime" {...register("endTime")} disabled={prefillLocked || !selectedDate}>
                    {endOptions.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </Select>
                  {errors.endTime ? <FieldHelp className="text-red-600">{errors.endTime.message}</FieldHelp> : null}
                </div>
              </div>
            </div>

            <div className="mt-3 text-xs text-slate-700">
              기본 회차 이용시간: <b>{durationMinutes ? fmtDuration(durationMinutes) : "-"}</b>
              {bundle.sessionCount > 1 ? (
                <span className="ml-2 text-slate-600">
                  · 총 이용시간: <b>{bundle.totalDurationMin ? fmtDuration(bundle.totalDurationMin) : "-"}</b> (총 {bundle.sessionCount}회차)
                </span>
              ) : null}
            </div>

            {hourlyFee > 0 && bundle.sessionCount > 0 && bundle.totalDurationMin > 0 ? (
              <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-end justify-between gap-3 text-sm text-slate-700">
                  <span>
                    {bundle.sessionCount > 1 ? (
                      <>
                        예상 대관 이용료 합계 (총 {bundle.sessionCount}회차, 시간당 {hourlyFee.toLocaleString()}원)
                      </>
                    ) : (
                      <>예상 대관 이용료 (시간당 {hourlyFee.toLocaleString()}원)</>
                    )}
                  </span>
                  <span className="text-base font-semibold text-slate-900">
                    {(bundle.sessionCount > 1 ? bundle.rentalSum : rentalFee).toLocaleString()}원
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-slate-500">
                  ※ 기자재 사용료 별도{bundle.sessionCount > 1 ? " (회차별 합산)" : ""}
                </div>
              </div>
            ) : null}

            {isTueNight ? (
              <div className="mt-2">
                <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                  화요일 야간 운영시간입니다
                </span>
              </div>
            ) : null}

            <FieldHelp className="mt-2">
              ※ 시간은 <b>30분 단위</b>로 선택할 수 있습니다. (최소 1시간, 최대 6시간)
              <br />※ 신청 시 “수업시간/차단/이미 신청된 일정”과 충돌하면 신청이 제한됩니다.
            </FieldHelp>
          </Card>

          <Card pad="lg">
            <h3 className={SECTION_TITLE}>신청자 정보</h3>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="applicantName">성명 *</FieldLabel>
                <Input id="applicantName" {...register("applicantName")} placeholder="홍길동" />
                {errors.applicantName ? (
                  <FieldHelp className="text-red-600">{errors.applicantName.message}</FieldHelp>
                ) : null}
              </div>

              <div>
                <FieldLabel htmlFor="birth">생년월일 *</FieldLabel>
                <Input id="birth" type="date" {...register("birth")} />
                {errors.birth ? <FieldHelp className="text-red-600">{errors.birth.message}</FieldHelp> : null}
              </div>

              <div className="md:col-span-2">
                <FieldLabel htmlFor="address">주소 *</FieldLabel>
                <Input
                  id="address"
                  {...register("address")}
                  placeholder="서울특별시 서운로26길 3, 4층"
                />
                {errors.address ? <FieldHelp className="text-red-600">{errors.address.message}</FieldHelp> : null}
              </div>

              <div>
                <FieldLabel htmlFor="phone">연락처 *</FieldLabel>
                <Input
                  id="phone"
                  {...register("phone", {
                    onChange: (e) => {
                      const formatted = formatPhoneKR((e.target as HTMLInputElement).value);
                      setValue("phone", formatted, { shouldDirty: true, shouldValidate: true });
                    },
                  })}
                  placeholder="010-0000-0000"
                  inputMode="numeric"
                  autoComplete="tel"
                />
                {errors.phone ? <FieldHelp className="text-red-600">{errors.phone.message}</FieldHelp> : null}
              </div>

              <div>
                <FieldLabel htmlFor="email">이메일 *</FieldLabel>
                <Input id="email" type="email" {...register("email")} placeholder="example@email.com" />
                {errors.email ? <FieldHelp className="text-red-600">{errors.email.message}</FieldHelp> : null}
              </div>
            </div>
          </Card>

          <Card pad="lg">
            <h3 className={SECTION_TITLE}>단체/행사 정보</h3>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="orgName">단체명 *</FieldLabel>
                <Input id="orgName" {...register("orgName")} />
                {errors.orgName ? <FieldHelp className="text-red-600">{errors.orgName.message}</FieldHelp> : null}
              </div>

              <div>
                <FieldLabel htmlFor="headcount">인원 *</FieldLabel>
                <Input
                  id="headcount"
                  type="number"
                  min={1}
                  {...register("headcount", { valueAsNumber: true })}
                />
                {errors.headcount ? <FieldHelp className="text-red-600">{errors.headcount.message}</FieldHelp> : null}
              </div>

              <div className="md:col-span-2">
                <FieldLabel htmlFor="purpose">사용 목적/행사 내용 *</FieldLabel>
                <Textarea id="purpose" {...register("purpose")} rows={4} />
                {errors.purpose ? <FieldHelp className="text-red-600">{errors.purpose.message}</FieldHelp> : null}
              </div>
            </div>
          </Card>

          <Card pad="lg">
            <h3 className={SECTION_TITLE}>장비 사용(선택)</h3>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <Checkbox {...register("laptop")} label="노트북" />
              <Checkbox {...register("projector")} label="프로젝터" />
              <Checkbox {...register("audio")} label="음향" />
            </div>
            <FieldHelp className="mt-3">
              * 장비 사용료 (회차당): <b>{equipmentFee.toLocaleString()}</b>원 (기준: 노트북 {EQUIPMENT_FEE_KRW.laptop.toLocaleString()}원 /
              프로젝터 {EQUIPMENT_FEE_KRW.projector.toLocaleString()}원 / 음향 {EQUIPMENT_FEE_KRW.audio.toLocaleString()}원)
              {bundle.sessionCount > 1 ? (
                <>
                  <br />* 장비 사용료 합계 (총 {bundle.sessionCount}회차): <b>{bundle.equipmentSum.toLocaleString()}</b>원
                </>
              ) : null}
            </FieldHelp>
          </Card>

          <Card pad="lg">
            <h3 className={SECTION_TITLE}>이용요금 안내</h3>
            <div className="mt-4">
              <Notice variant="info" title="대관 이용료 및 장비 사용료" pad="md">
                <div className="space-y-2 text-sm">
                  <div className="flex items-baseline gap-3">
                    <span className="text-slate-700">
                      {bundle.sessionCount > 1 ? (
                        <>
                          대관 이용료 합계 (총 {bundle.sessionCount}회차 · {bundle.totalDurationMin ? fmtDuration(bundle.totalDurationMin) : "-"})
                        </>
                      ) : (
                        <>대관 이용료 {durationMinutes ? `(${fmtDuration(durationMinutes)})` : ""}</>
                      )}
                    </span>
                    <span
                      aria-hidden
                      className="flex-1 border-b border-dotted border-slate-300 translate-y-[-2px]"
                    />
                    <span className="font-semibold text-slate-900 tabular-nums">{bundle.rentalSum.toLocaleString()}원</span>
                  </div>

                  <div className="flex items-baseline gap-3">
                    <span className="text-slate-700">
                      {bundle.sessionCount > 1 ? <>장비 사용료 합계 (총 {bundle.sessionCount}회차)</> : <>장비 사용료</>}
                    </span>
                    <span
                      aria-hidden
                      className="flex-1 border-b border-dotted border-slate-300 translate-y-[-2px]"
                    />
                    <span className="font-semibold text-slate-900 tabular-nums">{bundle.equipmentSum.toLocaleString()}원</span>
                  </div>

                  <div className="mt-2 flex items-baseline gap-3 border-t border-slate-200 pt-2">
                    <span className="font-semibold text-slate-900">총 금액</span>
                    <span
                      aria-hidden
                      className="flex-1 border-b border-dotted border-slate-300 translate-y-[-2px]"
                    />
                    <span className="text-base font-bold text-slate-900 tabular-nums">{bundle.total.toLocaleString()}원</span>
                  </div>

                  <div className="mt-1 text-[11px] text-slate-500">
                    ※ 장비 사용료는 선택 항목에 따라 변동되며, 선택한 회차 수 기준으로 합산됩니다.
                  </div>
                </div>
              </Notice>
            </div>
          </Card>

          <Card pad="lg">
            <h3 className={SECTION_TITLE}>동의/서약</h3>
            <div className="mt-4">
              {/* privacyAgree는 모달 동의/비동의로만 결정 */}
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
            </div>
            <div className="mt-4">
              {/* pledgeAgree는 모달 동의/비동의로만 결정 */}
              <input type="hidden" {...register("pledgeAgree")} />
              <Checkbox
                checked={!!pledgeAgree}
                readOnly
                onClick={(e) => {
                  // 체크박스 클릭 시에도 "서약서 모달"이 먼저 열리도록 강제
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
              <FieldHelp className="mt-1">
                * 체크 시 서약서 내용을 확인한 후 동의 여부가 반영됩니다.
              </FieldHelp>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="pledgeDate">서약 일자 *</FieldLabel>
                {/* 신청 당일로 고정 */}
                <input type="hidden" {...register("pledgeDate")} />
                <Input id="pledgeDate" type="text" value={fixedPledgeDate} readOnly className="bg-slate-50 text-slate-700" />
                {errors.pledgeDate ? <FieldHelp className="text-red-600">{errors.pledgeDate.message}</FieldHelp> : null}
              </div>

              <div>
                <FieldLabel htmlFor="pledgeName">서약자 성명 *</FieldLabel>
                <Input
                  id="pledgeName"
                  {...register("pledgeName", {
                    onChange: (e) => {
                      // 사용자가 직접 수정하면 자동 동기화 중단(원하면 다시 비워서 자동 채움 가능)
                      pledgeAutoFillRef.current = (e.target as HTMLInputElement).value.trim() === "";
                    },
                  })}
                />
                {errors.pledgeName ? <FieldHelp className="text-red-600">{errors.pledgeName.message}</FieldHelp> : null}
              </div>
            </div>
          </Card>

          <Button type="submit" variant="primary" disabled={submitting} className="w-full py-3 shadow-sm hover:opacity-90">
            {submitting ? "신청 중..." : "신청하기"}
          </Button>
        </form>

        {/* 추가 회차 모달 */}
        {extraOpen ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="extra-session-modal-title"
          >
            <button
              type="button"
              className="absolute inset-0 bg-black/40"
              aria-label="모달 닫기"
              onClick={() => {
                setExtraOpen(false);
                setSessionError(null);
              }}
              tabIndex={-1}
            />

            <div className="relative w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-xl">
              <div className="flex items-center justify-between border-b px-5 py-4">
                <h3 id="extra-session-modal-title" className="text-base font-semibold">대관 일정 추가</h3>
                <button
                  type="button"
                  onClick={() => {
                    setExtraOpen(false);
                    setSessionError(null);
                  }}
                  className="rounded-lg px-2 py-1 text-sm text-gray-600 hover:bg-gray-100"
                  aria-label="모달 닫기"
                >
                  닫기
                </button>
              </div>

              <div className="max-h-[70vh] overflow-auto px-5 py-4">
                <p className="text-sm text-gray-700">날짜/시간이 다른 여러 회차를 한 번에 신청할 수 있습니다.</p>

                {sessionError ? (
                  <div className="mt-4">
                    <Notice variant="warn" title="일정 추가를 진행할 수 없습니다" pad="md">
                      <div className="whitespace-pre-line text-sm">{sessionError}</div>
                    </Notice>
                  </div>
                ) : null}

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {/* 입력 */}
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="text-xs font-semibold text-slate-900">일정 추가</div>

                    <div className="mt-2 grid gap-2">
                      <div>
                        <FieldLabel htmlFor="addDate" className="text-[11px]">날짜</FieldLabel>
                        <Input
                          id="addDate"
                          type="date"
                          value={addDate}
                          min={todayYmdSeoul()}
                          disabled={!selectedDate}
                          onChange={(e) => setAddDate(e.target.value)}
                        />
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2">
                        <div>
                          <FieldLabel htmlFor="addStartTime" className="text-[11px]">시작</FieldLabel>
                          <Select
                            id="addStartTime"
                            value={addStartTime}
                            disabled={!selectedDate || !addDate}
                            onChange={(e) => setAddStartTime(e.target.value)}
                          >
                            {addStartOptions.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </Select>
                        </div>

                        <div>
                          <FieldLabel htmlFor="addEndTime" className="text-[11px]">종료</FieldLabel>
                          <Select
                            id="addEndTime"
                            value={addEndTime}
                            disabled={!selectedDate || !addDate}
                            onChange={(e) => setAddEndTime(e.target.value)}
                          >
                            {addEndOptions.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </Select>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-end">
                      <Button
                        variant="outline"
                        className="h-10 px-3"
                        disabled={!selectedDate || !addDate || !addStartTime || !addEndTime}
                        onClick={addSession}
                        type="button"
                      >
                        일정 추가
                      </Button>
                    </div>

                    <FieldHelp className="mt-2">
                      * “기본” 회차와 동일한 일정은 자동으로 중복 추가되지 않습니다.
                    </FieldHelp>
                  </div>

                  {/* 목록 */}
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-semibold text-slate-900">선택된 일정</div>
                      <div className="text-[11px] text-slate-500">
                        총 <b>{allSessions.length}</b>회차
                      </div>
                    </div>

                    {allSessions.length > 0 ? (
                      <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white">
                        {allSessions.map((s) => {
                          const isBase = s.date === selectedDate && s.startTime === startTime && s.endTime === endTime;
                          return (
                            <div
                              key={`${s.date}|${s.startTime}|${s.endTime}`}
                              className="flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-2 text-xs text-slate-700 first:border-t-0"
                            >
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-semibold text-slate-900">{s.date}</span>
                                  <span className="text-slate-700">{s.startTime}~{s.endTime}</span>
                                  {isBase ? (
                                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600">
                                      기본
                                    </span>
                                  ) : null}
                                </div>
                              </div>

                              {!isBase ? (
                                <button
                                  type="button"
                                  className="shrink-0 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-600 hover:bg-slate-50"
                                  onClick={() => removeExtraSession(s)}
                                  aria-label={`회차 삭제: ${s.date} ${s.startTime}-${s.endTime}`}
                                >
                                  삭제
                                </button>
                              ) : (
                                <span className="text-[10px] text-slate-400">삭제 불가</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="mt-2 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                        추가 일정이 없습니다. 왼쪽에서 날짜/시간을 선택 후 “일정 추가”를 눌러주세요.
                      </div>
                    )}

                    <FieldHelp className="mt-2">
                      ※ “기본” 회차는 삭제할 수 없습니다. (기본 회차를 바꾸려면 바깥 화면에서 날짜/시간을 변경하세요.)
                    </FieldHelp>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t bg-white px-5 py-4">
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => {
                    setExtraOpen(false);
                    setSessionError(null);
                  }}
                >
                  완료
                </Button>
              </div>
            </div>
          </div>
        ) : null}

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
