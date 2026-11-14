import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        obsidian: "#0E0D0C",
        charcoal: "#171513",
        espresso: "#1F1C19",
        brass: {
          DEFAULT: "#D4AF37",
          soft: "#E5C96B",
          muted: "rgba(212, 175, 55, 0.14)",
        },
        cream: "#FAF7F2",
        sand: "#B9B1A4",
        ember: "#E05A37",
        sage: "#2E8B57",
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        serif: ["var(--font-serif-italic)", "Georgia", "serif"],
        syne: ["var(--font-syne)", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        brass: "0 0 0 1px rgba(212, 175, 55, 0.25)",
        card: "0 24px 60px rgba(0, 0, 0, 0.65)",
      },
    },
  },
  plugins: [],
};

export default config;
