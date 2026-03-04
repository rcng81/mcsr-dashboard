/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.tsx"],
  theme: {
    extend: {
      colors: {
        ink: "#0f172a",
        canvas: "#f4f8f7",
        mint: "#8dd9c0",
        cyan: "#3ea8a4",
        coral: "#f28482",
        amber: "#f4a261"
      },
      boxShadow: {
        soft: "0 12px 30px rgba(15, 23, 42, 0.08)"
      }
    }
  },
  plugins: []
};
