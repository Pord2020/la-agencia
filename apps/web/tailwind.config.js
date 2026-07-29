/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        arcade: "#1a1a2e",
        cream: "#fffdf5",
        "cream-dark": "#f3ead8",
        ink: "#22223b",
        "ink-soft": "#4a4e69",
        sky: "#7eb8da",
        sun: "#ffd866",
      },
      fontFamily: {
        pixel: ['"Press Start 2P"', "monospace"],
        sans: ["IBM Plex Sans", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
