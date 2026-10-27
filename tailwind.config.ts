import type { Config } from "tailwindcss";

const config: Config = {
  // Tailwind purge 대상 경로를 넓혀야 components/ 안의 class가 누락되지 않습니다.
  // (달력이 1열로 보이던 원인이었음)
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      // audit-fix-2 디자인 토큰(01_spec ③-A · 02_ui §1). 이 밖의 색은 추가하지 않는다.
      colors: {
        brand: {
          DEFAULT: "rgb(var(--brand-primary) / <alpha-value>)", // #0E4A7A
          hover: "#0B3C63",
          soft: "#E8F0F7",
        },
        sky: {
          DEFAULT: "#2E8FD0", // focus ring·스튜디오 좌측 바 전용(글자 금지)
        },
        // CI 오렌지 #CA772B — 점·밑줄·테두리·좌측 바 전용(본문 글자·흰 글자 금지)
        accent: {
          DEFAULT: "rgb(var(--brand-accent) / <alpha-value>)",
          ink: "#9C5A1C",
        },
        line: "#E2E8F0",
        ink: {
          DEFAULT: "#0F172A",
          2: "#334155",
          3: "#64748B",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-pretendard)",
          "Pretendard Variable",
          "Pretendard",
          "-apple-system",
          "Malgun Gothic",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
