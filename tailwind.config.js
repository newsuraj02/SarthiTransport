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
        sm: "0 2px 10px 0 rgb(0 0 0 / 0.06)",
        lg: "0 14px 32px -8px rgb(0 0 0 / 0.14), 0 4px 10px -6px rgb(0 0 0 / 0.08)",
      },
    },
  },
  plugins: [],
};
