import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: "#f5f2eb",
        bg2: "#ede9e0",
        surface: "#ffffff",
        border: "#d8d3c8",
        "border-dark": "#b8b2a6",
        text: "#111009",
        muted: "#4a4642",
        accent: "#1a4a2e",
        "accent-light": "#e8f0ea",
        "accent-mid": "#1f6038",
        // Dark theme for mindset detail pages
        "dk-bg": "#0d0c09",
        "dk-bg2": "#141310",
        "dk-surface": "#1a1916",
        "dk-border": "#2a2820",
        "dk-border-light": "#3a3830",
        "dk-text": "#e8e4da",
        "dk-mid": "#8a857c",
        "dk-dim": "#4a4840",
        warm: "#c8a86a",
        "warm-dim": "#6a5830",
        "kh-green": "#4a7a5a",
        "kh-green-dim": "#1a2a1e",
      },
      fontFamily: {
        serif: ["Playfair Display", "Georgia", "serif"],
        mono: ["IBM Plex Mono", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
