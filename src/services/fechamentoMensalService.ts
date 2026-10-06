// ─── fechamentoMensalService.ts — os dados da aba "4 Fechamento" ───────────────
//
// A regra do que impede o malote está em `lib/fechamentoMensal.ts` (pura). Aqui ficam só
// as idas ao banco: contas e saldos, lançamentos do mês, centros, cobertura documental,
// o plano do Pacote Contábil e o registro de envio.
//
// Cada parte do checklist falha sozinha: se a cobertura documental der erro, a conciliação
// continua na tela (e o erro aparece naquela linha), em vez de a aba inteira ficar em branco.

import { supabase } from "@/integrations/supabase/client";
import { enriquecerLancamentos, type FinLancamento } from "@/services/finService";
import {
  avaliarFechamento, limitesDoMes,
  type Avaliacao, type CentroFechamento, type ContaFechamento, type LancamentoFechamento,
} from "@/lib/fechamentoMensal";
import { auditarPeriodo, prepararPacoteContabil } from "@/services/pacoteContabilService";
import { resumirAuditoria, type ResumoAuditoria } from "@/lib/pacoteContabil";
import { percentualCobertura } from "@/lib/documentos/cobertura";

const PAGINA = 1000;
const FIM_DOS_TEMPOS = "2999-01-01";

// ── a base da avaliação ─────────────────────────────────────────────────────

async function carregarContas(): Promise<ContaFechamento[]> {
  const { data, error } = await supabase.from("fin_contas").select("id, nome, tipo, ativo, saldo_inicial, saldo_atual");
  if (error) throw error;
  const contas = data ?? [];
  // O movimento de todo o histórico, somado no banco (mesma soma do gatilho do saldo):
  // sem o teto de linhas do PostgREST.
  const movimentos = await Promise.all(contas.map(c =>
    supabase.rpc("fin_movimento_antes_de", { p_data_limite_exclusiva: FIM_DOS_TEMPOS, p_conta_id: c.id })));
  return contas.map((c, i) => {
    if (movimentos[i].error) throw movimentos[i].error;
    return {
      id: c.id, nome: c.nome, tipo: String(c.tipo), ativo: !!c.ativo,
      saldoInicial: Number(c.saldo_inicial ?? 0), saldoAtual: Number(c.saldo_atual ?? 0),
      movimentoTotal: Number(movimentos[i].data ?? 0),
    };
  });
}

async function carregarLancamentos(ini: string, fim: string): Promise<LancamentoFechamento[]> {
  const brutos: FinLancamento[] = [];
  for (let p = 0; ; p++) {
    const { data, error } = await supabase.from("fin_lancamentos").select("*")
      .in("status", ["realizado", "conciliado"])
      // o dia que conta é a data do pagamento, ou a data quando vazia (mesma regra do Pacote)
      .or(`and(data_pagamento.gte.${ini},data_pagamento.lte.${fim}),and(data_pagamento.is.null,data.gte.${ini},data.lte.${fim})`)
      .order("data").order("id").range(p * PAGINA, p * PAGINA + PAGINA - 1);
    if (error) throw error;
    const bloco = (data ?? []) as unknown as FinLancamento[];
    brutos.push(...bloco);
    if (bloco.length < PAGINA) break;
  }
  const ext = await enriquecerLancamentos(brutos);
  return ext.map(l => ({
    id: l.id, dia: l.data_pagamento || l.data, tipo: l.tipo === "entrada" ? "entrada" : "saida",
    status: l.status, valor: Number(l.valor), contaId: l.conta_id, contaNome: l.conta_nome ?? "",
    categoriaId: l.categoria_id ?? null, centroId: l.centro_custo_id ?? null, origem: l.origem ?? null,
    fornecedor: l.fornecedor_nome ?? l.descricao ?? "",
  }));
}

async function carregarCentros(): Promise<CentroFechamento[]> {
  const { data, error } = await supabase.from("fin_centros_custo").select("id, centro_pai_id");
  if (error) throw error;
  return (data ?? []).map(c => ({ id: c.id, paiId: c.centro_pai_id ?? null }));
}

/** Um lançamento completo (com nomes), para abrir no formulário de edição. */
export async function buscarLancamentoParaEditar(id: string) {
  const { data, error } = await supabase.from("fin_lancamentos").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return (await enriquecerLancamentos([data as unknown as FinLancamento]))[0] ?? null;
}

/** O que impede o malote — a base do checklist e do selo do menu. */
export async function avaliarMes(ano: number, mes: number): Promise<Avaliacao> {
  const { ini, fim } = limitesDoMes(ano, mes);
  const [contas, lancamentos, centros] = await Promise.all([carregarContas(), carregarLancamentos(ini, fim), carregarCentros()]);
  return avaliarFechamento(ano, mes, contas, lancamentos, centros);
}

// ── documentação e pacote (só o resumo; o trabalho é na Central) ─────────────

export interface ResumoDocumentacao {
  /** Saídas pagas que exigem documento. */
  exigem: number;
  comDocumento: number;
  /** Saídas que exigem e ainda não têm nenhum anexo. */
  pendencias: number;
  dispensam: number;
  /** 0–100, com uma casa decimal. */
  cobertura: number;
}

export function resumoDeDocumentacao(r: ResumoAuditoria): ResumoDocumentacao {
  const exigem = r.com + r.sem;
  return {
    exigem, comDocumento: r.com, pendencias: r.sem, dispensam: r.dispensa,
    cobertura: percentualCobertura(r.com, exigem),
  };
}

export async function documentacaoDoMes(ano: number, mes: number): Promise<ResumoDocumentacao> {
  const { ini, fim } = limitesDoMes(ano, mes);
  return resumoDeDocumentacao(resumirAuditoria(await auditarPeriodo(ini, fim)));
}

export interface ResumoPacote { dossies: number; pendencias: number; totalSaidas: number }

export async function pacoteDoMes(ano: number, mes: number): Promise<ResumoPacote> {
  const plano = await prepararPacoteContabil(ano, mes);
  return {
    dossies: plano.dossies.filter(d => d.caminhoZip || d.aoLado.length > 0).length,
    pendencias: plano.pendencias.length,
    totalSaidas: plano.totalSaidas,
  };
}

// ── envio à contabilidade ───────────────────────────────────────────────────

export interface EnvioMalote {
  id: string;
  ano: number;
  mes: number;
  enviado_em: string;
  dossies: number;
  pendencias_documentos: number;
}

/** Tabela ainda não criada (migration não aplicada): PostgREST devolve 42P01 / PGRST205. */
function tabelaInexistente(e: { code?: string; message?: string } | null): boolean {
  return !!e && (e.code === "42P01" || e.code === "PGRST205" || /could not find the table|does not exist/i.test(e.message ?? ""));
}

export interface EstadoDoEnvio { envio: EnvioMalote | null; indisponivel: boolean }

export async function ultimoEnvio(ano: number, mes: number): Promise<EstadoDoEnvio> {
  const { data, error } = await supabase.from("fin_malote_envios")
    .select("id, ano, mes, enviado_em, dossies, pendencias_documentos")
    .eq("ano", ano).eq("mes", mes).order("enviado_em", { ascending: false }).limit(1);
  if (error) {
    if (tabelaInexistente(error)) return { envio: null, indisponivel: true };
    throw error;
  }
  return { envio: (data?.[0] as EnvioMalote | undefined) ?? null, indisponivel: false };
}

export async function registrarEnvio(ano: number, mes: number, resumo: { dossies: number; pendencias: number }): Promise<EnvioMalote> {
  const { data, error } = await supabase.from("fin_malote_envios")
    .insert({ ano, mes, dossies: resumo.dossies, pendencias_documentos: resumo.pendencias })
    .select("id, ano, mes, enviado_em, dossies, pendencias_documentos");
  if (error) {
    if (tabelaInexistente(error)) {
      throw new Error("Falta aplicar a migration 20261003130000 (registro de envios) no banco.");
    }
    throw error;
  }
  // RLS barrando um INSERT devolve sucesso com 0 linhas (CLAUDE.md §6.1)
  if (!data || data.length === 0) throw new Error("O envio não foi gravado (sem permissão).");
  return data[0] as EnvioMalote;
}
