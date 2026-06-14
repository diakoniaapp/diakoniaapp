// ══════════════════════════════════════════════════════════════════════
// arrecadacaoService.ts — Fase 3A
//
// Service NOVO do módulo de arrecadação (substitui bazarService.ts na Fase 3).
// O bazarService.ts CONTINUA EXISTINDO durante a transição.
//
// Esta primeira onda só expõe:
//   • tipos fortemente tipados (com base no schema arr_*)
//   • CRUD básico: espaços, reservas, checklist, produtos
//
// A onda 3B traz UI; 3C traz PDV/caixa; 3D traz movimentos; 3E remove bazar.
// ══════════════════════════════════════════════════════════════════════

import { supabase } from "@/integrations/supabase/client";

// ─── Enums (refletem os enums SQL exatamente) ───────────────────────────
export type ReservaStatus =
  | "solicitada" | "aprovada" | "recusada"
  | "em_uso"    | "encerrada" | "cancelada";

export type CaixaEstado = "aberto" | "conciliando" | "fechado";

export type FormaPagamento =
  | "dinheiro" | "pix" | "debito" | "credito" | "outros";

export type ProdutoCategoria = "bazar" | "cantina_prato" | "outro";

export type MovimentoTipo =
  | "custo" | "reembolso_pessoa" | "abate_compra_cnpj"
  | "reversao_admin" | "ajuste";

export type EstoqueMovTipo =
  | "inicial" | "venda" | "ajuste" | "reabastecimento" | "perda";

// ─── Modelos (refletem o schema arr_*) ──────────────────────────────────
export interface Espaco {
  id: string;
  codigo: "BAZAR" | "CANTINA";
  nome: string;
  descricao: string | null;
  dono_ministerio_id: string;
  recomendacoes_default: string | null;
  taxa_debito_pct: number;
  taxa_credito_pct: number;
  taxa_pix_pct: number;
  ativo: boolean;
}

export interface Reserva {
  id: string;
  espaco_id: string;
  area_solicitante_id: string;
  centro_custo_id: string;
  responsavel_id: string;
  finalidade: string;
  periodo: string;           // tstzrange como string
  status: ReservaStatus;
  solicitada_por: string;
  solicitada_em: string;
  aprovada_por: string | null;
  aprovada_em: string | null;
  motivo_recusa: string | null;
  observacoes: string | null;
  arquivado_em: string | null;
  // Joined (opcional)
  espaco?: Pick<Espaco, "id" | "codigo" | "nome">;
  area?: { id: string; nome: string; ministerio_id: string };
  responsavel?: { id: string; nome_completo: string };
}

export interface ChecklistItem {
  id: string;
  reserva_id: string;
  template_id: string | null;
  item: string;
  obrigatorio: boolean;
  ordem: number;
  ok: boolean;
  ok_em: string | null;
  ok_por: string | null;
  observacao: string | null;
}

export interface Produto {
  id: string;
  espaco_id: string;
  codigo: string | null;
  nome: string;
  categoria: ProdutoCategoria;
  subcategoria: string | null;
  preco_sugerido: number;
  estoque_atual: number | null;
  estoque_minimo: number | null;
  observacao: string | null;
  ativo: boolean;
  arquivado_em: string | null;
}

export interface Caixa {
  id: string;
  reserva_id: string;
  estado: CaixaEstado;
  taxa_debito_pct: number;
  taxa_credito_pct: number;
  taxa_pix_pct: number;
  aberto_em: string;
  conciliando_desde: string | null;
  fechado_em: string | null;
  arquivado_em: string | null;
  observacao: string | null;
}

export interface CaixaResumo {
  caixa_id: string;
  reserva_id: string;
  estado: CaixaEstado;
  qtd_vendas: number;
  total_bruto: number;
  total_dinheiro: number;
  total_pix: number;
  total_debito: number;
  total_credito: number;
  total_outros: number;
  taxa_debito_calc: number;
  taxa_credito_calc: number;
  taxa_pix_calc: number;
  total_custos: number;
  total_reemb_pessoa: number;
  total_abate_cnpj: number;
  total_revertido: number;
  total_ajustes: number;
  saldo_virtual: number;
}

// ════════════════════════════════════════════════════════════════════════
// Espaços
// ════════════════════════════════════════════════════════════════════════
export async function listarEspacos(): Promise<Espaco[]> {
  const { data, error } = await supabase
    .from("arr_espacos")
    .select("*")
    .eq("ativo", true)
    .order("codigo");
  if (error) throw error;
  return (data ?? []) as Espaco[];
}

export async function carregarEspaco(id: string): Promise<Espaco | null> {
  const { data, error } = await supabase
    .from("arr_espacos").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as Espaco | null;
}

export async function atualizarTaxasEspaco(
  id: string,
  taxas: Pick<Espaco, "taxa_debito_pct" | "taxa_credito_pct" | "taxa_pix_pct">,
): Promise<void> {
  const { error } = await supabase
    .from("arr_espacos").update(taxas).eq("id", id);
  if (error) throw error;
}

// ════════════════════════════════════════════════════════════════════════
// Reservas
// ════════════════════════════════════════════════════════════════════════
export interface FiltroReserva {
  status?: ReservaStatus | ReservaStatus[];
  espaco_id?: string;
  area_id?: string;
  incluir_arquivadas?: boolean;
}

export async function listarReservas(f: FiltroReserva = {}): Promise<Reserva[]> {
  let q = supabase
    .from("arr_reservas")
    .select(`
      *,
      espaco:arr_espacos!espaco_id(id, codigo, nome),
      area:areas!area_solicitante_id(id, nome, ministerio_id),
      responsavel:membros!responsavel_id(id, nome_completo)
    `)
    .order("solicitada_em", { ascending: false })
    .limit(100);
  if (!f.incluir_arquivadas) q = q.is("arquivado_em", null);
  if (f.status) {
    q = Array.isArray(f.status) ? q.in("status", f.status) : q.eq("status", f.status);
  }
  if (f.espaco_id) q = q.eq("espaco_id", f.espaco_id);
  if (f.area_id) q = q.eq("area_solicitante_id", f.area_id);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as Reserva[];
}

export async function carregarReserva(id: string): Promise<Reserva | null> {
  const { data, error } = await supabase
    .from("arr_reservas")
    .select(`
      *,
      espaco:arr_espacos!espaco_id(id, codigo, nome),
      area:areas!area_solicitante_id(id, nome, ministerio_id),
      responsavel:membros!responsavel_id(id, nome_completo)
    `)
    .eq("id", id).maybeSingle();
  if (error) throw error;
  return data as unknown as Reserva | null;
}

export interface ReservaNova {
  espaco_id: string;
  area_solicitante_id: string;
  centro_custo_id: string;
  responsavel_id: string;
  finalidade: string;
  /** tstzrange textual: '[2026-10-26 00:00, 2026-10-26 23:59)' OR datas brasileiras */
  periodo_inicio: string;       // 'YYYY-MM-DDTHH:mm' (datetime-local)
  periodo_fim: string;
  observacoes?: string;
}

export async function solicitarReserva(input: ReservaNova): Promise<Reserva> {
  const periodo = `[${input.periodo_inicio}, ${input.periodo_fim})`;
  const { data, error } = await supabase
    .from("arr_reservas")
    .insert({
      espaco_id: input.espaco_id,
      area_solicitante_id: input.area_solicitante_id,
      centro_custo_id: input.centro_custo_id,
      responsavel_id: input.responsavel_id,
      finalidade: input.finalidade,
      periodo,
      observacoes: input.observacoes ?? null,
      solicitada_por: (await supabase.auth.getUser()).data.user!.id,
      // status default 'solicitada' já no schema
    } as any)
    .select().single();
  if (error) throw error;
  return data as Reserva;
}

export async function aprovarReserva(id: string): Promise<void> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  const { error } = await supabase
    .from("arr_reservas")
    .update({
      status: "aprovada",
      aprovada_por: userId,
      aprovada_em: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}

export async function recusarReserva(id: string, motivo: string): Promise<void> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  const { error } = await supabase
    .from("arr_reservas")
    .update({
      status: "recusada",
      motivo_recusa: motivo,
      aprovada_por: userId,
      aprovada_em: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}

export async function iniciarUso(id: string): Promise<void> {
  const { error } = await supabase
    .from("arr_reservas").update({ status: "em_uso" }).eq("id", id);
  if (error) throw error;
}

export async function arquivarReserva(id: string): Promise<void> {
  const { error } = await supabase
    .from("arr_reservas")
    .update({ arquivado_em: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

// ════════════════════════════════════════════════════════════════════════
// Checklist
// ════════════════════════════════════════════════════════════════════════
/** Após criar reserva, materializa a checklist a partir do template default. */
export async function materializarChecklist(reservaId: string, espacoId: string): Promise<void> {
  // Templates aplicáveis: válidos pra todos (NULL) OU específicos do espaço
  const { data: tpls, error } = await supabase
    .from("arr_checklist_template")
    .select("*")
    .or(`espaco_id.is.null,espaco_id.eq.${espacoId}`)
    .eq("ativo", true)
    .order("ordem");
  if (error) throw error;
  if (!tpls || tpls.length === 0) return;

  const linhas = tpls.map((t: any) => ({
    reserva_id: reservaId,
    template_id: t.id,
    item: t.item,
    obrigatorio: t.obrigatorio,
    ordem: t.ordem,
  }));
  const { error: insErr } = await supabase.from("arr_reserva_checklist").insert(linhas);
  if (insErr) throw insErr;
}

export async function listarChecklist(reservaId: string): Promise<ChecklistItem[]> {
  const { data, error } = await supabase
    .from("arr_reserva_checklist")
    .select("*")
    .eq("reserva_id", reservaId)
    .order("ordem");
  if (error) throw error;
  return (data ?? []) as ChecklistItem[];
}

export async function marcarChecklist(itemId: string, ok: boolean, obs?: string): Promise<void> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  const { error } = await supabase
    .from("arr_reserva_checklist")
    .update({
      ok,
      ok_em: ok ? new Date().toISOString() : null,
      ok_por: ok ? userId : null,
      observacao: obs ?? null,
    })
    .eq("id", itemId);
  if (error) throw error;
}

// ════════════════════════════════════════════════════════════════════════
// Produtos
// ════════════════════════════════════════════════════════════════════════
export async function listarProdutos(espacoId: string, incluirInativos = false): Promise<Produto[]> {
  let q = supabase
    .from("arr_produtos")
    .select("*")
    .eq("espaco_id", espacoId)
    .is("arquivado_em", null)
    .order("nome");
  if (!incluirInativos) q = q.eq("ativo", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Produto[];
}

export async function criarProduto(input: Partial<Produto>): Promise<Produto> {
  const { data, error } = await supabase
    .from("arr_produtos")
    .insert(input).select().single();
  if (error) throw error;
  return data as Produto;
}

export async function atualizarProduto(id: string, patch: Partial<Produto>): Promise<void> {
  const { error } = await supabase
    .from("arr_produtos").update(patch).eq("id", id);
  if (error) throw error;
}

export async function arquivarProduto(id: string): Promise<void> {
  const { error } = await supabase
    .from("arr_produtos")
    .update({ arquivado_em: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

// ════════════════════════════════════════════════════════════════════════
// Caixas (preview — 3C traz operações completas)
// ════════════════════════════════════════════════════════════════════════
export async function listarCaixasDeReserva(reservaId: string): Promise<Caixa[]> {
  const { data, error } = await supabase
    .from("arr_caixas").select("*").eq("reserva_id", reservaId)
    .is("arquivado_em", null);
  if (error) throw error;
  return (data ?? []) as Caixa[];
}

export async function carregarResumoCaixa(caixaId: string): Promise<CaixaResumo | null> {
  const { data, error } = await supabase
    .from("arr_caixa_resumo").select("*").eq("caixa_id", caixaId).maybeSingle();
  if (error) throw error;
  return data as CaixaResumo | null;
}
