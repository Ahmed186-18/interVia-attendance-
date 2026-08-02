/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: "#1C3246",
          50: "#E8ECF0",
          100: "#C5CED8",
          200: "#9BADC0",
          300: "#718CA8",
          400: "#4E6D8F",
          500: "#2D4F73",
          600: "#1C3246",
          700: "#162838",
          800: "#101D2A",
          900: "#0A111C",
        },
        teal: {
          DEFAULT: "#127677",
          50: "#E6F5F5",
          100: "#BFE5E5",
          200: "#8DD1D1",
          300: "#5BBCBC",
          400: "#2FA0A0",
          500: "#127677",
          600: "#0F6263",
          700: "#0C4E4F",
          800: "#093A3B",
          900: "#062627",
        },
        tint: {
          DEFAULT: "#EAF3F2",
          50: "#F7FBFB",
          100: "#EAF3F2",
          200: "#D5E7E5",
          300: "#C0DBD9",
        },
        surface: "#F3F7F7",
        success: "#2E9E5B",
        warning: "#C9821A",
        danger: "#D14B4B",
        muted: "#8A99A3",
      },
      fontFamily: {
        sans: [
          "var(--font-cairo)",
          "Cairo",
          "system-ui",
          "-apple-system",
          "sans-serif",
        ],
      },
      fontSize: {
        "display-xl": ["3rem", { lineHeight: "1.15", fontWeight: "700" }],
        "display-lg": ["2.25rem", { lineHeight: "1.2", fontWeight: "700" }],
        "display-md": ["1.75rem", { lineHeight: "1.25", fontWeight: "600" }],
        "display-sm": ["1.25rem", { lineHeight: "1.3", fontWeight: "600" }],
      },
      borderRadius: {
        "4xl": "2rem",
      },
      boxShadow: {
        "soft": "0 1px 3px rgba(28, 50, 70, 0.04), 0 4px 12px rgba(28, 50, 70, 0.06)",
        "soft-md": "0 2px 6px rgba(28, 50, 70, 0.06), 0 8px 24px rgba(28, 50, 70, 0.08)",
        "soft-lg": "0 4px 12px rgba(28, 50, 70, 0.08), 0 16px 48px rgba(28, 50, 70, 0.10)",
        "inner-soft": "inset 0 1px 2px rgba(28, 50, 70, 0.06)",
        "glow-teal": "0 0 0 3px rgba(18, 118, 119, 0.15)",
        "glow-danger": "0 0 0 3px rgba(209, 75, 75, 0.15)",
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-out",
        "slide-up": "slideUp 0.5s ease-out",
        "slide-in-right": "slideInRight 0.3s ease-out",
        "scale-in": "scaleIn 0.2s ease-out",
        "pulse-soft": "pulseSoft 2s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideInRight: {
          "0%": { opacity: "0", transform: "translateX(-16px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        },
      },
    },
  },
  plugins: [],
};
