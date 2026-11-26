import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#0f172a",
          900: "#ffffff",
          850: "#ffffff",
          800: "#ffffff",
          700: "#f1f5f9",
          600: "#e2e8f0",
          500: "#cbd5e1",
        },
        brand: {
          50: "#eff6ff",
          100: "#dbeafe",
          200: "#bfdbfe",
          300: "#93c5fd",
          400: "#60a5fa",
          500: "#0274FB",
          600: "#0262d6",
          700: "#034fb0",
        },
        accent: { 400: "#60a5fa", 500: "#0274FB" },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(2,116,251,.25), 0 8px 40px -8px rgba(2,116,251,.25)",
      },
      keyframes: {
        float: {
          "0%,100%": { transform: "translateY(0) scale(1)" },
          "50%": { transform: "translateY(-24px) scale(1.06)" },
        },
        fadeUp: {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        fadeIn: { from: { opacity: "0" }, to: { opacity: "1" } },
        popIn: {
          from: { opacity: "0", transform: "translateY(8px) scale(.97)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
      },
      animation: {
        float: "float 9s ease-in-out infinite",
        "float-slow": "float 14s ease-in-out infinite",
        "fade-up": "fadeUp .5s ease both",
        "fade-in": "fadeIn .15s ease-out both",
        "pop-in": "popIn .18s cubic-bezier(.2,.9,.3,1.2) both",
      },
    },
  },
  plugins: [],
};

export default config;
