import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-arabic)", "system-ui", "sans-serif"],
      },
      colors: {
        // Neutral surface scale — the base of the interface
        surface: {
          DEFAULT: "rgb(var(--surface) / <alpha-value>)",
          muted: "rgb(var(--surface-muted) / <alpha-value>)",
          subtle: "rgb(var(--surface-subtle) / <alpha-value>)",
          inset: "rgb(var(--surface-inset) / <alpha-value>)",
        },
        line: {
          DEFAULT: "rgb(var(--line) / <alpha-value>)",
          strong: "rgb(var(--line-strong) / <alpha-value>)",
        },
        content: {
          DEFAULT: "rgb(var(--content) / <alpha-value>)",
          muted: "rgb(var(--content-muted) / <alpha-value>)",
          subtle: "rgb(var(--content-subtle) / <alpha-value>)",
          inverted: "rgb(var(--content-inverted) / <alpha-value>)",
        },
        // Brand — deep teal, reads as trustworthy hospitality software
        brand: {
          50: "#eef8f7",
          100: "#d4ecea",
          200: "#a9d9d6",
          300: "#75c0bd",
          400: "#46a19f",
          500: "#2c8482",
          600: "#1f6a69",
          700: "#1b5455",
          800: "#194445",
          900: "#17393a",
          950: "#0a2122",
        },
        accent: {
          50: "#fbf6ec",
          100: "#f5e8cd",
          200: "#e9cf9c",
          300: "#dbb164",
          400: "#cf973c",
          500: "#c07f27",
          600: "#a4631f",
          700: "#84491d",
          800: "#6d3b1e",
          900: "#5c321c",
        },
        // Semantic status colors used by badges across the system
        ok: {
          bg: "rgb(var(--ok-bg) / <alpha-value>)",
          fg: "rgb(var(--ok-fg) / <alpha-value>)",
        },
        warn: {
          bg: "rgb(var(--warn-bg) / <alpha-value>)",
          fg: "rgb(var(--warn-fg) / <alpha-value>)",
        },
        danger: {
          bg: "rgb(var(--danger-bg) / <alpha-value>)",
          fg: "rgb(var(--danger-fg) / <alpha-value>)",
        },
        info: {
          bg: "rgb(var(--info-bg) / <alpha-value>)",
          fg: "rgb(var(--info-fg) / <alpha-value>)",
        },
      },
      borderRadius: {
        card: "0.75rem",
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)",
        raised: "0 4px 12px -2px rgb(15 23 42 / 0.10), 0 2px 4px -2px rgb(15 23 42 / 0.06)",
        overlay: "0 20px 40px -12px rgb(15 23 42 / 0.25)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "translateY(4px) scale(0.985)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "slide-in": {
          from: { opacity: "0", transform: "translateY(-6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 120ms ease-out",
        "scale-in": "scale-in 140ms ease-out",
        "slide-in": "slide-in 140ms ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
