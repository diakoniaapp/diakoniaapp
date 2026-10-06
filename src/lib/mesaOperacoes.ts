// ─── mesaOperacoes.ts — as regras da "mesa de trabalho" do tesoureiro (puras) ────
//
// A aba "1 Operações" deixou de ser um painel de indicadores (arrecadação, conciliação) e virou a
// MESA DE TRABALHO da rotina diária: o que pagar, o que vence, o que o banco vai debitar sozinho,
// o que falta documentar e se o caixa aguenta. Aqui ficam as decisões; a tela só desenha.
//
// Regras de agrupamento (uma só definição, testada):
//   · "a pagar"      — saída PREVISTA de liquidação manual ou boleto/fatura: alguém precisa agir;
//   · "automático"   — débito automático, PIX recorrente, transferência programada: o banco
//                      executa; entra em "Débitos automáticos", nunca em "Contas a pagar";
//   · janelas        — atrasadas · hoje · amanhã · 2 a 7 dias · 8 a 30 dias.

import { ehAutomatica } from "./formaLiquidacao";

export interface VencimentoLike {
  id: string;
  valor: number;
  dias_para_vencer: number;
  data: string;
  forma_liquidacao?: unknown;
  tipo?: string;
}

export interface GruposDeContas<T> {
  atrasadas: T[];
  hoje: T[];
  amanha: T[];
  semana: T[];
  ate30: T[];
}

export const soma = (xs: { valor: number }[]): number =>
  Math.round(xs.reduce((s, x) => s + Number(x.valor), 0) * 100) / 100;

const porData = <T extends VencimentoLike>(a: T, b: T) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id);

/** Separa o que é conta a pagar do que é débito automático, e agrupa as contas por janela. */
export function agruparVencimentos<T extends VencimentoLike>(vencimentos: T[]): { aPagar: GruposDeContas<T>; automaticos: T[] } {
  const aPagar: GruposDeContas<T> = { atrasadas: [], hoje: [], amanha: [], semana: [], ate30: [] };
  const automaticos: T[] = [];
  for (const v of vencimentos) {
    if (v.tipo && v.tipo !== "saida") continue;
    if (ehAutomatica(v.forma_liquidacao)) { automaticos.push(v); continue; }
    const d = v.dias_para_vencer;
    if (d < 0) aPagar.atrasadas.push(v);
    else if (d === 0) aPagar.hoje.push(v);
    else if (d === 1) aPagar.amanha.push(v);
    else if (d <= 7) aPagar.semana.push(v);
    else if (d <= 30) aPagar.ate30.push(v);
  }
  for (const k of Object.keys(aPagar) as (keyof GruposDeContas<T>)[]) aPagar[k].sort(porData);
  automaticos.sort(porData);
  return { aPagar, automaticos };
}

export const totalAPagar = (g: GruposDeContas<VencimentoLike>, ate: "hoje" | "semana" | "30d"): number => {
  const partes = [g.atrasadas, g.hoje];
  if (ate !== "hoje") partes.push(g.amanha, g.semana);
  if (ate === "30d") partes.push(g.ate30);
  return soma(partes.flat());
};

// ── o caixa aguenta? ────────────────────────────────────────────────────────

export interface CoberturaDoCaixa {
  /** disponível − compromissos. Negativo = falta. */
  saldoDepois: number;
  cobre: boolean;
}

export function coberturaDoCaixa(disponivel: number, compromissos: number): CoberturaDoCaixa {
  const saldoDepois = Math.round((disponivel - compromissos) * 100) / 100;
  return { saldoDepois, cobre: saldoDepois >= 0 };
}

/** O que conta como "caixa disponível": o que se pode gastar hoje. Aplicação rende e cartão é
 *  dívida — aparecem à parte, não somados. */
export const TIPOS_DE_CAIXA_DISPONIVEL: ReadonlySet<string> = new Set(["banco", "caixa", "envelope"]);

export interface ContaDeCaixa { tipo: string; saldo_atual: number | string | null }

export function resumoDoCaixa(contas: ContaDeCaixa[]): { disponivel: number; aplicacoes: number; cartao: number } {
  const r = { disponivel: 0, aplicacoes: 0, cartao: 0 };
  for (const c of contas) {
    const s = Number(c.saldo_atual ?? 0);
    if (TIPOS_DE_CAIXA_DISPONIVEL.has(String(c.tipo))) r.disponivel += s;
    else if (c.tipo === "aplicacao") r.aplicacoes += s;
    else if (c.tipo === "cartao") r.cartao += s;
  }
  const a = (n: number) => Math.round(n * 100) / 100;
  return { disponivel: a(r.disponivel), aplicacoes: a(r.aplicacoes), cartao: a(r.cartao) };
}

// ── o checklist do dia ──────────────────────────────────────────────────────

export interface EntradasDoChecklist {
  atrasadas: number;
  venceHoje: number;
  /** Débitos automáticos que já deveriam ter aparecido no extrato e ainda não apareceram. */
  debitosAConferir: number;
  /** Pagamentos recentes sem comprovante anexado. */
  comprovantesPendentes: number;
  /** Dias desde o último movimento lançado numa conta de banco; null = sem dado. */
  diasSemExtrato: number | null;
  aprovacoesParadas: number;
  /** Saídas pagas no mês que exigem documento e ainda não têm. */
  documentosFaltando: number;
}

export interface ItemDoChecklist {
  chave: string;
  rotulo: string;
  pendentes: number;
  feito: boolean;
  detalhe: string;
}

/** Quantos dias sem lançar nada no banco até a tesouraria precisar importar o extrato. */
export const DIAS_ATE_PEDIR_EXTRATO = 4;

const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;

export function montarChecklist(e: EntradasDoChecklist): ItemDoChecklist[] {
  const extratoAtrasado = e.diasSemExtrato != null && e.diasSemExtrato > DIAS_ATE_PEDIR_EXTRATO;
  const item = (chave: string, rotulo: string, pendentes: number, quando: string, ok: string): ItemDoChecklist =>
    ({ chave, rotulo, pendentes, feito: pendentes === 0, detalhe: pendentes === 0 ? ok : quando });
  return [
    item("atrasadas", "Resolver contas atrasadas", e.atrasadas, `${plural(e.atrasadas, "conta atrasada", "contas atrasadas")}`, "Nada atrasado"),
    item("hoje", "Pagar o que vence hoje", e.venceHoje, `${plural(e.venceHoje, "conta vence", "contas vencem")} hoje`, "Nada vence hoje"),
    item("debitos", "Conferir débitos automáticos", e.debitosAConferir, `${plural(e.debitosAConferir, "débito ainda não apareceu", "débitos ainda não apareceram")} no extrato`, "Todos os débitos conferidos"),
    item("comprovantes", "Anexar comprovantes", e.comprovantesPendentes, `${plural(e.comprovantesPendentes, "pagamento sem comprovante", "pagamentos sem comprovante")}`, "Comprovantes em dia"),
    item("extrato", "Importar o extrato do banco", extratoAtrasado ? 1 : 0,
      e.diasSemExtrato != null ? `último movimento há ${e.diasSemExtrato} dias` : "sem movimento", "Extrato em dia"),
    item("aprovacoes", "Decidir aprovações paradas", e.aprovacoesParadas, plural(e.aprovacoesParadas, "lançamento aguarda aprovação", "lançamentos aguardam aprovação"), "Nenhuma aprovação parada"),
    item("documentos", "Documentos para a contabilidade", e.documentosFaltando, `${plural(e.documentosFaltando, "pagamento sem documento", "pagamentos sem documento")} neste mês`, "Documentação em dia"),
  ];
}

export const pendenciasDoChecklist = (itens: ItemDoChecklist[]): number => itens.filter(i => !i.feito).length;

/** Dias inteiros entre duas datas YYYY-MM-DD (b − a). */
export function diasEntreDatas(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
}
