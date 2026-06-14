/**
 * @deprecated Esta service foi substituída por arrecadacaoService.ts (Fase 3).
 * Rotas /bazar/* continuam vivas para não quebrar bookmarks, mas a UI ativa
 * usa /arrecadacao/*. Esta camada será REMOVIDA na Fase 4, junto com
 * o DROP das tabelas bazar_*.
 */

import { supabase } from "@/integrations/supabase/client";

export type ModalidadeBazar = "bazar" | "cantina" | "ambos";
export type StatusCampanha = "planejada" | "ativa" | "encerrada" | "cancelada";
export type FormaPagamento = "dinheiro" | "pix" | "cartao" | "debito" | "credito" | "fiado" | "outros";

export interface Campanha {
  id: string;
  nome: string;
  descricao: string | null;
  modalidade: ModalidadeBazar;
  data_inicio: string;
  data_fim: string;
  ministerio_id: string | null;
  area_id: string | null;
  centro_custo_id: string | null;
  conta_destino_id: string | null;
  responsavel_id: string | null;
  responsavel_nome: string | null;
  meta_arrecadacao: number | null;
  observacao: string | null;
  status: StatusCampanha;
  total_bruto: number;
  total_custos: number;
  total_liquido: number;
  qtd_vendas: number;
  criada_em: string;
  encerrada_em: string | null;
}

export interface ItemCatalogo {
  id: string;
  campanha_id: string;
  nome: string;
  descricao: string | null;
  preco_sugerido: number;
  categoria: string | null;
  ativo: boolean;
  // v3 — estoque opcional
  quantidade_estoque?: number | null;
  estoque_minimo?: number | null;
  observacao?: string | null;
}

export interface Venda {
  id: string;
  campanha_id: string;
  data_venda: string;
  vendedor_id: string | null;
  vendedor_nome: string | null;
  valor_total: number;
  forma_pagamento: FormaPagamento;
  cliente_nome: string | null;
  observacao: string | null;
  cancelada: boolean;
  motivo_cancelamento: string | null;
}

export interface ItemVenda {
  id?: string;
  venda_id?: string;
  item_catalogo_id?: string | null;
  descricao: string;
  quantidade: number;
  preco_unit: number;
  subtotal: number;
}

export interface Custo {
  id: string;
  campanha_id: string;
  descricao: string;
  valor: number;
  data_compra: string;
  fornecedor: string | null;
  comprovante_url: string | null;
}

// ─── Campanhas ────────────────────────────────────────────────────────
export async function listarCampanhas(status?: StatusCampanha): Promise<Campanha[]> {
  let q = supabase.from("bazar_campanhas").select("*").order("data_inicio", { ascending: false });
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Campanha[];
}

export async function carregarCampanha(id: string): Promise<Campanha | null> {
  const { data, error } = await supabase
    .from("bazar_campanhas").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as Campanha | null;
}

export async function criarCampanha(input: Partial<Campanha>): Promise<Campanha> {
  const { data, error } = await supabase
    .from("bazar_campanhas").insert(input).select().single();
  if (error) throw error;
  return data as Campanha;
}

export async function atualizarCampanha(id: string, patch: Partial<Campanha>): Promise<void> {
  const { error } = await supabase
    .from("bazar_campanhas").update(patch).eq("id", id);
  if (error) throw error;
}

export async function ativarCampanha(id: string): Promise<void> {
  return atualizarCampanha(id, { status: "ativa" });
}

export async function encerrarCampanha(id: string): Promise<void> {
  const { error } = await supabase.rpc("bazar_encerrar_campanha", { p_id: id });
  if (error) throw error;
}

export async function excluirCampanha(id: string): Promise<void> {
  const { error } = await supabase.from("bazar_campanhas").delete().eq("id", id);
  if (error) throw error;
}

// ─── Catálogo ─────────────────────────────────────────────────────────
export async function listarCatalogo(campanhaId: string): Promise<ItemCatalogo[]> {
  const { data, error } = await supabase
    .from("bazar_itens_catalogo")
    .select("*").eq("campanha_id", campanhaId)
    .order("categoria").order("nome");
  if (error) throw error;
  return (data ?? []) as ItemCatalogo[];
}

export async function criarItemCatalogo(input: Partial<ItemCatalogo>): Promise<ItemCatalogo> {
  const { data, error } = await supabase
    .from("bazar_itens_catalogo").insert(input).select().single();
  if (error) throw error;
  return data as ItemCatalogo;
}

export async function excluirItemCatalogo(id: string): Promise<void> {
  const { error } = await supabase.from("bazar_itens_catalogo").delete().eq("id", id);
  if (error) throw error;
}

// ─── Vendas + itens ───────────────────────────────────────────────────
export async function registrarVenda(
  campanhaId: string,
  itens: ItemVenda[],
  pagamento: FormaPagamento,
  vendedor: { id: string | null; nome: string },
  extras: { cliente_nome?: string; observacao?: string } = {},
): Promise<Venda> {
  const valor_total = itens.reduce((acc, i) => acc + i.subtotal, 0);
  const { data: venda, error: vErr } = await supabase
    .from("bazar_vendas")
    .insert({
      campanha_id: campanhaId,
      vendedor_id: vendedor.id,        // pode ser NULL — registra venda anônima
      vendedor_nome: vendedor.nome,
      valor_total,
      forma_pagamento: pagamento,
      cliente_nome: extras.cliente_nome ?? null,
      observacao: extras.observacao ?? null,
    })
    .select().single();
  if (vErr) throw vErr;

  if (itens.length > 0) {
    const { error: iErr } = await supabase
      .from("bazar_itens_venda")
      .insert(itens.map(i => ({ ...i, venda_id: venda.id })));
    if (iErr) throw iErr;
  }
  return venda as Venda;
}

export async function listarVendas(campanhaId: string): Promise<Venda[]> {
  const { data, error } = await supabase
    .from("bazar_vendas").select("*")
    .eq("campanha_id", campanhaId)
    .order("data_venda", { ascending: false }).limit(200);
  if (error) throw error;
  return (data ?? []) as Venda[];
}

export async function cancelarVenda(id: string, motivo: string): Promise<void> {
  const { error } = await supabase
    .from("bazar_vendas")
    .update({ cancelada: true, motivo_cancelamento: motivo })
    .eq("id", id);
  if (error) throw error;
}

// ─── Custos ───────────────────────────────────────────────────────────
export async function listarCustos(campanhaId: string): Promise<Custo[]> {
  const { data, error } = await supabase
    .from("bazar_custos").select("*")
    .eq("campanha_id", campanhaId)
    .order("data_compra", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Custo[];
}

export async function registrarCusto(input: Partial<Custo>): Promise<Custo> {
  const { data, error } = await supabase
    .from("bazar_custos").insert(input).select().single();
  if (error) throw error;
  return data as Custo;
}

export async function excluirCusto(id: string): Promise<void> {
  const { error } = await supabase.from("bazar_custos").delete().eq("id", id);
  if (error) throw error;
}

// ─── Voluntários do caixa ─────────────────────────────────────────────
export async function listarVoluntarios(campanhaId: string) {
  const { data, error } = await supabase
    .from("bazar_caixa_voluntarios")
    .select("*, membro:membros!membro_id(id,nome_completo)")
    .eq("campanha_id", campanhaId);
  if (error) throw error;
  return data ?? [];
}

export async function adicionarVoluntario(campanhaId: string, membroId: string, papel = "caixa") {
  const { error } = await supabase
    .from("bazar_caixa_voluntarios")
    .insert({ campanha_id: campanhaId, membro_id: membroId, papel });
  if (error) throw error;
}

export async function removerVoluntario(id: string) {
  const { error } = await supabase
    .from("bazar_caixa_voluntarios").delete().eq("id", id);
  if (error) throw error;
}

// ─── Dashboard resumo ─────────────────────────────────────────────────
export interface ResumoBazar {
  ativas: Array<{
    id: string; nome: string; modalidade: ModalidadeBazar;
    data_inicio: string; data_fim: string;
    total_bruto: number; total_liquido: number;
    meta: number | null; percentual_meta: number | null;
    qtd_vendas: number;
  }>;
  proximas: Array<{ id: string; nome: string; modalidade: ModalidadeBazar; data_inicio: string; meta: number | null }>;
  total_arrecadado_ano: number;
}

export async function carregarResumoBazar(): Promise<ResumoBazar> {
  const { data, error } = await supabase.rpc("bazar_resumo");
  if (error) throw error;
  return (data ?? { ativas: [], proximas: [], total_arrecadado_ano: 0 }) as ResumoBazar;
}

// ═══════════════════════════════════════════════════════════════════════
// v2: config global de taxas + fechamento de caixa
// ═══════════════════════════════════════════════════════════════════════

export interface BazarConfig {
  id: number;
  taxa_debito_pct: number;
  taxa_credito_pct: number;
  taxa_pix_pct: number;
  taxa_outros_pct: number;
  observacao: string | null;
  atualizado_em: string;
}

export async function carregarBazarConfig(): Promise<BazarConfig | null> {
  const { data, error } = await supabase
    .from("bazar_config").select("*").eq("id", 1).maybeSingle();
  if (error) throw error;
  return data as BazarConfig | null;
}

export async function atualizarBazarConfig(patch: Partial<BazarConfig>): Promise<void> {
  const { error } = await supabase
    .from("bazar_config")
    .update({ ...patch, atualizado_em: new Date().toISOString() })
    .eq("id", 1);
  if (error) throw error;
}

// ─── Catálogo: editar (faltava no v1) ────────────────────────────────
export async function atualizarItemCatalogo(id: string, patch: Partial<ItemCatalogo>): Promise<void> {
  const { error } = await supabase.from("bazar_itens_catalogo").update(patch).eq("id", id);
  if (error) throw error;
}

// ─── Fechamento de caixa ─────────────────────────────────────────────
export interface ResumoFechamento {
  campanha_nome: string;
  campanha_modalidade: string;
  tipo: "diario" | "final";
  data_referencia: string;
  periodo_inicio: string;
  periodo_fim: string;
  total_bruto: number;
  qtd_vendas: number;
  total_custos: number;
  taxa_debito_pct: number;
  taxa_credito_pct: number;
  taxa_pix_pct: number;
  taxa_debito: number;
  taxa_credito: number;
  taxa_pix: number;
  total_taxas: number;
  total_liquido: number;
  vendas_por_forma: Record<string, number>;
  top_vendedores: Array<{ vendedor: string; total: number; qtd: number }>;
}

export async function previewFechamento(
  campanhaId: string,
  data?: string,    // YYYY-MM-DD; null = final
): Promise<ResumoFechamento> {
  const { data: resp, error } = await supabase.rpc("bazar_resumo_fechamento", {
    p_campanha_id: campanhaId,
    p_data: data ?? null,
  });
  if (error) throw error;
  return resp as ResumoFechamento;
}

export async function fecharCaixa(
  campanhaId: string,
  tipo: "diario" | "final",
  data?: string,
  observacao?: string,
): Promise<string> {
  const { data: resp, error } = await supabase.rpc("bazar_fechar_caixa", {
    p_campanha_id: campanhaId,
    p_tipo: tipo,
    p_data: tipo === "diario" ? (data ?? new Date().toISOString().slice(0,10)) : null,
    p_observacao: observacao ?? null,
  });
  if (error) throw error;
  return resp as string;
}

export interface FechamentoSalvo {
  id: string;
  campanha_id: string;
  tipo: "diario" | "final";
  data_referencia: string;
  fechado_em: string;
  fechado_por_nome: string | null;
  total_dinheiro: number;
  total_pix: number;
  total_debito: number;
  total_credito: number;
  total_fiado: number;
  total_outros: number;
  total_bruto: number;
  qtd_vendas: number;
  total_custos_periodo: number;
  total_taxas: number;
  total_liquido: number;
  observacao: string | null;
}

export async function listarFechamentos(campanhaId: string): Promise<FechamentoSalvo[]> {
  const { data, error } = await supabase
    .from("bazar_fechamentos").select("*")
    .eq("campanha_id", campanhaId)
    .order("data_referencia", { ascending: false });
  if (error) throw error;
  return (data ?? []) as FechamentoSalvo[];
}

// ═══════════════════════════════════════════════════════════════════════
// v3: estoque por produto + apenas 1 evento ativo
// ═══════════════════════════════════════════════════════════════════════

// Atualizar interface ItemCatalogo: agora tem estoque e observação
// (campos novos opcionais; sem breaking change)
declare module "./bazarService" {}

export interface ItemEstoqueBaixo {
  id: string;
  campanha_id: string;
  campanha_nome: string;
  nome: string;
  categoria: string | null;
  quantidade_estoque: number;
  estoque_minimo: number;
}

export async function listarEstoqueBaixo(): Promise<ItemEstoqueBaixo[]> {
  const { data, error } = await supabase.rpc("bazar_estoque_baixo");
  if (error) throw error;
  return (data ?? []) as ItemEstoqueBaixo[];
}

export async function reabastecerEstoque(itemId: string, quantidade: number): Promise<void> {
  const { error } = await supabase.rpc("bazar_reabastecer_estoque", {
    p_item_id: itemId,
    p_quantidade: quantidade,
  });
  if (error) throw error;
}
