/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./*.{html,js}", "./!(build|dist|.*)/**/*.{html,js}"],
  theme: {
    extend: {
      colors: {
        white: "#fff",
        darkslategray: {
          "100": "#3d3d3d",
          "200": "#2f2f2f",
        },
        "slate-400": "#94a3b8",
        "slate-900": "#0f172a",
        "slate-600": "#475569",
        darkseagreen: "#b5d8a0",
        lavender: "#d7e0eb",
        lightslategray: "rgba(148, 163, 184, 0.7)",
        black: "#000",
        gray: "#fafafa",
        linen: "#f9f0e8",
        darkgray: "#ada6a1",
        "slate-200": "#e2e8f0",
        "slate-100": "#f1f5f9",
        lightgray: "rgba(203, 213, 225, 0.4)",
      },
      spacing: {},
      fontFamily: {
        subtle: "Inter",
        "perfectly-nineties": "'Perfectly Nineties'",
        "helvetica-neue": "'Helvetica Neue'",
      },
      borderRadius: {
        sm: "14px",
      },
    },
    fontSize: {
      base: "16px",
      sm: "14px",
      xs: "12px",
      xl: "20px",
      "11xl": "30px",
      "29xl": "48px",
      "7xs-5": "5.5px",
      "8xs": "5px",
      inherit: "inherit",
    },
  },
  corePlugins: {
    preflight: false,
  },
};
