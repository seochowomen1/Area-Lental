/**
 * 개인정보 마스킹 유틸리티
 *
 * 공개 API 응답에서 개인정보를 최소 노출하기 위한 함수들입니다.
 * 개인정보보호법 제29조(안전성 확보 조치) 준수.
 */

/** 이름 마스킹: "홍길동" → "홍○○", "Kim" → "K○○" */
export function maskName(name: string): string {
  if (!name) return "";
  const trimmed = name.trim();
  if (trimmed.length <= 1) return trimmed;
  return trimmed[0] + "○".repeat(trimmed.length - 1);
}

/**
 * 전화번호 마스킹: "010-1234-5678" → "010-****-5678"
 * 하이픈 없는 경우에도 처리: "01012345678" → "010****5678"
 */
export function maskPhone(phone: string): string {
  if (!phone) return "";
  const trimmed = phone.trim();

  // 하이픈 포함 형식 (010-1234-5678)
  const dashed = trimmed.match(/^(\d{2,3})-(\d{3,4})-(\d{4})$/);
  if (dashed) {
    return `${dashed[1]}-****-${dashed[3]}`;
  }

  // 하이픈 없는 형식 (01012345678)
  const plain = trimmed.match(/^(\d{2,3})(\d{3,4})(\d{4})$/);
  if (plain) {
    return `${plain[1]}****${plain[3]}`;
  }

  // 패턴 매칭 안 되면 앞 3자리 + **** + 뒤 2자리
  if (trimmed.length < 7) return trimmed;
  return trimmed.slice(0, 3) + "****" + trimmed.slice(-2);
}

/** 이메일 마스킹: "user@example.com" → "us***@example.com" */
export function maskEmail(email: string): string {
  if (!email) return "";
  const trimmed = email.trim();
  const atIdx = trimmed.indexOf("@");
  if (atIdx < 0) return trimmed;

  const local = trimmed.slice(0, atIdx);
  const domain = trimmed.slice(atIdx);

  if (local.length === 0) {
    return "***" + domain;
  }
  if (local.length === 1) {
    return local[0] + "***" + domain;
  }
  return local.slice(0, 2) + "***" + domain;
}

/** 주소 마스킹: "서울시 서초구 방배동 123-4" → "서울시 서초구 ***" */
export function maskAddress(address: string): string {
  if (!address) return "";
  const trimmed = address.trim();

  // 공백으로 분리하여 앞 2단위만 표시
  const parts = trimmed.split(/\s+/);
  if (parts.length <= 2) {
    return parts[0] + " ***";
  }
  return parts.slice(0, 2).join(" ") + " ***";
}

/** 생년월일 마스킹: "1990-05-15" → "1990-**-**" */
export function maskBirth(birth: string): string {
  if (!birth) return "";
  const trimmed = birth.trim();
  const match = trimmed.match(/^(\d{4})-\d{2}-\d{2}$/);
  if (match) {
    return `${match[1]}-**-**`;
  }
  // 패턴 불일치 시 앞 4자리만 표시
  if (trimmed.length > 4) {
    return trimmed.slice(0, 4) + "-**-**";
  }
  return trimmed;
}
