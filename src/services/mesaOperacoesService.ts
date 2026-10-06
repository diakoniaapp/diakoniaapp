// ─── mesaOperacoesService.ts — os dados da "mesa do tesoureiro" (aba 1 Operações) ───
//
// As regras (o que é conta a pagar, o que é débito automático, o checklist) estão em
// `lib/mesaOperacoes.ts` e `lib/formaLiquidacao.ts`. Aqui ficam só as idas ao banco.
//
// Cada parte falha SOZINHA (`erros` diz qual): uma consulta que quebra — a cobertura documental,
// ou a coluna `forma_liquidacao` antes da migration 20261006120000 — não derruba a mesa inteira.

import { supabase } from "@/integrations/supabase/client";
import { daquiADias } from "@/lib/data";
import { limitesDoMes } from "@/lib/fechamentoMensal";
import type { DebitoItem } from "@/lib/formaLiquidacao";
import {
  enriquecerLancamentos, listarContas, listarProximosVencimentos,
  type FinConta, type FinLancamento, type FinVencimento,
} from "@/services/finService";
import { documentacaoDoMes, type ResumoDocumentacao } from "@/services/fechamentoMensalService";

const PAGINA = 1000;
const LOTE = 150;
/** Quantos dias para trás um pagamento ainda "pede" comprovante na rotina diária. */
export const DIAS_DE_COMPROVANTE = 7;
/** Até que dia do mês o mês ANTERIOR ainda conta como "em fechamento" (malote contábil). */
export const DIA_LIMITE_DO_MALOTE = 20;
const NOME_MES = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
/** Horizonte da lista de contas a pagar. */
export const DIAS_DA_MESA = 30;

export interface PagoRecente {
  id: string;
  dia: string;
  valor: number;
  descricao: string;
  fornecedor: string;
  contaNome: string;
  temComprovante: boolean;
}

export interface DebitoDoMes extends DebitoItem {
  contaNome: string;
  variavel: boolean;
}

export interface DadosDaMesa {
  vencimentos: FinVencimento[];
  /** ids de vencimentos que já têm algum documento anexado. */
  comAnexo: Set<string>;
  contas: FinConta[];
  /** Último dia com movimento lançado numa conta de banco. */
  ultimoMovimentoBanco: string | null;
  recorrenciasAtivas: number;
  debitos: DebitoDoMes[];
  /** Migration 20261006120000 ainda não aplicada: não há como separar débito automático. */
  debitosIndisponiveis: boolean;
  pagosRecentes: PagoRecente[];
  documentos: ResumoDocumentacao | null;
  /** O mês anterior, enquanto o malote dele ainda está aberto (até o dia 20). */
  documentosAnterior: { rotulo: string; resumo: ResumoDocumentacao } | null;
  erros: string[];
}

const emLotes = <T,>(xs: T[], n: number): T[][] => {
  const r: T[][] = [];
  for (let i = 0; i < xs.length; i += n) r.push(xs.slice(i, i + n));
  return r;
};

async function idsComAnexo(ids: string[]): Promise<Set<string>> {
  const set = new Set<string>();
  for (const parte of emLotes(ids, LOTE)) {
    const { data, error } = await supabase.from("fin_lancamento_anexos").select("lancamento_id").in("lancamento_id", parte);
    if (error) throw error;
    for (const a of data ?? []) set.add(a.lancamento_id);
  }
  return set;
}

async function pagosDesde(desde: string): Promise<PagoRecente[]> {
  const brutos: FinLancamento[] = [];
  for (let p = 0; ; p++) {
    const { data, error } = await supabase.from("fin_lancamentos").select("*")
      .eq("tipo", "saida").in("status", ["realizado", "conciliado"]).neq("origem", "transferencia")
      .or(`data_pagamento.gte.${desde},and(data_pagamento.is.null,data.gte.${desde})`)
      .order("data").order("id").range(p * PAGINA, p * PAGINA + PAGINA - 1);
    if (error) throw error;
    brutos.push(...((data ?? []) as unknown as FinLancamento[]));
    if ((data ?? []).length < PAGINA) break;
  }
  const comAnexo = await idsComAnexo(brutos.filter(l => !l.comprovante_url).map(l => l.id));
  const ext = await enriquecerLancamentos(brutos);
  return ext.map(l => ({
    id: l.id, dia: l.data_pagamento || l.data, valor: Number(l.valor),
    descricao: l.descricao ?? "", fornecedor: l.fornecedor_nome ?? l.pessoa_nome ?? "", contaNome: l.conta_nome ?? "",
    temComprovante: !!l.comprovante_url || comAnexo.has(l.id),
  }));
}

async function debitosDoMes(ini: string, fim: string): Promise<DebitoDoMes[]> {
  const { data, error } = await supabase.from("fin_lancamentos").select("*")
    .eq("tipo", "saida").in("status", ["previsto", "realizado", "conciliado"])
    .neq("forma_liquidacao", "manual").gte("data", ini).lte("data", fim)
    .order("data").order("id").limit(PAGINA);
  if (error) throw error;
  const ext = await enriquecerLancamentos((data ?? []) as unknown as FinLancamento[]);
  return ext.map(l => ({
    id: l.id, data: l.data, dataPagamento: l.data_pagamento, valor: Number(l.valor), status: l.status,
    descricao: l.descricao, fornecedor: l.fornecedor_nome ?? null, contaNome: l.conta_nome ?? "",
    variavel: !!l.valor_variavel,
  }));
}

/** Coluna inexistente (migration pendente) → o PostgREST responde 42703 / "does not exist". */
const colunaAusente = (e: unknown): boolean => {
  const m = e as { code?: string; message?: string } | null;
  return !!m && (m.code === "42703" || m.code === "PGRST204" || /forma_liquidacao|does not exist/i.test(m.message ?? ""));
};

export async function carregarMesa(hoje: string): Promise<DadosDaMesa> {
  const erros: string[] = [];
  const { ini, fim } = limitesDoMes(Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7)));
  const guardar = async <T,>(nome: string, p: Promise<T>, padrao: T): Promise<T> => {
    try { return await p; } catch (e) { erros.push(`${nome}: ${(e as Error)?.message ?? "erro"}`); return padrao; }
  };

  let debitosIndisponiveis = false;
  const [vencimentos, contas, recorrenciasAtivas, pagosRecentes, debitos, documentos] = await Promise.all([
    guardar("vencimentos", listarProximosVencimentos({ ateData: daquiADias(hoje, DIAS_DA_MESA), tipo: "saida" }), [] as FinVencimento[]),
    guardar("contas", listarContas(), [] as FinConta[]),
    guardar("recorrências", (async () => {
      const { count, error } = await supabase.from("fin_recorrencias").select("id", { count: "exact", head: true }).eq("ativo", true);
      if (error) throw error;
      return count ?? 0;
    })(), 0),
    guardar("pagamentos recentes", pagosDesde(daquiADias(hoje, -DIAS_DE_COMPROVANTE)), [] as PagoRecente[]),
    debitosDoMes(ini, fim).catch(e => {
      if (colunaAusente(e)) debitosIndisponiveis = true; else erros.push(`débitos automáticos: ${(e as Error)?.message ?? "erro"}`);
      return [] as DebitoDoMes[];
    }),
    guardar("documentação", documentacaoDoMes(Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7))), null as ResumoDocumentacao | null),
  ]);

  // o mês anterior só importa enquanto o malote contábil dele não foi fechado
  const anoAnt = Number(hoje.slice(5, 7)) === 1 ? Number(hoje.slice(0, 4)) - 1 : Number(hoje.slice(0, 4));
  const mesAnt = Number(hoje.slice(5, 7)) === 1 ? 12 : Number(hoje.slice(5, 7)) - 1;
  const resumoAnterior = Number(hoje.slice(8, 10)) <= DIA_LIMITE_DO_MALOTE
    ? await guardar("documentação do mês anterior", documentacaoDoMes(anoAnt, mesAnt), null as ResumoDocumentacao | null)
    : null;
  const documentosAnterior = resumoAnterior
    ? { rotulo: `${NOME_MES[mesAnt]}/${anoAnt}`, resumo: resumoAnterior } : null;

  const comAnexo = await guardar("anexos dos vencimentos", idsComAnexo(vencimentos.map(v => v.id)), new Set<string>());

  const bancos = contas.filter(c => c.tipo === "banco").map(c => c.id);
  const ultimoMovimentoBanco = bancos.length === 0 ? null : await guardar("último movimento do banco", (async () => {
    const { data, error } = await supabase.from("fin_lancamentos").select("data, data_pagamento")
      .in("conta_id", bancos).in("status", ["realizado", "conciliado"])
      .order("data", { ascending: false }).limit(1);
    if (error) throw error;
    const l = data?.[0];
    return l ? String(l.data_pagamento ?? l.data).slice(0, 10) : null;
  })(), null as string | null);

  return {
    vencimentos, comAnexo, contas, ultimoMovimentoBanco, recorrenciasAtivas,
    debitos, debitosIndisponiveis, pagosRecentes, documentos, documentosAnterior, erros,
  };
}
