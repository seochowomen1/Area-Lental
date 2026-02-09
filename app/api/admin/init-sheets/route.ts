import { NextResponse } from "next/server";
import { getGoogleClient } from "@/lib/google";
import { requireGoogleEnv } from "@/lib/env";

/**
 * POST /api/admin/init-sheets
 *
 * 스프레드시트에 3개 시트(requests, class_schedule, blocks)를 생성하고
 * 각 시트에 헤더 행을 자동 세팅합니다.
 *
 * - 이미 존재하는 시트는 건너뛰고, 헤더만 비어 있으면 채웁니다.
 * - 기존 데이터가 있는 시트는 건드리지 않습니다.
 */

const SHEETS_CONFIG = [
  {
    title: "requests",
    headers: [
      "requestId", "createdAt", "roomId", "roomName",
      "date", "startTime", "endTime",
      "applicantName", "birth", "address", "phone", "email",
      "orgName", "headcount",
      "equipment_laptop", "equipment_projector", "equipment_audio",
      "purpose", "attachments",
      "privacyAgree", "pledgeAgree", "pledgeDate", "pledgeName",
      "status", "adminMemo", "rejectReason", "decidedAt", "decidedBy",
      // optional columns
      "discountRatePct", "discountAmountKRW", "discountReason",
      "batchId", "batchSeq", "batchSize",
      "isPrepDay", "startDate", "endDate",
      "exhibitionTitle", "exhibitionPurpose", "genreContent", "awarenessPath", "specialNotes",
      "galleryGeneratedAt", "galleryGenerationVersion",
      "galleryWeekdayCount", "gallerySaturdayCount", "galleryExhibitionDayCount",
      "galleryPrepDate", "galleryAuditJson",
    ],
  },
  {
    title: "class_schedule",
    headers: ["id", "roomId", "dayOfWeek", "startTime", "endTime", "title", "effectiveFrom", "effectiveTo"],
  },
  {
    title: "blocks",
    headers: ["id", "roomId", "date", "startTime", "endTime", "reason", "endDate"],
  },
];

export async function POST() {
  try {
    const env = requireGoogleEnv();
    const { sheets } = getGoogleClient();
    const spreadsheetId = env.GOOGLE_SHEET_ID;

    // 1. 현재 스프레드시트의 시트 목록 조회
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const existingSheets = (spreadsheet.data.sheets ?? []).map(
      (s) => s.properties?.title ?? ""
    );

    const log: string[] = [];

    for (const config of SHEETS_CONFIG) {
      const exists = existingSheets.includes(config.title);

      // 2. 시트가 없으면 생성
      if (!exists) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              {
                addSheet: {
                  properties: { title: config.title },
                },
              },
            ],
          },
        });
        log.push(`[생성] "${config.title}" 시트 생성 완료`);
      } else {
        log.push(`[확인] "${config.title}" 시트 이미 존재`);
      }

      // 3. 헤더 행 확인 → 비어있으면 세팅
      const headerRes = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${config.title}!1:1`,
      });

      const currentHeader = (headerRes.data.values?.[0] ?? []) as string[];

      if (currentHeader.length === 0) {
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${config.title}!A1`,
          valueInputOption: "RAW",
          requestBody: { values: [config.headers] },
        });
        log.push(`[헤더] "${config.title}" 헤더 ${config.headers.length}개 컬럼 세팅 완료`);
      } else {
        // 누락된 헤더가 있으면 끝에 추가
        const missing = config.headers.filter((h) => !currentHeader.includes(h));
        if (missing.length > 0) {
          const merged = [...currentHeader, ...missing];
          await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `${config.title}!A1`,
            valueInputOption: "RAW",
            requestBody: { values: [merged] },
          });
          log.push(`[헤더] "${config.title}" 누락 컬럼 ${missing.length}개 추가: ${missing.join(", ")}`);
        } else {
          log.push(`[헤더] "${config.title}" 헤더 이상 없음 (${currentHeader.length}개 컬럼)`);
        }
      }
    }

    // 4. 기본 시트("시트1" 또는 "Sheet1")가 남아있으면 삭제 시도
    const refreshed = await sheets.spreadsheets.get({ spreadsheetId });
    const allSheets = refreshed.data.sheets ?? [];
    const defaultSheet = allSheets.find(
      (s) => s.properties?.title === "시트1" || s.properties?.title === "Sheet1"
    );
    if (defaultSheet && allSheets.length > 1) {
      try {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              { deleteSheet: { sheetId: defaultSheet.properties!.sheetId! } },
            ],
          },
        });
        log.push(`[정리] 기본 시트 "${defaultSheet.properties!.title}" 삭제 완료`);
      } catch {
        log.push(`[정리] 기본 시트 삭제 실패 (무시)`);
      }
    }

    return NextResponse.json({ ok: true, log });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
