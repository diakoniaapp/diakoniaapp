// ─── extratoDeObrigacoes — "Extrato de Obrigações": todas as obrigações do período, pagas ou não, pela igreja ou por terceiros ─────────────────────────
// Regras puras (sem banco, sem React). Uma OBRIGAÇÃO é uma despesa (saída, que não é transferência) e pode ter mais de uma linha em `fin_lancamentos`: no pagamento parcial a raiz vira
// "realizada" e nasce uma parcela `previsto` com o saldo (mesma `obrigacao_id`). Aqui as linhas do grupo viram UMA linha do extrato.
// A "Situação" é a pergunta que o relatório responde: a obrigação está em aberto, foi paga pela igreja, é um reembolso, foi quitada por um terceiro ou foi cancelada?
import { ROTULO_INTENCAO, ROTULO_RESPONSAVEL, ehTerceiro, type Intencao, type ResponsavelTipo } from "@/lib/quitacao";

export type SituacaoDaObrigacao = "em_aberto" | "paga_parcialmente" | "paga" | "reembolso" | "quitada_por_terceiro" | "cancelada";

export const ROTULO_SITUACAO: Record<SituacaoDaObrigacao, string> = {
  em_aberto: "Em aberto", paga_parcialmente: "Paga parcialmente", paga: "Paga", reembolso: "Reembolso", quitada_por_terceiro: "Quitada por terceiro", cancelada: "Cancelada",
};

/** O filtro "Situação" da tela: as cinco do resumo (a parcial entra em "Em aberto", porque ainda há saldo a pagar) ou todas. */
export type FiltroDeSituacao = "todas" | "em_aberto" | "paga" | "reembolso" | "quitada_por_terceiro" | "cancelada";
export const OPCOES_DE_SITUACAO: { valor: FiltroDeSituacao; rotulo: string }[] = [
  { valor: "todas", rotulo: "Todas" }, { valor: "em_aberto", rotulo: "Em aberto" }, { valor: "paga", rotulo: "Pagas" },
  { valor: "reembolso", rotulo: "Reembolsos" }, { valor: "quitada_por_terceiro", rotulo: "Quitadas por terceiros" }, { valor: "cancelada", rotulo: "Canceladas" },
];

/** Uma linha de `fin_lancamentos` como o extrato a lê. */
export interface LinhaDeObrigacao {
  id: string;
  obrigacao_id: string | null;
  data: string;                      // vencimento (AAAA-MM-DD)
  status: string;
  valor: number;
  valor_original: number | null;
  descricao: string | null;
  documento_numero: string | null;
  fornecedor_id: string | null;
  pessoa_id: string | null;
  categoria_id: string | null;
  centro_custo_id: string | null;
  projeto_id: string | null;
}

/** A quitação registrada para a obrigação (`vw_fin_quitacao`), quando existe. */
export interface QuitacaoDoExtrato { responsavel: ResponsavelTipo; responsavelNome: string | null; intencao: Intencao }

export interface NomesDoExtrato {
  fornecedores: Map<string, string>; pessoas: Map<string, string>; categorias: Map<string, string>; centros: Map<string, string>; projetos: Map<string, string>;
}

export interface LinhaDoExtrato {
  obrigacaoId: string;
  data: string;
  fornecedor: string;
  documento: string;
  descricao: string;
  categoria: string;
  centro: string;
  projeto: string;
  valor: number;
  /** o que ainda falta pagar (soma das linhas `previsto`); 0 nas demais */
  saldoEmAberto: number;
  situacao: SituacaoDaObrigacao;
  responsavel: string;
  intencao: string;
  diasEmAtraso: number | null;
}

const PAGAS = ["realizado", "conciliado", "quitado_terceiro"];
const c2 = (n: number) => Math.round(n * 100) / 100;
const soma = (xs: number[]) => c2(xs.reduce((s, x) => s + x, 0));

/** Dias corridos de `de` até `ate` (AAAA-MM-DD), sem fuso: parte do meio-dia UTC de cada data. */
export function diasEntre(de: string, ate: string): number {
  const t = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  return Math.round((t(ate) - t(de)) / 86_400_000);
}

/** Agrupa as linhas por obrigação (a raiz é a linha cujo id é o da obrigação; sem `obrigacao_id`, a própria linha). */
export function agruparPorObrigacao(linhas: LinhaDeObrigacao[]): Map<string, LinhaDeObrigacao[]> {
  const grupos = new Map<string, LinhaDeObrigacao[]>();
  for (const l of linhas) {
    const chave = l.obrigacao_id ?? l.id;
    const g = grupos.get(chave);
    if (g) g.push(l); else grupos.set(chave, [l]);
  }
  return grupos;
}

export function situacaoDaObrigacao(linhas: Pick<LinhaDeObrigacao, "status">[], quitacao: QuitacaoDoExtrato | null): SituacaoDaObrigacao {
  if (linhas.length > 0 && linhas.every(l => l.status === "cancelado")) return "cancelada";
  const vigentes = linhas.filter(l => l.status !== "cancelado");
  const terceiro = !!quitacao && ehTerceiro(quitacao.responsavel);
  if (terceiro && quitacao!.intencao === "reembolso") return "reembolso";
  if (vigentes.some(l => l.status === "quitado_terceiro") || terceiro) return "quitada_por_terceiro";
  const abertas = vigentes.filter(l => !PAGAS.includes(l.status));
  const pagas = vigentes.filter(l => PAGAS.includes(l.status));
  if (abertas.length > 0) return pagas.length > 0 ? "paga_parcialmente" : "em_aberto";
  return "paga";
}

export function montarExtratoDeObrigacoes(entrada: {
  linhas: LinhaDeObrigacao[]; quitacoes: Map<string, QuitacaoDoExtrato>; nomes: NomesDoExtrato; hoje: string;
}): LinhaDoExtrato[] {
  const { linhas, quitacoes, nomes, hoje } = entrada;
  const saida: LinhaDoExtrato[] = [];
  for (const [chave, grupo] of agruparPorObrigacao(linhas)) {
    const raiz = grupo.find(l => l.id === chave) ?? [...grupo].sort((a, b) => a.data.localeCompare(b.data))[0];
    const q = quitacoes.get(chave) ?? null;
    const situacao = situacaoDaObrigacao(grupo, q);
    const abertas = grupo.filter(l => l.status !== "cancelado" && !PAGAS.includes(l.status));
    const saldoEmAberto = soma(abertas.map(l => Number(l.valor)));
    const vencimentoAberto = abertas.map(l => l.data).sort()[0];
    const diasEmAtraso = situacao !== "cancelada" && vencimentoAberto && vencimentoAberto < hoje ? diasEntre(vencimentoAberto, hoje) : null;
    const nomeDoFavorecido = (raiz.fornecedor_id && nomes.fornecedores.get(raiz.fornecedor_id)) || (raiz.pessoa_id && nomes.pessoas.get(raiz.pessoa_id)) || "";
    const responsavel = situacao === "cancelada" ? "—"
      : q ? `${ROTULO_RESPONSAVEL[q.responsavel]}${q.responsavelNome ? ` — ${q.responsavelNome}` : ""}`
      : situacao === "em_aberto" || situacao === "paga_parcialmente" ? (situacao === "paga_parcialmente" ? "Igreja (parcial)" : ROTULO_RESPONSAVEL.ninguem_ainda) : ROTULO_RESPONSAVEL.igreja;
    saida.push({
      obrigacaoId: chave,
      data: raiz.data,
      fornecedor: nomeDoFavorecido,
      documento: raiz.documento_numero ?? "",
      descricao: raiz.descricao ?? "",
      categoria: (raiz.categoria_id && nomes.categorias.get(raiz.categoria_id)) || "",
      centro: (raiz.centro_custo_id && nomes.centros.get(raiz.centro_custo_id)) || "",
      projeto: (raiz.projeto_id && nomes.projetos.get(raiz.projeto_id)) || "",
      valor: Number(raiz.valor_original ?? raiz.valor),
      saldoEmAberto,
      situacao,
      responsavel,
      intencao: q && q.intencao !== "nao_se_aplica" ? ROTULO_INTENCAO[q.intencao] : "—",
      diasEmAtraso,
    });
  }
  return saida.sort((a, b) => a.data.localeCompare(b.data) || a.fornecedor.localeCompare(b.fornecedor, "pt-BR") || a.descricao.localeCompare(b.descricao, "pt-BR"));
}

export function filtrarPorSituacao(linhas: LinhaDoExtrato[], filtro: FiltroDeSituacao): LinhaDoExtrato[] {
  if (filtro === "todas") return linhas;
  if (filtro === "em_aberto") return linhas.filter(l => l.situacao === "em_aberto" || l.situacao === "paga_parcialmente");
  return linhas.filter(l => l.situacao === filtro);
}

export interface ParteDoResumo { quantidade: number; valor: number }
export interface ResumoDoExtrato {
  quantidade: number;
  /** soma das obrigações vigentes: as canceladas não entram no valor (entram na quantidade) */
  valorTotal: number;
  emAberto: ParteDoResumo;
  pagas: ParteDoResumo;
  reembolsos: ParteDoResumo;
  quitadasPorTerceiros: ParteDoResumo;
  canceladas: ParteDoResumo;
}

export function resumoDoExtrato(linhas: LinhaDoExtrato[]): ResumoDoExtrato {
  const r: ResumoDoExtrato = {
    quantidade: linhas.length, valorTotal: 0,
    emAberto: { quantidade: 0, valor: 0 }, pagas: { quantidade: 0, valor: 0 }, reembolsos: { quantidade: 0, valor: 0 },
    quitadasPorTerceiros: { quantidade: 0, valor: 0 }, canceladas: { quantidade: 0, valor: 0 },
  };
  const mais = (p: ParteDoResumo, v: number) => { p.quantidade += 1; p.valor = c2(p.valor + v); };
  for (const l of linhas) {
    if (l.situacao !== "cancelada") r.valorTotal = c2(r.valorTotal + l.valor);
    switch (l.situacao) {
      case "em_aberto": case "paga_parcialmente": mais(r.emAberto, l.saldoEmAberto || l.valor); break;
      case "paga": mais(r.pagas, l.valor); break;
      case "reembolso": mais(r.reembolsos, l.valor); break;
      case "quitada_por_terceiro": mais(r.quitadasPorTerceiros, l.valor); break;
      case "cancelada": mais(r.canceladas, l.valor); break;
    }
  }
  return r;
}

export const CABECALHO_DO_EXTRATO = [
  "Data", "Fornecedor", "Documento", "Descrição", "Categoria", "Centro de custo", "Projeto", "Valor", "Situação", "Responsável pela quitação", "Intenção", "Dias em atraso",
] as const;

const dataBr = (ymd: string) => (ymd ? `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}` : "");
export const dataDoExtrato = dataBr;

/** CSV em `;` (Excel brasileiro), com BOM; valores com ponto decimal, como os demais CSVs do sistema. */
export function gerarCSVDoExtrato(linhas: LinhaDoExtrato[], resumo: ResumoDoExtrato, filtros: string[]): string {
  const cel = (v: string | number) => {
    const s = String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const f = (n: number) => n.toFixed(2);
  const out: string[] = [];
  out.push(CABECALHO_DO_EXTRATO.join(";"));
  for (const l of linhas) {
    out.push([
      dataBr(l.data), l.fornecedor, l.documento, l.descricao, l.categoria, l.centro, l.projeto, f(l.valor), ROTULO_SITUACAO[l.situacao], l.responsavel, l.intencao,
      l.diasEmAtraso === null ? "" : String(l.diasEmAtraso),
    ].map(cel).join(";"));
  }
  out.push("");
  out.push(["RESUMO", "Quantidade", "Valor"].join(";"));
  const parte = (nome: string, p: ParteDoResumo) => out.push([nome, p.quantidade, f(p.valor)].map(cel).join(";"));
  out.push(["Total (valor sem canceladas)", resumo.quantidade, f(resumo.valorTotal)].map(cel).join(";"));
  parte("Em aberto", resumo.emAberto); parte("Pagas", resumo.pagas); parte("Reembolsos", resumo.reembolsos);
  parte("Quitadas por terceiros", resumo.quitadasPorTerceiros); parte("Canceladas", resumo.canceladas);
  if (filtros.length > 0) { out.push(""); out.push(cel(`Filtros: ${filtros.join(" · ")}`)); }
  return "﻿" + out.join("\r\n");
}
