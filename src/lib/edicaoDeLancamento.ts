// ─── edicaoDeLancamento.ts — a trilha de edição e o aviso de invalidação (Fase 2A: a Declaração manda) ────────────────────────────────────────────────
// Regra pura, sem React nem banco. O banco é quem manda (fin_lanc_historico_declaracao, fin_impacto_edicao); aqui só se descreve o que ele grava e se redige o aviso.

/** O aviso que a pessoa lê antes de confirmar uma edição que invalida a declaração (o mesmo texto que o banco usa ao recusar sem motivo). */
export const AVISO_DE_INVALIDACAO = "Esta alteração invalidará a declaração atual e cancelará quaisquer aprovações relacionadas.";
/** O motivo precisa ter ao menos isto (a mesma exigência do banco). */
export const MOTIVO_MINIMO_DA_EDICAO = 5;

export type CampoDaEdicao = "valor" | "data" | "fornecedor" | "favorecido" | "categoria" | "centro_custo" | "projeto" | "conta" | "documento_numero" | "nf_chave_acesso";

export const ROTULO_CAMPO_DA_EDICAO: Record<CampoDaEdicao, string> = {
  valor: "Valor", data: "Data", fornecedor: "Fornecedor", favorecido: "Favorecido", categoria: "Categoria", centro_custo: "Centro de custo",
  projeto: "Projeto", conta: "Conta", documento_numero: "Número da nota", nf_chave_acesso: "Chave da nota",
};

/** Uma linha da trilha (fin_lancamento_historico). */
export interface EdicaoDoLancamento {
  id: string;
  lancamentoId: string;
  campo: CampoDaEdicao;
  antes: string | null;
  depois: string | null;
  antesRotulo: string | null;
  depoisRotulo: string | null;
  motivo: string | null;
  invalidouDeclaracao: boolean;
  por: string | null;
  porNome: string | null;
  em: string;
}

/** O que a edição pretendida faria com a declaração e as aprovações (a resposta de fin_impacto_edicao). */
export interface ImpactoDaEdicao {
  invalida: boolean;
  /** os dados declarados que mudariam ("valor", "emitente (fornecedor)", "número da nota"…) */
  campos: string[];
  declaracaoEstado: string | null;
  derrubaAprovacoes: boolean;
}

export function impactoDaResposta(r: unknown): ImpactoDaEdicao | null {
  if (!r || typeof r !== "object") return null;
  const o = r as Record<string, unknown>;
  return {
    invalida: o.invalida === true,
    campos: Array.isArray(o.campos) ? o.campos.map(String) : [],
    declaracaoEstado: typeof o.declaracao_estado === "string" ? o.declaracao_estado : null,
    derrubaAprovacoes: o.derruba_aprovacoes === true,
  };
}

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

/** O valor de um lado da edição, legível: o nome gravado na hora (fornecedor, categoria…), dinheiro, data; "(vazio)" quando não havia nada. */
export function ladoDaEdicao(e: Pick<EdicaoDoLancamento, "campo" | "antes" | "depois" | "antesRotulo" | "depoisRotulo">, lado: "antes" | "depois"): string {
  const bruto = lado === "antes" ? e.antes : e.depois;
  const rotulo = lado === "antes" ? e.antesRotulo : e.depoisRotulo;
  if (bruto === null || bruto === "") return "(vazio)";
  if (rotulo) return rotulo;
  if (e.campo === "valor") { const n = Number(bruto); return Number.isFinite(n) ? brl(n) : bruto; }
  if (e.campo === "data") return dataBr(bruto);
  return bruto;
}

/** "Valor: R$ 100,00 → R$ 120,00". */
export function textoDaEdicao(e: Pick<EdicaoDoLancamento, "campo" | "antes" | "depois" | "antesRotulo" | "depoisRotulo">): string {
  return `${ROTULO_CAMPO_DA_EDICAO[e.campo] ?? e.campo}: ${ladoDaEdicao(e, "antes")} → ${ladoDaEdicao(e, "depois")}`;
}

/** O que a tela manda ao banco para saber o impacto: só os dados que a Declaração declara, com o valor que a pessoa digitou. */
export function patchDeclarado(novo: { valor: number; data: string; fornecedor_id: string | null; documento_numero: string | null }): Record<string, unknown> {
  return { valor: novo.valor, data: novo.data, fornecedor_id: novo.fornecedor_id, documento_numero: novo.documento_numero };
}

/** "20/10/2026 às 15:30" no horário de Brasília (quem, quando: a trilha mostra data E hora). */
export function dataHoraDaEdicao(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10).split("-").reverse().join("/");
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", " às");
}
