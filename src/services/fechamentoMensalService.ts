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
    // só o vínculo REAL; usar a descrição aqui apresentava um texto livre como se fosse o fornecedor
    fornecedor: l.fornecedor_nome ?? l.pessoa_nome ?? "",
    descricao: l.descricao ?? "",
    categoriaNome: l.categoria_nome ?? "",
    texto: `${l.descricao ?? ""} ${l.observacoes ?? ""}`,
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
  /** quantas despesas "Prontas para Malote" este envio capturou (D6; 0/ausente nos envios de antes) */
  despesas?: number;
}

const COLUNAS_DO_ENVIO = "id, ano, mes, enviado_em, dossies, pendencias_documentos";

/** Tabela ainda não criada (migration não aplicada): PostgREST devolve 42P01 / PGRST205. */
function tabelaInexistente(e: { code?: string; message?: string } | null): boolean {
  return !!e && (e.code === "42P01" || e.code === "PGRST205" || /could not find the table|does not exist/i.test(e.message ?? ""));
}

export interface EstadoDoEnvio { envio: EnvioMalote | null; indisponivel: boolean }

export async function ultimoEnvio(ano: number, mes: number): Promise<EstadoDoEnvio> {
  // `despesas` existe depois da migration 20261013130000; antes dela a leitura recua para as colunas de sempre
  let { data, error } = await supabase.from("fin_malote_envios").select(`${COLUNAS_DO_ENVIO}, despesas` as never)
    .eq("ano", ano).eq("mes", mes).order("enviado_em", { ascending: false }).limit(1) as unknown as { data: unknown[] | null; error: { code?: string; message?: string } | null };
  if (error && /despesas/.test(error.message ?? "")) {
    ({ data, error } = await supabase.from("fin_malote_envios").select(COLUNAS_DO_ENVIO)
      .eq("ano", ano).eq("mes", mes).order("enviado_em", { ascending: false }).limit(1) as unknown as { data: unknown[] | null; error: { code?: string; message?: string } | null });
  }
  if (error) {
    if (tabelaInexistente(error)) return { envio: null, indisponivel: true };
    throw error;
  }
  return { envio: (data?.[0] as EnvioMalote | undefined) ?? null, indisponivel: false };
}

/**
 * ENVIAR o malote do mês (D6): registra o envio E captura, por lote, todas as despesas que estão "Prontas para Malote" neste instante — elas ficam ENVIADAS
 * (congeladas: valor, data, categoria, centro e favorecido só mudam com a reabertura). Antes da migration 20261013130000 a função não existe e o registro
 * segue como sempre (só o envio do mês, sem capturar despesas).
 */
export async function registrarEnvio(ano: number, mes: number, resumo: { dossies: number; pendencias: number }): Promise<EnvioMalote> {
  const rpc = await supabase.rpc("fin_enviar_malote" as never, { p_ano: ano, p_mes: mes, p_dossies: resumo.dossies, p_pendencias: resumo.pendencias, p_observacao: null } as never);
  if (!rpc.error) {
    const { data } = await supabase.from("fin_malote_envios").select(`${COLUNAS_DO_ENVIO}, despesas` as never).eq("id", rpc.data as never).limit(1) as unknown as { data: EnvioMalote[] | null };
    if (data && data[0]) return data[0];
    return { id: String(rpc.data), ano, mes, enviado_em: new Date().toISOString(), dossies: resumo.dossies, pendencias_documentos: resumo.pendencias };
  }
  if (!/could not find the function|schema cache|PGRST202/i.test(`${rpc.error.message} ${rpc.error.code}`)) throw new Error(rpc.error.message);
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

// ── reabrir (D6): só Administrador e Tesouraria, com motivo; o banco confere o papel e guarda o rastro ──

/** Reabre UMA despesa enviada. O banco recusa quem não é admin/tesouraria, motivo curto e despesa Arquivada (reabra o período antes). */
export async function reabrirDespesaEnviada(lancamentoId: string, motivo: string): Promise<void> {
  const { error } = await supabase.rpc("fin_reabrir_despesa_enviada" as never, { p_lancamento: lancamentoId, p_motivo: motivo } as never);
  if (error) throw new Error(mensagemDaReabertura(error.message));
}

/** Reabre TODAS as despesas ativas de um envio. Devolve quantas. */
export async function reabrirEnvio(envioId: string, motivo: string): Promise<number> {
  const { data, error } = await supabase.rpc("fin_reabrir_envio" as never, { p_envio: envioId, p_motivo: motivo } as never);
  if (error) throw new Error(mensagemDaReabertura(error.message));
  return Number(data ?? 0);
}

function mensagemDaReabertura(m: string): string {
  if (/could not find the function|schema cache/i.test(m)) return "Falta aplicar a migration 20261013130000 (Enviada e Arquivada) no banco.";
  return m;
}
