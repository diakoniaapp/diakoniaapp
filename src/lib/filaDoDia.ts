// ─── filaDoDia — UMA fila e UM vocabulário para "o que fazer com cada obrigação" (puro, testado) ─────────────────────────────────────────────────────────
//
// Fase C da simplificação do Financeiro (20/10/2026). A auditoria achou sete vocabulários de estado para a mesma obrigação e quatro lugares da Mesa listando "o que pede ação": as contas a pagar
// (por janela), os débitos automáticos (por mês), as filas da Quitação (por pergunta) e os prazos da Quitação. A Tesouraria precisava ler os quatro e juntar de cabeça.
//
// Aqui há UMA pergunta — "o que faço agora com esta obrigação?" — com UMA resposta em verbo (a AÇÃO) e UMA régua de urgência (agora / hoje / em breve), qualquer que seja a origem:
//   · Pagar ............................. a conta é manual/boleto e vence (ou venceu);
//   · Conferir débito / Possível falha .. o banco deveria ter debitado e não confirmou (🟡 / 🔴);
//   · Débito hoje ....................... o banco debita hoje — só acompanhar;
//   · Descobrir quem pagou · Esclarecer · Formalizar · Aprovar reembolso · Pagar reembolso ... as filas da Política de Compras por Terceiros.
// A ação mora nesta tabela; cada tela só DESENHA (rótulo e cor), nunca reinventa o nome.
import { ehAutomatica, situacaoDoDebito, type DebitoItem } from "@/lib/formaLiquidacao";
import type { Fila } from "@/lib/quitacao";

export type AcaoDaObrigacao =
  | "pagar" | "conferir_debito" | "debito_falhou" | "debito_hoje"
  | "investigar" | "esclarecer" | "formalizar" | "aprovar_reembolso" | "pagar_reembolso";

export const ROTULO_DA_ACAO: Record<AcaoDaObrigacao, string> = {
  pagar: "Pagar", conferir_debito: "Conferir débito", debito_falhou: "Possível falha no débito", debito_hoje: "Débito hoje",
  investigar: "Descobrir quem pagou", esclarecer: "Esclarecer a intenção", formalizar: "Formalizar", aprovar_reembolso: "Aprovar reembolso", pagar_reembolso: "Pagar reembolso",
};

/** Cor (token semântico) por natureza da ação: dinheiro que sai · banco a conferir · decisão sobre terceiro. */
export const NATUREZA_DA_ACAO: Record<AcaoDaObrigacao, "dinheiro" | "banco" | "falha" | "informa" | "decisao"> = {
  pagar: "dinheiro", pagar_reembolso: "dinheiro", conferir_debito: "banco", debito_falhou: "falha", debito_hoje: "informa",
  investigar: "decisao", esclarecer: "decisao", formalizar: "decisao", aprovar_reembolso: "decisao",
};

/** 0 = agora (atrasado, falha, prazo vencido) · 1 = hoje (ou nesta semana, para o que tem prazo) · 2 = em breve. */
export type UrgenciaDaFila = 0 | 1 | 2;
export const ROTULO_DA_URGENCIA: Record<UrgenciaDaFila, string> = { 0: "Agora", 1: "Hoje", 2: "Em breve" };
export const DIAS_DO_EM_BREVE = 7;

/** Dentro da mesma urgência, o que mexe mais com o caixa e com o risco vem primeiro. */
const PESO: Record<AcaoDaObrigacao, number> = {
  debito_falhou: 0, pagar: 1, pagar_reembolso: 2, formalizar: 3, esclarecer: 4, aprovar_reembolso: 5, conferir_debito: 6, investigar: 7, debito_hoje: 9,
};

export type OrigemDaFila = "vencimento" | "debito" | "quitacao";

export interface ItemDaFila<T = unknown> {
  /** estável e único por obrigação+ação */
  chave: string;
  origem: OrigemDaFila;
  acao: AcaoDaObrigacao;
  urgencia: UrgenciaDaFila;
  obrigacaoId: string;
  /** a data que manda: vencimento (contas e débitos) ou a da despesa (quitações) */
  data: string;
  valor: number;
  /** o porquê, em uma frase ("atrasada há 3 dias", "prazo vencido há 2 dias") */
  porque: string;
  /** o objeto de origem, para a tela chamar a ação certa */
  ref: T;
}

const dias = (n: number) => `${n} dia${n === 1 ? "" : "s"}`;

// ── as três origens ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface VencimentoDaFila { id: string; valor: number; dias_para_vencer: number; data: string; forma_liquidacao?: unknown; tipo?: string }

/** Conta a pagar (manual/boleto): atrasada = agora; vence hoje = hoje; até 7 dias = em breve. Débito automático NÃO entra aqui (é do banco). Depois disso, fora da fila (o calendário mostra). */
export function itemDeVencimento<T extends VencimentoDaFila>(v: T): ItemDaFila<T> | null {
  if (v.tipo && v.tipo !== "saida") return null;
  if (ehAutomatica(v.forma_liquidacao)) return null;
  const d = v.dias_para_vencer;
  if (d > DIAS_DO_EM_BREVE) return null;
  const urgencia: UrgenciaDaFila = d < 0 ? 0 : d === 0 ? 1 : 2;
  const porque = d < 0 ? `atrasada há ${dias(-d)}` : d === 0 ? "vence hoje" : d === 1 ? "vence amanhã" : `vence em ${dias(d)}`;
  return { chave: `pagar:${v.id}`, origem: "vencimento", acao: "pagar", urgencia, obrigacaoId: v.id, data: v.data, valor: Number(v.valor), porque, ref: v };
}

/** Débito automático (e PIX recorrente / transferência programada): só entra o que pede olho — 🔴 possível falha = agora; 🟡 aguardando confirmação = hoje; 🔵 débito hoje = hoje, só acompanhar. */
export function itemDeDebito<T extends DebitoItem>(d: T, hoje: string): ItemDaFila<T> | null {
  const s = situacaoDoDebito(d, hoje);
  if (s === "nao_encontrado") return { chave: `debito:${d.id}`, origem: "debito", acao: "debito_falhou", urgencia: 0, obrigacaoId: d.id, data: d.data, valor: Number(d.valor), porque: `o banco não confirmou o débito de ${d.data.slice(8, 10)}/${d.data.slice(5, 7)}`, ref: d };
  if (s === "aguardando") return { chave: `debito:${d.id}`, origem: "debito", acao: "conferir_debito", urgencia: 1, obrigacaoId: d.id, data: d.data, valor: Number(d.valor), porque: "venceu e o banco ainda não confirmou", ref: d };
  if (s === "previsto_hoje") return { chave: `debito:${d.id}`, origem: "debito", acao: "debito_hoje", urgencia: 1, obrigacaoId: d.id, data: d.data, valor: Number(d.valor), porque: "o banco debita hoje", ref: d };
  return null;
}

export interface QuitacaoDaFila {
  quitacaoId: string; obrigacaoId: string; fila: Fila | null; valorDaObrigacao: number; saldoAReembolsar?: number | null; dataDaDespesa: string; idadeEmDias?: number;
  bloqueiaFechamento?: boolean;
}
export interface PrazoDaFila { quitacaoId: string; situacao: "vencido" | "vence_em_7_dias" | "no_prazo"; diasRestantes: number }

const ACAO_DA_FILA: Record<Fila, AcaoDaObrigacao> = {
  investigar: "investigar", a_esclarecer: "esclarecer", formalizar: "formalizar", aprovar_reembolso: "aprovar_reembolso", reembolso_a_pagar: "pagar_reembolso",
};

/**
 * Item da Política de Compras por Terceiros. O PRAZO manda na urgência (vencido = agora; vence em 7 dias = hoje); sem prazo, o que bloqueia o fechamento é "hoje", o reembolso aprovado
 * (dívida da igreja) é "hoje" e o resto é "em breve".
 */
export function itemDeQuitacao<T extends QuitacaoDaFila>(q: T, prazo?: PrazoDaFila | null): ItemDaFila<T> | null {
  if (!q.fila) return null;
  const acao = ACAO_DA_FILA[q.fila];
  if (!acao) return null;   // fila desconhecida (valor novo no banco): melhor omitir do que ordenar errado
  let urgencia: UrgenciaDaFila;
  let porque: string;
  if (prazo?.situacao === "vencido") { urgencia = 0; porque = `prazo vencido há ${dias(Math.abs(prazo.diasRestantes))}`; }
  else if (prazo?.situacao === "vence_em_7_dias") { urgencia = 1; porque = prazo.diasRestantes === 0 ? "o prazo vence hoje" : `o prazo vence em ${dias(prazo.diasRestantes)}`; }
  else if (q.bloqueiaFechamento) { urgencia = 1; porque = "impede o fechamento do mês"; }
  else if (acao === "pagar_reembolso") { urgencia = 1; porque = "a igreja deve este reembolso"; }
  else { urgencia = 2; porque = q.idadeEmDias != null ? `há ${dias(q.idadeEmDias)} sem resposta` : "sem resposta"; }
  const valor = acao === "pagar_reembolso" ? Number(q.saldoAReembolsar ?? q.valorDaObrigacao) : Number(q.valorDaObrigacao);
  return { chave: `quitacao:${q.quitacaoId}`, origem: "quitacao", acao, urgencia, obrigacaoId: q.obrigacaoId, data: q.dataDaDespesa, valor, porque, ref: q };
}

// ── a fila ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export function ordenarFila<T>(itens: ItemDaFila<T>[]): ItemDaFila<T>[] {
  return [...itens].sort((a, b) =>
    a.urgencia - b.urgencia || PESO[a.acao] - PESO[b.acao] || a.data.localeCompare(b.data) || b.valor - a.valor || a.chave.localeCompare(b.chave));
}

/**
 * Monta a fila única. Uma obrigação aparece UMA vez: se ela tem Quitação (um terceiro pagou, ou ninguém sabe quem), a Política manda — a igreja não paga ao fornecedor — e a conta a pagar sai;
 * quem fala dela é o item da Quitação.
 */
export function montarFilaDoDia(e: {
  vencimentos: VencimentoDaFila[]; debitos: DebitoItem[]; quitacoes: QuitacaoDaFila[]; prazos: PrazoDaFila[]; obrigacoesComQuitacao?: ReadonlySet<string>; hoje: string;
}): ItemDaFila[] {
  const prazoDa = new Map(e.prazos.map(p => [p.quitacaoId, p]));
  const comQuitacao = new Set<string>([...(e.obrigacoesComQuitacao ?? []), ...e.quitacoes.map(q => q.obrigacaoId)]);
  const itens: ItemDaFila[] = [];
  for (const v of e.vencimentos) { if (!comQuitacao.has(v.id)) { const i = itemDeVencimento(v); if (i) itens.push(i); } }
  for (const d of e.debitos) { if (!comQuitacao.has(d.id)) { const i = itemDeDebito(d, e.hoje); if (i) itens.push(i); } }
  for (const q of e.quitacoes) { const i = itemDeQuitacao(q, prazoDa.get(q.quitacaoId)); if (i) itens.push(i); }
  return ordenarFila(itens);
}

export interface ResumoDaFila { total: number; porUrgencia: Record<UrgenciaDaFila, number>; porAcao: Partial<Record<AcaoDaObrigacao, number>>; valor: number }
export function resumirFila(itens: readonly ItemDaFila[]): ResumoDaFila {
  const r: ResumoDaFila = { total: itens.length, porUrgencia: { 0: 0, 1: 0, 2: 0 }, porAcao: {}, valor: 0 };
  for (const i of itens) {
    r.porUrgencia[i.urgencia] += 1;
    r.porAcao[i.acao] = (r.porAcao[i.acao] ?? 0) + 1;
    if (i.acao !== "debito_hoje") r.valor += i.valor;
  }
  r.valor = Math.round(r.valor * 100) / 100;
  return r;
}
