/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      // Rounder than Tailwind's defaults across the board — cards, inputs,
      // and buttons read as soft/native rather than boxy, without having to
      // touch every rounded-* class site individually.
      borderRadius: {
        lg: "1.125rem",  // was 0.5rem (8px) -> 18px
        xl: "1.375rem",  // was 0.75rem (12px) -> 22px
        "2xl": "1.625rem", // was 1rem (16px) -> 26px
      },
      // Softer, more diffuse falloff than Tailwind's defaults (which are a
      // tight, fairly hard-edged blur) — reads as a gentle lift rather than
      // a sharp cutout, to match the rounder corners above.
      boxShadow: {
        // 2026-10-26 look refresh: cool navy-tinted, layered shadows (a tight
        // contact shadow + a wide soft one) so white cards float off the
        // faint-blue page instead of sitting behind a hard outline.
        sm: "0 1px 2px 0 rgb(15 27 45 / 0.05), 0 2px 10px 0 rgb(15 27 45 / 0.06)",
        DEFAULT: "0 1px 3px 0 rgb(15 27 45 / 0.08), 0 4px 14px -2px rgb(15 27 45 / 0.08)",
        md: "0 2px 6px -1px rgb(15 27 45 / 0.08), 0 8px 20px -4px rgb(15 27 45 / 0.10)",
        lg: "0 14px 32px -8px rgb(15 27 45 / 0.16), 0 4px 10px -6px rgb(15 27 45 / 0.09)",
      },
    },
  },
  plugins: [],
};
