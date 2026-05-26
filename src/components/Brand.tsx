import { cn } from "@/lib/utils";
import logo from "@/assets/logo-diakonia.png";

/**
 * DIAKONIA — logomarca oficial
 */
export function BrandMark({ className, tagline = false }: { className?: string; tagline?: boolean }) {
  return (
    <div className={cn("inline-flex flex-col items-center", className)}>
      <img
        src={logo}
        alt="DIAKONIA"
        className="h-[1.6em] w-auto object-contain"
        draggable={false}
      />
      {tagline && (
        <span className="text-[0.65em] tracking-[0.18em] uppercase text-muted-foreground mt-2 font-sans">
          Conectando pessoas, organizando o propósito
        </span>
      )}
    </div>
  );
}