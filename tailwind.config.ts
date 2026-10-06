import type { Config } from "tailwindcss";

// 교실 시간표 디자인 토큰.
// - shell: 시간표 머리띠의 진남색
// - ground/sheet/rule: 게시판 바탕, 인쇄된 시트, 1px 괘선
// - gap: 학습 점수 0~100 단일 램프(낮을수록 진한 주홍) — src/lib/palette.ts와 같은 값
const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        shell: {
          DEFAULT: "#18233A",
          raised: "#22304D",
          line: "#34425F",
          text: "#C9D2E3",
        },
        ground: "#E9EDEB",
        sheet: "#FFFFFF",
        rule: {
          DEFAULT: "#D3D9D6",
          strong: "#A9B3AF",
        },
        ink: {
          DEFAULT: "#18233A",
          soft: "#46536A",
          muted: "#5F6B7E",
        },
        gap: {
          1: "#9E2A1C",
          2: "#C2412C",
          3: "#DD6E4E",
          4: "#EDA58F",
          5: "#F6D3C8",
        },
        ok: "#127A55",
        warn: "#9A5B00",
      },
      fontFamily: {
        sans: [
          "Pretendard Variable",
          "Pretendard",
          "-apple-system",
          "BlinkMacSystemFont",
          "Apple SD Gothic Neo",
          "Malgun Gothic",
          "sans-serif",
        ],
      },
      borderRadius: {
        DEFAULT: "2px",
        sm: "2px",
        md: "3px",
      },
    },
  },
  plugins: [],
};

export default config;
