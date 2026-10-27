// 중앙에서 톤/여백/보더를 통일 관리하기 위한 Tailwind 프리셋

// 카드: 그림자 없음(테두리만) — audit-fix-2 ③-A-5
export const CARD_BASE =
  "rounded-xl border border-slate-200 bg-white";

export const CARD_PAD = {
  sm: "px-4 py-3",
  md: "px-6 py-5",
  lg: "px-7 py-6",
} as const;

export const NOTICE_BASE =
  "rounded-xl border border-slate-200 bg-white";

export const NOTICE_VARIANT = {
  info: "border-l-[3px] border-l-brand",
  accent: "border-l-[3px] border-l-accent",
  success: "border-l-[3px] border-l-emerald-500",
  warn: "border-l-[3px] border-l-amber-500",
  danger: "border-l-[3px] border-l-red-500",
} as const;

// 버튼 3종(Primary·Secondary·Danger) — audit-fix-2 ③-A-5 · 02_ui §1-3
// 높이 44 이상 · 글자 한 줄 · 비활성은 투명도 없이 slate-200 바탕/slate-500 글자
export const BUTTON_BASE =
  "inline-flex min-h-[44px] items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-[15px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sky focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:border-transparent disabled:bg-slate-200 disabled:text-slate-500";

export const BUTTON_VARIANT = {
  /** Primary — 화면당 1개 */
  primary:
    "bg-brand text-white hover:bg-brand-hover",
  /** Secondary(기존 이름 outline 유지) */
  outline:
    "border border-slate-300 bg-white text-ink hover:bg-slate-50",
  /** Danger — 외곽형. 채운 빨강은 확인 모달 안에서만(Modal의 MODAL_BTN_DANGER) */
  danger:
    "border border-red-300 bg-white text-red-700 hover:bg-red-50",
} as const;

export type ButtonVariant = keyof typeof BUTTON_VARIANT;
export type NoticeVariant = keyof typeof NOTICE_VARIANT;

// ---------- Form / Typography presets ----------

// 입력 필드(대표 사이트 톤: 라운드/보더/여백 통일)
// 입력칸: 높이 44 · 휴대폰 16px(iOS 확대 방지) / PC 15px
export const FIELD_CONTROL_BASE =
  "mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-sky/40 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 sm:text-[15px]";

export const FIELD_LABEL = "text-sm font-semibold text-slate-900";
// 입력 도움말 13px(③-A-3 help)
export const FIELD_HELP = "mt-1 text-[13px] leading-5 text-slate-500";

// 섹션 타이포(제목/설명)
export const SECTION_TITLE = "text-base font-bold text-slate-900";
export const SECTION_DESC = "mt-1 text-sm text-slate-600";

// 체크박스(입력 프리셋 톤)
export const CHECKBOX_WRAP =
  "flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 transition-colors hover:border-slate-300";
export const CHECKBOX_INPUT =
  "mt-0.5 h-5 w-5 rounded border-slate-300 text-brand focus:ring-sky disabled:cursor-not-allowed disabled:bg-slate-200";
export const CHECKBOX_TEXT = "text-[15px] font-semibold text-slate-900";
export const CHECKBOX_HELP = "mt-1 text-[13px] leading-5 text-slate-500";

// ---------- Home-only presets (대표 사이트 홈 카드/버튼 느낌) ----------
// NOTE: 다른 화면 톤에는 영향 주지 않도록 Home에서만 사용

export const HOME_CARD_BASE =
  "rounded-xl border border-slate-200 bg-white";

// hover 떠오름(-translate-y)·그림자 삭제(③-A-5) — 테두리 색만 바뀜
export const HOME_CARD_HOVER =
  "transition-colors duration-150 hover:border-slate-300";

// 홈 카드 내부 타이포/배지/안내문 규칙(흔들림 방지)
export const HOME_TITLE = "text-[28px] leading-[1.12] font-bold tracking-[-0.02em] text-slate-900";
export const HOME_DESC = "text-[15px] leading-7 text-slate-700";
export const HOME_BADGE =
  "inline-flex items-center gap-1 rounded-full border border-brand/[0.16] bg-brand-soft px-3 py-1 text-sm font-semibold text-brand";
export const HOME_NOTE_BOX =
  "rounded-xl border border-slate-200 bg-white px-4 py-3 text-[13px] leading-5 text-slate-600";

export const HOME_ICON_WRAP =
  "flex h-28 w-28 items-center justify-center rounded-2xl border border-slate-200 bg-white";
export const HOME_ICON_SVG = "h-20 w-20";

export const HOME_BUTTON_BASE =
  "inline-flex min-h-[48px] items-center justify-center whitespace-nowrap rounded-xl px-10 py-3 text-base font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sky focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500";

export const HOME_BUTTON_PRIMARY =
  "bg-brand text-white hover:bg-brand-hover";

export const HOME_BUTTON_SOFT =
  "border border-slate-300 bg-white text-ink hover:bg-slate-50";
