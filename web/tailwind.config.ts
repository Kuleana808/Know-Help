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
