import { cn } from "@/lib/utils";

// ── Por que há três arquivos de logotipo ───────────────────────────────────
//
// O original, `logo-diakonia.png`, é chapado em amarelo-gema — rgb(255,204,0),
// medido: 178.924 pixels de uma tinta só. Amarelo chapado não lê como ouro;
// lê como aviso. As letras DIAKONIA são brancas, outros 237.206 pixels.
//
// Os dois arquivos "-dourado" são o MESMO desenho com a tinta amarela trocada
// por um degradê de cinco tons — champanhe onde a luz bate, âmbar na sombra,
// e uma faixa estreita de brilho no meio. O gerador separa uma tinta da outra
// pelo canal azul, então trocar o ouro sem tocar na letra sai exato.
//
// Eles diferem só na LETRA:
//
//   logo-diakonia-dourado.png .......... letra branca, para fundo escuro
//   logo-diakonia-dourado-claro.png .... letra carvão, para fundo claro
//
// A variante clara existe porque, sobre o creme da tela de acesso no tema
// claro, a palavra branca sumia: sobrava a sombra projetada, e era só por
// ela que ainda se lia alguma coisa.
//
// O gerador está em scratchpad/logo/dourar.js, e o cabeçalho dele conta a
// medição inteira.
import logoEscuro from "@/assets/logo-diakonia-dourado.png";
import logoClaro from "@/assets/logo-diakonia-dourado-claro.png";

/**
 * DIAKONIA — logomarca oficial
 *
 * `trocaPorTema` só serve a superfícies que seguem o tema da PÁGINA — as
 * telas de acesso. A barra lateral é escura nos dois temas, então lá a
 * variante de letra branca é a certa sempre, e trocar quebraria.
 */
export function BrandMark({
  className,
  tagline = false,
  trocaPorTema = false,
}: {
  className?: string;
  tagline?: boolean;
  trocaPorTema?: boolean;
}) {
  const comum = "h-[1.6em] w-auto object-contain";
  return (
    <div className={cn("inline-flex flex-col items-center", className)}>
      {trocaPorTema ? (
        <>
          <img src={logoClaro} alt="DIAKONIA" className={cn(comum, "dark:hidden")} draggable={false} />
          <img src={logoEscuro} alt="" aria-hidden className={cn(comum, "hidden dark:block")} draggable={false} />
        </>
      ) : (
        <img src={logoEscuro} alt="DIAKONIA" className={comum} draggable={false} />
      )}
      {tagline && (
        <span className="text-[0.65em] tracking-[0.18em] uppercase text-muted-foreground mt-2 font-sans">
          Conectando pessoas, organizando o propósito
        </span>
      )}
    </div>
  );
}
