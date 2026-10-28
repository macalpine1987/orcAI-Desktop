/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "var(--bg)",
        subtle: "var(--bg-subtle)",
        muted: "var(--bg-muted)",
        border: "var(--border)",
        foreground: "var(--text)",
        "foreground-muted": "var(--text-muted)",
        accent: "var(--accent)",
        "accent-fg": "var(--accent-fg)",
        "mat-face": "var(--mat-face)",
        "mat-recess": "var(--mat-recess)",
        "mat-raised": "var(--mat-raised)",
        bezel: "var(--bezel)",
        "lcd-bg": "var(--lcd-bg)",
        "lcd-fg": "var(--lcd-fg)",
      },
      boxShadow: {
        "mat-out": "var(--shadow-out)",
        "mat-in": "var(--shadow-in)",
      },
      borderRadius: {
        DEFAULT: "var(--radius)",
      },
      width: {
        sidebar: "var(--sidebar-width)",
        "sidebar-collapsed": "var(--sidebar-collapsed-width)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
  safelist: [
    "jobs-status-dot",
    "jobs-status-dot--running",
    "jobs-status-dot--pending",
    "jobs-status-dot--completed",
    "jobs-status-dot--failed",
    "jobs-status-dot--cancelled",
    "job-status-pill--running",
    "job-status-pill--pending",
    "job-status-pill--completed",
    "job-status-pill--failed",
    "job-status-pill--cancelled",
  ],
};
