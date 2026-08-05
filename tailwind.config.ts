import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
        "pulse-glow": {
          "0%, 100%": {
            opacity: "1",
            boxShadow: "0 0 5px hsl(var(--retro-glow))",
          },
          "50%": {
            opacity: "0.8",
            boxShadow: "0 0 15px hsl(var(--retro-glow))",
          },
        },
        "flicker": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.95" },
        },
        "map-dot-pop": {
          "0%": { opacity: "0", transform: "translate(-50%, -50%) scale(0.4)" },
          "100%": { opacity: "1", transform: "translate(-50%, -50%) scale(1)" },
        },
        "map-trail-flow": {
          "0%": { strokeDashoffset: "0" },
          "100%": { strokeDashoffset: "-32" },
        },
        "selected-arrow-pulse": {
          "0%, 100%": { boxShadow: "0 0 10px 3px rgba(255,255,255,0.5)" },
          "50%": { boxShadow: "0 0 22px 8px rgba(255,255,255,0.95)" },
        },
        "goal-intro-glow": {
          "0%, 100%": { filter: "drop-shadow(0 0 6px rgba(253,224,71,0.35))", transform: "scale(1)" },
          "50%": { filter: "drop-shadow(0 0 24px rgba(253,224,71,0.95))", transform: "scale(1.07)" },
        },
        "climb-out-of-cave": {
          "0%": { opacity: "0", transform: "translateY(55%) scale(0.55)" },
          "60%": { opacity: "1", transform: "translateY(-6%) scale(1.05)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
         "stuck-hint-pulse": {
           "0%, 100%": { boxShadow: "0 0 0 0 rgba(251,191,36,0)" },
           "50%": { boxShadow: "0 0 0 6px rgba(251,191,36,0.35)" },
         },
         "crumble": {
           "0%": { transform: "scale(1) rotate(0deg)", opacity: "1" },
           "30%": { transform: "scale(0.85) rotate(-8deg)", opacity: "0.9" },
           "60%": { transform: "scale(0.6) rotate(12deg)", opacity: "0.5" },
           "100%": { transform: "scale(0.3) rotate(-20deg)", opacity: "0" },
         },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        "flicker": "flicker 0.15s infinite",
        "map-dot-pop": "map-dot-pop 0.45s ease-out backwards",
        "map-trail-flow": "map-trail-flow 1.1s linear infinite",
        "selected-arrow-pulse": "selected-arrow-pulse 1.1s ease-in-out infinite",
        "goal-intro-glow": "goal-intro-glow 0.85s ease-in-out infinite",
        "climb-out-of-cave": "climb-out-of-cave 0.8s cubic-bezier(0.34,1.56,0.64,1) backwards",
         "stuck-hint-pulse": "stuck-hint-pulse 1.6s ease-in-out infinite",
         "crumble": "crumble 0.5s ease-out forwards",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
