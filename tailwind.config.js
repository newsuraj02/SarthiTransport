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
    },
  },
  plugins: [],
};
