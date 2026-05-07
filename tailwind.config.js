/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "rgb(var(--bg) / <alpha-value>)",
          elev: "rgb(var(--bg-elev) / <alpha-value>)",
          line: "rgb(var(--bg-line) / <alpha-value>)",
        },
        fg: {
          DEFAULT: "rgb(var(--fg) / <alpha-value>)",
          muted: "rgb(var(--fg-muted) / <alpha-value>)",
          dim: "rgb(var(--fg-dim) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          on: "rgb(var(--accent-on) / <alpha-value>)",
        },
        diff: {
          add: "rgb(var(--diff-add) / <alpha-value>)",
          addLine: "rgb(var(--diff-add-gutter) / <alpha-value>)",
          del: "rgb(var(--diff-del) / <alpha-value>)",
          delLine: "rgb(var(--diff-del-gutter) / <alpha-value>)",
        },
      },
      fontFamily: {
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "SF Mono",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
    },
  },
  plugins: [],
};
