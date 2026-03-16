# 개인정보 보안 강화 계획

## 현황 요약

코드베이스를 전수 조사한 결과, 기본 보안 인프라(CSRF, Rate Limiting, 타이밍 공격 방어, 보안 헤더)는
우수한 수준이나, **개인정보보호법(공공기관) 관점**에서 아래 항목들의 보강이 필요합니다.

### 수집되는 개인정보 목록 (RentalRequest)
| 필드 | 내용 | 민감도 |
|------|------|--------|
| `applicantName` | 신청자명 | 일반 |
| `birth` | 생년월일 | **민감** |
| `phone` | 전화번호 | 일반 |
| `email` | 이메일 | 일반 |
| `address` | 주소 | 일반 |
| `orgName` | 단체명 | 일반 |

---

## Phase 1: 개인정보 마스킹 유틸리티 (필수/즉시)

### 1-1. `lib/mask.ts` 신설 — 마스킹 유틸리티 함수

```
maskName("홍길동") → "홍○○"
maskPhone("010-1234-5678") → "010-****-5678"
maskEmail("user@example.com") → "us***@example.com"
maskAddress("서울시 서초구 ...") → "서울시 서초구 ***"
maskBirth("1990-05-15") → "1990-**-**"
```

### 1-2. 공개 API 응답 마스킹 적용

**대상 파일:**
- `app/api/public/result/route.ts` (라인 159-162)
  - `applicantName`, `phone`, `address` → 마스킹 처리
  - `email`은 본인 인증에 사용되었으므로 그대로 반환 가능

**변경 전:**
```typescript
applicantName: representative.applicantName,
phone: representative.phone,
address: representative.address,
```

**변경 후:**
```typescript
applicantName: maskName(representative.applicantName),
phone: maskPhone(representative.phone),
address: maskAddress(representative.address),
```

### 1-3. 이메일 제목의 개인정보 제거

**대상 파일:** `lib/mail.ts`
- 관리자 알림 메일 제목에 포함된 `applicantName` → `신청번호`로 대체
- 현재: `[대관신청] 강의실401 / 2026-01-15 / 홍길동`
- 변경: `[대관신청] 강의실401 / 2026-01-15 / R-20260115xxxx`

---

## Phase 2: 감사 로그 완성 (필수/즉시)

### 2-1. 승인/반려 감사 로그 추가

**현황:** `auditLog.ts`에 `REQUEST_APPROVE`, `REQUEST_REJECT` 액션 타입은 정의되어 있지만,
실제 승인/반려 처리 코드에서 `auditLog()` 호출이 누락됨.

**대상 파일:**
- `app/admin/requests/[id]/` 내 승인/반려 처리 로직 (서버 액션 또는 API)

**추가할 내용:**
```typescript
auditLog({
  action: "REQUEST_APPROVE", // 또는 "REQUEST_REJECT"
  ip: getClientIp(req),
  target: requestId,
  details: { decidedAt, rejectReason }
});
```

### 2-2. 통계/엑셀 조회 감사 로그 추가

**대상 파일:**
- `app/api/admin/stats/route.ts` — 통계 조회 시 로그
- `app/api/admin/export/route.ts` — 엑셀 다운로드 시 로그
- `app/api/admin/export/form/route.ts` — 개별 신청서 다운로드 시 로그

**새 액션 타입 추가 (`lib/auditLog.ts`):**
```typescript
| "STATS_VIEW"
| "EXPORT_LIST"
| "EXPORT_FORM"
```

### 2-3. 개인정보 조회 감사 로그

**대상 파일:**
- `app/api/public/result/route.ts` — 신청 결과 조회 시

**새 액션 타입:**
```typescript
| "PI_ACCESS"  // Personal Information Access
```

---

## Phase 3: 개인정보 처리방침 페이지 (필수/법적)

### 3-1. `/privacy` 페이지 신설

개인정보보호법 제30조에 따라 공공기관은 개인정보 처리방침을 공개해야 합니다.

**포함 항목:**
1. 개인정보의 처리 목적
2. 수집하는 개인정보 항목
3. 개인정보의 보유 및 이용 기간 (3년)
4. 개인정보의 파기 절차 및 방법
5. 개인정보의 제3자 제공 (해당 없음)
6. 정보주체의 권리·의무 및 행사 방법
7. 개인정보 보호책임자 연락처
8. 개인정보 처리방침 변경 이력

### 3-2. 푸터에 개인정보 처리방침 링크 추가

모든 페이지 하단에 개인정보 처리방침 링크를 배치합니다.

---

## Phase 4: 개인정보 자동 파기 (필수/법적)

### 4-1. 보존 기한 체크 API

PrivacyModal에 "수집일로부터 3년"으로 명시되어 있지만, 자동 파기 로직이 없음.

**신설:** `app/api/admin/data-retention/route.ts`
- 3년 경과 건을 조회하는 GET API
- 관리자가 확인 후 파기하는 DELETE API (감사 로그 포함)

**신설 액션 타입:**
```typescript
| "DATA_RETENTION_CHECK"
| "DATA_RETENTION_PURGE"
```

### 4-2. 관리자 설정 페이지에 "보존기한 만료 건" 알림

관리자 대시보드에 3년 경과 건수를 표시하여 주기적 파기를 유도.

---

## Phase 5: 엑셀 내보내기 보안 강화 (권장)

### 5-1. 엑셀 다운로드 감사 로그 (Phase 2에서 처리)

### 5-2. 엑셀 파일에 워터마크/주의문구 삽입

**대상 파일:**
- `app/api/admin/export/route.ts`
- `app/api/admin/export/form/route.ts`

엑셀 시트에 "개인정보 포함 — 취급 주의" 주의문구를 헤더 영역에 삽입.

### 5-3. 다운로드 시 팝업 확인

엑셀 다운로드 버튼 클릭 시 "개인정보가 포함된 파일입니다. 개인정보보호법에 따라 안전하게 관리해주세요."
확인 모달을 표시.

---

## Phase 6: 세션 보안 강화 (권장)

### 6-1. 비활동 타임아웃 (30분)

**현황:** 고정 8시간 세션만 지원 (쿠키 maxAge).

**변경:**
- `middleware.ts`에서 마지막 요청 시간 추적
- 30분 비활동 시 세션 만료 처리
- 쿠키에 `lastActivity` 타임스탬프 추가하거나, 요청 시마다 쿠키 TTL 갱신

### 6-2. 동시 세션 제한 (선택)

하나의 관리자 계정으로 동시 로그인 수 제한 (단일 세션).

---

## Phase 7: CSP 강화 (장기)

### 7-1. `unsafe-inline` 제거

**현황 (middleware.ts 라인 69-70):**
```
script-src 'self' 'unsafe-inline'
style-src 'self' 'unsafe-inline'
```

**변경:** Next.js nonce 기반 CSP로 전환
- `app/layout.tsx`에서 nonce 생성
- `<Script nonce={nonce}>` 적용
- Tailwind CSS의 인라인 스타일은 빌드 타임에 처리되므로 style-src도 nonce 전환 가능

---

## 구현 우선순위

| 순서 | Phase | 항목 | 중요도 | 근거 |
|------|-------|------|--------|------|
| 1 | Phase 1 | 개인정보 마스킹 유틸리티 + API 적용 | **필수** | 개인정보 최소 노출 원칙 |
| 2 | Phase 2 | 감사 로그 완성 | **필수** | 개인정보보호법 접근 기록 의무 |
| 3 | Phase 3 | 개인정보 처리방침 페이지 | **필수** | 개인정보보호법 제30조 |
| 4 | Phase 4 | 자동 파기 로직 | **필수** | 개인정보보호법 제21조 |
| 5 | Phase 5 | 엑셀 내보내기 보안 | 권장 | 유출 방지 |
| 6 | Phase 6 | 세션 보안 강화 | 권장 | 비인가 접근 방지 |
| 7 | Phase 7 | CSP 강화 | 장기 | XSS 방어 심화 |

---

## 영향 범위

- **변경 파일 수 (예상):** 약 12~15개
- **신규 파일:** `lib/mask.ts`, `app/privacy/page.tsx`, `app/api/admin/data-retention/route.ts`
- **빌드 영향:** 없음 (기존 구조 유지)
- **사용자 UX 변경:**
  - 결과 조회 시 이름/전화번호/주소가 마스킹되어 보임
  - 푸터에 개인정보 처리방침 링크 추가
  - 엑셀 다운로드 시 확인 모달 추가
