import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        airvet: {
          navy: "#1B3A6B",
          blue: "#1E6CD9",
        },
        dark: {
          bg:     "#0F1923",
          card:   "#1A2636",
          hover:  "#1E2F42",
          border: "#1E3A5F",
          text:   "#F0F4F8",
          muted:  "#7DA8E0",
        },
      },
    },
  },
  plugins: [],
};

export default config;
