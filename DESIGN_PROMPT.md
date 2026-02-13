# 서초여성가족플라자 디자인 시스템 프롬프트

> 이 프롬프트를 새 프로젝트 시작 시 AI에게 전달하면, 서초여성가족플라자 대관 시스템과 동일한 디자인 톤으로 개발할 수 있습니다.

---

## 프롬프트 (복사하여 사용)

```
아래 디자인 시스템과 기술 스택을 기반으로 [여기에 프로젝트 설명]을 개발해줘.

## 기술 스택

- **프레임워크**: Next.js 14 (App Router)
- **언어**: TypeScript 5.5
- **스타일링**: Tailwind CSS 3.4 (유틸리티 클래스 기반, 별도 CSS-in-JS 없음)
- **폼 관리**: react-hook-form + zod (스키마 기반 유효성 검증)
- **패키지 매니저**: npm

## 디자인 원칙

1. **미니멀 & 깔끔**: 과도한 그림자, 그래디언트, 애니메이션 금지. 1px 보더 + 미세한 쉐도우만 사용.
2. **카드 기반 레이아웃**: 모든 컨텐츠 블록은 `rounded-xl border border-slate-200 bg-white` 카드에 담기.
3. **CSS 변수 브랜딩**: 브랜드 색상은 CSS 변수로 관리하여 한 곳에서 변경 가능.
4. **프리셋 시스템**: 버튼/카드/인풋/체크박스 등의 Tailwind 클래스 조합을 `presets.ts`에 모아서 일관성 유지.
5. **반응형 우선**: 모바일 → sm(640) → md(768) → lg(1024) 순서.

## CSS 변수 (globals.css)

```css
:root {
  color-scheme: light;
  --brand-primary: 14 74 122;      /* 네이비 블루 — 메인 색상 */
  --brand-accent: 242 132 43;       /* 오렌지 — 포인트 색상 */
  --brand-bg: 246 248 250;          /* 연한 그레이 — 페이지 배경 */
}

body {
  background: rgb(var(--brand-bg));
}
```

> 새 프로젝트에서는 `--brand-primary`와 `--brand-accent` 값만 바꾸면 전체 톤이 변경됩니다.
> 사용법: `bg-[rgb(var(--brand-primary))]`, `text-[rgb(var(--brand-accent))]`

## Tailwind 프리셋 (components/ui/presets.ts)

### 카드
```ts
export const CARD_BASE =
  "rounded-xl border border-slate-200 bg-white shadow-[0_1px_0_rgba(0,0,0,0.02)]";

export const CARD_PAD = {
  sm: "px-4 py-3",
  md: "px-6 py-5",
  lg: "px-7 py-6",
} as const;
```

### 알림/공지 박스
```ts
export const NOTICE_BASE =
  "rounded-xl border border-slate-200 bg-white shadow-[0_1px_0_rgba(0,0,0,0.02)]";

export const NOTICE_VARIANT = {
  info:    "border-l-[3px] border-l-[rgb(var(--brand-primary))]",
  accent:  "border-l-[3px] border-l-[rgb(var(--brand-accent))]",
  success: "border-l-[3px] border-l-emerald-500",
  warn:    "border-l-[3px] border-l-amber-500",
  danger:  "border-l-[3px] border-l-red-500",
} as const;
```

### 버튼
```ts
export const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-[rgb(var(--brand-primary)/0.35)] disabled:cursor-not-allowed disabled:opacity-60";

export const BUTTON_VARIANT = {
  primary: "bg-[rgb(var(--brand-primary))] text-white hover:opacity-95 active:opacity-90",
  accent:  "bg-[rgb(var(--brand-accent))] text-white hover:opacity-95 active:opacity-90",
  outline: "border border-slate-200 bg-white text-slate-900 hover:bg-slate-50",
  ghost:   "bg-transparent text-slate-900 hover:bg-slate-100",
  danger:  "bg-red-600 text-white hover:opacity-95 active:opacity-90",
} as const;
```

### 폼 필드
```ts
export const FIELD_CONTROL_BASE =
  "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-[0_1px_0_rgba(0,0,0,0.02)] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--brand-primary)/0.28)] disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed";

export const FIELD_LABEL = "text-sm font-semibold text-slate-900";
export const FIELD_HELP  = "mt-1 text-[11px] leading-4 text-slate-500";
```

### 체크박스
```ts
export const CHECKBOX_WRAP =
  "flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 transition-colors hover:border-slate-300";
export const CHECKBOX_INPUT =
  "mt-0.5 h-4 w-4 rounded border-slate-300 text-[rgb(var(--brand-primary))] focus:ring-[rgb(var(--brand-primary)/0.35)] disabled:opacity-60";
export const CHECKBOX_TEXT = "text-sm font-semibold text-slate-900";
export const CHECKBOX_HELP = "mt-1 text-[11px] leading-4 text-slate-500";
```

### 타이포그래피
```ts
export const SECTION_TITLE = "text-base font-bold text-slate-900";
export const SECTION_DESC  = "mt-1 text-sm text-slate-600";
```

## cn() 유틸리티 (lib/cn.ts)

tailwind-merge가 아닌 경량 문자열 결합 함수를 사용합니다:

```ts
export type ClassValue = string | number | null | undefined | false;

export function cn(...values: ClassValue[]) {
  return values
    .filter((v) => v !== null && v !== undefined && v !== false && v !== "")
    .map((v) => String(v))
    .join(" ");
}
```

## 공통 컴포넌트 구조

### Button 컴포넌트
```tsx
type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "accent" | "outline" | "ghost" | "danger";
};

export default function Button({ variant = "primary", className, ...props }: Props) {
  return (
    <button
      className={cn(BUTTON_BASE, BUTTON_VARIANT[variant], className)}
      {...props}
    />
  );
}
```

### Card 컴포넌트
```tsx
export default function Card({
  pad = "md", children, className,
}: { pad?: "sm" | "md" | "lg"; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn(CARD_BASE, CARD_PAD[pad], className)}>
      {children}
    </div>
  );
}
```

### Notice 컴포넌트
```tsx
export default function Notice({
  variant = "info", pad = "md", title, icon, children, className,
}: NoticeProps) {
  return (
    <div className={cn(NOTICE_BASE, NOTICE_VARIANT[variant], CARD_PAD[pad], className)}>
      {icon && <div className="mb-2 flex items-center gap-2">{icon}<span className="text-sm font-bold">{title}</span></div>}
      <div className="text-sm text-slate-700">{children}</div>
    </div>
  );
}
```

### Field 컴포넌트
```tsx
export function FieldLabel({ children, className, htmlFor }) {
  return <label htmlFor={htmlFor} className={cn(FIELD_LABEL, className)}>{children}</label>;
}

export function FieldHelp({ children, className }) {
  const isError = typeof className === "string" && className.includes("text-red");
  const base = isError ? "mt-1 text-xs leading-4 font-semibold" : FIELD_HELP;
  return <p className={cn(base, className)}>{children}</p>;
}

export const Input = React.forwardRef(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(FIELD_CONTROL_BASE, className)} {...props} />;
});

export const Select = React.forwardRef(function Select({ className, ...props }, ref) {
  return <select ref={ref} className={cn(FIELD_CONTROL_BASE, className)} {...props} />;
});

export const Textarea = React.forwardRef(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(FIELD_CONTROL_BASE, "min-h-[96px] resize-y", className)} {...props} />;
});
```

## 페이지 레이아웃 패턴

### 기본 페이지 구조
```tsx
<div className="flex min-h-screen flex-col bg-gray-50">
  <SiteHeader title="페이지 제목" />

  <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-8">
    {/* 컨텐츠 */}
  </main>

  <footer className="border-t border-slate-200 bg-white">
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="flex items-center justify-end">
        <Link href="/admin" className="text-xs text-slate-400 hover:text-slate-600">
          관리자
        </Link>
      </div>
    </div>
  </footer>
</div>
```

### SiteHeader 패턴
```tsx
<header className="border-b bg-white">
  <div className="mx-auto max-w-6xl px-4">
    <div className="flex items-center justify-between py-4">
      <Link href="/" className="flex items-center gap-3">
        <Image src="/brand/logo.png" alt="로고" width={260} height={52} className="h-8 w-auto" />
      </Link>
    </div>
    <div className="pb-4">
      <div className="flex items-center gap-2">
        <span className="inline-block h-2 w-2 rounded-full bg-[rgb(var(--brand-accent))]" />
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      </div>
    </div>
  </div>
</header>
```

### 폼 페이지 패턴
```tsx
<Card pad="lg">
  <h3 className={SECTION_TITLE}>섹션 제목</h3>
  <div className="mt-4 grid gap-4 md:grid-cols-2">
    <div>
      <FieldLabel htmlFor="name">이름 *</FieldLabel>
      <Input id="name" {...register("name")} placeholder="홍길동" />
      {errors.name && <FieldHelp className="text-red-600">{errors.name.message}</FieldHelp>}
    </div>
    <div>
      <FieldLabel htmlFor="phone">연락처 *</FieldLabel>
      <Input id="phone" {...register("phone")} placeholder="010-0000-0000" />
      {errors.phone && <FieldHelp className="text-red-600">{errors.phone.message}</FieldHelp>}
    </div>
  </div>
</Card>
```

### 홈/카드 그리드 패턴
```tsx
<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
  {items.map((item) => (
    <div key={item.id} className={cn(CARD_BASE, CARD_PAD.md, HOME_CARD_HOVER, "cursor-pointer")}>
      <div className="flex items-center gap-3 mb-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[rgb(var(--brand-primary)/0.06)]">
          {item.icon}
        </div>
        <h3 className="text-base font-bold">{item.title}</h3>
      </div>
      <p className="text-sm text-slate-600">{item.description}</p>
    </div>
  ))}
</div>
```

## 디자인 토큰 요약

| 토큰 | 값 | 용도 |
|------|-----|------|
| **border-radius** | `rounded-xl` (12px) | 카드, 인풋, 버튼 기본 |
| **border-radius-full** | `rounded-full` | 배지, 탭 버튼 |
| **border-color** | `border-slate-200` | 모든 보더 기본색 |
| **shadow** | `shadow-[0_1px_0_rgba(0,0,0,0.02)]` | 카드/인풋 기본 그림자 |
| **hover-shadow** | `shadow-[0_10px_22px_rgba(15,23,42,0.08)]` | 카드 호버 |
| **focus-ring** | `ring-2 ring-[brand-primary/0.28~0.35]` | 포커스 상태 |
| **text-primary** | `text-slate-900` | 제목, 본문 |
| **text-secondary** | `text-slate-600` | 설명, 부제 |
| **text-tertiary** | `text-slate-500` | 도움말 |
| **text-muted** | `text-slate-400` | 플레이스홀더, 시간라벨 |
| **bg-page** | `bg-gray-50` | 페이지 배경 |
| **bg-card** | `bg-white` | 카드, 헤더, 푸터 배경 |
| **spacing-section** | `gap-6`, `mt-8` | 섹션 간격 |
| **spacing-field** | `gap-4`, `mt-4` | 필드 간격 |

## 색상 팔레트 (상태별)

| 상태 | 배경 | 보더 | 텍스트 | 용도 |
|------|------|------|--------|------|
| **기본** | `bg-slate-50` | `border-slate-200` | `text-slate-700` | 접수, 비활성 |
| **성공** | `bg-emerald-50` | `border-emerald-200` | `text-emerald-800` | 승인, 완료 |
| **경고** | `bg-amber-50` | `border-amber-200` | `text-amber-800` | 주의 안내 |
| **위험** | `bg-red-50` | `border-red-200` | `text-red-800` | 에러, 반려 |
| **정보** | `bg-blue-50` | `border-blue-200` | `text-blue-800` | 안내, 팁 |

## 타이포그래피 스케일

| 용도 | 크기 | 굵기 | 예시 |
|------|------|------|------|
| 페이지 제목 | `text-2xl` (24px) | `font-bold` | SiteHeader 제목 |
| 홈 대제목 | `text-[28px]` | `font-bold` | 메인 히어로 |
| 섹션 제목 | `text-base` (16px) | `font-bold` | Card 섹션 헤더 |
| 본문 | `text-sm` (14px) | normal | 일반 텍스트 |
| 라벨 | `text-sm` (14px) | `font-semibold` | 폼 라벨 |
| 설명 | `text-[15px]` | normal | 홈 카드 본문 |
| 도움말 | `text-[11px]` | normal | 필드 하단 힌트 |
| 배지 | `text-[12px]` | `font-semibold` | 상태 뱃지 |
| 극소형 | `text-xs` (12px) | normal | 푸터, 범례 |

## 반응형 패턴

```
기본(모바일): 1열 레이아웃
sm (640px):   2열 그리드
md (768px):   2열 그리드 (폼 필드), 관리자 사이드바
lg (1024px):  3열 그리드 (카드), 넓은 여백
```

## 폼 유효성 검증 패턴

```tsx
// lib/schema.ts — Zod 스키마
import { z } from "zod";

export const MyFormSchema = z.object({
  name: z.string().min(2, "이름은 2자 이상 입력해주세요"),
  phone: z.string().regex(/^01[016789]-?\d{3,4}-?\d{4}$/, "올바른 연락처를 입력해주세요"),
  email: z.string().email("올바른 이메일을 입력해주세요").optional().or(z.literal("")),
});

export type MyFormInput = z.infer<typeof MyFormSchema>;

// 컴포넌트에서 사용
const { register, handleSubmit, formState: { errors } } = useForm<MyFormInput>({
  resolver: zodResolver(MyFormSchema),
});
```

## 관리자 페이지 패턴

```tsx
<div className="flex min-h-screen">
  {/* 사이드바 */}
  <aside className="hidden w-56 border-r bg-white md:block">
    <nav className="space-y-1 p-4">
      {menuItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition",
            isActive ? "bg-slate-100 font-semibold" : "text-slate-600 hover:bg-slate-50"
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  </aside>

  {/* 메인 */}
  <div className="flex-1">
    <header className="border-b bg-white px-6 py-4">
      <h1 className="text-lg font-bold">{title}</h1>
    </header>
    <main className="p-6">{children}</main>
  </div>
</div>
```

---

위 디자인 시스템과 동일한 톤으로 [프로젝트 이름]을 개발해줘.
요구사항:
1. [요구사항 1]
2. [요구사항 2]
3. [요구사항 3]
```

---

## 사용 방법

1. 위 프롬프트의 `[여기에 프로젝트 설명]`, `[프로젝트 이름]`, `[요구사항]` 부분을 실제 내용으로 교체
2. `--brand-primary`, `--brand-accent` 값을 원하는 브랜드 색상으로 변경
3. AI에게 전달하면 동일한 디자인 톤으로 개발 시작

### 예시

```
위 디자인 시스템과 동일한 톤으로 "서초여성가족플라자 프로그램 신청 시스템"을 개발해줘.
요구사항:
1. 이용자가 교육 프로그램 목록을 보고 수강 신청할 수 있는 페이지
2. 관리자가 프로그램을 등록/수정/삭제할 수 있는 관리 페이지
3. 신청 현황 조회 및 엑셀 다운로드 기능
```
