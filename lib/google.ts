import { google } from "googleapis";
import { isMockMode, requireGoogleEnv } from "@/lib/env";

/**
 * @deprecated
 * 이전 코드 호환용(가급적 requireGoogleEnv / requireAdminEnv 등 용도별 함수 사용)
 */
export function getEnv() {
  return process.env;
}

export function getGoogleClient() {
  if (isMockMode()) {
    throw new Error("MOCK_MODE=true에서는 Google Client를 사용할 수 없습니다.");
  }

  const env = requireGoogleEnv();

  const credentials = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);

  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"]
  });

  return {
    sheets: google.sheets({ version: "v4", auth }),
    drive: google.drive({ version: "v3", auth }),
    env
  };
}
