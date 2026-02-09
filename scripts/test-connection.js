#!/usr/bin/env node
/**
 * Google Sheets/Drive 연동 테스트 스크립트
 *
 * 사용법:
 *   node scripts/test-connection.js
 *
 * .env.local 파일을 자동으로 읽어서 테스트합니다.
 */

const fs = require("fs");
const path = require("path");

// .env.local 파일을 수동 파싱
const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx);
    const val = trimmed.slice(eqIdx + 1);
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
  console.log("✓ .env.local 로드 완료\n");
} else {
  console.error("✗ .env.local 파일을 찾을 수 없습니다.");
  process.exit(1);
}

const { google } = require("googleapis");

async function main() {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  if (!json || !sheetId) {
    console.error("✗ GOOGLE_SERVICE_ACCOUNT_JSON 또는 GOOGLE_SHEET_ID가 설정되지 않았습니다.");
    process.exit(1);
  }

  console.log("─── 1. 인증 테스트 ───");
  let credentials;
  try {
    credentials = JSON.parse(json);
    console.log(`  서비스 계정: ${credentials.client_email}`);
    console.log(`  프로젝트:    ${credentials.project_id}`);
  } catch (e) {
    console.error("✗ JSON 파싱 실패:", e.message);
    process.exit(1);
  }

  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive",
    ],
  });

  try {
    await auth.authorize();
    console.log("  ✓ JWT 인증 성공\n");
  } catch (e) {
    console.error("  ✗ JWT 인증 실패:", e.message);
    process.exit(1);
  }

  const sheets = google.sheets({ version: "v4", auth });
  const drive = google.drive({ version: "v3", auth });

  console.log("─── 2. 스프레드시트 접근 테스트 ───");
  console.log(`  Sheet ID: ${sheetId}`);
  try {
    const res = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    const title = res.data.properties?.title;
    const sheetNames = (res.data.sheets ?? []).map((s) => s.properties?.title);
    console.log(`  ✓ 스프레드시트 이름: "${title}"`);
    console.log(`  ✓ 시트 목록: [${sheetNames.join(", ")}]`);
  } catch (e) {
    console.error(`  ✗ 스프레드시트 접근 실패: ${e.message}`);
    console.error("    → 서비스 계정 이메일을 스프레드시트에 편집자로 공유했는지 확인하세요.");
    process.exit(1);
  }

  if (folderId) {
    console.log(`\n─── 3. Drive 폴더 접근 테스트 ───`);
    console.log(`  Folder ID: ${folderId}`);
    try {
      const res = await drive.files.get({ fileId: folderId, fields: "name,id" });
      console.log(`  ✓ 폴더 이름: "${res.data.name}"`);
    } catch (e) {
      console.error(`  ✗ Drive 폴더 접근 실패: ${e.message}`);
      console.error("    → 서비스 계정 이메일을 Drive 폴더에 편집자로 공유했는지 확인하세요.");
    }
  }

  console.log("\n─── 4. 시트 초기화 테스트 (POST /api/admin/init-sheets와 동일) ───");

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

  try {
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    const existingSheets = (spreadsheet.data.sheets ?? []).map(
      (s) => s.properties?.title ?? ""
    );

    for (const config of SHEETS_CONFIG) {
      const exists = existingSheets.includes(config.title);

      if (!exists) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: sheetId,
          requestBody: {
            requests: [{ addSheet: { properties: { title: config.title } } }],
          },
        });
        console.log(`  [생성] "${config.title}" 시트 생성 완료`);
      } else {
        console.log(`  [확인] "${config.title}" 시트 이미 존재`);
      }

      const headerRes = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: `${config.title}!1:1`,
      });
      const currentHeader = (headerRes.data.values?.[0] ?? []);

      if (currentHeader.length === 0) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: sheetId,
          range: `${config.title}!A1`,
          valueInputOption: "RAW",
          requestBody: { values: [config.headers] },
        });
        console.log(`  [헤더] "${config.title}" 헤더 ${config.headers.length}개 컬럼 세팅 완료`);
      } else {
        const missing = config.headers.filter((h) => !currentHeader.includes(h));
        if (missing.length > 0) {
          const merged = [...currentHeader, ...missing];
          await sheets.spreadsheets.values.update({
            spreadsheetId: sheetId,
            range: `${config.title}!A1`,
            valueInputOption: "RAW",
            requestBody: { values: [merged] },
          });
          console.log(`  [헤더] "${config.title}" 누락 컬럼 ${missing.length}개 추가`);
        } else {
          console.log(`  [헤더] "${config.title}" 헤더 이상 없음 (${currentHeader.length}개 컬럼)`);
        }
      }
    }

    // 기본 시트 정리
    const refreshed = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    const allSheets = refreshed.data.sheets ?? [];
    const defaultSheet = allSheets.find(
      (s) => s.properties?.title === "시트1" || s.properties?.title === "Sheet1"
    );
    if (defaultSheet && allSheets.length > 1) {
      try {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: sheetId,
          requestBody: {
            requests: [
              { deleteSheet: { sheetId: defaultSheet.properties.sheetId } },
            ],
          },
        });
        console.log(`  [정리] 기본 시트 "${defaultSheet.properties.title}" 삭제 완료`);
      } catch {
        console.log(`  [정리] 기본 시트 삭제 실패 (무시)`);
      }
    }
  } catch (e) {
    console.error(`  ✗ 시트 초기화 실패: ${e.message}`);
    process.exit(1);
  }

  console.log("\n═══════════════════════════════════════");
  console.log("  ✓ 모든 테스트 통과! Google 연동 정상");
  console.log("═══════════════════════════════════════");
  console.log("\n다음 단계:");
  console.log("  1. npm run dev 로 서버 시작");
  console.log("  2. http://localhost:3000 에서 대관 신청 테스트");
  console.log("  3. 스프레드시트에서 데이터 확인");
}

main().catch((e) => {
  console.error("\n예상치 못한 오류:", e);
  process.exit(1);
});
