// ─── DiasDoExtrato — a lista do Extrato de Obrigações agrupada por dia, na tela e no papel ───────────────────────────────────────────────────────────────────
// Redesenho de 20/10/2026. Uma obrigação ocupa 2 a 4 linhas (quem e quanto; o que é; classificação e marcas); a exceção (projeto, terceiro, atraso) é o que ganha destaque. Cada dia fecha com
// "TOTAL DO DIA" — por VENCIMENTO, porque o extrato é de obrigações e não de pagamentos. A MESMA peça serve à tela (todos os campos + as ações) e ao papel (só os campos do modelo escolhido).
import { memo, type ReactNode } from "react";
import { brl } from "@/services/finService";
import { dataDoExtrato, diaDaSemana, seloDaSituacao, type ChaveDoSelo, type DiaDoExtrato, type LinhaDoExtrato } from "@/lib/extratoDeObrigacoes";
import type { CampoDeImpressao } from "@/lib/perfilDeImpressaoDoExtrato";
import { DocumentacaoChip } from "@/components/financas/DocumentacaoChip";

type Campos = Record<CampoDeImpressao, boolean>;

/** Os selos: cor + forma + palavra (cores só por token semântico do sistema). */
const CLASSE_DO_SELO: Record<ChaveDoSelo, string> = {
  pago: "border-success-line bg-success-soft text-success-text",
  aberto: "border-warning-line bg-warning-soft text-warning-text",
  reembolso_a_pagar: "border-gold bg-gold text-gold-foreground",
  reembolso_pago: "border-gold/50 bg-gold/10 text-gold-text",
  terceiro: "border-violeta-line bg-violeta-soft text-violeta-text",
  cancelada: "border-border bg-muted text-muted-foreground line-through",
};

export function SeloDaSituacaoChip({ l, comAtraso }: { l: LinhaDoExtrato; comAtraso?: boolean }) {
  const s = seloDaSituacao(l);
  return (
    <span className="inline-flex flex-col items-end">
      <span data-selo={s.chave} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-px text-[11px] font-bold leading-tight ${CLASSE_DO_SELO[s.chave]}`}><span aria-hidden>{s.glifo}</span>{s.rotulo}</span>
      {comAtraso && !!l.diasEmAtraso && l.diasEmAtraso > 0 && <span className="text-[10.5px] font-bold text-destructive-text mt-0.5"><span aria-hidden>▲</span> {l.diasEmAtraso} dia{l.diasEmAtraso === 1 ? "" : "s"}</span>}
    </span>
  );
}

const Chip = ({ children, tom }: { children: ReactNode; tom?: "projeto" | "conta" }) => (
  <span className={`mr-1 inline-block rounded border px-1.5 text-[10px] font-semibold leading-[1.5] ${tom === "projeto" ? "border-gold bg-gold/10 text-gold-text" : "border-border bg-muted text-muted-foreground"}`}>{children}</span>
);

export function ObrigacaoItem({ l, campos, acoes, onAbrir, anexosZero }: { l: LinhaDoExtrato; campos: Campos; acoes?: ReactNode; onAbrir?: () => void; anexosZero?: boolean }) {
  const terceiro = l.situacao === "quitada_por_terceiro";
  const reembolso = l.situacao === "reembolso";
  const titulo = campos.fornecedor ? (l.fornecedor || l.descricao || "—") : (l.descricao || l.categoria || "Obrigação");
  const descricao = campos.descricao && l.descricao && l.descricao !== l.fornecedor ? l.descricao : "";
  const obs = campos.observacoes && l.observacoes ? l.observacoes : "";
  const l2 = [descricao, obs ? `Obs.: ${obs}` : ""].filter(Boolean).join("  ·  ");
  const l3 = [campos.categoria && l.categoria, campos.centro && l.centro].filter(Boolean).join(" › ");
  // o contador de documentos: na tela só quando há (zero em quase toda tarifa e débito automático seria ruído); no papel, quando pedido, mostra também o zero
  const mostraAnexos = campos.anexos && (l.anexos > 0 || !!anexosZero);
  // a situação documental (sem documentos / parcial / completa): vai junto do campo "documentos anexados"
  const mostraDocumentacao = campos.anexos && !!l.documentacao;
  const marcas = (campos.projeto && l.projeto ? 1 : 0) + (campos.conta && l.conta ? 1 : 0) + (mostraAnexos ? 1 : 0) + (mostraDocumentacao ? 1 : 0);
  const quemCampos = [
    campos.responsavel && `Pago por: ${l.responsavel}`, campos.intencao && l.intencao !== "—" && `Intenção: ${l.intencao}`, campos.grau && l.grau && `Prova: ${l.grau}`,
    reembolso && l.reembolsoAPagar && l.saldoAReembolsar !== null ? `Saldo a reembolsar: ${brl(l.saldoAReembolsar)}` : "",
  ].filter(Boolean).join("  ·  ");
  const mostraQuem = (terceiro || reembolso) && quemCampos !== "";
  const cor = terceiro ? "bg-violeta-soft border-l-[5px] border-l-violeta" : reembolso ? "bg-gold/10 border-l-[5px] border-l-gold" : "border-l-[5px] border-l-transparent";
  return (
    <div data-obrigacao={l.obrigacaoId} className={`avoid-break grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-b border-border/40 px-2 py-1.5 ${acoes ? "md:grid-cols-[minmax(0,1fr)_auto_auto]" : ""} ${cor}`} style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}>
      <div className="flex min-w-0 items-baseline gap-2">
        {onAbrir
          ? <button type="button" onClick={onAbrir} className="min-w-0 truncate text-left text-[13px] font-semibold hover:underline" title={titulo}>{titulo}</button>
          : <span className="min-w-0 truncate text-[13px] font-semibold" title={titulo}>{titulo}</span>}
        {campos.documento && l.documento && <span className="whitespace-nowrap text-[11px] text-muted-foreground">nº {l.documento}</span>}
      </div>
      <div className="text-right text-[13px] font-semibold tabular-nums whitespace-nowrap">{brl(l.valor)}</div>
      {l2 && <div className="col-start-1 truncate text-[11px] leading-snug text-muted-foreground" title={l2}>{l2}</div>}
      {(l3 || marcas > 0) && (
        <div className="col-start-1 text-[11px] leading-snug text-muted-foreground">
          {l3}{l3 && marcas > 0 ? "  " : ""}
          {campos.projeto && l.projeto && <Chip tom="projeto">Projeto: {l.projeto}</Chip>}
          {campos.conta && l.conta && <Chip tom="conta">{l.conta}</Chip>}
          {mostraAnexos && <Chip tom="conta">{l.anexos} {l.anexos === 1 ? "documento" : "documentos"}</Chip>}
          {mostraDocumentacao && l.documentacao && <span className="mr-1 inline-block align-middle"><DocumentacaoChip situacao={l.documentacao} /></span>}
        </div>
      )}
      <div className="col-start-2 row-start-2 row-span-2 self-start text-right"><SeloDaSituacaoChip l={l} comAtraso={campos.diasAtraso} /></div>
      {mostraQuem && (
        <div className={`col-span-full mt-0.5 border-t border-dotted border-foreground/20 pt-0.5 text-[11px] font-semibold ${terceiro ? "text-violeta-text" : "text-gold-text"}`}>
          <span aria-hidden>{terceiro ? "◆" : "↺"}</span> {terceiro ? "Quitada por terceiro" : l.reembolsoAPagar ? "Reembolso a pagar" : "Reembolso pago"} · <span className="font-normal text-muted-foreground">{quemCampos}</span>
        </div>
      )}
      {/* as ações NÃO disputam o espaço da leitura: ficam numa coluna estreita à direita (no celular, numa linha própria) */}
      {acoes && <div className="no-print col-span-2 flex justify-end pt-1 md:col-span-1 md:col-start-3 md:row-span-3 md:row-start-1 md:self-center md:pl-1 md:pt-0">{acoes}</div>}
    </div>
  );
}

/**
 * `memo` de propósito (20/10/2026): abrir ou fechar QUALQUER diálogo da página muda o estado do pai, e sem isto cada mudança re-renderizava todas as linhas — medido com 300 linhas e CPU 4× mais lenta
 * (um celular médio): 1,1 s para abrir e 0,8 s para fechar o "Imprimir extrato", e o toque em Cancelar/X parecia não responder. Quem chama passa funções estáveis (`useCallback`).
 */
export const DiaDoExtratoBloco = memo(function DiaDoExtratoBloco({ dia, campos, renderAcoes, onAbrir, topoFixo, anexosZero }: {
  dia: DiaDoExtrato; campos: Campos; renderAcoes?: (l: LinhaDoExtrato) => ReactNode; onAbrir?: (l: LinhaDoExtrato) => void; anexosZero?: boolean;
  /** na tela, o cabeçalho do dia fica preso abaixo da barra de filtros enquanto o dia rola (px) */
  topoFixo?: number;
}) {
  const n = dia.linhas.length;
  const jaPago = Math.round((dia.total - dia.emAberto) * 100) / 100;
  return (
    <section data-dia={dia.data} className="mt-3 first:mt-0">
      <div className={`flex items-baseline justify-between border-b-[1.5px] border-gold-text bg-card px-1 pb-0.5 ${topoFixo === undefined ? "" : "sticky z-[5]"}`} style={topoFixo === undefined ? undefined : { top: topoFixo }}>
        <h3 className="font-serif text-sm font-semibold uppercase tracking-wide text-gold-text">{diaDaSemana(dia.data)} <span className="font-sans text-[11px] font-medium normal-case tracking-normal text-muted-foreground">{dataDoExtrato(dia.data)}</span></h3>
        <span className="text-[11px] text-muted-foreground">{n} {n === 1 ? "obrigação" : "obrigações"}</span>
      </div>
      {dia.linhas.map(l => <ObrigacaoItem key={l.obrigacaoId} l={l} campos={campos} acoes={renderAcoes?.(l)} onAbrir={onAbrir ? () => onAbrir(l) : undefined} anexosZero={anexosZero} />)}
      {campos.totalDoDia && (
        <div data-fecha-dia={dia.data} className="flex items-baseline justify-between border-y border-gold/30 border-t-[1.5px] border-t-gold-text bg-gold/5 px-2 py-0.5 text-[11px] font-bold" style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}>
          <span className="tracking-wide">{dataDoExtrato(dia.data)} <span className="text-gold-text">|</span> TOTAL DO DIA</span>
          <span className="tabular-nums text-[12.5px]">{brl(dia.total)}{dia.emAberto > 0 && jaPago > 0 && <small className="ml-2 text-[10px] font-normal text-muted-foreground">pago/quitado {brl(jaPago)} · em aberto {brl(dia.emAberto)}</small>}</span>
        </div>
      )}
    </section>
  );
});
