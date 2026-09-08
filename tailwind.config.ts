import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          orange: "#f4a97c",
          blue: "#bfe4f2",
          navy: "#0f4c66",
        },
      },
    },
  },
  plugins: [],
};

export default config;
