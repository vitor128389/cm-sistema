import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Paleta verde escuro (antes era tom de madeira/castanho)
        madeira: {
          50: "#f4f6f3",
          100: "#e5eae2",
          200: "#c7d2c1",
          300: "#a0b096",
          400: "#748a68",
          500: "#4f6b43",
          600: "#33552a",
          700: "#204411",
          800: "#1a370e",
          900: "#12280a",
        },
        latao: {
          400: "#c9a15a",
          500: "#ab7f3c",
        },
        estofado: {
          50: "#f5f6f4",
          100: "#e4e9e1",
        },
      },
      fontFamily: {
        display: ["var(--font-fraunces)", "serif"],
        sans: ["var(--font-inter)", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
