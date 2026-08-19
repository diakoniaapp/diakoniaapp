import type { Config } from "tailwindcss";

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
          glow: "hsl(var(--primary-glow))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        gold: {
          DEFAULT: "hsl(var(--gold))",
          foreground: "hsl(var(--gold-foreground))",
          // `text-gold-text`: para quando o dourado é a letra, e não o fundo.
          text: "hsl(var(--gold-text))",
        },
        teal: {
          DEFAULT: "hsl(var(--teal))",
          foreground: "hsl(var(--teal-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
          // `text-warning-text`: o âmbar escuro, para quando a cor é o texto.
          // O âmbar de preenchimento não serve como texto — mede 2.15:1 — e
          // não pode escurecer, porque o que vai escrito EM CIMA dele é
          // escuro. São dois papéis, e agora são dois valores.
          text: "hsl(var(--warning-text))",
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
      fontFamily: {
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
        serif: ['"Cormorant Garamond"', 'Georgia', 'serif'],
      },

      // ── A escala ──────────────────────────────────────────────────────
      //
      // Medido antes de mexer: 1.473 usos de `text-xs` contra 503 de
      // `text-sm`. Dois terços de todo o texto do sistema estava em 12px, e
      // no Painel eram 59 dos 78 blocos. Não havia hierarquia — havia um
      // sussurro contínuo, e para achar qualquer coisa era preciso ler tudo.
      // É isso que cansa em oito horas de uso.
      //
      // Redefinir a escala aqui muda os 1.473 usos de uma vez, sem tocar em
      // 174 arquivos. Duas mudanças pequenas e uma consequência grande:
      //
      //   xs   12px → 13px, entrelinha 16 → 18
      //   sm   entrelinha 20 → 21 (de 1,43 para 1,5)
      //
      // 13px e não 14px porque `text-xs` também veste etiqueta e rótulo de
      // coluna, onde 14 ficaria pesado. O texto que é CORPO sobe para `sm`
      // caso a caso, onde dá para saber que é corpo.
      //
      // 1,5 de entrelinha é o que a leitura contínua pede; 1,43 é aperto de
      // tabela aplicado ao sistema inteiro.
      fontSize: {
        xs:   ['0.8125rem', { lineHeight: '1.125rem' }],  // 13 / 18
        sm:   ['0.875rem',  { lineHeight: '1.3125rem' }], // 14 / 21
        base: ['1rem',      { lineHeight: '1.5rem' }],    // 16 / 24
        lg:   ['1.125rem',  { lineHeight: '1.625rem' }],  // 18 / 26
        xl:   ['1.25rem',   { lineHeight: '1.75rem' }],   // 20 / 28
        '2xl':['1.5rem',    { lineHeight: '2rem' }],      // 24 / 32
        '3xl':['1.875rem',  { lineHeight: '2.25rem' }],   // 30 / 36
      },
      backgroundImage: {
        'gradient-hero': 'var(--gradient-hero)',
        'gradient-gold': 'var(--gradient-gold)',
        'gradient-verse': 'var(--gradient-verse)',
      },
      boxShadow: {
        'card-soft': 'var(--shadow-card)',
        'elevated': 'var(--shadow-elevated)',
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
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          "0%": { transform: "scale(0.96)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.25s ease-out",
        "scale-in": "scale-in 0.18s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
