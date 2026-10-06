import type { Config } from "tailwindcss";

// 교실 시간표 디자인 토큰.
// 색 값은 globals.css의 CSS 변수(RGB 채널)에 있고, 라이트/다크 모드마다 바뀐다.
//  - shell: 상단 메뉴와 제목 띠 (라이트: 진남색 / 다크: 더 깊은 밤색)
//  - ground/sheet/rule: 게시판 바탕, 시트, 1px 괘선
//  - mark: 오늘·선택 강조 (라이트: 진남색 / 다크: 밝은 하늘보라)
//  - gap: 학습 점수 0~100 단일 램프 — 데이터 색이라 두 모드에서 같다 (src/lib/palette.ts와 같은 값)
const v = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        shell: {
          DEFAULT: v("shell"),
          raised: v("shell-raised"),
          line: v("shell-line"),
          text: v("shell-text"),
        },
        ground: v("ground"),
        sheet: {
          DEFAULT: v("sheet"),
          alt: v("sheet-alt"),
          muted: v("sheet-muted"),
        },
        today: v("today"),
        rule: {
          DEFAULT: v("rule"),
          strong: v("rule-strong"),
        },
        ink: {
          DEFAULT: v("ink"),
          soft: v("ink-soft"),
          muted: v("ink-muted"),
        },
        mark: v("mark"),
        "on-mark": v("on-mark"),
        accent: v("accent"),
        primary: {
          DEFAULT: v("primary"),
          hover: v("primary-hover"),
        },
        "on-primary": v("on-primary"),
        danger: v("danger"),
        gap: {
          1: "#9E2A1C",
          2: "#C2412C",
          3: "#DD6E4E",
          4: "#EDA58F",
          5: "#F6D3C8",
        },
        ok: v("ok"),
        warn: v("warn"),
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
