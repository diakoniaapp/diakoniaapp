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
/** Após criar reserva, materializa a checklist a partir do template default.
 *  Idempotente: se já houver itens na reserva, não duplica. */
export async function materializarChecklist(reservaId: string, espacoId: string): Promise<void> {
  // Já materializado? Se já tem qualquer item na reserva, não faz nada.
  const { count } = await supabase
    .from("arr_reserva_checklist")
    .select("*", { count: "exact", head: true })
    .eq("reserva_id", reservaId);
  if ((count ?? 0) > 0) return;

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
  // upsert para tolerar UNIQUE (reserva_id, item) caso o fix SQL esteja aplicado
  const { error: insErr } = await supabase
    .from("arr_reserva_checklist")
    .upsert(linhas, { onConflict: "reserva_id,item", ignoreDuplicates: true });
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

// ════════════════════════════════════════════════════════════════════════
// Onda 3C: PDV + caixa + fechamento + operadores + produtos avançado
// ════════════════════════════════════════════════════════════════════════

export interface Venda {
  id: string;
  caixa_id: string;
  operador_id: string | null;
  registrada_por: string | null;
  forma_pagamento: FormaPagamento;
  valor_total: number;
  cliente_nome: string | null;
  observacao: string | null;
  cancelada: boolean;
  motivo_cancelamento: string | null;
  cancelada_em: string | null;
  data_venda: string;
}

export interface ItemVendaInput {
  produto_id?: string | null;
  descricao: string;
  qtd: number;
  preco_unit: number;
  subtotal: number;
}

export interface ItemVenda extends ItemVendaInput { id: string; venda_id: string; }

export interface Operador {
  id: string;
  caixa_id: string;
  membro_id: string;
  papel: "operador" | "coordenador";
  designado_em: string;
  // joined
  membro?: { id: string; nome_completo: string };
}

// ─── Abertura automática do caixa (chamado pelo iniciarUso) ────────────
export async function abrirCaixaParaReserva(reservaId: string): Promise<Caixa> {
  // Já existe um caixa? (pode ter sido criado manualmente)
  const { data: existente } = await supabase
    .from("arr_caixas")
    .select("*")
    .eq("reserva_id", reservaId)
    .is("arquivado_em", null)
    .maybeSingle();
  if (existente) return existente as Caixa;

  // Snapshot das taxas do espaço da reserva
  const { data: reserva, error: errR } = await supabase
    .from("arr_reservas")
    .select("espaco_id")
    .eq("id", reservaId)
    .single();
  if (errR) throw errR;

  const { data: espaco, error: errE } = await supabase
    .from("arr_espacos")
    .select("taxa_debito_pct, taxa_credito_pct, taxa_pix_pct")
    .eq("id", reserva.espaco_id)
    .single();
  if (errE) throw errE;

  const { data: caixa, error: errC } = await supabase
    .from("arr_caixas")
    .insert({
      reserva_id: reservaId,
      estado: "aberto",
      taxa_debito_pct: espaco.taxa_debito_pct,
      taxa_credito_pct: espaco.taxa_credito_pct,
      taxa_pix_pct: espaco.taxa_pix_pct,
    })
    .select().single();
  if (errC) throw errC;
  return caixa as Caixa;
}

/** Inicia uso E garante caixa aberto. Substitui o iniciarUso "puro". */
export async function iniciarUsoEAbrirCaixa(reservaId: string): Promise<Caixa> {
  await iniciarUso(reservaId);
  return abrirCaixaParaReserva(reservaId);
}

export async function carregarCaixa(caixaId: string): Promise<Caixa | null> {
  const { data, error } = await supabase
    .from("arr_caixas").select("*").eq("id", caixaId).maybeSingle();
  if (error) throw error;
  return data as Caixa | null;
}

// ─── Transição de estado do caixa ───────────────────────────────────────
export async function moverCaixaParaConciliando(caixaId: string): Promise<void> {
  const { error } = await supabase
    .from("arr_caixas")
    .update({ estado: "conciliando", conciliando_desde: new Date().toISOString() })
    .eq("id", caixaId);
  if (error) throw error;
}

export async function fecharCaixa(caixaId: string, observacao?: string): Promise<void> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  const { error } = await supabase
    .from("arr_caixas")
    .update({
      estado: "fechado",
      fechado_em: new Date().toISOString(),
      fechado_por: userId,
      observacao: observacao ?? null,
    })
    .eq("id", caixaId);
  if (error) throw error;
}

// ─── Vendas ─────────────────────────────────────────────────────────────
export async function listarVendasCaixa(caixaId: string): Promise<Venda[]> {
  const { data, error } = await supabase
    .from("arr_vendas")
    .select("*")
    .eq("caixa_id", caixaId)
    .is("arquivado_em", null)
    .order("data_venda", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as Venda[];
}

export async function registrarVendaPDV(
  caixaId: string,
  itens: ItemVendaInput[],
  forma: FormaPagamento,
  operador: { id: string | null; nome: string },
  extras: { cliente_nome?: string; observacao?: string } = {},
): Promise<Venda> {
  const valor_total = itens.reduce((acc, i) => acc + i.subtotal, 0);
  const userId = (await supabase.auth.getUser()).data.user?.id;

  const { data: venda, error: vErr } = await supabase
    .from("arr_vendas")
    .insert({
      caixa_id: caixaId,
      operador_id: operador.id,
      registrada_por: userId,
      forma_pagamento: forma,
      valor_total,
      cliente_nome: extras.cliente_nome ?? null,
      observacao: extras.observacao ?? null,
    })
    .select().single();
  if (vErr) throw vErr;

  if (itens.length > 0) {
    const linhas = itens.map(i => ({ ...i, venda_id: venda.id }));
    const { error: iErr } = await supabase.from("arr_itens_venda").insert(linhas);
    if (iErr) throw iErr;
  }
  return venda as Venda;
}

export async function cancelarVenda(vendaId: string, motivo: string): Promise<void> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  const { error } = await supabase
    .from("arr_vendas")
    .update({
      cancelada: true,
      motivo_cancelamento: motivo,
      cancelada_em: new Date().toISOString(),
      cancelada_por: userId,
    })
    .eq("id", vendaId);
  if (error) throw error;
}

// ─── Operadores designados ─────────────────────────────────────────────
export async function listarOperadores(caixaId: string): Promise<Operador[]> {
  const { data, error } = await supabase
    .from("arr_caixa_operadores")
    .select("*, membro:membros!membro_id(id, nome_completo)")
    .eq("caixa_id", caixaId);
  if (error) throw error;
  return (data ?? []) as Operador[];
}

export async function designarOperador(
  caixaId: string,
  membroId: string,
  papel: "operador" | "coordenador" = "operador",
): Promise<void> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  const { error } = await supabase
    .from("arr_caixa_operadores")
    .insert({ caixa_id: caixaId, membro_id: membroId, papel, designado_por: userId });
  if (error) throw error;
}

export async function removerOperador(operadorId: string): Promise<void> {
  const { error } = await supabase
    .from("arr_caixa_operadores").delete().eq("id", operadorId);
  if (error) throw error;
}

// ════════════════════════════════════════════════════════════════════════
// Onda 3D: movimentos avançados + NF storage + fin_lancamentos integration
// ════════════════════════════════════════════════════════════════════════

export interface Movimento {
  id: string;
  caixa_id: string;
  tipo: MovimentoTipo;
  valor: number;
  ajuste_positivo: boolean | null;
  data_movimento: string;
  descricao: string;
  beneficiario_membro_id: string | null;
  nf_numero: string | null;
  nf_serie: string | null;
  nf_emitida_em: string | null;
  nf_cnpj_emitente: string | null;
  nf_anexo_path: string | null;
  fin_lancamento_id: string | null;
  registrado_em: string;
  arquivado_em: string | null;
  // joined
  beneficiario?: { id: string; nome_completo: string };
}

export async function listarMovimentos(caixaId: string): Promise<Movimento[]> {
  const { data, error } = await supabase
    .from("arr_movimentos")
    .select("*, beneficiario:membros!beneficiario_membro_id(id, nome_completo)")
    .eq("caixa_id", caixaId)
    .is("arquivado_em", null)
    .order("data_movimento", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Movimento[];
}

// ─── Custo: despesa simples vinculada ao caixa ─────────────────────────
export async function registrarCusto(
  caixaId: string,
  valor: number,
  descricao: string,
  dataMovimento?: string,
): Promise<Movimento> {
  const { data, error } = await supabase
    .from("arr_movimentos")
    .insert({
      caixa_id: caixaId,
      tipo: "custo" as MovimentoTipo,
      valor,
      descricao,
      data_movimento: dataMovimento ?? new Date().toISOString().slice(0,10),
      registrado_por: (await supabase.auth.getUser()).data.user?.id,
    })
    .select().single();
  if (error) throw error;
  return data as Movimento;
}

// ─── Upload de NF anexa ────────────────────────────────────────────────
export async function uploadAnexoNF(
  caixaId: string,
  arquivo: File,
): Promise<string> {
  const safe = arquivo.name.replace(/[^\w.\-]+/g, "_");
  const path = `${caixaId}/${Date.now()}-${safe}`;
  const { error } = await supabase.storage
    .from("arrecadacao-nf")
    .upload(path, arquivo, {
      cacheControl: "3600",
      upsert: false,
      contentType: arquivo.type || undefined,
    });
  if (error) throw error;
  return path;
}

export async function urlNF(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from("arrecadacao-nf")
    .createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

// ─── Reembolso a pessoa: gera fin_lancamentos automaticamente (trigger) ─
export interface NFDados {
  numero: string;
  serie?: string;
  emitida_em: string;
  cnpj_emitente?: string;
  anexo_path?: string;
}

export async function registrarReembolsoPessoa(
  caixaId: string,
  valor: number,
  beneficiarioId: string,
  descricao: string,
  nf: NFDados,
): Promise<Movimento> {
  const { data, error } = await supabase
    .from("arr_movimentos")
    .insert({
      caixa_id: caixaId,
      tipo: "reembolso_pessoa" as MovimentoTipo,
      valor,
      descricao,
      beneficiario_membro_id: beneficiarioId,
      nf_numero: nf.numero,
      nf_serie: nf.serie ?? null,
      nf_emitida_em: nf.emitida_em,
      nf_cnpj_emitente: nf.cnpj_emitente ?? null,
      nf_anexo_path: nf.anexo_path ?? null,
      data_movimento: nf.emitida_em,
      registrado_por: (await supabase.auth.getUser()).data.user?.id,
    })
    .select().single();
  if (error) throw error;
  return data as Movimento;
}

// ─── Abate compra CNPJ: vincula a fin_lancamento existente ─────────────
export async function registrarAbateCompraCNPJ(
  caixaId: string,
  finLancamentoId: string,
  valor: number,
  descricao: string,
  nf: NFDados,
): Promise<Movimento> {
  const { data, error } = await supabase
    .from("arr_movimentos")
    .insert({
      caixa_id: caixaId,
      tipo: "abate_compra_cnpj" as MovimentoTipo,
      valor,
      descricao,
      fin_lancamento_id: finLancamentoId,
      nf_numero: nf.numero,
      nf_serie: nf.serie ?? null,
      nf_emitida_em: nf.emitida_em,
      nf_cnpj_emitente: nf.cnpj_emitente ?? null,
      nf_anexo_path: nf.anexo_path ?? null,
      data_movimento: nf.emitida_em,
      registrado_por: (await supabase.auth.getUser()).data.user?.id,
    })
    .select().single();
  if (error) throw error;
  return data as Movimento;
}

// ─── Reversão Admin: devolve saldo virtual para o ministério dono ──────
export async function registrarReversaoAdmin(
  caixaId: string,
  valor: number,
  descricao: string,
): Promise<Movimento> {
  const { data, error } = await supabase
    .from("arr_movimentos")
    .insert({
      caixa_id: caixaId,
      tipo: "reversao_admin" as MovimentoTipo,
      valor,
      descricao,
      data_movimento: new Date().toISOString().slice(0,10),
      registrado_por: (await supabase.auth.getUser()).data.user?.id,
    })
    .select().single();
  if (error) throw error;
  return data as Movimento;
}

export async function arquivarMovimento(id: string): Promise<void> {
  const { error } = await supabase
    .from("arr_movimentos")
    .update({ arquivado_em: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

// ─── Listar fin_lancamentos saída disponíveis (não vinculados) ─────────
export interface FinLancamentoDisp {
  id: string;
  descricao: string;
  valor: number;
  data: string | null;
  data_competencia: string | null;
}

export async function listarLancamentosSaidaDisponiveis(): Promise<FinLancamentoDisp[]> {
  // Lançamentos de saída realizados sem arr_movimentos vinculado
  const { data, error } = await supabase
    .from("fin_lancamentos")
    .select("id, descricao, valor, data, data_competencia")
    .eq("tipo", "saida")
    .eq("status", "realizado")
    .order("data", { ascending: false })
    .limit(200);
  if (error) throw error;
  // Filtra os já vinculados
  const { data: vinculados } = await supabase
    .from("arr_movimentos")
    .select("fin_lancamento_id")
    .not("fin_lancamento_id", "is", null)
    .is("arquivado_em", null);
  const usados = new Set((vinculados ?? []).map((v: any) => v.fin_lancamento_id));
  return ((data ?? []) as FinLancamentoDisp[]).filter(l => !usados.has(l.id));
}
