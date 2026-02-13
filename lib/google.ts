import { google } from "googleapis";
import { isMockMode, requireGoogleEnv } from "@/lib/env";

/**
 * @deprecated
 * 이전 코드 호환용(가급적 requireGoogleEnv / requireAdminEnv 등 용도별 함수 사용)
 */
export function getEnv() {
  return process.env;
}

let _warnedKeyRotation = false;

/** 서비스 계정 키 구조 검증 및 보안 경고 */
function validateServiceAccountKey(json: string): { client_email: string; private_key: string } {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON 환경변수의 JSON 형식이 올바르지 않습니다.");
  }

  // 필수 필드 검증
  if (typeof parsed.client_email !== "string" || !parsed.client_email.includes("@")) {
    throw new Error("[SECURITY] GOOGLE_SERVICE_ACCOUNT_JSON에 유효한 client_email이 없습니다.");
  }
  if (typeof parsed.private_key !== "string" || !parsed.private_key.includes("PRIVATE KEY")) {
    throw new Error("[SECURITY] GOOGLE_SERVICE_ACCOUNT_JSON에 유효한 private_key가 없습니다.");
  }
  if (parsed.type !== "service_account") {
    throw new Error("[SECURITY] GOOGLE_SERVICE_ACCOUNT_JSON의 type이 'service_account'가 아닙니다.");
  }

  // 키 생성 시기 경고 (private_key_id가 있으면 로테이션 권장)
  if (parsed.private_key_id && !_warnedKeyRotation) {
    _warnedKeyRotation = true;
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "[SECURITY] Google 서비스 계정 키 보안 권장사항:\n" +
        "  - 키를 정기적으로 로테이션하세요 (최소 90일)\n" +
        "  - 불필요한 권한은 제거하세요 (최소 권한 원칙)\n" +
        "  - Vercel의 Environment Variables로만 저장하고 코드에 포함하지 마세요"
      );
    }
  }

  return {
    client_email: parsed.client_email as string,
    private_key: parsed.private_key as string,
  };
}

export function getGoogleClient() {
  if (isMockMode()) {
    throw new Error("MOCK_MODE=true에서는 Google Client를 사용할 수 없습니다.");
  }

  const env = requireGoogleEnv();
  const credentials = validateServiceAccountKey(env.GOOGLE_SERVICE_ACCOUNT_JSON);

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
