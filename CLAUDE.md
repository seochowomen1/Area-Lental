# CLAUDE.md — Area-Lental 프로젝트 컨텍스트

## 프로젝트 개요

**Area-Lental**은 서초여성가족플라자의 공간 대관 신청 시스템입니다.
사용자가 온라인으로 공간을 예약하고, 관리자가 승인/반려/통계를 관리하는 풀스택 웹앱입니다.

## 기술 스택

- **Next.js 14.2.35** (App Router) + **React 18** + **TypeScript 5.5.4** (strict)
- **Tailwind CSS 3.4** (PostCSS, 커스텀 컴포넌트 기반 — 외부 UI 라이브러리 없음)
- **React Hook Form 7.52** + **Zod 3.23** (폼/유효성)
- **Google Sheets API** (프로덕션 DB) / **mockdb.ts** (로컬 개발 — `.mockdb.json`)
- **Nodemailer** (이메일) / **bcryptjs** (비밀번호) / **xlsx** (엑셀 내보내기)
- **Jest 30** (테스트) / **ESLint 8** (린트)

## 핵심 명령어

```bash
npm run dev          # 로컬 개발 서버
npm run build        # lint + typecheck + next build
npm test             # Jest 테스트
npm run typecheck    # TypeScript 검사 (npx tsc --noEmit)
npm run lint         # ESLint 검사
```

## 디렉토리 구조

```
app/
├── page.tsx                    # 홈 (공간 목록)
├── space/[id]/                 # 공간 상세
├── apply/                      # 대관 신청 폼
├── my/                         # 내 예약 조회 (매직 링크)
├── result/                     # 신청 결과 확인
├── admin/
│   ├── login/                  # 관리자 로그인
│   ├── requests/               # 신청 목록 (page.tsx=서버, RequestTable.tsx=클라이언트)
│   ├── requests/[id]/          # 신청 상세 (승인/반려/메모)
│   ├── calendar/               # 캘린더 뷰
│   ├── stats/                  # 실적 관리 (StatsClient.tsx)
│   └── settings/               # 설정 (수업시간, 차단, 이메일 템플릿)
├── api/
│   ├── requests/               # 대관 신청 생성
│   ├── admin/requests/         # 관리자 신청 관리 (GET/DELETE)
│   ├── admin/stats/            # 통계 API
│   ├── admin/blocks/           # 차단 관리
│   ├── admin/calendar/         # 캘린더 데이터
│   ├── admin/send-email/       # 이메일 발송
│   └── admin/export/           # 엑셀 내보내기

lib/
├── database.ts      # DB 추상화 (MockDatabase / SheetsDatabase)
├── mockdb.ts        # 인메모리 목업 DB
├── sheets.ts        # Google Sheets 연동
├── space.ts         # 공간 데이터 (Single Source of Truth)
├── types.ts         # 타입 정의 (RentalRequest, RequestStatus 등)
├── schema.ts        # Zod 유효성 스키마
├── config.ts        # 앱 설정 (요금, 운영시간 등)
├── pricing.ts       # 요금 계산 (단건/묶음)
├── bundle.ts        # 묶음 신청 분석
├── operating.ts     # 운영시간 로직
├── labels.ts        # UI 라벨
├── mail.ts          # 이메일 템플릿
├── adminAuth.ts     # 관리자 인증 (브라우저)
├── adminApiAuth.ts  # 관리자 API 인증
├── rateLimit.ts     # 레이트 리미팅
└── cn.ts            # Tailwind 클래스 유틸리티

components/          # 재사용 컴포넌트
middleware.ts        # 보안 헤더, 레이트 리미팅, 인증 미들웨어
```

## 핵심 패턴

### 데이터 흐름
- `MOCK_MODE=true` → `MockDatabase` (`.mockdb.json` 파일 기반)
- `MOCK_MODE=false` → `SheetsDatabase` (Google Sheets API, TTL 캐시 10~30초)
- `getDatabase()` 호출로 자동 선택

### 대관 상태
- `RequestStatus = "접수" | "승인" | "반려" | "취소"`
- 삭제 가능 상태: `반려`, `취소` 만

### 공간 카테고리
- `RoomCategory = "lecture" | "studio" | "gallery"`
- 강의실(4~7층), E-스튜디오, 우리동네 갤러리

### 묶음(Batch) 신청
- 여러 날짜를 한 번에 신청 → `batchId`로 그룹핑
- `analyzeBundle()` → 상태 분석 (부분처리 포함)
- `computeFeesForBundle()` → 묶음 요금 계산

### 관리자 인증
- 쿠키 기반 SHA-256 토큰 / bcrypt 해시
- 미들웨어에서 `/admin/*` 경로 보호

## 주요 파일 관계도 (관리자 신청 목록)

```
page.tsx (서버 컴포넌트)
  ├── getAllRequests() → DB에서 전체 신청 조회
  ├── 그룹핑/필터링/요금계산 → TableRowData[] 직렬화
  └── <RequestTable rows={...} /> → 클라이언트로 전달

RequestTable.tsx (클라이언트 컴포넌트)
  ├── 체크박스 선택/해제
  ├── Optimistic UI 삭제 (deletingKeys → removedKeys → router.refresh)
  └── DELETE /api/admin/requests → 서버 삭제

route.ts (DELETE API)
  ├── 관리자 인증 확인
  ├── 반려/취소 상태 확인
  └── db.deleteRequests() → 실제 삭제
```

## 최근 작업 이력 (참고용)

| 커밋 | 내용 |
|------|------|
| `443c57d` | 테이블 공간/상태 컬럼 줄바꿈 수정 + 코드 점검 (as any 제거, 에러 로깅, year 검증) |
| `770bf66` | 실적 관리 합계 컬럼 제거 + 대관 목록 삭제 Optimistic UI 고도화 |
| `47ba674` | 반려 사유 입력란을 반려 선택 시에만 활성화 |
| `fba931b` | 갤러리 월 걸침 일정의 통계 월별 배분 수정 |
| `882dca7` | 보안 운영 권장사항 4종 전면 적용 |
| `02b23c8` | 종합 보안 패치 (CSP/Rate Limit/타이밍 공격/ID 랜덤화) |

## 코드 스타일 & 규칙

- 한국어 UI 라벨 및 에러 메시지 사용
- 커밋 메시지: `fix:`, `feat:`, `security:`, `docs:` 프리픽스
- Tailwind CSS 직접 사용 (외부 UI 라이브러리 없음)
- `lib/space.ts`가 공간 데이터의 Single Source of Truth
- 서버 컴포넌트(page.tsx) + 클라이언트 컴포넌트(Client.tsx) 분리 패턴
- `force-dynamic` 설정으로 관리자 페이지 캐시 비활성화

## 브랜치 정보

- 작업 브랜치: `claude/rental-booking-system-FAhFO`
- 원격: `origin/claude/rental-booking-system-FAhFO`
