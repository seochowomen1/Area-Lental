# 국가 공휴일 자동 휴관 처리 구현 계획

## 개요

현재 시스템은 **일요일만** 자동 휴관 처리하고, 공휴일은 관리자가 수동으로 차단(block)해야 함.
공공데이터포털 API를 통해 국가 공휴일·임시공휴일을 자동 감지하여 모든 공간의 예약을 차단하는 기능 추가.

## 데이터 소스

- **한국천문연구원 특일정보 API** (data.go.kr)
  - 엔드포인트: `http://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo`
  - 파라미터: `solYear`, `solMonth`, `ServiceKey`
  - 응답: XML/JSON — 공휴일 이름(`dateName`), 날짜(`locdate`), 공휴일 여부(`isHoliday`)
  - **임시공휴일·대체공휴일 포함** (API가 정부 관보 기준으로 자동 반영)
  - **무료**, API 키 발급 필요 (즉시 발급)

---

## 구현 단계

### Phase A: 공휴일 데이터 모듈 (`lib/holidays.ts`)

#### 1. 환경변수 추가
```
DATA_GO_KR_API_KEY=발급받은_서비스키
```
- `lib/env.ts`에 optional 환경변수 등록
- 키 미설정 시 공휴일 체크 비활성화 (graceful degradation)

#### 2. `lib/holidays.ts` 신규 생성

```typescript
// 핵심 함수
export async function getHolidays(year: number, month: number): Promise<HolidayInfo[]>
export async function isHoliday(dateYmd: string): Promise<boolean>
export function getHolidayName(dateYmd: string): string | null
```

**캐싱 전략:**
- **인메모리 TTL 캐시** (월 단위, TTL: 24시간)
  - 키: `"2026-03"` → 값: `HolidayInfo[]`
  - 공휴일은 하루에 한 번만 갱신하면 충분
  - 임시공휴일 지정 시에도 24시간 내 반영
- API 호출 실패 시 → 캐시된 데이터 사용 / 캐시 없으면 빈 배열 반환 (API 장애 시 공휴일 체크 스킵, 예약 차단하지 않음 — 안전 방향)

**HolidayInfo 타입:**
```typescript
type HolidayInfo = {
  date: string;      // "2026-01-01"
  name: string;      // "신정"
  isHoliday: boolean; // true
}
```

#### 3. API 응답 파싱
- XML 응답 → `xml2js` 또는 간단한 정규식 파싱 (외부 의존성 최소화)
- 또는 `_type=json` 파라미터로 JSON 응답 요청

---

### Phase B: 운영시간 로직 통합 (`lib/operating.ts`)

#### 4. `operatingRangesForDate()` 수정

현재:
```typescript
export function operatingRangesForDate(dateYmd: string): TimeRange[] {
  const dow = dayOfWeek(dateYmd);
  if (dow === 0) return [];  // 일요일만 체크
  ...
}
```

변경 후:
```typescript
export async function isClosedDate(dateYmd: string): Promise<boolean> {
  if (dayOfWeek(dateYmd) === 0) return true;       // 일요일
  return await isHoliday(dateYmd);                  // 공휴일
}
```

**주의:** `operatingRangesForDate()`는 현재 동기 함수.
공휴일 API 호출이 비동기이므로 두 가지 접근법 중 선택 필요:

**접근법 A (권장): 사전 로딩 패턴**
- 월 단위로 공휴일을 미리 로드하여 `Set<string>`으로 캐싱
- `operatingRangesForDate()`는 동기 상태 유지
- 호출 전에 `await ensureHolidaysLoaded(year, month)` 선행

```typescript
// 동기 함수 유지 — 캐시에서 즉시 조회
export function operatingRangesForDate(dateYmd: string): TimeRange[] {
  const dow = dayOfWeek(dateYmd);
  if (dow === 0 || isHolidayCached(dateYmd)) return [];
  // ... 기존 로직
}
```

**접근법 B: 비동기 전환**
- `operatingRangesForDate()`를 async로 변경
- 호출하는 모든 곳(6~7개 파일)을 await로 수정
- 변경 범위가 넓어 리스크 높음

→ **접근법 A 권장** (변경 최소화)

#### 5. `explainNoAvailability()` 수정

새로운 reason code 추가:
```typescript
export type DateAvailabilityReasonCode =
  | "PAST"
  | "SUNDAY_CLOSED"
  | "HOLIDAY_CLOSED"    // 신규
  | "NO_OPERATING_HOURS"
  | "FULLY_BOOKED_OR_BLOCKED"
  | "UNKNOWN";
```

공휴일인 경우 메시지:
```
"공휴일(설날)은 휴관으로 대관이 불가합니다."
```

#### 6. `validateOperatingHours()` 수정

공휴일에 대한 신청 차단 메시지:
```
"공휴일은 대관 신청이 불가합니다."
```

#### 7. `operatingNoticeText()` 수정

현재: `"평일 10~17 / 화 10~20 / 토 10~12 (일 휴관)"`
변경: `"평일 10~17 / 화 10~20 / 토 10~12 (일·공휴일 휴관)"`

---

### Phase C: API 엔드포인트 통합

#### 8. `/api/availability/route.ts` 수정

- 요청 날짜의 월에 대해 `await ensureHolidaysLoaded()` 호출
- `buildHourSlotsForDate()`가 공휴일에 빈 배열 반환하므로 기존 로직 그대로 동작
- `explainNoAvailability()`에서 공휴일 이유 반환

#### 9. `/api/booked-dates/route.ts` 수정

- 월 시작 전 `await ensureHolidaysLoaded(year, month)` 한 번 호출
- 공휴일은 일요일과 동일하게 `continue` 처리 (bookedDates에 포함하지 않음 — 캘린더 UI에서 별도 표시)
- 응답에 `holidays` 배열 추가:
```json
{
  "ok": true,
  "bookedDates": ["2026-03-20"],
  "holidays": [
    { "date": "2026-03-01", "name": "삼일절" }
  ]
}
```

---

### Phase D: 캘린더 UI 표시

#### 10. 사용자 캘린더 (`RentalCalendar.tsx`)

- `holidays` 데이터를 받아 공휴일 날짜에 빨간색 표시 + 툴팁
- 공휴일 클릭 시 "공휴일(OO)은 휴관입니다" 안내
- 일요일과 동일하게 선택 불가 처리

#### 11. 관리자 캘린더 (`CalendarClient.tsx`)

- 공휴일 날짜에 배지 표시 (예: 🔴 "삼일절")
- 관리자는 공휴일 목록을 시각적으로 확인 가능

#### 12. 공간 상세 (`SpaceDetailShell.tsx`)

- 날짜 선택 시 공휴일이면 "공휴일(OO)은 휴관입니다" 안내 표시
- 시간 선택 UI 비활성화

---

### Phase E: 관리자 확인 기능 (선택)

#### 13. 관리자 설정 페이지에 공휴일 목록 표시

- `/admin/settings` 에 "올해 공휴일 목록" 섹션 추가
- API에서 가져온 공휴일 목록을 테이블로 표시
- API 연결 상태 확인 (키 설정 여부, 마지막 갱신 시각)

---

## 영향받는 파일 목록

| 파일 | 변경 내용 |
|------|-----------|
| `lib/holidays.ts` | **신규** — 공휴일 API 호출 + 캐시 |
| `lib/operating.ts` | 공휴일 체크 추가 (동기 캐시 조회) |
| `lib/env.ts` | `DATA_GO_KR_API_KEY` 환경변수 |
| `lib/config.ts` | 운영시간 안내 문구 수정 (공휴일 포함) |
| `app/api/availability/route.ts` | 공휴일 사전 로딩 + reason 처리 |
| `app/api/booked-dates/route.ts` | 공휴일 skip + holidays 배열 반환 |
| `app/api/admin/calendar/route.ts` | 공휴일 정보 포함 |
| `components/RentalCalendar.tsx` | 공휴일 날짜 표시 |
| `components/SpaceDetailShell.tsx` | 공휴일 안내 메시지 |
| `app/admin/calendar/CalendarClient.tsx` | 공휴일 배지 |
| `.env.example` | API 키 예시 추가 |

## 리스크 및 고려사항

1. **API 키 미설정 시**: 공휴일 체크 자체를 스킵 (현재와 동일하게 동작)
2. **API 장애 시**: 캐시 데이터 사용 / 캐시 없으면 공휴일 체크 스킵 (예약 차단 안 함 — 안전 방향)
3. **임시공휴일 반영 지연**: 정부 관보 게재 → API 반영 → 24시간 캐시 TTL 내 반영 (실무적으로 충분)
4. **기관 자체 휴관일**: 공휴일 API에 포함되지 않으므로 기존 수동 차단(block) 기능으로 관리
5. **성능**: 월 1회 API 호출 + 인메모리 캐시 → 기존 응답 시간에 영향 없음
6. **동기 함수 유지**: `operatingRangesForDate()` 시그니처 변경 없이 캐시 패턴 적용으로 변경 범위 최소화
