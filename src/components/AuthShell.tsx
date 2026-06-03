// ============================================================
// AuthShell.tsx — Shell reutilizável para telas de autenticação
// DiakoniaApp — padrão institucional completo
// ============================================================
// Contém: fundo gradiente + textura, logo animada, versículo
// rotativo, dark mode nativo, rodapé institucional.
// Uso:
//   <AuthShell versiculoFixo={verse} wide>
//     <MeuCard />
//   </AuthShell>
// ============================================================

import { useEffect, useState, useCallback } from "react";
import { BrandMark } from "@/components/Brand";
import { cn } from "@/lib/utils";

// ── Versículos pastorais ───────────────────────────────────
export const VERSICULOS_AUTH = [
  { texto: "Porque sou eu que conheço os planos que tenho para vocês — planos de fazê-los prosperar e não de causar dano, planos de dar a vocês esperança e um futuro.", ref: "Jeremias 29:11" },
  { texto: "O Senhor é o meu pastor; nada me faltará.", ref: "Salmos 23:1" },
  { texto: "Confie no Senhor de todo o seu coração e não se apoie em seu próprio entendimento.", ref: "Provérbios 3:5" },
  { texto: "Tudo posso naquele que me fortalece.", ref: "Filipenses 4:13" },
  { texto: "Vinde a mim, todos os que estais cansados e sobrecarregados, e eu vos aliviarei.", ref: "Mateus 11:28" },
  { texto: "Pois Deus não nos deu um espírito de covardia, mas de poder, de amor e de equilíbrio.", ref: "2 Timóteo 1:7" },
  { texto: "O Senhor está perto de todos os que o invocam, de todos os que o invocam em verdade.", ref: "Salmos 145:18" },
  { texto: "Porque Deus amou o mundo de tal maneira que deu o seu Filho unigênito.", ref: "João 3:16" },
  { texto: "Buscai primeiro o Reino de Deus e a sua justiça, e todas as demais coisas vos serão acrescentadas.", ref: "Mateus 6:33" },
  { texto: "O Senhor te abençoe e te guarde; o Senhor faça resplandecer o seu rosto sobre ti.", ref: "Números 6:24-25" },
  { texto: "Em tudo dai graças, porque esta é a vontade de Deus em Cristo Jesus para convosco.", ref: "1 Tessalonicenses 5:18" },
  { texto: "Aquele que habita no esconderijo do Altíssimo, à sombra do Onipotente descansará.", ref: "Salmos 91:1" },
  { texto: "Servir a uns aos outros por amor.", ref: "Gálatas 5:13" },
  { texto: "Como eu vos amei, que também vós uns aos outros vos ameis.", ref: "João 13:34" },
  { texto: "Não nos cansemos de fazer o bem, porque a seu tempo ceifaremos, se não desfalecermos.", ref: "Gálatas 6:9" },
];

export function getVersiculoAleatorio() {
  return VERSICULOS_AUTH[Math.floor(Math.random() * VERSICULOS_AUTH.length)];
}

// ── Saudação por horário ───────────────────────────────────
export function getSaudacao(): string {
  const h = new Date().getHours();
  if (h >= 5  && h < 12) return "Bom dia";
  if (h >= 12 && h < 18) return "Boa tarde";
  return "Boa noite";
}

// ── Versículo rotativo ─────────────────────────────────────
function VersiculoRotativo({ fixo }: { fixo?: { texto: string; ref: string } }) {
  const [verso, setVerso] = useState(fixo ?? getVersiculoAleatorio);
  const [visivel, setVisivel] = useState(true);

  const trocar = useCallback(() => {
    setVisivel(false);
    setTimeout(() => {
      setVerso(getVersiculoAleatorio());
      setVisivel(true);
    }, 400);
  }, []);

  // Troca automática a cada 18 segundos
  useEffect(() => {
    if (fixo) return;
    const t = setInterval(trocar, 18_000);
    return () => clearInterval(t);
  }, [fixo, trocar]);

  return (
    <button
      onClick={fixo ? undefined : trocar}
      className={cn(
        "w-full text-center px-2 space-y-1 transition-all duration-400",
        !fixo && "cursor-pointer hover:opacity-80 active:scale-[0.99]",
        visivel ? "opacity-100 translate-x-0" : "opacity-0 translate-x-2",
      )}
      aria-label={fixo ? undefined : "Próximo versículo"}
      type="button"
    >
      <p className="text-xs italic leading-relaxed text-foreground/50 dark:text-foreground/40 line-clamp-3">
        "{verso.texto}"
      </p>
      <p className="text-[10px] font-semibold tracking-widest uppercase text-gold/70">
        — {verso.ref}
      </p>
    </button>
  );
}

// ── AuthShell ──────────────────────────────────────────────
interface AuthShellProps {
  children: React.ReactNode;
  /** Versículo fixo (não rotativo). Se omitido, fica rotativo. */
  versiculoFixo?: { texto: string; ref: string };
  /** Largura máxima do card: "sm" = 384px (padrão) · "md" = 480px */
  wide?: boolean;
  /** Oculta o versículo abaixo do card */
  semVersiculo?: boolean;
}

export function AuthShell({ children, versiculoFixo, wide = false, semVersiculo = false }: AuthShellProps) {
  return (
    <div className="min-h-screen bg-auth flex flex-col items-center justify-center p-4 relative overflow-hidden">

      {/* ── Ornamentos decorativos de fundo ── */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        {/* Cruz sutil — canto superior direito */}
        <svg
          viewBox="0 0 200 200"
          className="absolute -top-10 -right-10 w-64 h-64 text-gold/5 dark:text-gold/4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <line x1="100" y1="20" x2="100" y2="180" />
          <line x1="40" y1="80" x2="160" y2="80" />
        </svg>
        {/* Círculo — canto inferior esquerdo */}
        <div className="absolute -bottom-24 -left-24 w-72 h-72 rounded-full border border-gold/8 dark:border-gold/6" />
        <div className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full border border-gold/6 dark:border-gold/4" />
      </div>

      {/* ── Conteúdo central ── */}
      <div className={cn("w-full relative z-10", wide ? "max-w-lg" : "max-w-sm")}>

        {/* Logo com animação de entrada */}
        <div className="text-center mb-8 animate-logo-appear">
          <div className="inline-flex flex-col items-center gap-3">
            <div className="drop-shadow-[0_3px_10px_rgba(0,0,0,0.20)] dark:drop-shadow-[0_3px_14px_rgba(0,0,0,0.50)]">
              <BrandMark className="text-[4rem]" />
            </div>
            <div className="space-y-0.5">
              <p className="text-[10px] tracking-[0.22em] uppercase font-semibold text-foreground/50 dark:text-foreground/40 leading-relaxed">
                Conectando Pessoas,
              </p>
              <p className="text-[10px] tracking-[0.22em] uppercase font-semibold text-foreground/50 dark:text-foreground/40 leading-relaxed">
                Organizando o Propósito
              </p>
            </div>
          </div>
        </div>

        {/* ── Slot do conteúdo (card da tela) ── */}
        <div className="animate-fade-in-up delay-100">
          {children}
        </div>

        {/* ── Versículo ── */}
        {!semVersiculo && (
          <div className="mt-6 animate-fade-in-up delay-300">
            <VersiculoRotativo fixo={versiculoFixo} />
          </div>
        )}

        {/* ── Rodapé ── */}
        <p className="text-center text-[10px] text-foreground/25 dark:text-foreground/20 mt-5 tracking-wide leading-relaxed animate-fade-in-up delay-400">
          DiakoniaApp — Sistema de Gestão Ministerial
          <br />
          CNPJ: 34.926.658/0001-40
        </p>
      </div>
    </div>
  );
}

// ── Card padrão de autenticação ────────────────────────────
export function AuthCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "bg-card dark:bg-card rounded-2xl border border-border/50 dark:border-border/40 p-7 space-y-5",
        "shadow-[0_20px_60px_-15px_hsl(25_35%_18%/0.18)] dark:shadow-[0_20px_60px_-15px_hsl(0_0%_0%/0.50)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

// ── Campo de formulário padrão ─────────────────────────────
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AuthCampo({
  id, label, type, value, onChange, icon, placeholder,
  autoFocus, required, sufixo, inputMode, disabled,
}: {
  id: string; label: string; type: string; value: string;
  onChange: (v: string) => void; icon: React.ReactNode; placeholder?: string;
  autoFocus?: boolean; required?: boolean; sufixo?: React.ReactNode;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium text-foreground/75 dark:text-foreground/70">
        {label}
      </Label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          {icon}
        </span>
        <Input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          required={required}
          inputMode={inputMode}
          disabled={disabled}
          className={cn(
            "pl-9 h-11 bg-background/70 dark:bg-background/60",
            "border-border/70 dark:border-border/60",
            "focus:border-gold/60 dark:focus:border-gold/50",
            "placeholder:text-muted-foreground/50",
            "transition-colors",
            sufixo ? "pr-10" : "pr-3",
          )}
        />
        {sufixo && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2">
            {sufixo}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Bloco de erro ──────────────────────────────────────────
export function AuthErro({ mensagem }: { mensagem: string | null }) {
  if (!mensagem) return null;
  return (
    <div className="bg-destructive/8 dark:bg-destructive/15 border border-destructive/25 dark:border-destructive/30 rounded-lg px-3 py-2.5 text-sm text-destructive dark:text-red-400 animate-fade-in">
      {mensagem}
    </div>
  );
}
