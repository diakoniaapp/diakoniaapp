import { supabase } from "@/integrations/supabase/client";

export type Periodicidade = "mensal" | "trimestral" | "anual" | "extraordinaria";
export type StatusReuniao = "agendada" | "em_andamento" | "realizada" | "cancelada";

export interface ReuniaoFinanceira {
  id: string;
  titulo: string;
  periodicidade: Periodicidade;
  competencia_inicio: string;
  competencia_fim: string;
  data_reuniao: string;
  local: string | null;
  reuniao_gov_id: string | null;
  status: StatusReuniao;
  pauta_jsonb: PautaFinanceira | null;
  ata: string | null;
  total_entradas_periodo: number | null;
  total_saidas_periodo: number | null;
  saldo_final: number | null;
}

export interface PautaFinanceira {
  periodo: { inicio: string; fim: string };
  resumo: { entradas: number; saidas: number; saldo_periodo: number };
  contas_a_pagar: {
    total: number; qtd: number;
    lista: Array<{ id: string; descricao: string; valor: number; vencimento: string; categoria: string | null }>;
  };
  nao_conciliados: {
    total: number;
    lista: Array<{ id: string; descricao: string; valor: number; data: string }>;
  };
  top_centros_custo: Array<{ nome: string; total: number }>;
  alertas_fiscais: Array<{ codigo: string; vencimento: string; status: string; valor_pago: number | null }>;
  orcamento_estourado: Array<{ centro: string; orcado: number; realizado: number; percentual: number }>;
  gerada_em: string;
}

export interface DecisaoReuniao {
  id: string;
  reuniao_id: string;
  descricao: string;
  responsavel_id: string | null;
  responsavel_nome: string | null;
  prazo: string | null;
  assunto_id: string | null;
  status: "aberta" | "em_andamento" | "concluida" | "cancelada";
}

export async function listarReunioes(): Promise<ReuniaoFinanceira[]> {
  const { data, error } = await supabase
    .from("fin_reunioes_financeiras")
    .select("*")
    .order("data_reuniao", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as ReuniaoFinanceira[];
}

export async function carregarReuniao(id: string): Promise<ReuniaoFinanceira | null> {
  const { data, error } = await supabase
    .from("fin_reunioes_financeiras")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as ReuniaoFinanceira | null;
}

export async function criarReuniao(input: Partial<ReuniaoFinanceira>): Promise<ReuniaoFinanceira> {
  const { data, error } = await supabase
    .from("fin_reunioes_financeiras")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as ReuniaoFinanceira;
}

export async function atualizarReuniao(id: string, patch: Partial<ReuniaoFinanceira>): Promise<void> {
  const { error } = await supabase
    .from("fin_reunioes_financeiras")
    .update({ ...patch, atualizado_em: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function excluirReuniao(id: string): Promise<void> {
  const { error } = await supabase
    .from("fin_reunioes_financeiras")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

/** Gera pauta automática pelo período. Retorna o JSON pronto. */
export async function gerarPautaAutomatica(inicio: string, fim: string): Promise<PautaFinanceira> {
  const { data, error } = await supabase.rpc("montar_pauta_financeira", {
    p_competencia_inicio: inicio,
    p_competencia_fim: fim,
  });
  if (error) throw error;
  return data as PautaFinanceira;
}

/** Atalho: gera a pauta E salva como snapshot na reunião. */
export async function gerarESalvarPauta(reuniaoId: string, inicio: string, fim: string): Promise<PautaFinanceira> {
  const pauta = await gerarPautaAutomatica(inicio, fim);
  await atualizarReuniao(reuniaoId, {
    pauta_jsonb: pauta,
    total_entradas_periodo: pauta.resumo.entradas,
    total_saidas_periodo: pauta.resumo.saidas,
    saldo_final: pauta.resumo.saldo_periodo,
  });
  return pauta;
}

// ─── Decisões ─────────────────────────────────────────────────────────
export async function listarDecisoes(reuniaoId: string): Promise<DecisaoReuniao[]> {
  const { data, error } = await supabase
    .from("fin_decisoes_reuniao")
    .select("*")
    .eq("reuniao_id", reuniaoId)
    .order("criada_em");
  if (error) throw error;
  return (data ?? []) as DecisaoReuniao[];
}

export async function adicionarDecisao(input: Partial<DecisaoReuniao>): Promise<DecisaoReuniao> {
  const { data, error } = await supabase
    .from("fin_decisoes_reuniao")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as DecisaoReuniao;
}

export async function atualizarDecisao(id: string, patch: Partial<DecisaoReuniao>): Promise<void> {
  const { error } = await supabase
    .from("fin_decisoes_reuniao")
    .update(patch)
    .eq("id", id);
  if (error) throw error;
}

export async function excluirDecisao(id: string): Promise<void> {
  const { error } = await supabase
    .from("fin_decisoes_reuniao")
    .delete()
    .eq("id", id);
  if (error) throw error;
}
