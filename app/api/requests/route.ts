import { NextResponse } from "next/server";
import { Readable } from "stream";
import { GalleryRequestInputSchema, RequestInputSchema, type GalleryRequestInput } from "@/lib/schema";
import { UPLOAD, ROOMS } from "@/lib/config";
import { getDatabase } from "@/lib/database";
import { dayOfWeek, inRangeYmd, nowIsoSeoul, overlaps } from "@/lib/datetime";
import { validateOperatingHours as validateOperatingHoursShared } from "@/lib/operating";
import { buildGallerySessionsFromPeriod, validateGalleryOperatingHours } from "@/lib/gallery";
import { getGoogleClient } from "@/lib/google";
import { isMockMode } from "@/lib/env";
import {
  sendAdminNewRequestEmail,
  sendApplicantReceivedEmail,
  sendAdminNewRequestEmailBatch,
  sendApplicantReceivedEmailBatch
} from "@/lib/mail";
import { logger } from "@/lib/logger";
import { createApplicantLinkToken } from "@/lib/publicLinkToken";
import type { RequestStatus } from "@/lib/types";

type SessionInput = { date: string; startTime: string; endTime: string; isPrepDay?: boolean };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function roomName(roomId: string) {
  return ROOMS.find(r => r.id === roomId)?.name ?? roomId;
}

function validateOperatingHours(date: string, startTime: string, endTime: string) {
  // ✅ 운영시간 규칙을 한 곳(lib/operating.ts)에서 관리하여
  //    (시간 옵션 / 슬롯 생성 / 서버 검증) 모두 동일한 기준을 사용하도록 합니다.
  return validateOperatingHoursShared(date, startTime, endTime);
}

function validateOperatingHoursForRoom(roomId: string, date: string, startTime: string, endTime: string) {
  return roomId === "gallery" ? validateGalleryOperatingHours(date, startTime, endTime) : validateOperatingHours(date, startTime, endTime);
}

function conflictMessage(roomId: string, date: string, startTime: string, endTime: string) {
  return `해당 공간(${roomName(roomId)})은 ${date} ${startTime}-${endTime} 시간대에 신청이 불가합니다(일정 충돌).`;
}

function isYmd(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function diffDaysInclusive(startYmd: string, endYmd: string) {
  const s = new Date(`${startYmd}T00:00:00+09:00`).getTime();
  const e = new Date(`${endYmd}T00:00:00+09:00`).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e)) return 0;
  return Math.floor((e - s) / (24 * 60 * 60 * 1000)) + 1;
}

// buildGallerySessionsFromPeriod는 lib/gallery.ts에서 단일 기준으로 관리합니다.

function BufferToStream(buffer: Buffer) {
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);
  return stream;
}

export async function POST(req: Request) {
  try {
    const isMock = isMockMode();
    const db = getDatabase();

    const form = await req.formData();

    const raw = {
      roomId: String(form.get("roomId") ?? ""),
      date: String(form.get("date") ?? ""),
      startTime: String(form.get("startTime") ?? ""),
      endTime: String(form.get("endTime") ?? ""),

      applicantName: String(form.get("applicantName") ?? ""),
      birth: String(form.get("birth") ?? ""),
      address: String(form.get("address") ?? ""),
      phone: String(form.get("phone") ?? ""),
      email: String(form.get("email") ?? ""),

      orgName: String(form.get("orgName") ?? ""),
      headcount: String(form.get("headcount") ?? ""),

      laptop: String(form.get("laptop") ?? "false"),
      projector: String(form.get("projector") ?? "false"),
      audio: String(form.get("audio") ?? "false"),

      mirrorless: String(form.get("mirrorless") ?? "false"),
      camcorder: String(form.get("camcorder") ?? "false"),
      wirelessMic: String(form.get("wirelessMic") ?? "false"),
      pinMic: String(form.get("pinMic") ?? "false"),
      rodeMic: String(form.get("rodeMic") ?? "false"),
      electronicBoard: String(form.get("electronicBoard") ?? "false"),

      // gallery 전용 필드(추가 데이터로 전달되며, 저장 확장은 추후 진행)
      startDate: String(form.get("startDate") ?? ""),
      endDate: String(form.get("endDate") ?? ""),
      exhibitionTitle: String(form.get("exhibitionTitle") ?? ""),
      exhibitionPurpose: String(form.get("exhibitionPurpose") ?? ""),
      genreContent: String(form.get("genreContent") ?? ""),
      awarenessPath: String(form.get("awarenessPath") ?? ""),
      specialNotes: String(form.get("specialNotes") ?? ""),

      purpose: String(form.get("purpose") ?? ""),

      privacyAgree: String(form.get("privacyAgree") ?? "false"),
      pledgeAgree: String(form.get("pledgeAgree") ?? "false"),
      pledgeDate: String(form.get("pledgeDate") ?? ""),
      pledgeName: String(form.get("pledgeName") ?? "")
    };

    const schema = raw.roomId === "gallery" ? GalleryRequestInputSchema : RequestInputSchema;
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          code: "VALIDATION_ERROR",
          message: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요.",
          issues: parsed.error.issues
        },
        { status: 400 }
      );
    }
    const input = parsed.data;

    // ✅ 여러 회차(날짜별로 시간 다르게) 묶음 신청 지원
    const isYmd = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

    let sessions: SessionInput[] = [];

    // 갤러리 입력일 경우 타입 안전하게 접근
    const galleryInput = input.roomId === "gallery" ? (input as GalleryRequestInput) : null;

    if (galleryInput) {
      // ✅ 보안: gallery는 client sessions를 무시하고 서버가 startDate~endDate로 회차를 재생성합니다.
      const startDate = String(galleryInput.startDate ?? "").trim();
      const endDate = String(galleryInput.endDate ?? "").trim();

      if (!isYmd(startDate) || !isYmd(endDate)) {
        return NextResponse.json(
          { ok: false, code: "VALIDATION_ERROR", message: "전시 시작/종료일 형식이 올바르지 않습니다." },
          { status: 400 }
        );
      }
      if (endDate < startDate) {
        return NextResponse.json(
          { ok: false, code: "VALIDATION_ERROR", message: "종료일은 시작일보다 빠를 수 없습니다." },
          { status: 400 }
        );
      }

      // ✅ 갤러리: 전시 기간 최대 30일(포함)
      const rangeDays = diffDaysInclusive(startDate, endDate);
      if (rangeDays > 30) {
        return NextResponse.json(
          { ok: false, code: "VALIDATION_ERROR", message: "전시 기간은 최대 30일까지 신청할 수 있습니다." },
          { status: 400 }
        );
      }

      sessions = buildGallerySessionsFromPeriod(startDate, endDate);
    } else {
      const rawSessions = String(form.get("sessions") ?? "").trim();
      if (rawSessions) {
        try {
          const parsedSessions = JSON.parse(rawSessions);
          if (!Array.isArray(parsedSessions)) throw new Error("sessions must be array");
          sessions = parsedSessions
            .map((s: any) => ({
              date: String(s?.date ?? "").trim(),
              startTime: String(s?.startTime ?? "").trim(),
              endTime: String(s?.endTime ?? "").trim()
            }))
            .filter((s) => s.date && s.startTime && s.endTime);
        } catch {
          return NextResponse.json(
            { ok: false, code: "VALIDATION_ERROR", message: "회차 정보(sessions) 형식이 올바르지 않습니다." },
            { status: 400 }
          );
        }
      } else {
        // (레거시) 같은 시간으로 여러 날짜 신청
        const rawDates = String(form.get("dates") ?? "").trim();
        const dates0 = (rawDates ? rawDates.split(",") : [input.date]).map((d) => d.trim()).filter(Boolean);
        const dates = Array.from(new Set(dates0));
        sessions = dates.map((date) => ({ date, startTime: input.startTime, endTime: input.endTime }));
      }
    }

// basic validation
    if (!sessions.length) {
      return NextResponse.json({ ok: false, code: "VALIDATION_ERROR", message: "이용일시를 확인해주세요." }, { status: 400 });
    }
    const maxBatch = input.roomId === "gallery" ? 500 : 20; // gallery는 전시기간 제한 없음(기술 안전장치만)
    if (sessions.length > maxBatch) {
      return NextResponse.json(
        {
          ok: false,
          code: "VALIDATION_ERROR",
          message: `묶음 신청은 최대 ${maxBatch}회차까지 가능합니다.`
        },
        { status: 400 }
      );
    }

    // de-dup & sort
    const uniq = new Map<string, SessionInput>();
    for (const s of sessions) {
      const key = `${s.date}|${s.startTime}|${s.endTime}`;
      uniq.set(key, s);
    }
    sessions = Array.from(uniq.values()).sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));

    const invalidDate = sessions.find((s) => !isYmd(s.date));
    if (invalidDate) {
      return NextResponse.json(
        { ok: false, code: "VALIDATION_ERROR", message: "이용일자 형식이 올바르지 않습니다." },
        { status: 400 }
      );
    }
    const sunday = sessions.find((s) => dayOfWeek(s.date) === 0);
    if (sunday) {
      return NextResponse.json(
        { ok: false, code: "VALIDATION_ERROR", message: "일요일은 휴관일로 신청할 수 없습니다." },
        { status: 400 }
      );
    }

    // 같은 날짜 내 회차끼리 겹침 방지
    const byDate = new Map<string, SessionInput[]>();
    for (const s of sessions) {
      const arr = byDate.get(s.date) ?? [];
      arr.push(s);
      byDate.set(s.date, arr);
    }
    for (const [date, arr] of byDate.entries()) {
      const sorted = arr.slice().sort((a, b) => a.startTime.localeCompare(b.startTime));
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const cur = sorted[i];
        if (overlaps(prev.startTime, prev.endTime, cur.startTime, cur.endTime)) {
          return NextResponse.json(
            { ok: false, code: "VALIDATION_ERROR", message: `같은 날짜(${date})에 겹치는 시간이 포함되어 있습니다.` },
            { status: 400 }
          );
        }
      }
    }

    // 운영시간/충돌 검증은 회차별로 수행
    const all = await db.getAllRequests();
    const conflictStatuses: RequestStatus[] = ["접수", "승인"];
    const schedules = await db.getClassSchedules();
    const blocks = await db.getBlocks();

    const issues: Array<{ date: string; startTime: string; endTime: string; code: string; message: string }> = [];
    for (const sess of sessions) {
      const op = validateOperatingHoursForRoom(input.roomId, sess.date, sess.startTime, sess.endTime);
      if (!op.ok) {
        issues.push({ date: sess.date, startTime: sess.startTime, endTime: sess.endTime, code: "OUT_OF_HOURS", message: op.message });
        continue;
      }

      const sameRoomSameDate = all.filter((r) => {
        if (r.roomId !== input.roomId) return false;
        if (!conflictStatuses.includes(r.status)) return false;
        // 갤러리 1행 형식: 날짜 범위로 충돌 판정
        if (r.roomId === "gallery" && !r.batchId && r.startDate && r.endDate) {
          if (sess.date >= r.startDate && sess.date <= r.endDate && dayOfWeek(sess.date) !== 0) return true;
          if (r.galleryPrepDate && sess.date === r.galleryPrepDate) return true;
          return false;
        }
        // 기존 형식: 개별 날짜 매칭
        return r.date === sess.date;
      });
      const hasRequestConflict = sameRoomSameDate.some((r) => {
        // 갤러리 1행 형식은 시간대 겹침이 아니라 날짜 범위 겹침으로 이미 판정됨
        if (r.roomId === "gallery" && !r.batchId && r.startDate && r.endDate) return true;
        return overlaps(r.startTime, r.endTime, sess.startTime, sess.endTime);
      });
      if (hasRequestConflict) {
        issues.push({ date: sess.date, startTime: sess.startTime, endTime: sess.endTime, code: "CONFLICT", message: conflictMessage(input.roomId, sess.date, sess.startTime, sess.endTime) });
        continue;
      }

      const dow = dayOfWeek(sess.date);
      const scheduleConf = schedules
        .filter((sc) => (sc.roomId === input.roomId || sc.roomId === "all") && sc.dayOfWeek === dow)
        .filter((sc) => inRangeYmd(sess.date, sc.effectiveFrom || undefined, sc.effectiveTo || undefined))
        .some((sc) => overlaps(sc.startTime, sc.endTime, sess.startTime, sess.endTime));
      if (scheduleConf) {
        issues.push({ date: sess.date, startTime: sess.startTime, endTime: sess.endTime, code: "CLASS_CONFLICT", message: "해당 시간대는 정규 수업으로 인해 신청이 불가합니다." });
        continue;
      }

      const blockConf = blocks
        .filter((b) => {
          if (b.roomId !== input.roomId && b.roomId !== "all") return false;
          const bStart = b.date;
          const bEnd = b.endDate || b.date;
          return sess.date >= bStart && sess.date <= bEnd;
        })
        .some((b) => overlaps(b.startTime, b.endTime, sess.startTime, sess.endTime));
      if (blockConf) {
        issues.push({ date: sess.date, startTime: sess.startTime, endTime: sess.endTime, code: "BLOCKED", message: "해당 시간대는 센터 운영 사정으로 신청이 불가합니다." });
        continue;
      }
    }

    if (issues.length) {
      return NextResponse.json(
        { ok: false, code: "BATCH_CONFLICT", message: issues[0].message, issues },
        { status: 409 }
      );
    }

    const files = form.getAll("attachments").filter(Boolean) as File[];
    if (files.length > UPLOAD.maxFiles) {
      return NextResponse.json(
        { ok: false, code: "TOO_MANY_FILES", message: `첨부파일은 최대 ${UPLOAD.maxFiles}개까지 가능합니다.` },
        { status: 400 }
      );
    }

    for (const f of files) {
      if (f.size > UPLOAD.maxBytesPerFile) {
        return NextResponse.json(
          { ok: false, code: "FILE_TOO_LARGE", message: `파일 용량은 건당 10MB 이하만 가능합니다. (${f.name})` },
          { status: 400 }
        );
      }
      if (!UPLOAD.allowedMime.includes(f.type)) {
        return NextResponse.json(
          { ok: false, code: "FILE_TYPE", message: `허용되지 않는 파일 형식입니다(PDF/JPG/PNG만 가능). (${f.name})` },
          { status: 400 }
        );
      }
    }

    // (단건 검증 로직은 위 날짜별 검증 루프로 대체)

    const uploadedUrls: string[] = [];

    if (isMock) {
      // 로컬 테스트에서는 Google Drive 업로드 생략(링크는 mock:// 로 저장)
      for (const f of files) {
        uploadedUrls.push(`mock://${encodeURIComponent(f.name)}`);
      }
    } else {
      const { drive, env: fullEnv } = getGoogleClient();

      for (const f of files) {
        const ab = await f.arrayBuffer();
        const buf = Buffer.from(ab);

        const first = sessions.find((s) => !s.isPrepDay) ?? sessions[0];
        const fileName = `${first.date}_${first.startTime.replace(":", "")}-${first.endTime.replace(":", "")}_${input.roomId}_${f.name}`;

        const createRes = await drive.files.create({
          requestBody: { name: fileName, parents: [fullEnv.GOOGLE_DRIVE_FOLDER_ID] },
          media: { mimeType: f.type, body: BufferToStream(buf) },
          fields: "id"
        });

        const id = createRes.data.id!;
        const getRes = await drive.files.get({ fileId: id, fields: "webViewLink" });
        uploadedUrls.push(getRes.data.webViewLink ?? `https://drive.google.com/file/d/${id}/view`);
      }
    }

    const isGallery = input.roomId === "gallery";
    const equipment = isGallery
      ? { laptop: false, projector: false, audio: false, mirrorless: false, camcorder: false, wirelessMic: false, pinMic: false, rodeMic: false, electronicBoard: false }
      : {
          laptop: input.laptop, projector: input.projector, audio: input.audio,
          mirrorless: input.mirrorless, camcorder: input.camcorder, wirelessMic: input.wirelessMic,
          pinMic: input.pinMic, rodeMic: input.rodeMic, electronicBoard: input.electronicBoard,
        };

    // ✅ 갤러리: 감사 로그 + 일수 통계
    const galleryGeneratedAt = isGallery ? nowIsoSeoul() : undefined;
    const galleryGenerationVersion = isGallery ? "gallery-gen-v2" : undefined;
    const exhibitionSessions = isGallery ? sessions.filter((s) => !s.isPrepDay) : [];
    const galleryWeekdayCount = isGallery
      ? exhibitionSessions.filter((s) => { const dow = dayOfWeek(s.date); return dow >= 1 && dow <= 5; }).length
      : undefined;
    const gallerySaturdayCount = isGallery
      ? exhibitionSessions.filter((s) => dayOfWeek(s.date) === 6).length
      : undefined;
    const galleryExhibitionDayCount = isGallery ? exhibitionSessions.length : undefined;
    const galleryPrepDate = isGallery ? (sessions.find((s) => s.isPrepDay)?.date || undefined) : undefined;
    const galleryAuditJson = isGallery
      ? JSON.stringify({
          startDate: galleryInput?.startDate,
          endDate: galleryInput?.endDate,
          prepDate: galleryPrepDate,
          weekdayCount: galleryWeekdayCount ?? 0,
          saturdayCount: gallerySaturdayCount ?? 0,
          exhibitionDayCount: galleryExhibitionDayCount ?? 0,
          generatedAt: galleryGeneratedAt,
          version: galleryGenerationVersion
        })
      : undefined;

    let savedList: Awaited<ReturnType<typeof db.appendRequestsBatch>>;
    let batchId: string | undefined;

    if (isGallery) {
      // ✅ 갤러리: 1행으로 저장 (startDate~endDate + 일수 통계)
      const firstExhibition = exhibitionSessions[0] ?? sessions[0];
      const singleRow = await db.appendRequest({
        roomId: input.roomId,
        date: galleryInput!.startDate,                  // 대표 날짜 = 전시 시작일
        startTime: firstExhibition.startTime,           // 대표 시간
        endTime: firstExhibition.endTime,

        // batchId 없음 (1행 형식)
        startDate: galleryInput!.startDate,
        endDate: galleryInput!.endDate,
        exhibitionTitle: galleryInput!.exhibitionTitle,
        exhibitionPurpose: galleryInput!.exhibitionPurpose,
        genreContent: galleryInput!.genreContent,
        awarenessPath: galleryInput!.awarenessPath,
        specialNotes: galleryInput!.specialNotes,

        galleryGeneratedAt,
        galleryGenerationVersion,
        galleryWeekdayCount,
        gallerySaturdayCount,
        galleryExhibitionDayCount,
        galleryPrepDate,
        galleryAuditJson,

        applicantName: input.applicantName,
        birth: input.birth,
        address: input.address,
        phone: input.phone,
        email: input.email,
        orgName: input.orgName,
        headcount: input.headcount,
        equipment,
        purpose: input.purpose,
        attachments: uploadedUrls,
        privacyAgree: input.privacyAgree,
        pledgeAgree: input.pledgeAgree,
        pledgeDate: input.pledgeDate,
        pledgeName: input.pledgeName,
      });
      savedList = [singleRow];
    } else {
      // ✅ 강의실/스튜디오: 기존 묶음 저장
      batchId = sessions.length > 1 ? `BAT-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}` : undefined;

      const appendInputs = sessions.map((s, i) => ({
        roomId: input.roomId,
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
        batchId,
        batchSeq: batchId ? i + 1 : undefined,
        batchSize: batchId ? sessions.length : undefined,
        applicantName: input.applicantName,
        birth: input.birth,
        address: input.address,
        phone: input.phone,
        email: input.email,
        orgName: input.orgName,
        headcount: input.headcount,
        equipment,
        purpose: input.purpose,
        attachments: uploadedUrls,
        privacyAgree: input.privacyAgree,
        pledgeAgree: input.pledgeAgree,
        pledgeDate: input.pledgeDate,
        pledgeName: input.pledgeName,
      }));
      savedList = await db.appendRequestsBatch(appendInputs);
    }

    if (savedList.length > 1) {
      await sendAdminNewRequestEmailBatch(savedList);
      await sendApplicantReceivedEmailBatch(savedList);
    } else {
      await sendAdminNewRequestEmail(savedList[0]);
      await sendApplicantReceivedEmail(savedList[0]);
    }

    logger.info('대관 신청 생성 완료', {
      requestId: savedList[0]?.requestId,
      batchId,
      count: savedList.length,
      roomId: input.roomId,
      date: isGallery ? galleryInput?.startDate : (sessions.find((s) => !s.isPrepDay) ?? sessions[0])?.date
    });

    let applicantToken = "";
    try {
      applicantToken = createApplicantLinkToken({
        email: input.email,
        ttlSeconds: 7 * 24 * 60 * 60,
      });
    } catch {
      // 토큰 발급 실패해도 신청 자체는 성공 처리
    }

    return NextResponse.json(
      {
        ok: true,
        requestId: savedList[0]?.requestId,
        batchId: batchId ?? "",
        count: savedList.length,
        requestIds: savedList.map((r) => r.requestId),
        token: applicantToken,
      },
      { status: 200 }
    );
  } catch (e: unknown) {
    const err = e instanceof Error ? e : new Error(String(e));
    const errWithCode = e as { code?: string };
    logger.error('대관 신청 처리 중 오류 발생', {
      error: err.message,
      code: errWithCode.code,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });

    // Google API 관련 에러
    if (err.message?.includes('Google') || errWithCode.code === 'EAUTH') {
      return NextResponse.json(
        { ok: false, code: "GOOGLE_API_ERROR", message: "Google API 연동 오류가 발생했습니다." },
        { status: 503 }
      );
    }

    // 네트워크 연결 에러
    if (errWithCode.code === 'ECONNREFUSED' || errWithCode.code === 'ETIMEDOUT') {
      return NextResponse.json(
        { ok: false, code: "NETWORK_ERROR", message: "네트워크 연결 오류가 발생했습니다." },
        { status: 503 }
      );
    }

    // 개발 환경에서는 상세 에러 메시지 포함
    const isDev = process.env.NODE_ENV === 'development';
    return NextResponse.json(
      {
        ok: false,
        code: "SERVER_ERROR",
        message: isDev ? `서버 오류: ${err.message}` : "서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
        ...((isDev ? { stack: err.stack } : {}))
      },
      { status: 500 }
    );
  }
}
