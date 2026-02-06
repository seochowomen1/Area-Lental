# 대관 신청 시스템 (Rental Application System)

온라인 공간 대관 신청 및 관리 시스템입니다.

## 🎨 v25 주요 개선사항

### UI/UX 개편
- ✨ **메인 페이지 디자인 완전 개편**: 레퍼런스 디자인과 정확히 일치하도록 재설계
  - 카드 레이아웃 최적화 (세로 길이, 여백, 간격)
  - 아이콘 크기 및 배치 개선
  - 색상 체계 개선 (진한 파란색 #1e5a8e)
  - 버튼 디자인 개선 (둥근 모서리, 호버 효과)

### 코드 품질 대폭 개선
- 🔧 **전역적으로 deprecated 함수 완전 제거**
  - 11개 파일에서 `sheets.ts` 직접 import 제거
  - 모든 코드에서 `getDatabase()` 패턴 사용
  - 일관된 데이터 접근 방식 확립

- 📝 **로거 시스템 실제 적용**
  - API 엔드포인트에 구조화된 로깅 추가
  - 개발/프로덕션 환경 구분 로깅
  - 디버깅 및 모니터링 개선

### 안정성 향상
- ✅ 모든 API 라우트에서 일관된 에러 처리
- ✅ 타입 안정성 100% 유지
- ✅ 코드 중복 제거 및 유지보수성 향상

## 🎉 v21 개선 사항

이 버전에서는 다음과 같은 주요 개선이 이루어졌습니다:

### 코드 품질 개선
- ✅ **타입 안정성 강화**: `BlockedSlot` 타입 별칭 추가로 타입 불일치 해결
- ✅ **상수 관리**: Magic number 제거 및 `TIME_CONSTANTS` 도입
- ✅ **deprecated 함수 제거**: `getDatabase()` 패턴으로 일관성 확보
- ✅ **컴포넌트 분할**: ApplyClient를 섹션별 컴포넌트로 분리하여 유지보수성 향상

### 에러 처리 개선
- ✅ **세분화된 에러 처리**: Google API, 네트워크 에러 등 타입별 처리
- ✅ **구조화된 로깅**: `logger` 유틸리티 추가 (개발/프로덕션 환경 구분)
- ✅ **환경 변수 검증**: Zod 기반 환경 변수 검증 유틸리티 추가

### 접근성 개선
- ✅ **ARIA 속성 추가**: 모달 및 주요 컴포넌트에 접근성 속성 추가
- ✅ **키보드 네비게이션**: 향상된 키보드 접근성

### 새로운 유틸리티
- 📝 `lib/logger.ts`: 구조화된 로깅 시스템
- 🔍 `lib/env-validation.ts`: 환경 변수 검증 유틸리티
- 🧩 `components/apply/*`: 신청 폼 섹션 컴포넌트들

## 📋 주요 기능

### 사용자 기능
- 📅 **공간 예약 현황 조회**: 실시간 예약 가능 시간대 확인
- 📝 **온라인 신청서 작성**: 간편한 웹 폼을 통한 신청
- 📎 **첨부파일 업로드**: 필요 서류 온라인 제출
- 📧 **자동 이메일 알림**: 신청 접수 및 결과 안내

### 관리자 기능
- 🔍 **신청 내역 조회**: 필터링 및 검색 기능
- ✅ **승인/반려 처리**: 신청 검토 및 결정
- 📊 **엑셀 다운로드**: 데이터 분석 및 보고
- ⚙️ **운영 설정**: 정규 수업 일정 및 차단 시간대 관리

## 🛠 기술 스택

- **프레임워크**: Next.js 14.2.35 (App Router)
- **언어**: TypeScript 5.5.4
- **스타일링**: Tailwind CSS 3.4.10
- **폼 관리**: React Hook Form 7.52.1 + Zod 3.23.8
- **데이터 저장**: Google Sheets API
- **파일 저장**: Google Drive API
- **이메일**: Nodemailer (SMTP)

## 📁 프로젝트 구조

```
rental-app/
├── app/                    # Next.js App Router
│   ├── space/             # 공간 목록 및 상세 페이지
│   ├── apply/             # 신청서 작성 페이지
│   ├── admin/             # 관리자 페이지
│   └── api/               # API 엔드포인트
├── components/            # React 컴포넌트
│   ├── RentalCalendar.tsx
│   ├── SpaceBooking.tsx
│   └── ...
├── lib/                   # 유틸리티 및 비즈니스 로직
│   ├── space.ts           # 공간 데이터 (Single Source of Truth)
│   ├── database.ts        # 데이터베이스 추상화 레이어
│   ├── api-response.ts    # API 응답 표준 형식
│   ├── schema.ts          # Zod 스키마 정의
│   ├── config.ts          # 설정 상수
│   ├── google.ts          # Google API 클라이언트
│   ├── sheets.ts          # Google Sheets 연동
│   ├── mockdb.ts          # Mock 데이터베이스 (로컬 테스트용)
│   └── ...
└── public/                # 정적 파일

```

## 🚀 시작하기

### 1. 환경 변수 설정

프로젝트 루트에 `.env.local` 파일을 생성하세요.

#### Mock 모드 (로컬 테스트용)

```env
MOCK_MODE=true
ADMIN_PASSWORD=your_admin_password
APP_BASE_URL=http://localhost:3000
```

#### 실제 운영 모드

```env
# Google API
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
GOOGLE_SHEET_ID=your_sheet_id
GOOGLE_DRIVE_FOLDER_ID=your_folder_id

# 관리자
ADMIN_PASSWORD=your_admin_password

# SMTP (이메일)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
SMTP_FROM=your_email@gmail.com

# 알림
ADMIN_NOTIFY_EMAIL=admin@example.com
APP_BASE_URL=https://your-domain.com
```

### 2. 의존성 설치

```bash
npm install
```

#### npm 경고 로그가 너무 많이 보일 때

이 프로젝트에는 기본으로 `.npmrc`가 포함되어 있어 `audit/fund` 및 대부분의 `warn` 로그를 숨깁니다.
만약 경고를 다시 보고 싶다면(의존성 점검/트러블슈팅 시 권장) 아래 중 하나를 선택하세요.

1) 임시로 로그레벨 올리기

```bash
npm_config_loglevel=warn npm install
```

2) `.npmrc`에서 `loglevel=error` 줄을 삭제/수정

> Windows에서 설치/삭제가 자주 꼬이면(EPERM, cleanup 실패 등)
> - 프로젝트 경로를 짧게 이동 권장: `C:\work\rental-app`
> - 실행 중인 `node.exe`/`next dev`/VSCode 터미널을 모두 종료 후 재시도

### 3. 개발 서버 실행

```bash
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 열어 확인하세요.

### 4. 빌드 및 배포

```bash
npm run build
npm start
```

## 📚 주요 개념

### Single Source of Truth

모든 공간 데이터는 `lib/space.ts`에서 관리됩니다. 공간을 추가/수정/삭제할 때는 이 파일만 수정하면 됩니다.

```typescript
// lib/space.ts
export const ROOMS: SpaceRoom[] = [
  { 
    id: "bookcafe", 
    floor: "4", 
    name: "북카페", 
    capacity: 20,
    // ...
  },
  // ...
];
```

### 데이터베이스 추상화

`lib/database.ts`는 Mock 모드와 실제 모드를 통합 관리합니다.

```typescript
import { getDatabase } from "@/lib/database";

const db = getDatabase(); // 환경에 따라 자동 선택
const requests = await db.getAllRequests();
```

### API 응답 표준화

모든 API는 `lib/api-response.ts`의 표준 형식을 따릅니다.

```typescript
import { success, error, HTTP_STATUS } from "@/lib/api-response";

// 성공
return NextResponse.json(success({ requestId: "..." }), { status: HTTP_STATUS.SUCCESS });

// 에러
return NextResponse.json(error("VALIDATION_ERROR", "입력값 오류"), { status: HTTP_STATUS.VALIDATION_ERROR });
```

## 🔧 공간 데이터 수정 방법

### 1. 공간 추가

`lib/space.ts`의 `ROOMS` 배열에 새 항목을 추가하세요.

```typescript
export const ROOMS: SpaceRoom[] = [
  // 기존 공간들...
  { 
    id: "new_room",           // 고유 ID (영문/숫자)
    floor: "5",               // 층 (4, 5, 6, 7)
    name: "새로운 강의실",     // 표시 이름
    capacity: 15,             // 수용 인원
    durationLimitHours: 4,    // 최대 이용 시간
    feeKRW: 0,               // 이용 금액
    contactName: "관리자",
    contactPhone: "02-0000-0000",
    note: "공간 설명"          // 선택사항
  },
];
```

### 2. 공간 수정

해당 공간의 속성을 직접 수정하세요.

### 3. 공간 삭제

해당 공간을 배열에서 제거하세요.

⚠️ **주의**: 기존 예약 데이터와의 일관성을 확인하세요.

## 🎨 운영 시간 설정

`lib/config.ts`에서 운영 시간을 설정할 수 있습니다.

```typescript
export const OPERATING_RULES = {
  weekday: { start: "10:00", end: "17:00" },
  tuesdayNight: { start: "18:00", end: "20:00" },
  saturday: { start: "10:00", end: "12:00" }
};
```

## 📧 이메일 템플릿

이메일 템플릿은 `lib/mail.ts`에서 수정할 수 있습니다.

## 🔐 관리자 로그인

- URL: `/admin/login`
- 비밀번호: 환경 변수 `ADMIN_PASSWORD`에 설정된 값

## 🐛 문제 해결

### Mock 모드에서 데이터가 사라짐

Mock 모드는 `.mockdb.json` 파일에 데이터를 저장합니다. 이 파일을 삭제하지 마세요.

### Google API 인증 오류

1. Service Account JSON이 올바른지 확인
2. Google Sheets/Drive API가 활성화되어 있는지 확인
3. Service Account에 Sheet/Folder 접근 권한이 있는지 확인

### 이메일 발송 실패

1. SMTP 설정이 올바른지 확인
2. Gmail 사용 시 "앱 비밀번호" 사용 필요
3. 방화벽에서 SMTP 포트(587) 허용 확인

## 📝 개선 사항 (v2.0)

### ✅ 완료된 개선 사항

1. **데이터 일관성 개선**
   - 공간 데이터를 `lib/space.ts`로 통합
   - Single Source of Truth 원칙 적용

2. **타입 안전성 강화**
   - 공통 타입 정의 및 재사용
   - 타입 불일치 제거

3. **API 중복 제거**
   - `/api/public/availability` 제거
   - `/api/availability`로 통합

4. **데이터베이스 추상화**
   - `lib/database.ts` 추가
   - Mock/Sheets 자동 선택

5. **API 응답 표준화**
   - `lib/api-response.ts` 추가
   - 일관된 에러 처리

6. **문서화 개선**
   - README 추가
   - 주석 및 JSDoc 보강

### 🔜 향후 개선 계획

1. **보안 강화**
   - JWT 기반 인증 시스템
   - CSRF 보호
   - 파일 업로드 보안 강화

2. **UI/UX 개선**
   - 캘린더 예약 가능 여부 표시
   - 시간 슬롯 선택 UI 개선
   - 모바일 반응형 최적화

3. **성능 최적화**
   - API 응답 캐싱
   - 이미지 최적화 (Next.js Image)
   - 번들 크기 최적화

4. **기능 확장**
   - 사용자 회원가입/로그인
   - 예약 변경/취소 기능
   - 결제 시스템 연동
   - 문자 알림 (SMS)

## 📄 라이선스

이 프로젝트는 내부 사용을 위한 것입니다.

## 🤝 기여

버그 리포트나 기능 제안은 이슈로 등록해주세요.

---

**개발**: Manus AI  
**버전**: 2.0 (개선판)  
**최종 업데이트**: 2026-01-15

---

## 문제 해결 (자주 발생하는 오류)

### 1) Windows에서 SWC 로딩 오류

증상 예시:
- `...next-swc.win32-x64-msvc.node is not a valid Win32 application`

대부분 아래 중 하나입니다.

1) **32-bit Node(ia32) 설치**
- 확인: `node -p "process.arch"`
- 결과가 `ia32`면 64-bit Node(x64)로 재설치가 필요합니다.

2) **Windows ARM(arm64) 환경에서 x64/arm64 혼용**
- Node와 @next/swc 패키지가 같은 아키텍처로 설치되어야 합니다.

3) **설치가 중간에 끊겨 node_modules 바이너리가 손상**

4) **Node 버전이 너무 최신(v24 등)**
- Next.js 14.x는 환경에 따라 최신 Node에서 SWC 바이너리 로딩 오류가 발생할 수 있습니다.
- 로컬은 **Node 20 LTS 또는 Node 22 LTS** 사용을 권장합니다.

권장 조치(공통):
```bash
# 1) node_modules 제거
rm -rf node_modules

# 2) npm 캐시 정리
npm cache clean --force

# 3) 재설치
# - package-lock.json이 있으면: npm ci
# - lockfile이 없으면: npm install
npm install

# 4) 실행
npm run dev
```

Windows PowerShell 기준:
```powershell
Remove-Item -Recurse -Force node_modules
npm cache clean --force
npm install
npm run dev
```
