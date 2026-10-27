"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { RequestInputSchema, type RequestInput } from "@/lib/schema";
import { EQUIPMENT_FEE_KRW, STUDIO_EQUIPMENT_FEE_KRW, STUDIO_EQUIPMENT_LABELS } from "@/lib/config";
import { operatingRangesForDate, isTuesdayNightOverlap } from "@/lib/operating";
import { toMinutes, todayYmdSeoul } from "@/lib/datetime";
import { FLOORS, FLOORS_WITH_ALL } from "@/lib/floors";
import { getRoom } from "@/lib/space";
import SiteHeader from "@/components/SiteHeader";
import PledgeModal from "@/components/PledgeModal";
import PrivacyModal from "@/components/PrivacyModal";
import OperatingHoursNotice from "@/components/OperatingHoursNotice";
import DatePickerCalendar from "@/components/DatePickerCalendar";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Card from "@/components/ui/Card";
import Notice from "@/components/ui/Notice";
import Checkbox from "@/components/ui/Checkbox";
import { FieldHelp, FieldLabel, Input, Select, Textarea } from "@/components/ui/Field";
import { SECTION_DESC, SECTION_TITLE } from "@/components/ui/presets";
import PaymentFlowText, { paymentFlowBold } from "@/components/PaymentFlowText";
import MissingFieldsSummary, { type MissingField } from "@/components/apply/MissingFieldsSummary";
import { PAYMENT_FLOW_SHORT } from "@/lib/policy";
import { computeBaseTotalKRW } from "@/lib/pricing";
import { handleApplySuccess, parseApplyError } from "@/lib/applySubmit";

/** E-스튜디오 이용 인원 상한(01_spec ③-E) — 서버도 capacity로 다시 검사한다 */
const STUDIO_MAX_HEADCOUNT_MESSAGE = "E-스튜디오 최대 인원은 12명입니다.";
const STUDIO_MIN_HEADCOUNT_MESSAGE = "이용 인원을 1명 이상 입력해 주세요.";

const ApplyFormSchema = RequestInputSchema.superRefine((v, ctx) => {
  const room = getRoom(v.roomId);
  if (room?.category === "studio" && Number(v.headcount) > (room.capacity ?? 12)) {
    ctx.addIssue({ code: "custom", path: ["headcount"], message: STUDIO_MAX_HEADCOUNT_MESSAGE });
  }
});

/** 빠진 항목 요약용 라벨·포커스 대상(01_spec · ux.md Top④) */
const FIELD_META: Array<{ key: keyof RequestInput; label: string; targetId: string }> = [
  { key: "date", label: "날짜", targetId: "field-date" },
  { key: "startTime", label: "시작 시간", targetId: "startTime" },
  { key: "endTime", label: "종료 시간", targetId: "endTime" },
  { key: "applicantName", label: "성명", targetId: "applicantName" },
  { key: "birth", label: "생년월일", targetId: "birthYear" },
  { key: "address", label: "주소", targetId: "address" },
  { key: "phone", label: "연락처", targetId: "phone" },
  { key: "email", label: "이메일", targetId: "email" },
  { key: "orgName", label: "단체명", targetId: "orgName" },
  { key: "headcount", label: "인원", targetId: "headcount" },
  { key: "purpose", label: "사용 목적/행사 내용", targetId: "purpose" },
  { key: "privacyAgree", label: "개인정보 동의", targetId: "privacyAgreeBox" },
  { key: "pledgeAgree", label: "서약 동의", targetId: "pledgeAgreeBox" },
  { key: "pledgeName", label: "서약자 성명", targetId: "pledgeName" },
];

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
  const [errorTitle, setErrorTitle] = useState("처리 중 오류가 발생했습니다");
  const [batchError, setBatchError] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [extraOpen, setExtraOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [pledgeOpen, setPledgeOpen] = useState(false);
  const [prefillLocked, setPrefillLocked] = useState(false);
  const [confirmData, setConfirmData] = useState<RequestInput | null>(null);

  // ✅ 정규수업/차단/기존예약으로 불가한 슬롯 관리
  type UnavailableSlot = { start: string; end: string };
  const [unavailableSlots, setUnavailableSlots] = useState<UnavailableSlot[]>([]);

  // ✅ 여러 회차(날짜/시간이 달라도 됨)를 1회 신청으로 묶기(강의실 동일)
  type ExtraSession = { date: string; startTime: string; endTime: string };
  const [extraSessions, setExtraSessions] = useState<ExtraSession[]>([]);
  const [addDate, setAddDate] = useState<string>("");
  const [addStartTime, setAddStartTime] = useState<string>("");
  const [addEndTime, setAddEndTime] = useState<string>("");

  // 생년월일 수동 입력(년→월→일 자동 이동)
  const [birthYear, setBirthYear] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [birthDay, setBirthDay] = useState("");
  const birthMonthRef = useRef<HTMLInputElement>(null);
  const birthDayRef = useRef<HTMLInputElement>(null);

  const [floorId, setFloorId] = useState<"all" | "4" | "5" | "6" | "7">("all");
  const floor = useMemo(() => FLOORS_WITH_ALL.find((f) => f.id === floorId)!, [floorId]);
  const [roomId, setRoomId] = useState<string>(floor.rooms[0].id);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError: setFormError,
    clearErrors,
    formState: { errors, submitCount },
  } = useForm<RequestInput>({
    resolver: zodResolver(ApplyFormSchema),
    defaultValues: {
      roomId: roomId,
      date: "",
      startTime: "10:00",
      endTime: "12:00",
      orgName: "",
      headcount: 10,
      purpose: "",
      laptop: false,
      projector: false,
      audio: false,
      mirrorless: false,
      camcorder: false,
      wirelessMic: false,
      pinMic: false,
      rodeMic: false,
      electronicBoard: false,
      privacyAgree: false,
      pledgeAgree: false,
    },
  });

  // 생년월일 수동 입력 → RHF 동기화
  const handleBirthSync = useCallback((y: string, m: string, d: string) => {
    if (y.length === 4 && m.length >= 1 && d.length >= 1) {
      const mm = m.padStart(2, "0");
      const dd = d.padStart(2, "0");
      setValue("birth", `${y}-${mm}-${dd}`, { shouldValidate: true, shouldDirty: true });
    }
  }, [setValue]);

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
      if (matchedFloor) setFloorId(matchedFloor.id);
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

  // E-스튜디오 전환 시 단체/행사 정보 기본값 설정
  useEffect(() => {
    const meta = getRoom(roomId);
    if (meta?.category === "studio") {
      setValue("orgName", "-", { shouldDirty: true });
      // [결3] E-스튜디오 이용 인원 기본 2명(기본 인원) · 1~12
      setValue("headcount", 2, { shouldDirty: true });
      setValue("purpose", "E-스튜디오 대관", { shouldDirty: true });
    }
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

  useEffect(() => {
    if (!pledgeAutoFillRef.current) return;
    if (!applicantName) return;
    setValue("pledgeName", applicantName, { shouldValidate: true, shouldDirty: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicantName, setValue]);

  // ✅ 날짜+공간 변경 시 가용시간 조회 → 불가 슬롯 반영 + 공휴일 차단
  useEffect(() => {
    if (!selectedDate || !roomId) {
      setUnavailableSlots([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/availability?roomId=${encodeURIComponent(roomId)}&date=${encodeURIComponent(selectedDate)}`,
          { cache: "no-store" }
        );
        const data = await res.json();
        if (cancelled) return;

        // 공휴일·휴관일이면 날짜 초기화 + 에러 표시
        if (data?.reasonCode === "HOLIDAY_CLOSED" || data?.reasonCode === "NO_OPERATING_HOURS") {
          setValue("date", "", { shouldValidate: true, shouldDirty: true });
          setFormError("date", { type: "manual", message: data.reasonMessage ?? "해당 날짜는 휴관일입니다." });
          setUnavailableSlots([]);
          return;
        }

        const blocked = (data?.slots ?? [])
          .filter((s: { start: string; end: string; available: boolean }) => !s.available)
          .map((s: { start: string; end: string }) => ({ start: s.start, end: s.end }));
        setUnavailableSlots(blocked);
      } catch {
        if (!cancelled) setUnavailableSlots([]);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedDate, roomId, setValue, setFormError]);

  const isTueNight = useMemo(() => {
    return isTuesdayNightOverlap(selectedDate, startTime, endTime);
  }, [selectedDate, startTime, endTime]);

  const allowedRanges = useMemo(() => {
    if (!selectedDate) return operatingRangesForDate("2099-12-31"); // fallback(평일 규칙 반환)
    return operatingRangesForDate(selectedDate);
  }, [selectedDate]);

  // 불가 슬롯을 빠르게 조회하기 위한 Set (30분 단위 시작 시간)
  const blockedStartSet = useMemo(() => {
    const set = new Set<string>();
    for (const s of unavailableSlots) set.add(s.start);
    return set;
  }, [unavailableSlots]);

  const startOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of allowedRanges) {
      const rs = toMinutes(r.start);
      const re = toMinutes(r.end);
      for (let t = rs; t + 60 <= re; t += 30) {
        const time = fromMinutes(t);
        // 해당 30분 슬롯이 불가(수업/차단/기존예약)면 시작 시간에서 제외
        if (!blockedStartSet.has(time)) {
          set.add(time);
        }
      }
    }
    return Array.from(set).sort();
  }, [allowedRanges, blockedStartSet]);

  const endOptions = useMemo(() => {
    // startTime이 속한 구간을 찾아서 그 안에서만 종료시간을 뽑는다(화요일 야간/주간 분리 대응)
    const stM = toMinutes(startTime);

    const r = allowedRanges.find((rg) => toMinutes(rg.start) <= stM && stM < toMinutes(rg.end)) ?? allowedRanges[0];
    if (!r) return [] as string[];

    // 최소 1시간, 최대 6시간(360분), 30분 단위
    // 불가 슬롯을 만나면 그 이후 종료 시간은 모두 차단
    const cap = Math.min(toMinutes(r.end), stM + 360);
    const ends: string[] = [];
    for (let t = stM + 60; t <= cap; t += 30) {
      // startTime~t 범위 내 마지막 30분 슬롯(t-30)이 불가면 중단
      if (blockedStartSet.has(fromMinutes(t - 30))) break;
      ends.push(fromMinutes(t));
    }
    return ends;
  }, [allowedRanges, startTime, blockedStartSet]);

  // 추가 회차용 가용시간 조회 (날짜가 기본 회차와 다를 수 있으므로 별도 조회)
  const [addUnavailableSlots, setAddUnavailableSlots] = useState<UnavailableSlot[]>([]);
  const [addDateError, setAddDateError] = useState<string | null>(null);

  useEffect(() => {
    const d = addDate || selectedDate;
    if (!d || !roomId) {
      setAddUnavailableSlots([]);
      setAddDateError(null);
      return;
    }
    // 기본 회차와 같은 날짜면 같은 불가 슬롯 사용
    if (d === selectedDate) {
      setAddUnavailableSlots(unavailableSlots);
      setAddDateError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/availability?roomId=${encodeURIComponent(roomId)}&date=${encodeURIComponent(d)}`,
          { cache: "no-store" }
        );
        const data = await res.json();
        if (cancelled) return;

        // 공휴일·휴관일 차단
        if (data?.reasonCode === "HOLIDAY_CLOSED" || data?.reasonCode === "NO_OPERATING_HOURS") {
          setAddDate("");
          setAddDateError(data.reasonMessage ?? "해당 날짜는 휴관일입니다.");
          setAddUnavailableSlots([]);
          return;
        }
        setAddDateError(null);

        const blocked = (data?.slots ?? [])
          .filter((s: { start: string; end: string; available: boolean }) => !s.available)
          .map((s: { start: string; end: string }) => ({ start: s.start, end: s.end }));
        setAddUnavailableSlots(blocked);
      } catch {
        if (!cancelled) setAddUnavailableSlots([]);
      }
    })();
    return () => { cancelled = true; };
  }, [addDate, selectedDate, roomId, unavailableSlots]);

  const addBlockedStartSet = useMemo(() => {
    const set = new Set<string>();
    for (const s of addUnavailableSlots) set.add(s.start);
    return set;
  }, [addUnavailableSlots]);

  // 추가 회차용 시간 옵션(운영시간 + 가용시간 규칙 반영)
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
      for (let t = rs; t + 60 <= re; t += 30) {
        const time = fromMinutes(t);
        if (!addBlockedStartSet.has(time)) set.add(time);
      }
    }
    return Array.from(set).sort();
  }, [addAllowedRanges, addBlockedStartSet]);

  const addEndOptions = useMemo(() => {
    const stM = toMinutes(addStartTime);
    const r = addAllowedRanges.find((rg) => toMinutes(rg.start) <= stM && stM < toMinutes(rg.end)) ?? addAllowedRanges[0];
    if (!r) return [] as string[];
    const cap = Math.min(toMinutes(r.end), stM + 360);
    const ends: string[] = [];
    for (let t = stM + 60; t <= cap; t += 30) {
      if (addBlockedStartSet.has(fromMinutes(t - 30))) break;
      ends.push(fromMinutes(t));
    }
    return ends;
  }, [addAllowedRanges, addStartTime, addBlockedStartSet]);

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

  const roomMeta = useMemo(() => getRoom(roomId), [roomId]);
  const isStudioRoom = roomMeta?.category === "studio";
  const hourlyFee = roomMeta?.feeKRW ?? 0;

  const equipment = watch(["laptop", "projector", "audio"]);
  const studioEquip = watch(["mirrorless", "camcorder", "wirelessMic", "pinMic", "rodeMic", "electronicBoard"]);
  const equipmentFee = isStudioRoom
    ? (studioEquip[0] ? STUDIO_EQUIPMENT_FEE_KRW.mirrorless : 0) +
      (studioEquip[1] ? STUDIO_EQUIPMENT_FEE_KRW.camcorder : 0) +
      (studioEquip[2] ? STUDIO_EQUIPMENT_FEE_KRW.wirelessMic : 0) +
      (studioEquip[3] ? STUDIO_EQUIPMENT_FEE_KRW.pinMic : 0) +
      (studioEquip[4] ? STUDIO_EQUIPMENT_FEE_KRW.rodeMic : 0) +
      (studioEquip[5] ? STUDIO_EQUIPMENT_FEE_KRW.electronicBoard : 0)
    : (equipment[0] ? EQUIPMENT_FEE_KRW.laptop : 0) +
      (equipment[1] ? EQUIPMENT_FEE_KRW.projector : 0) +
      (equipment[2] ? EQUIPMENT_FEE_KRW.audio : 0);
  const headcountRaw = watch("headcount");
  const headcountNum = Number(headcountRaw);

  function handleConfirm(values: RequestInput) {
    setError(null);
    setBatchError(null);
    setConfirmData(values);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submitConfirmed() {
    if (!confirmData) return;
    await onSubmit(confirmData);
  }

  async function onSubmit(values: RequestInput) {
    setError(null);
    setErrorTitle("처리 중 오류가 발생했습니다");
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
        // ★ [2][6] 409 BATCH_CONFLICT(저장 전 겹침) / SLOT_TAKEN(저장 직후 먼저 들어온 신청) · 400 SESSION_INVALID(회차별)
        const v = parseApplyError(data, false);
        setErrorTitle(v.title);
        if (v.issueLines.length) setBatchError(v.issueLines.join("\n"));
        throw new Error(v.message);
      }
      const data = await res.json().catch(() => null);
      // ★ [1][10] 토큰은 sessionStorage(60분)에만 · 주소창에 넣지 않음
      router.push(handleApplySuccess(data, { screenFeeKRW: bundle.total }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "신청 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
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
    let extraHeadcountSum = 0;
    // [결3] 대관료(초과 인원 가산 포함)는 lib/pricing.ts computeBaseTotalKRW 한 곳에서 계산
    const hc = isStudioRoom && Number.isFinite(headcountNum) ? headcountNum : undefined;
    for (const s of sessions) {
      const dur = toMinutes(s.endTime) - toMinutes(s.startTime);
      if (!Number.isFinite(dur) || dur <= 0) continue;
      totalDurationMin += dur;
      const fee = computeBaseTotalKRW({
        roomId,
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
        equipment: { laptop: false, projector: false, audio: false },
        headcount: hc,
      });
      rentalSum += fee.rentalFeeKRW;
      extraHeadcountSum += fee.extraHeadcountFeeKRW;
    }
    const equipmentSum = equipmentFee * sessionCount;
    const total = rentalSum + equipmentSum;
    return { sessionCount, totalDurationMin, rentalSum, extraHeadcountSum, baseRentalSum: rentalSum - extraHeadcountSum, equipmentSum, total };
  }, [allSessions, equipmentFee, roomId, isStudioRoom, headcountNum]);

  /** E-스튜디오 추가 인원(기본 2명 초과분) */
  const studioBaseHeadcount = roomMeta?.baseHeadcount ?? 2;
  const studioExtraPersons = isStudioRoom && Number.isFinite(headcountNum) ? Math.max(0, Math.floor(headcountNum) - studioBaseHeadcount) : 0;
  const totalHoursText = String(Math.round((bundle.totalDurationMin / 60) * 100) / 100);

  /** 빠진 항목 — 제출을 한 번 눌러 오류가 생긴 뒤부터 버튼 위에 보인다 */
  //   (RHF errors 객체는 같은 참조로 바뀌므로 메모하지 않고 매 렌더 계산한다)
  const missingFields: MissingField[] =
    submitCount === 0
      ? []
      : FIELD_META.filter((f) => errors[f.key]).map((f) => ({
          key: f.key,
          label: f.key === "headcount" && isStudioRoom ? "이용 인원" : f.label,
          targetId: f.targetId,
        }));

  /** E-스튜디오 인원 오류 문구(01_spec ③-E) */
  // 상한 초과는 다른 칸이 비어 있어도 바로 알린다(superRefine은 기본 검사 통과 후에만 돈다)
  const studioOverCapacity = isStudioRoom && Number.isFinite(headcountNum) && headcountNum > (roomMeta?.capacity ?? 12);
  const headcountErrorText = studioOverCapacity
    ? STUDIO_MAX_HEADCOUNT_MESSAGE
    : errors.headcount
    ? isStudioRoom
      ? errors.headcount.message === STUDIO_MAX_HEADCOUNT_MESSAGE
        ? STUDIO_MAX_HEADCOUNT_MESSAGE
        : STUDIO_MIN_HEADCOUNT_MESSAGE
      : errors.headcount.message
    : null;


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

  // ─── 확인 화면 ───
  if (confirmData) {
    const confirmRoom = getRoom(confirmData.roomId);
    const confirmSessions = [
      { date: confirmData.date, startTime: confirmData.startTime, endTime: confirmData.endTime },
      ...extraSessions,
    ]
      .filter((s) => s.date && s.startTime && s.endTime)
      .sort((a, b) => (a.date !== b.date ? a.date.localeCompare(b.date) : a.startTime.localeCompare(b.startTime)));

    return (
      <div>
        <SiteHeader title="신청 내용 확인" backHref="/space" backLabel="목록" />
        <main className="mx-auto max-w-2xl px-4 pb-16 pt-8">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-slate-900">신청 내용 확인</h2>
            <p className="mt-2 text-sm text-slate-600">아래 내용을 확인하신 후 제출해 주세요.</p>
          </div>

          {error && (
            <div className="mt-4">
              <Notice variant="danger" title={errorTitle} pad="md">{error}</Notice>
            </div>
          )}
          {batchError && (
            <div className="mt-4">
              <Notice variant="warn" title="일부 회차는 신청할 수 없습니다" pad="md">
                <div className="whitespace-pre-line text-sm">{batchError}</div>
              </Notice>
            </div>
          )}

          <div className="mt-6 space-y-4">
            {/* 대관 일시 */}
            <Card pad="lg">
              <h3 className={SECTION_TITLE}>대관 일시</h3>
              <div className="mt-3 divide-y divide-slate-100">
                <div className="flex justify-between py-2.5">
                  <span className="text-sm text-slate-500">공간</span>
                  <span className="text-sm font-semibold text-slate-900">{confirmRoom?.name ?? confirmData.roomId}</span>
                </div>
                {confirmSessions.map((s, i) => (
                  <div key={`${s.date}|${s.startTime}`} className="flex justify-between py-2.5">
                    <span className="text-sm text-slate-500">{confirmSessions.length > 1 ? `${i + 1}회차` : "일시"}</span>
                    <span className="text-sm font-semibold text-slate-900">{s.date} {s.startTime}~{s.endTime}</span>
                  </div>
                ))}
                <div className="flex justify-between py-2.5">
                  <span className="text-sm text-slate-500">총 이용시간</span>
                  <span className="text-sm font-semibold text-slate-900">
                    {fmtDuration(bundle.totalDurationMin)}
                    {bundle.sessionCount > 1 ? ` (${bundle.sessionCount}회차)` : ""}
                  </span>
                </div>
                {confirmRoom?.category === "studio" ? (
                  <div className="flex justify-between py-2.5">
                    <span className="text-sm text-slate-500">이용 인원</span>
                    <span className="text-sm font-semibold text-slate-900">
                      {confirmData.headcount}명{studioExtraPersons > 0 ? ` (기본 ${studioBaseHeadcount}명 + 추가 ${studioExtraPersons}명)` : ""}
                    </span>
                  </div>
                ) : null}
              </div>
            </Card>

            {/* 신청자 정보 */}
            <Card pad="lg">
              <h3 className={SECTION_TITLE}>신청자 정보</h3>
              <div className="mt-3 divide-y divide-slate-100">
                {([
                  ["성명", confirmData.applicantName],
                  ["생년월일", confirmData.birth],
                  ["주소", confirmData.address],
                  ["연락처", confirmData.phone],
                  ["이메일", confirmData.email],
                ] as const).map(([label, value]) => (
                  <div key={label} className="flex justify-between py-2.5">
                    <span className="text-sm text-slate-500 shrink-0">{label}</span>
                    <span className="text-sm font-semibold text-slate-900 text-right">{value}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                이메일은 대관 승인 여부 및 신청 조회 등에 활용되므로 반드시 정확히 입력해 주세요.
              </p>
            </Card>

            {/* 단체/행사 정보 (E-스튜디오 제외) */}
            {confirmRoom?.category !== "studio" && (
              <Card pad="lg">
                <h3 className={SECTION_TITLE}>단체/행사 정보</h3>
                <div className="mt-3 divide-y divide-slate-100">
                  <div className="flex justify-between py-2.5">
                    <span className="text-sm text-slate-500">단체명</span>
                    <span className="text-sm font-semibold text-slate-900">{confirmData.orgName}</span>
                  </div>
                  <div className="flex justify-between py-2.5">
                    <span className="text-sm text-slate-500">인원</span>
                    <span className="text-sm font-semibold text-slate-900">{confirmData.headcount}명</span>
                  </div>
                  <div className="py-2.5">
                    <span className="text-sm text-slate-500">사용 목적/행사 내용</span>
                    <p className="mt-1.5 text-sm text-slate-900 whitespace-pre-line rounded-lg bg-slate-50 px-3 py-2">{confirmData.purpose}</p>
                  </div>
                </div>
              </Card>
            )}

            {/* 장비 사용 */}
            <Card pad="lg">
              <h3 className={SECTION_TITLE}>{isStudioRoom ? "촬영장비 사용" : "장비 사용"}</h3>
              <div className="mt-3">
                {isStudioRoom ? (
                  confirmData.mirrorless || confirmData.camcorder || confirmData.wirelessMic || confirmData.pinMic || confirmData.rodeMic || confirmData.electronicBoard ? (
                    <div className="flex flex-wrap gap-2">
                      {confirmData.mirrorless && <span className="rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-sm text-blue-800">미러리스</span>}
                      {confirmData.camcorder && <span className="rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-sm text-blue-800">캠코더</span>}
                      {confirmData.wirelessMic && <span className="rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-sm text-blue-800">무선 마이크</span>}
                      {confirmData.pinMic && <span className="rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-sm text-blue-800">핀 마이크</span>}
                      {confirmData.rodeMic && <span className="rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-sm text-blue-800">로데 마이크</span>}
                      {confirmData.electronicBoard && <span className="rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-sm text-blue-800">전자칠판</span>}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">선택 없음</p>
                  )
                ) : (
                  confirmData.laptop || confirmData.projector || confirmData.audio ? (
                    <div className="flex flex-wrap gap-2">
                      {confirmData.laptop && <span className="rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-sm text-blue-800">노트북</span>}
                      {confirmData.projector && <span className="rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-sm text-blue-800">프로젝터</span>}
                      {confirmData.audio && <span className="rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-sm text-blue-800">음향</span>}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">선택 없음</p>
                  )
                )}
              </div>
            </Card>

            {/* 예상 이용요금 */}
            <Card pad="lg">
              <h3 className={SECTION_TITLE}>예상 이용요금</h3>
              <div className="mt-3 overflow-hidden rounded-xl border border-line bg-white">
                <div className="px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between text-sm text-slate-600">
                    <span>대관료{bundle.sessionCount > 1 ? ` (${bundle.sessionCount}회차)` : ""}</span>
                    <span className="font-semibold text-slate-800 tabular-nums">{bundle.baseRentalSum.toLocaleString()}원</span>
                  </div>
                  {bundle.extraHeadcountSum > 0 ? (
                    <div className="flex items-center justify-between gap-3 text-sm text-slate-600">
                      <span>추가 인원 {studioExtraPersons}명 × 10,000원 × {totalHoursText}시간</span>
                      <span className="font-semibold text-slate-800 tabular-nums">{bundle.extraHeadcountSum.toLocaleString()}원</span>
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between text-sm text-slate-600">
                    <span>장비 사용료</span>
                    <span className="font-semibold text-slate-800 tabular-nums">{bundle.equipmentSum.toLocaleString()}원</span>
                  </div>
                </div>
                <div className="mx-4 mb-3 flex items-center justify-between rounded-xl bg-brand/[0.06] px-4 py-3">
                  <span className="text-sm font-bold text-slate-900">총 금액</span>
                  <span className="text-lg font-extrabold text-brand">{bundle.total.toLocaleString()}원</span>
                </div>
              </div>
            </Card>

            {/* 버튼 */}
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" className="flex-1 py-3" onClick={() => setConfirmData(null)}>
                수정하기
              </Button>
              <Button type="button" variant="primary" className="flex-1 py-3" disabled={submitting} onClick={submitConfirmed}>
                {submitting ? "제출 중..." : "최종 제출"}
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div>
      <SiteHeader title={isStudioRoom ? "E-스튜디오 대관신청" : "강의실 대관신청"} backHref="/space" backLabel="목록" />

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-8">
        <h2 className="text-2xl font-bold">{isStudioRoom ? "E-스튜디오" : "강의실"} 대관신청서 작성</h2>
        <p className={SECTION_DESC}>온라인으로 신청서를 작성하면 담당자 검토/승인 절차를 거쳐 확정됩니다.</p>

        <div className="mt-4">
          <OperatingHoursNotice />
        </div>

        <div className="mt-5">
          <Notice title="신청 전 확인" variant="info" pad="md">
            {isStudioRoom ? (
              <ul className="list-disc space-y-1 pl-5">
                <li>이용 시간은 <b>30분 단위</b>로 선택되며, 최소 1시간~최대 6시간까지 신청 가능합니다.</li>
                <li>기본 2인 기준 <b>시간당 20,000원</b>이며, 3인부터 1인마다 <b>시간당 10,000원</b>이 추가됩니다(최대 12인).</li>
                <li>촬영장비는 <b>별도 사용료</b>가 적용되며, 대관 이용 기간 중 1일 1회만 과금됩니다.</li>
                <li>촬영 시 <b>SD카드 또는 외장하드</b>를 반드시 준비해 주세요.</li>
                <li><PaymentFlowText text={PAYMENT_FLOW_SHORT("예약")} bold={paymentFlowBold("예약", "short")} /></li>
              </ul>
            ) : (
              <ul className="list-disc space-y-1 pl-5">
                <li>이용 시간은 <b>30분 단위</b>로 선택되며, 최소 1시간~최대 6시간까지 신청 가능합니다.</li>
                <li>&ldquo;대관 일정 추가하기&rdquo;를 이용하면 <b>여러 날짜/시간</b>을 한 번에 신청할 수 있습니다.</li>
                <li>기자재(노트북·빔프로젝터·음향) 사용 시 각 <b>10,000원</b>이 추가됩니다.</li>
                <li><PaymentFlowText text={PAYMENT_FLOW_SHORT("예약")} bold={paymentFlowBold("예약", "short")} /></li>
              </ul>
            )}
          </Notice>
        </div>

        <form onSubmit={handleSubmit(handleConfirm)} className="mt-6 space-y-8">
          {/* hidden - date/roomId are driven by UI */}
          <input type="hidden" {...register("roomId")} />
          <input type="hidden" {...register("date")} />

          {error ? (
            <Notice variant="danger" title={errorTitle} pad="md">
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
                  className="text-xs font-semibold text-brand hover:underline"
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
                  onChange={(e) => setFloorId(e.target.value as typeof floorId)}
                  disabled={prefillLocked}
                >
                  {FLOORS_WITH_ALL.map((f) => (
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

              <div id="field-date" tabIndex={-1} className="outline-none">
                <FieldLabel>날짜 *</FieldLabel>
                {prefillLocked ? (
                  <Input type="date" value={selectedDate ?? ""} disabled />
                ) : (
                  <DatePickerCalendar
                    value={selectedDate ?? ""}
                    roomId={roomId}
                    onChange={(ymd) => {
                      clearErrors("date");
                      setValue("date", ymd, { shouldValidate: true, shouldDirty: true });
                    }}
                  />
                )}
                {errors.date ? <FieldHelp className="text-red-600">{errors.date.message}</FieldHelp> : null}

                {/* 여러 회차(날짜/시간) 묶음 신청 */}
                <div className="mt-3">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-xl border border-dashed border-slate-300 bg-slate-50/50 px-4 py-3 text-left transition-colors hover:border-brand hover:bg-brand/[0.03] disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={!selectedDate}
                    onClick={() => {
                      if (!selectedDate) return;
                      setBatchError(null);
                      setSessionError(null);
                      setExtraOpen(true);
                    }}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/[0.08] text-brand">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                      </span>
                      <div>
                        <div className="text-sm font-semibold text-slate-800">대관 일정 추가하기</div>
                        <div className="text-xs text-slate-500">여러 날짜/시간을 한 번에 신청</div>
                      </div>
                    </div>
                    {extraSessions.length > 0 && (
                      <span className="rounded-full bg-brand px-2.5 py-1 text-xs font-bold text-white">
                        +{extraSessions.length}
                      </span>
                    )}
                  </button>

                  {extraSessions.length > 0 ? (
                    <div className="mt-3 space-y-1.5">
                      {allSessions.map((s, idx) => {
                        const isBase = s.date === selectedDate && s.startTime === startTime && s.endTime === endTime;
                        return (
                          <div
                            key={`${s.date}|${s.startTime}|${s.endTime}`}
                            className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">
                                {idx + 1}
                              </span>
                              <span className="font-semibold text-slate-900">{s.date}</span>
                              <span className="text-slate-600">{s.startTime}~{s.endTime}</span>
                              {isBase && <span className="rounded bg-blue-50 border border-blue-200 px-1.5 py-0.5 text-xs font-semibold text-blue-700">기본</span>}
                            </div>
                            {!isBase ? (
                              <button
                                type="button"
                                className="shrink-0 rounded-md p-1 text-slate-500 hover:bg-red-50 hover:text-red-500"
                                onClick={() => removeExtraSession(s)}
                                aria-label={`삭제: ${s.date}`}
                              >
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M9 3L3 9M3 3l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                              </button>
                            ) : null}
                          </div>
                        );
                      })}
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
              <div className="mt-3 overflow-hidden rounded-xl border border-line bg-white">
                <div className="flex items-center gap-2 border-b border-line bg-slate-50 px-4 py-2.5">
                  <span className="text-sm font-bold text-slate-800">예상 대관료</span>
                </div>
                <div className="px-4 py-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm text-slate-600">
                      <span>이용시간</span>
                      <span className="font-semibold text-slate-800">
                        {bundle.totalDurationMin ? fmtDuration(bundle.totalDurationMin) : "-"}
                        {bundle.sessionCount > 1 ? ` (${bundle.sessionCount}회차)` : ""}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm text-slate-600">
                      <span>시간당 요금</span>
                      <span className="font-semibold text-slate-800">{hourlyFee.toLocaleString()}원</span>
                    </div>
                    {isStudioRoom && studioExtraPersons > 0 ? (
                      <div className="flex items-center justify-between gap-3 text-sm text-slate-600">
                        <span>추가 인원 {studioExtraPersons}명 × 10,000원 × {totalHoursText}시간</span>
                        <span className="font-semibold text-slate-800 tabular-nums">{bundle.extraHeadcountSum.toLocaleString()}원</span>
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-3 flex items-center justify-between rounded-xl bg-brand/[0.06] px-4 py-3">
                    <span className="text-sm font-bold text-slate-900">합계</span>
                    <span className="text-lg font-extrabold text-brand">
                      {bundle.rentalSum.toLocaleString()}원
                    </span>
                  </div>
                  <p className="mt-2 text-[13px] text-slate-500">
                    ※ 기자재 사용료 별도{bundle.sessionCount > 1 ? " (회차별 합산)" : ""}
                  </p>
                </div>
              </div>
            ) : null}

            {isTueNight ? (
              <div className="mt-2">
                <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
                  화요일 야간 운영시간입니다
                </span>
              </div>
            ) : null}

            <FieldHelp className="mt-2">
              ※ 시간은 <b>30분 단위</b>로 선택할 수 있습니다. (최소 1시간, 최대 6시간)
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
                <FieldLabel htmlFor="birthYear">생년월일 *</FieldLabel>
                <input type="hidden" {...register("birth")} />
                <div className="flex items-center gap-1" role="group" aria-label="생년월일 입력">
                  <input
                    id="birthYear"
                    aria-label="생년(4자리)"
                    className="w-20 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-center outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300"
                    maxLength={4}
                    placeholder="YYYY"
                    inputMode="numeric"
                    value={birthYear}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                      setBirthYear(v);
                      if (v.length === 4) birthMonthRef.current?.focus();
                      handleBirthSync(v, birthMonth, birthDay);
                    }}
                  />
                  <span className="text-slate-500" aria-hidden="true">-</span>
                  <input
                    ref={birthMonthRef}
                    aria-label="월(2자리)"
                    className="w-14 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-center outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300"
                    maxLength={2}
                    placeholder="MM"
                    inputMode="numeric"
                    value={birthMonth}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, "").slice(0, 2);
                      setBirthMonth(v);
                      if (v.length === 2) birthDayRef.current?.focus();
                      handleBirthSync(birthYear, v, birthDay);
                    }}
                  />
                  <span className="text-slate-500" aria-hidden="true">-</span>
                  <input
                    ref={birthDayRef}
                    aria-label="일(2자리)"
                    className="w-14 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-center outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300"
                    maxLength={2}
                    placeholder="DD"
                    inputMode="numeric"
                    value={birthDay}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, "").slice(0, 2);
                      setBirthDay(v);
                      handleBirthSync(birthYear, birthMonth, v);
                    }}
                  />
                </div>
                {errors.birth ? <FieldHelp className="text-red-600">{errors.birth.message}</FieldHelp> : null}
              </div>

              <div className="md:col-span-2">
                <FieldLabel htmlFor="address">주소 *</FieldLabel>
                <Input
                  id="address"
                  {...register("address")}
                  placeholder="서울특별시 서초구 서운로26길 3, 4층"
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

          {isStudioRoom ? (
            /* E-스튜디오: 단체/행사 정보 불필요 → 숨김 처리 */
            <>
              <input type="hidden" {...register("orgName")} value="-" />
              <input type="hidden" {...register("purpose")} value="E-스튜디오 대관" />
              {/* [결3] 이용 인원(기본 2 · 1~12) — 초과 인원 가산은 예상 대관료에 바로 반영 */}
              <Card pad="lg">
                <h3 className={SECTION_TITLE}>이용 인원</h3>
                <div className="mt-4 max-w-xs">
                  <FieldLabel htmlFor="headcount">이용 인원 *</FieldLabel>
                  <div className="flex items-center gap-2">
                    <Input
                      id="headcount"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={roomMeta?.capacity ?? 12}
                      step={1}
                      className="w-28"
                      {...register("headcount", { valueAsNumber: true })}
                    />
                    <span className="mt-1 text-sm text-slate-700">명</span>
                  </div>
                  {headcountErrorText ? <FieldHelp className="text-red-600">{headcountErrorText}</FieldHelp> : null}
                  <FieldHelp>기본 2명까지 시간당 20,000원입니다. 3명부터 1명마다 시간당 10,000원이 더해집니다. (최대 12명)</FieldHelp>
                </div>
              </Card>
            </>
          ) : (
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
          )}

          <Card pad="lg">
            <h3 className={SECTION_TITLE}>{isStudioRoom ? "촬영장비 사용(선택)" : "장비 사용(선택)"}</h3>
            {isStudioRoom ? (
              <>
                <div className="mt-4 space-y-3">
                  {(Object.keys(STUDIO_EQUIPMENT_FEE_KRW) as Array<keyof typeof STUDIO_EQUIPMENT_FEE_KRW>).map((key) => (
                    <Checkbox
                      key={key}
                      {...register(key)}
                      label={`${STUDIO_EQUIPMENT_LABELS[key]} — ${STUDIO_EQUIPMENT_FEE_KRW[key].toLocaleString()}원`}
                    />
                  ))}
                </div>
                <FieldHelp className="mt-3">
                  * 촬영장비 사용료 (1일 1회 과금): <b>{equipmentFee.toLocaleString()}</b>원
                  {bundle.sessionCount > 1 ? (
                    <>
                      <br />* 장비 사용료 합계 (총 {bundle.sessionCount}회차): <b>{bundle.equipmentSum.toLocaleString()}</b>원
                    </>
                  ) : null}
                </FieldHelp>
              </>
            ) : (
              <>
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
              </>
            )}
          </Card>

          <Card pad="lg">
            <h3 className={SECTION_TITLE}>이용요금 안내</h3>
            <div className="mt-4 overflow-hidden rounded-xl border border-line bg-white">
              <div className="flex items-center gap-2 border-b border-line bg-slate-50 px-4 py-2.5">
                <span className="text-sm font-bold text-slate-800">대관료 및 장비 사용료</span>
              </div>
              <div className="px-4 py-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm text-slate-600">
                    <span>
                      {bundle.sessionCount > 1 ? (
                        <>대관료 ({bundle.sessionCount}회차 · {bundle.totalDurationMin ? fmtDuration(bundle.totalDurationMin) : "-"})</>
                      ) : (
                        <>대관료 {durationMinutes ? `(${fmtDuration(durationMinutes)})` : ""}</>
                      )}
                    </span>
                    <span className="font-semibold text-slate-800 tabular-nums">{bundle.rentalSum.toLocaleString()}원</span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-slate-600">
                    <span>
                      {bundle.sessionCount > 1 ? <>장비 사용료 ({bundle.sessionCount}회차)</> : <>장비 사용료</>}
                    </span>
                    <span className="font-semibold text-slate-800 tabular-nums">{bundle.equipmentSum.toLocaleString()}원</span>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between rounded-xl bg-brand/[0.06] px-4 py-3">
                  <span className="text-sm font-bold text-slate-900">총 금액</span>
                  <span className="text-lg font-extrabold text-brand">{bundle.total.toLocaleString()}원</span>
                </div>
                <p className="mt-2 text-[13px] text-slate-500">
                  ※ 장비 사용료는 선택 항목에 따라 변동되며, 선택한 회차 수 기준으로 합산됩니다.
                </p>
              </div>
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
                id="privacyAgreeBox"
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
                id="pledgeAgreeBox"
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

          <MissingFieldsSummary items={missingFields} />
          <Button type="submit" variant="primary" disabled={submitting} className="w-full py-3 shadow-sm hover:opacity-90">
            {submitting ? "신청 중..." : "신청하기"}
          </Button>
        </form>

        {/* ── 추가 회차 모달 (리뉴얼) ── */}
        <Modal
          open={extraOpen}
          onClose={() => { setExtraOpen(false); setSessionError(null); }}
          size="lg"
          title="대관 일정 추가"
          bodyClassName="!px-0 !py-0 sm:!px-0"
          footer={
            <Button
              type="button"
              variant="primary"
              className="w-full py-2.5"
              onClick={() => { setExtraOpen(false); setSessionError(null); }}
            >
              완료 ({allSessions.length}회차)
            </Button>
          }
        >
              <p className="px-5 pt-3 text-[13px] text-slate-500">여러 회차를 한 번에 신청할 수 있습니다</p>
              <div>
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
                    <FieldLabel className="text-xs">날짜</FieldLabel>
                    <DatePickerCalendar
                      value={addDate}
                      roomId={roomId}
                      disabled={!selectedDate}
                      onChange={(ymd) => {
                        setAddDateError(null);
                        setAddDate(ymd);
                      }}
                    />
                    {addDateError && <FieldHelp className="text-red-600">{addDateError}</FieldHelp>}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <FieldLabel htmlFor="addStartTime" className="text-xs">시작 시간</FieldLabel>
                      <Select
                        id="addStartTime"
                        value={addStartTime}
                        disabled={!selectedDate || !addDate}
                        onChange={(e) => setAddStartTime(e.target.value)}
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
                        onChange={(e) => setAddEndTime(e.target.value)}
                      >
                        {addEndOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                      </Select>
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    className="h-10 w-full"
                    disabled={!selectedDate || !addDate || !addStartTime || !addEndTime}
                    onClick={addSession}
                    type="button"
                  >
                    + 일정 추가
                  </Button>
                </div>

                {/* 구분선 + 일정 목록 */}
                <div className="border-t border-slate-100 bg-slate-50/80 px-5 py-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-slate-700">선택된 일정</span>
                    <span className="rounded-full bg-brand/[0.1] px-2.5 py-0.5 text-xs font-bold text-brand">
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
                              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                                {idx + 1}
                              </span>
                              <div className="text-xs">
                                <span className="font-semibold text-slate-900">{s.date}</span>
                                <span className="ml-1.5 text-slate-600">{s.startTime} ~ {s.endTime}</span>
                              </div>
                              {isBase && (
                                <span className="rounded bg-blue-50 border border-blue-200 px-1.5 py-0.5 text-xs font-semibold text-blue-700">기본</span>
                              )}
                            </div>

                            {!isBase ? (
                              <button
                                type="button"
                                className="shrink-0 rounded-md border border-slate-200 bg-white p-1 text-slate-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-500"
                                onClick={() => removeExtraSession(s)}
                                aria-label={`삭제: ${s.date}`}
                              >
                                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M10.5 3.5l-7 7M3.5 3.5l7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                              </button>
                            ) : (
                              <span className="text-xs text-slate-500">기본</span>
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

        </Modal>

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
