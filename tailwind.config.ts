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
    extend: {}
  },
  plugins: []
};

export default config;
