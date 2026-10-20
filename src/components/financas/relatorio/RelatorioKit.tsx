// ─── RelatorioKit — as peças que dão aos relatórios do sistema a MESMA cara ─────────────────────────────────────────────────────────────────────────────────
// Redesenho do Extrato de Obrigações (20/10/2026): a Prestação de Contas é a referência (marca à esquerda, "Emitido em" à direita, título espaçado em terracota, período em serifa, caixa de
// resumo rosada, rodapé com o versículo). Estas peças saíram do Extrato para serem usadas pelos demais relatórios — a Prestação, o Extrato Bancário e o Ciclo Mensal passam a usá-las depois,
// uma tela por vez. Só estilo e estrutura: nenhuma regra de negócio mora aqui. Fontes: as do sistema (Inter no texto, Cormorant Garamond nos títulos).
import type { ReactNode } from "react";
import logoDiakonia from "@/assets/logo-diakonia.png";
import { AssinaturaDoSistema } from "@/components/AssinaturaDoSistema";

export function CabecalhoDeRelatorio({ emitidoPor }: { emitidoPor: string }) {
  const agora = new Date();
  return (
    <header className="avoid-break flex items-start justify-between gap-4 pb-3 border-b-2 border-gold/30">
      <div className="flex flex-col items-center gap-1">
        <img src={logoDiakonia} alt="DIAKONIA" className="h-12 w-auto object-contain" style={{ filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.35)) drop-shadow(0 1px 1px rgba(0,0,0,0.25))", printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }} draggable={false} />
        <div className="text-center">
          <h2 className="font-serif text-base leading-tight">DiakoniaApp</h2>
          <p className="text-2xs text-muted-foreground tracking-[0.12em] uppercase">Gestão Ministerial</p>
        </div>
      </div>
      <div className="text-right text-xs text-muted-foreground space-y-0.5">
        <p>Emitido em <strong className="text-foreground">{agora.toLocaleDateString("pt-BR")}</strong> às {agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
        <p>Por <strong className="text-foreground">{emitidoPor}</strong></p>
      </div>
    </header>
  );
}

export function TituloDeRelatorio({ rotulo, titulo, subtitulo }: { rotulo: string; titulo: string; subtitulo?: ReactNode }) {
  return (
    <div className="text-center my-4 avoid-break">
      <p className="text-xs tracking-[0.25em] uppercase text-gold-text">{rotulo}</p>
      <h1 className="font-serif text-3xl mt-1">{titulo}</h1>
      {subtitulo && <p className="text-xs text-muted-foreground mt-1">{subtitulo}</p>}
    </div>
  );
}

export interface PecaDoResumo {
  rotulo: string;
  valor: ReactNode;
  detalhe?: ReactNode;
  /** a cor do número: os tons semânticos do sistema (nunca cor crua) */
  tom?: "neutro" | "sucesso" | "aviso" | "reembolso" | "terceiro" | "mudo";
  /** a peça que o olho precisa achar primeiro: ganha uma faixa à esquerda */
  destaque?: boolean;
}

const TOM: Record<NonNullable<PecaDoResumo["tom"]>, string> = {
  neutro: "text-foreground", sucesso: "text-success-text", aviso: "text-warning-text", reembolso: "text-gold-text", terceiro: "text-violeta-text", mudo: "text-muted-foreground",
};

/** A caixa de resumo rosada das telas de relatório (a da Prestação: título espaçado em serifa e peças brancas). */
export function CaixaDeResumo({ titulo = "Resumo executivo", pecas, rotulo }: { titulo?: string; pecas: PecaDoResumo[]; rotulo?: string }) {
  return (
    <section aria-label={rotulo ?? titulo} className="avoid-break rounded-xl border border-gold/30 bg-gold/5 px-3 pt-2 pb-3 mb-3" style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}>
      <h2 className="font-serif text-xs uppercase tracking-[0.22em] text-gold-text mb-1.5 ml-0.5">{titulo}</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 print:grid-cols-3 gap-2">
        {pecas.map(p => (
          <div key={p.rotulo} className={`rounded-lg border bg-card px-3 py-1.5 ${p.destaque ? "border-warning-line border-l-[3px] border-l-warning" : "border-gold/20"}`}>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{p.rotulo}</p>
            <p className={`text-lg font-bold tabular-nums leading-tight ${TOM[p.tom ?? "neutro"]}`}>{p.valor}</p>
            {p.detalhe && <p className="text-[11px] text-muted-foreground leading-tight">{p.detalhe}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}

/** As duas linhas de assinatura do fim do relatório (como na Prestação de Contas). */
export function Assinaturas() {
  return (
    <div className="avoid-break flex gap-12 mt-8 pt-6">
      {[["Tesouraria", "Responsável pela conta"], ["Conselho Fiscal", "Confere e aprova"]].map(([quem, papel]) => (
        <div key={quem} className="flex-1 text-center text-xs text-muted-foreground">
          <p className="border-t border-foreground/50 pt-1 text-foreground text-sm">{quem}</p>
          <p>{papel}</p>
        </div>
      ))}
    </div>
  );
}

export function RodapeDeRelatorio() {
  return (
    <footer className="avoid-break mt-6 pt-3 border-t border-gold/30 text-center">
      <p className="text-xs italic text-muted-foreground font-serif">"Tudo, porém, deve ser feito com decência e ordem."</p>
      <p className="text-xs text-gold-text tracking-wide mt-1">1 Coríntios 14:40</p>
      <AssinaturaDoSistema />
    </footer>
  );
}
