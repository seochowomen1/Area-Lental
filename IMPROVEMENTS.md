# 코드 개선 가이드

이 문서는 v21에서 적용된 주요 개선사항과 향후 권장 개선 방향을 안내합니다.

## ✅ v21에서 적용된 개선사항

### 1. 타입 안정성 강화

**문제**: `BlockedSlot`과 `BlockTime` 타입 불일치
**해결**: `lib/types.ts`에 타입 별칭 추가

```typescript
export type BlockedSlot = BlockTime;
```

### 2. Magic Number 제거

**문제**: 코드 전반에 하드코딩된 숫자 (60, 360, 30 등)
**해결**: `lib/constants.ts`에 `TIME_CONSTANTS` 추가

```typescript
export const TIME_CONSTANTS = {
  MINUTES_PER_HOUR: 60,
  MIN_RENTAL_MINUTES: 60,
  MAX_RENTAL_MINUTES: 360,
  TIME_SLOT_INTERVAL: 30,
} as const;
```

### 3. Deprecated 함수 제거

**문제**: `sheets.ts`에서 직접 함수 import
**해결**: `getDatabase()` 패턴 사용

```typescript
// Before
import { getAllRequests, getBlocks } from '@/lib/sheets';

// After
import { getDatabase } from '@/lib/database';
const db = getDatabase();
const requests = await db.getAllRequests();
```

### 4. 에러 처리 개선

**문제**: 일반적인 에러 메시지
**해결**: 에러 타입별 세분화 처리

```typescript
catch (e: any) {
  // Google API 에러
  if (e.message?.includes('Google')) {
    return NextResponse.json({...}, { status: 503 });
  }
  
  // 네트워크 에러
  if (e.code === 'ECONNREFUSED') {
    return NextResponse.json({...}, { status: 503 });
  }
  
  // 기타 에러
  return NextResponse.json({...}, { status: 500 });
}
```

### 5. 구조화된 로깅

**추가**: `lib/logger.ts` 유틸리티

```typescript
import { logger } from '@/lib/logger';

logger.info('신청 생성 완료', { requestId: 'REQ-123' });
logger.error('API 오류 발생', { error: e.message });
```

### 6. 컴포넌트 분할

**문제**: ApplyClient.tsx가 583줄로 너무 김
**해결**: 섹션별 컴포넌트로 분리

- `components/apply/RentalTimeSection.tsx`
- `components/apply/ApplicantInfoSection.tsx`
- `components/apply/OrganizationInfoSection.tsx`

### 7. 접근성 개선

**추가**: PledgeModal에 ARIA 속성

```typescript
<div
  role="dialog"
  aria-modal="true"
  aria-labelledby="pledge-modal-title"
  aria-describedby="pledge-modal-desc"
>
```

### 8. 환경 변수 검증

**추가**: `lib/env-validation.ts`

```typescript
import { validateEnv } from '@/lib/env-validation';

// 앱 시작 시 검증
const env = validateEnv();
```

---

## 🔜 향후 권장 개선사항

### 우선순위 High

#### 1. 테스트 코드 작성

현재 `__tests__/lib/schema.test.ts`에 예시만 있습니다.

**설치 필요**:
```bash
npm install --save-dev jest @types/jest ts-jest @testing-library/react @testing-library/jest-dom
```

**jest.config.js 생성**:
```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
};
```

**목표**: 최소 50% 코드 커버리지

#### 2. ApplyClient 리팩토링 완성

현재 섹션 컴포넌트는 생성했지만 ApplyClient에서 아직 사용하지 않습니다.

**할 일**:
1. ApplyClient.tsx에서 새 컴포넌트 import
2. 각 섹션을 컴포넌트로 교체
3. props 전달 최적화

#### 3. 에러 바운더리 추가

React Error Boundary로 전역 에러 처리:

```typescript
// components/ErrorBoundary.tsx
import { Component, ReactNode } from 'react';

class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  // ...
}
```

### 우선순위 Medium

#### 4. 성능 최적화

**React.memo 적용**:
```typescript
export default React.memo(RentalTimeSection);
```

**useCallback 사용**:
```typescript
const handleTimeChange = useCallback((newTime: string) => {
  setValue("startTime", newTime);
}, [setValue]);
```

#### 5. 로깅 통합

현재 `logger`가 있지만 실제로 사용되지 않습니다.

**할 일**:
1. API 라우트에 logger 적용
2. 중요 액션에 로깅 추가
3. 프로덕션에서 로그 수집 서비스 연동 (Sentry, CloudWatch 등)

#### 6. Rate Limiting

API 엔드포인트에 속도 제한 추가:

```typescript
// middleware.ts
import { rateLimit } from './lib/rate-limit';

const limiter = rateLimit({
  interval: 60 * 1000, // 1분
  uniqueTokenPerInterval: 500,
});
```

### 우선순위 Low

#### 7. 국제화 (i18n)

향후 다국어 지원이 필요한 경우:

```bash
npm install next-intl
```

#### 8. E2E 테스트

Playwright 또는 Cypress로 전체 플로우 테스트:

```bash
npm install --save-dev @playwright/test
```

#### 9. Storybook

컴포넌트 개발 및 문서화:

```bash
npx storybook init
```

---

## 📚 코딩 컨벤션

### 타입 정의
- 타입은 `lib/types.ts`에 중앙 집중
- export하는 타입은 명확한 이름 사용
- 재사용 가능한 타입은 제네릭 활용

### 컴포넌트
- 파일명은 PascalCase (예: `RentalTimeSection.tsx`)
- 한 파일에 하나의 주요 컴포넌트
- Props는 interface로 정의

### 함수
- 순수 함수 우선 (side effect 최소화)
- 함수명은 동사로 시작 (예: `formatPhoneKR`, `validateTime`)
- 복잡한 로직은 주석 추가

### 상수
- 대문자 SNAKE_CASE (예: `TIME_CONSTANTS`)
- `as const` 사용으로 타입 안정성 확보
- 관련 상수는 객체로 그룹화

### 에러 처리
- 모든 async 함수는 try-catch
- 에러 타입별 처리
- 사용자에게 명확한 메시지

---

## 🔍 코드 리뷰 체크리스트

새로운 코드를 추가할 때 확인할 사항:

- [ ] TypeScript 타입 에러 없음 (`npm run typecheck`)
- [ ] ESLint 경고 없음 (`npm run lint`)
- [ ] 새로운 magic number가 없음
- [ ] 에러 처리 추가됨
- [ ] 필요한 경우 로깅 추가
- [ ] 접근성 고려 (ARIA 속성)
- [ ] 성능 고려 (불필요한 리렌더링 방지)
- [ ] 보안 고려 (입력값 검증)
- [ ] 테스트 코드 작성 (가능한 경우)

---

## 📖 참고 자료

### Next.js
- [공식 문서](https://nextjs.org/docs)
- [App Router 가이드](https://nextjs.org/docs/app)

### TypeScript
- [공식 핸드북](https://www.typescriptlang.org/docs/handbook/intro.html)
- [타입 추론 가이드](https://www.typescriptlang.org/docs/handbook/type-inference.html)

### React
- [React Hooks](https://react.dev/reference/react)
- [성능 최적화](https://react.dev/learn/render-and-commit)

### Zod
- [스키마 정의](https://zod.dev/)
- [에러 처리](https://zod.dev/ERROR_HANDLING)

### 접근성
- [ARIA 가이드](https://www.w3.org/WAI/ARIA/apg/)
- [WebAIM 체크리스트](https://webaim.org/standards/wcag/checklist)
