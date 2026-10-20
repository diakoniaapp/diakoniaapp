// ─── extratoDeObrigacoes — "Extrato de Obrigações": todas as obrigações do período, pagas ou não, pela igreja ou por terceiros ─────────────────────────
// Regras puras (sem banco, sem React). Uma OBRIGAÇÃO é uma despesa (saída, que não é transferência) e pode ter mais de uma linha em `fin_lancamentos`: no pagamento parcial a raiz vira
// "realizada" e nasce uma parcela `previsto` com o saldo (mesma `obrigacao_id`). Aqui as linhas do grupo viram UMA linha do extrato.
// A "Situação" é a pergunta que o relatório responde: a obrigação está em aberto, foi paga pela igreja, é um reembolso, foi quitada por um terceiro ou foi cancelada?
import { documentacaoDaSaida, type SituacaoDocumental } from "@/lib/documentacaoExigida";
import { CONTA_NAO_APLICAVEL_ID, ROTULO_INTENCAO, ROTULO_RESPONSAVEL, ehTerceiro, type Intencao, type ResponsavelTipo } from "@/lib/quitacao";

export type SituacaoDaObrigacao = "em_aberto" | "paga_parcialmente" | "paga" | "reembolso" | "quitada_por_terceiro" | "cancelada";

export const ROTULO_SITUACAO: Record<SituacaoDaObrigacao, string> = {
  em_aberto: "Em aberto", paga_parcialmente: "Paga parcialmente", paga: "Paga", reembolso: "Reembolso", quitada_por_terceiro: "Quitada por terceiro", cancelada: "Cancelada",
};

/**
 * O filtro "Situação" da tela (redesenho de 20/10/2026).
 *   · "Em aberto" = obrigações em aberto + pagas parcialmente + REEMBOLSOS A PAGAR — para a Tesouraria o reembolso pendente continua sendo dívida da igreja;
 *   · "Pagas" = pagas pela igreja + reembolsos já pagos;
 *   · "Reembolsos" (todos) mantém a consulta específica, com as duas metades logo abaixo: a pagar e pagos.
 */
export type FiltroDeSituacao = "todas" | "em_aberto" | "paga" | "reembolso" | "reembolso_a_pagar" | "reembolso_pago" | "quitada_por_terceiro" | "cancelada";
export const OPCOES_DE_SITUACAO: { valor: FiltroDeSituacao; rotulo: string }[] = [
  { valor: "todas", rotulo: "Todas" }, { valor: "em_aberto", rotulo: "Em aberto (inclui reembolsos a pagar)" }, { valor: "paga", rotulo: "Pagas" },
  { valor: "reembolso", rotulo: "Apenas reembolsos" }, { valor: "reembolso_a_pagar", rotulo: "   Reembolsos a pagar" }, { valor: "reembolso_pago", rotulo: "   Reembolsos pagos" },
  { valor: "quitada_por_terceiro", rotulo: "Quitadas por terceiros" }, { valor: "cancelada", rotulo: "Canceladas" },
];

/** O selo de cada situação: cor + forma + palavra (legível até em papel preto-e-branco; nada de emoji, que muda de computador para computador). */
export type ChaveDoSelo = "pago" | "aberto" | "reembolso_a_pagar" | "reembolso_pago" | "terceiro" | "cancelada";
export interface SeloDaSituacao { chave: ChaveDoSelo; glifo: string; rotulo: string }
export function seloDaSituacao(l: { situacao: SituacaoDaObrigacao; reembolsoAPagar: boolean }): SeloDaSituacao {
  switch (l.situacao) {
    case "paga": return { chave: "pago", glifo: "✓", rotulo: "Paga" };
    case "em_aberto": return { chave: "aberto", glifo: "!", rotulo: "Em aberto" };
    case "paga_parcialmente": return { chave: "aberto", glifo: "!", rotulo: "Paga parcialmente" };
    case "reembolso": return l.reembolsoAPagar ? { chave: "reembolso_a_pagar", glifo: "↺", rotulo: "Reembolso a pagar" } : { chave: "reembolso_pago", glifo: "↺", rotulo: "Reembolso pago" };
    case "quitada_por_terceiro": return { chave: "terceiro", glifo: "◆", rotulo: "Quitada por terceiro" };
    case "cancelada": return { chave: "cancelada", glifo: "✕", rotulo: "Cancelada" };
  }
}

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
  conta_id?: string | null;
  observacoes?: string | null;
}

/** A quitação registrada para a obrigação (`vw_fin_quitacao`), quando existe. `resultado` e `fila` dizem se o reembolso JÁ foi pago ou se a igreja ainda deve. */
export interface QuitacaoDoExtrato { responsavel: ResponsavelTipo; responsavelNome: string | null; intencao: Intencao; resultado?: string | null; fila?: string | null; saldoAReembolsar?: number | null; grau?: string | null }

export interface NomesDoExtrato {
  fornecedores: Map<string, string>; pessoas: Map<string, string>; categorias: Map<string, string>; centros: Map<string, string>; projetos: Map<string, string>;
  /** id da conta financeira → nome (a conta estrutural das compras pagas por terceiros entra como "Sem conta financeira") */
  contas?: Map<string, string>;
  /** id da conta → tipo (`banco`, `caixa`, `cartao`…): só o banco emite comprovante, e a regra de documentação precisa saber */
  contaTipos?: Map<string, string>;
}

/** O nome que o extrato dá à conta estrutural das compras pagas por terceiros: ela não é conta financeira. */
export const ROTULO_SEM_CONTA = "Sem conta financeira";

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
  /** A linha de `fin_lancamentos` que está em aberto (a que se edita e se paga): a mais antiga entre as `previsto`. Nula quando nada falta pagar. Num pagamento parcial NÃO é a raiz da obrigação. */
  idEmAberto: string | null;
  /** Reembolso que a igreja ainda deve à pessoa que pagou (o reembolso pago continua `reembolso`, mas sem esta marca). */
  reembolsoAPagar: boolean;
  saldoAReembolsar: number | null;
  /** a conta financeira da obrigação ("" quando não se sabe) e o seu id */
  contaId: string;
  conta: string;
  observacoes: string;
  /** quantos documentos estão anexados à obrigação (todas as parcelas) */
  anexos: number;
  /** a situação documental pela regra ÚNICA (`lib/documentacaoExigida.ts`): sem documentos / parcial / completa / dispensa. Nula quando não se sabe (anexos não lidos) ou a obrigação está cancelada. */
  documentacao: SituacaoDocumental | null;
  /** grau de prova da quitação ("Formal", "Relatado", "Nenhum"); nulo sem quitação */
  grau: string | null;
}

/** O que o tesoureiro pode fazer a partir da linha do extrato — uma regra só, para a tela e para os testes. */
export interface AcoesDaObrigacao {
  visualizar: boolean;
  editar: boolean;
  /** "normal": o Pagar de sempre · "reembolso": o pagamento do reembolso à pessoa · null: a igreja não paga (já foi paga, é de terceiro, ou foi cancelada) */
  pagar: "normal" | "reembolso" | null;
  corrigirQuitacao: boolean;
  /** o painel com todos os documentos da obrigação: vale para qualquer situação (e é o centro da decisão nas de terceiro) */
  documentacao: boolean;
}

/**
 * Comportamento por situação (pedido de 20/10/2026):
 *   Em aberto / Atrasada (atraso é indicador, não estado) → Editar + Pagar agora · Paga → Visualizar · Cancelada → Visualizar ·
 *   Quitada por terceiro → Visualizar + Corrigir quitação (a igreja NÃO paga) · Reembolso a pagar → Pagar agora abre o pagamento do REEMBOLSO; reembolso já pago → só Visualizar + Corrigir quitação.
 * Editar e pagar precisam de uma linha em aberto (`idEmAberto`): sem ela não há o que corrigir nem pagar.
 */
export function acoesDaObrigacao(l: Pick<LinhaDoExtrato, "situacao" | "idEmAberto" | "reembolsoAPagar">): AcoesDaObrigacao {
  switch (l.situacao) {
    case "em_aberto": case "paga_parcialmente":
      return { visualizar: true, editar: !!l.idEmAberto, pagar: l.idEmAberto ? "normal" : null, corrigirQuitacao: false, documentacao: true };
    case "reembolso":
      return { visualizar: true, editar: false, pagar: l.reembolsoAPagar ? "reembolso" : null, corrigirQuitacao: true, documentacao: true };
    case "quitada_por_terceiro":
      return { visualizar: true, editar: false, pagar: null, corrigirQuitacao: true, documentacao: true };
    case "paga": case "cancelada":
      return { visualizar: true, editar: false, pagar: null, corrigirQuitacao: false, documentacao: true };
  }
}

const PAGAS = ["realizado", "conciliado", "quitado_terceiro"];

/** As observações guardam marcas técnicas de importação — `[ofx:ABC123]`, `[ofx-sfx:x9]` — que não dizem nada a quem lê o extrato: saem, e o que sobra é a observação de verdade. */
export function observacaoLegivel(texto: string | null | undefined): string {
  return String(texto ?? "").replace(/\[[a-z][a-z0-9_-]*:[^\]]*\]/gi, " ").replace(/\s{2,}/g, " ").trim();
}
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
  /** documentos anexados por obrigação (chave = id da raiz); sem o mapa, 0 */
  anexos?: Map<string, number>;
  /** os TIPOS de anexo de cada obrigação (todas as parcelas, comprovante incluído); sem o mapa, a situação documental fica nula */
  tiposDeAnexo?: Map<string, string[]>;
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
    const idEmAberto = [...abertas].sort((a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id))[0]?.id ?? null;
    const reembolsoAPagar = situacao === "reembolso" && !!q && (q.fila === "reembolso_a_pagar" || q.resultado === "divida_com_terceiro");
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
      idEmAberto,
      reembolsoAPagar,
      saldoAReembolsar: reembolsoAPagar ? (q?.saldoAReembolsar ?? null) : null,
      contaId: raiz.conta_id ?? "",
      conta: raiz.conta_id ? (raiz.conta_id === CONTA_NAO_APLICAVEL_ID ? ROTULO_SEM_CONTA : nomes.contas?.get(raiz.conta_id) ?? "") : "",
      observacoes: observacaoLegivel(raiz.observacoes),
      anexos: entrada.anexos?.get(chave) ?? 0,
      documentacao: situacao === "cancelada" || !entrada.tiposDeAnexo ? null : documentacaoDaSaida({
        categoriaNome: (raiz.categoria_id && nomes.categorias.get(raiz.categoria_id)) || "", contaTipo: raiz.conta_id ? nomes.contaTipos?.get(raiz.conta_id) ?? null : null,
        // a obrigação ainda não paga (ou só em parte) não tem comprovante a exigir; o reembolso a pagar é "previsto" (o PIX só existe depois)
        status: situacao === "quitada_por_terceiro" ? "quitado_terceiro" : situacao === "paga" || (situacao === "reembolso" && !reembolsoAPagar) ? "conciliado" : "previsto",
        tipos: entrada.tiposDeAnexo.get(chave) ?? [], intencao: q?.intencao ?? null, terceiroQuitou: !!q && ehTerceiro(q.responsavel),
        temCategoria: !!raiz.categoria_id, temCentro: !!raiz.centro_custo_id, documentoNumero: raiz.documento_numero,
      }).situacao,
      grau: q?.grau ?? null,
    });
  }
  return saida.sort((a, b) => a.data.localeCompare(b.data) || a.fornecedor.localeCompare(b.fornecedor, "pt-BR") || a.descricao.localeCompare(b.descricao, "pt-BR"));
}

/** O reembolso que a igreja ainda deve conta como "em aberto" (é dívida dela com a pessoa que pagou). */
const estaEmAberto = (l: Pick<LinhaDoExtrato, "situacao" | "reembolsoAPagar">) => l.situacao === "em_aberto" || l.situacao === "paga_parcialmente" || (l.situacao === "reembolso" && l.reembolsoAPagar);
const estaPaga = (l: Pick<LinhaDoExtrato, "situacao" | "reembolsoAPagar">) => l.situacao === "paga" || (l.situacao === "reembolso" && !l.reembolsoAPagar);

export function filtrarPorSituacao(linhas: LinhaDoExtrato[], filtro: FiltroDeSituacao): LinhaDoExtrato[] {
  switch (filtro) {
    case "todas": return linhas;
    case "em_aberto": return linhas.filter(estaEmAberto);
    case "paga": return linhas.filter(estaPaga);
    case "reembolso": return linhas.filter(l => l.situacao === "reembolso");
    case "reembolso_a_pagar": return linhas.filter(l => l.situacao === "reembolso" && l.reembolsoAPagar);
    case "reembolso_pago": return linhas.filter(l => l.situacao === "reembolso" && !l.reembolsoAPagar);
    default: return linhas.filter(l => l.situacao === filtro);
  }
}

/** Filtro de CONTA: "" = todas; o id da conta estrutural das compras pagas por terceiros = "Sem conta financeira". */
export function filtrarPorConta(linhas: LinhaDoExtrato[], contaId: string): LinhaDoExtrato[] {
  return contaId ? linhas.filter(l => l.contaId === contaId) : linhas;
}
/** Quantas obrigações cada conta tem nas linhas dadas (para o número ao lado de cada opção do filtro). */
export function contagemPorConta(linhas: LinhaDoExtrato[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of linhas) m.set(l.contaId, (m.get(l.contaId) ?? 0) + 1);
  return m;
}

export interface ParteDoResumo { quantidade: number; valor: number }
export interface ResumoDoExtrato {
  quantidade: number;
  /** soma das obrigações vigentes: as canceladas não entram no valor (entram na quantidade) */
  valorTotal: number;
  /** pagas pela igreja + reembolsos já pagos */
  pagas: ParteDoResumo;
  /** o que ainda falta pagar: em aberto + parciais (saldo) + reembolsos a pagar (saldo) */
  emAberto: ParteDoResumo;
  /** das em aberto, as que já passaram do vencimento (atraso é indicador dentro de "em aberto", não um estado) */
  vencidas: ParteDoResumo;
  /** dentro das em aberto: o que a igreja deve a quem pagou por ela */
  reembolsosPendentes: ParteDoResumo;
  quitadasPorTerceiros: ParteDoResumo;
  canceladas: ParteDoResumo;
}

export function resumoDoExtrato(linhas: LinhaDoExtrato[]): ResumoDoExtrato {
  const zero = (): ParteDoResumo => ({ quantidade: 0, valor: 0 });
  const r: ResumoDoExtrato = { quantidade: linhas.length, valorTotal: 0, pagas: zero(), emAberto: zero(), vencidas: zero(), reembolsosPendentes: zero(), quitadasPorTerceiros: zero(), canceladas: zero() };
  const mais = (p: ParteDoResumo, v: number) => { p.quantidade += 1; p.valor = c2(p.valor + v); };
  for (const l of linhas) {
    if (l.situacao !== "cancelada") r.valorTotal = c2(r.valorTotal + l.valor);
    if (estaEmAberto(l)) {
      const devido = l.situacao === "reembolso" ? (l.saldoAReembolsar ?? l.saldoEmAberto ?? l.valor) : (l.saldoEmAberto || l.valor);
      mais(r.emAberto, devido);
      if (l.diasEmAtraso) mais(r.vencidas, devido);
      if (l.situacao === "reembolso") mais(r.reembolsosPendentes, devido);
    } else if (estaPaga(l)) mais(r.pagas, l.valor);
    else if (l.situacao === "quitada_por_terceiro") mais(r.quitadasPorTerceiros, l.valor);
    else if (l.situacao === "cancelada") mais(r.canceladas, l.valor);
  }
  return r;
}

/** Um dia do extrato (por VENCIMENTO — o extrato é de obrigações, não de pagamentos) com o seu fechamento. */
export interface DiaDoExtrato {
  data: string;
  linhas: LinhaDoExtrato[];
  /** soma do dia, sem as canceladas */
  total: number;
  /** do total, o que ainda falta pagar (o restante está pago, reembolsado ou quitado por terceiro) */
  emAberto: number;
}
export function agruparPorDia(linhas: LinhaDoExtrato[]): DiaDoExtrato[] {
  const dias = new Map<string, DiaDoExtrato>();
  for (const l of linhas) {
    const d = dias.get(l.data) ?? { data: l.data, linhas: [], total: 0, emAberto: 0 };
    d.linhas.push(l);
    if (l.situacao !== "cancelada") d.total = c2(d.total + l.valor);
    if (estaEmAberto(l)) d.emAberto = c2(d.emAberto + (l.situacao === "reembolso" ? (l.saldoAReembolsar ?? l.valor) : (l.saldoEmAberto || l.valor)));
    dias.set(l.data, d);
  }
  return [...dias.values()].sort((a, b) => a.data.localeCompare(b.data));
}

const DIAS_DA_SEMANA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
/** "quinta-feira" de uma data AAAA-MM-DD, sem fuso. */
export function diaDaSemana(ymd: string): string {
  return DIAS_DA_SEMANA[new Date(Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)))).getUTCDay()];
}

export const CABECALHO_DO_EXTRATO = [
  "Data", "Fornecedor", "Documento", "Descrição", "Categoria", "Centro de custo", "Projeto", "Valor", "Situação", "Responsável pela quitação", "Intenção", "Dias em atraso", "Conta",
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
      dataBr(l.data), l.fornecedor, l.documento, l.descricao, l.categoria, l.centro, l.projeto, f(l.valor), seloDaSituacao(l).rotulo, l.responsavel, l.intencao,
      l.diasEmAtraso === null ? "" : String(l.diasEmAtraso), l.conta,
    ].map(cel).join(";"));
  }
  out.push("");
  out.push(["RESUMO", "Quantidade", "Valor"].join(";"));
  const parte = (nome: string, p: ParteDoResumo) => out.push([nome, p.quantidade, f(p.valor)].map(cel).join(";"));
  out.push(["Total (valor sem canceladas)", resumo.quantidade, f(resumo.valorTotal)].map(cel).join(";"));
  parte("Pagas", resumo.pagas); parte("Em aberto (inclui reembolsos a pagar)", resumo.emAberto); parte("   das quais vencidas", resumo.vencidas); parte("   dos quais reembolsos a pagar", resumo.reembolsosPendentes);
  parte("Quitadas por terceiros", resumo.quitadasPorTerceiros); parte("Canceladas", resumo.canceladas);
  if (filtros.length > 0) { out.push(""); out.push(cel(`Filtros: ${filtros.join(" · ")}`)); }
  return "﻿" + out.join("\r\n");
}
