// 중앙에서 톤/여백/보더를 통일 관리하기 위한 Tailwind 프리셋

export const CARD_BASE =
  "rounded-xl border border-slate-200 bg-white shadow-[0_1px_0_rgba(0,0,0,0.02)]";

export const CARD_PAD = {
  sm: "px-4 py-3",
  md: "px-6 py-5",
  lg: "px-7 py-6",
} as const;

export const NOTICE_BASE =
  "rounded-xl border border-slate-200 bg-white shadow-[0_1px_0_rgba(0,0,0,0.02)]";

export const NOTICE_VARIANT = {
  info: "border-l-[3px] border-l-[rgb(var(--brand-primary))]",
  accent: "border-l-[3px] border-l-[rgb(var(--brand-accent))]",
  success: "border-l-[3px] border-l-emerald-500",
  warn: "border-l-[3px] border-l-amber-500",
  danger: "border-l-[3px] border-l-red-500",
} as const;

export const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-[rgb(var(--brand-primary)/0.35)] disabled:cursor-not-allowed disabled:opacity-60";

export const BUTTON_VARIANT = {
  primary:
    "bg-[rgb(var(--brand-primary))] text-white hover:opacity-95 active:opacity-90",
  accent:
    "bg-[rgb(var(--brand-accent))] text-white hover:opacity-95 active:opacity-90",
  outline:
    "border border-slate-200 bg-white text-slate-900 hover:bg-slate-50",
  ghost:
    "bg-transparent text-slate-900 hover:bg-slate-100",
  danger:
    "bg-red-600 text-white hover:opacity-95 active:opacity-90",
} as const;

export type ButtonVariant = keyof typeof BUTTON_VARIANT;
export type NoticeVariant = keyof typeof NOTICE_VARIANT;

// ---------- Form / Typography presets ----------

// 입력 필드(대표 사이트 톤: 라운드/보더/여백 통일)
export const FIELD_CONTROL_BASE =
  "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-[0_1px_0_rgba(0,0,0,0.02)] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--brand-primary)/0.28)] disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed";

export const FIELD_LABEL = "text-sm font-semibold text-slate-900";
export const FIELD_HELP = "mt-1 text-[11px] leading-4 text-slate-500";

// 섹션 타이포(제목/설명)
export const SECTION_TITLE = "text-base font-bold text-slate-900";
export const SECTION_DESC = "mt-1 text-sm text-slate-600";

// 체크박스(입력 프리셋 톤)
export const CHECKBOX_WRAP =
  "flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 transition-colors hover:border-slate-300";
export const CHECKBOX_INPUT =
  "mt-0.5 h-4 w-4 rounded border-slate-300 text-[rgb(var(--brand-primary))] focus:ring-[rgb(var(--brand-primary)/0.35)] disabled:opacity-60";
export const CHECKBOX_TEXT = "text-sm font-semibold text-slate-900";
export const CHECKBOX_HELP = "mt-1 text-[11px] leading-4 text-slate-500";

// ---------- Home-only presets (대표 사이트 홈 카드/버튼 느낌) ----------
// NOTE: 다른 화면 톤에는 영향 주지 않도록 Home에서만 사용

export const HOME_CARD_BASE =
  // 대표 사이트 공지/박스 결을 기준으로: 라운드/보더/그림자를 '한 세트'로 고정
  "rounded-xl border border-slate-200 bg-white shadow-[0_1px_0_rgba(0,0,0,0.02)]";

export const HOME_CARD_HOVER =
  "transition-all duration-150 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_10px_22px_rgba(15,23,42,0.08)]";

// 홈 카드 내부 타이포/배지/안내문 규칙(흔들림 방지)
export const HOME_TITLE = "text-[28px] leading-[1.12] font-bold tracking-[-0.02em] text-slate-900";
export const HOME_DESC = "text-[15px] leading-7 text-slate-700";
export const HOME_BADGE =
  "inline-flex items-center gap-1 rounded-full border border-[rgb(var(--brand-primary)/0.16)] bg-[rgb(var(--brand-primary)/0.04)] px-3 py-1 text-[12px] font-semibold text-[rgb(var(--brand-primary)/0.85)]";
export const HOME_NOTE_BOX =
  "rounded-xl border border-slate-200 bg-white px-4 py-3 text-[12px] leading-5 text-slate-600 shadow-[0_1px_0_rgba(0,0,0,0.02)]";

export const HOME_ICON_WRAP =
  "flex h-28 w-28 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-[0_1px_0_rgba(0,0,0,0.02)]";
export const HOME_ICON_SVG = "h-20 w-20";

export const HOME_BUTTON_BASE =
  "inline-flex items-center justify-center rounded-xl px-10 py-3 text-[15px] font-semibold transition focus:outline-none focus:ring-2 focus:ring-[rgb(var(--brand-primary)/0.35)] disabled:cursor-not-allowed disabled:opacity-60";

export const HOME_BUTTON_PRIMARY =
  // 대표 사이트 버튼 톤: 단색 기반 + 과하지 않은 음영(그래디언트 과사용 금지)
  "bg-[rgb(var(--brand-primary))] text-white shadow-sm hover:bg-[rgb(var(--brand-primary)/0.92)] active:bg-[rgb(var(--brand-primary)/0.88)]";

export const HOME_BUTTON_SOFT =
  "border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50";
