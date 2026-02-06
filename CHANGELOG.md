# Changelog

All notable changes to this project will be documented in this file.

## [v25] - 2025-01-20

### 🎨 UI/UX 개선
- **메인 페이지 디자인 완전 개편**: 레퍼런스 이미지와 정확히 일치하도록 재설계
  - 카드 높이 증가 (min-h-[480px])
  - 아이콘 크기 및 위치 최적화
  - 제목 폰트 크기 및 색상 조정 (#1e5a8e)
  - 버튼 디자인 개선 (둥근 모서리, 진한 파란색)
  - 전체적인 여백 및 간격 조정
  - 배경색 변경 (bg-gray-50)

### 🔧 코드 품질 개선
- **전역적으로 deprecated 함수 제거**
  - 모든 파일에서 `sheets.ts` 직접 import 제거
  - `getDatabase()` 패턴으로 일관성 있게 통합
  - 영향받은 파일: 7개 (admin pages + API routes)

- **로거 시스템 실제 적용**
  - `app/api/requests/route.ts`: 로거 적용
  - `app/api/availability/route.ts`: 로거 적용 + deprecated 함수 제거
  - 구조화된 로깅으로 디버깅 개선

### 📝 개선된 파일 목록
```
✏️ app/page.tsx                          - 메인 페이지 디자인 완전 개편
✏️ components/home/HomeCategoryCard.tsx  - 레퍼런스 이미지 정확히 반영
✏️ app/api/requests/route.ts             - 로거 추가
✏️ app/api/availability/route.ts         - deprecated 제거 + 로거 추가
✏️ app/admin/page.tsx                    - getDatabase() 사용
✏️ app/admin/settings/page.tsx           - getDatabase() 사용
✏️ app/admin/requests/[id]/page.tsx      - getDatabase() 사용
✏️ app/api/admin/export/route.ts         - getDatabase() 사용
✏️ app/api/admin/export/form/route.ts    - getDatabase() 사용
✏️ app/api/admin/class-schedules/route.ts - getDatabase() 사용
✏️ app/api/admin/blocks/route.ts         - getDatabase() 사용
```

### 🎯 주요 특징
- ✅ 메인 페이지가 제공된 디자인 가이드와 정확히 일치
- ✅ 모든 코드에서 일관된 데이터 접근 패턴 사용
- ✅ 실제로 동작하는 구조화된 로깅 시스템
- ✅ 코드 중복 제거 및 유지보수성 향상

### 📊 코드 개선 통계
- Deprecated 함수 사용 제거: 7개 파일
- 로거 적용: 2개 API 엔드포인트
- UI 개선: 메인 페이지 + 카드 컴포넌트

---

## [v24] - 이전 버전 (다른 AI가 작업)

이전 버전 기록...

---

## [v21] - 2025-01-20

### Added
- 새로운 유틸리티 파일
  - `lib/logger.ts`: 구조화된 로깅 시스템 (개발/프로덕션 환경 구분)
  - `lib/env-validation.ts`: Zod 기반 환경 변수 검증
  - `lib/constants.ts`: TIME_CONSTANTS 추가 (magic number 제거)

- 새로운 컴포넌트 (ApplyClient 분할)
  - `components/apply/RentalTimeSection.tsx`: 대관 일시 선택 섹션
  - `components/apply/ApplicantInfoSection.tsx`: 신청자 정보 섹션
  - `components/apply/OrganizationInfoSection.tsx`: 단체/행사 정보 섹션

### Changed
- **타입 시스템 개선**
  - `lib/types.ts`: `BlockedSlot` 타입 별칭 추가하여 타입 불일치 해결
  - `lib/schema.ts`: TIME_CONSTANTS 사용으로 magic number 제거

- **API 레이어 개선**
  - `app/api/requests/route.ts`: deprecated 함수 제거, `getDatabase()` 사용
  - 에러 처리 세분화 (Google API 에러, 네트워크 에러 등 타입별 처리)
  - 개발 환경에서 상세 에러 메시지 포함

- **접근성 개선**
  - `components/PledgeModal.tsx`: ARIA 속성 추가 (`aria-labelledby`, `aria-describedby`, `aria-label`)
  - 모달 오버레이에 `tabIndex={-1}` 추가
  - 버튼에 명확한 `aria-label` 추가

- **코드 품질**
  - Magic number를 명명된 상수로 대체
  - 컴포넌트 분할로 가독성 향상
  - 일관된 에러 처리 패턴 적용

### Fixed
- `BlockedSlot` vs `BlockTime` 타입 불일치 문제 해결
- deprecated 함수 사용 문제 해결 (sheets.ts에서 직접 import → database.ts 사용)

### Developer Experience
- README.md에 v21 개선 사항 섹션 추가
- 더 나은 타입 추론을 위한 타입 별칭 추가
- 구조화된 로깅으로 디버깅 용이성 향상

---

## [v20] - 이전 버전

초기 구현 버전
- 기본 대관 신청 시스템
- Google Sheets 연동
- 관리자 패널
- 이메일 알림
