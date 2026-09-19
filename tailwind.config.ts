import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: "#06152F",
        "dark-blue": "#0A2452",
        "primary-blue": "#1457B8",
        "bright-blue": "#1D6FE8",
        "light-blue": "#EAF3FF",
        "app-bg": "#F7FAFF",
        ink: "#10213D",
        muted: "#62718A",
        "dark-bg": "#050B18",
        "dark-surface": "#0C1B36",
        "dark-surface-alt": "#132447",
      },
      fontFamily: {
        sans: [
          "var(--font-inter)",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
      },
      backgroundImage: {
        "hero-gradient": "linear-gradient(135deg, #06152F, #1457B8)",
        "brand-gradient": "linear-gradient(135deg, #0A2452, #1D6FE8)",
      },
      boxShadow: {
        card: "0 4px 24px rgba(10, 36, 82, 0.08)",
        "card-hover": "0 12px 32px rgba(10, 36, 82, 0.14)",
      },
      borderRadius: {
        xl2: "1.25rem",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.6s ease-out forwards",
      },
      container: {
        center: true,
        padding: {
          DEFAULT: "1rem",
          sm: "1.5rem",
          lg: "2rem",
        },
      },
    },
  },
  plugins: [],
};

export default config;
