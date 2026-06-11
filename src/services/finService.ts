import { supabase } from "@/integrations/supabase/client";

// ─── Tipos ───────────────────────────────────────────────────────────────
export type FinContaTipo = "caixa" | "banco" | "pix" | "envelope" | "cartao" | "aplicacao" | "cofre";
export type FinMovimentoTipo = "entrada" | "saida";
export type FinStatus = "previsto" | "realizado" | "conciliado" | "cancelado" | "aguardando_aprovacao";
export type FinFormaPagamento = "pix" | "dinheiro" | "cartao_debito" | "cartao_credito" | "transferencia" | "boleto" | "envelope" | "outro";
export type FinCentroVinculo = "ministerio" | "area" | "ebd_classe" | "pgm_grupo" | "campanha" | "geral";

export interface FinConta {
  id: string;
  nome: string;
  tipo: FinContaTipo;
  banco_nome: string | null;
  banco_codigo: string | null;
  agencia: string | null;
  conta_numero: string | null;
  saldo_inicial: number;
  saldo_atual: number;
  cor: string | null;
  ativo: boolean;
  ordem: number;
  observacao: string | null;
  dia_vencimento: number | null;
  dia_fechamento: number | null;
  limite_credito: number | null;
}

export interface FinCategoria {
  id: string;
  nome: string;
  tipo: FinMovimentoTipo;
  conta_contabil: string | null;
  cor: string | null;
  icone: string | null;
  pai_id: string | null;
  sistema: boolean;
  ordem: number;
  ativo: boolean;
}

export interface FinCentroCusto {
  id: string;
  nome: string;
  vinculo_tipo: FinCentroVinculo;
  vinculo_id: string | null;
  vinculo_nome: string | null;
  orcamento_anual: number | null;
  cor: string | null;
  ativo: boolean;
}

export interface FinFornecedor {
  id: string;
  nome: string;
  tipo: string | null;
  cnpj_cpf: string | null;
  email: string | null;
  telefone: string | null;
  endereco: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  chave_pix: string | null;
  categoria_padrao_id: string | null;
  ativo: boolean;
  observacao: string | null;
}

export interface FinLancamento {
  id: string;
  data: string;
  data_competencia: string | null;
  tipo: FinMovimentoTipo;
  status: FinStatus;
  conta_id: string;
  categoria_id: string | null;
  centro_custo_id: string | null;
  fornecedor_id: string | null;
  pessoa_id: string | null;
  familia_id: string | null;
  valor: number;
  descricao: string | null;
  forma_pagamento: FinFormaPagamento | null;
  documento_numero: string | null;
  observacoes: string | null;
  comprovante_url: string | null;
  data_pagamento: string | null;
  origem: string;
  created_at?: string;
}

export interface FinLancamentoExtenso extends FinLancamento {
  conta_nome?: string;
  categoria_nome?: string;
  categoria_cor?: string | null;
  centro_nome?: string;
  fornecedor_nome?: string;
  pessoa_nome?: string;
}

export interface FinResumoMes {
  saldo_total: number;
  entradas_mes: number;
  saidas_mes: number;
  previstas_mes: number;
}

// ─── Labels ──────────────────────────────────────────────────────────────
export const CONTA_TIPO_LABEL: Record<FinContaTipo, string> = {
  caixa: "Caixa", banco: "Banco", pix: "PIX",
  envelope: "Envelope", cartao: "Cartão de Crédito",
  aplicacao: "Aplicação", cofre: "Cofre",
};

export const FORMA_LABEL: Record<FinFormaPagamento, string> = {
  pix: "PIX", dinheiro: "Dinheiro",
  cartao_debito: "Cartão Débito", cartao_credito: "Cartão Crédito",
  transferencia: "Transferência", boleto: "Boleto",
  envelope: "Envelope", outro: "Outro",
};

export const STATUS_LABEL: Record<FinStatus, string> = {
  previsto: "Previsto", realizado: "Realizado",
  conciliado: "Conciliado", cancelado: "Cancelado",
  aguardando_aprovacao: "Aguardando aprovação",
};

// ─── Contas ──────────────────────────────────────────────────────────────
export async function listarContas(incluirInativas = false): Promise<FinConta[]> {
  let q = supabase.from("fin_contas").select("*").order("ordem").order("nome");
  if (!incluirInativas) q = q.eq("ativo", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as FinConta[];
}

export async function carregarConta(id: string): Promise<FinConta | null> {
  const { data } = await supabase.from("fin_contas").select("*").eq("id", id).maybeSingle();
  return (data ?? null) as FinConta | null;
}

export async function criarConta(input: Partial<FinConta>): Promise<FinConta> {
  const { data, error } = await supabase.from("fin_contas").insert(input as any).select("*").single();
  if (error) throw error;
  return data as FinConta;
}

export async function atualizarConta(id: string, patch: Partial<FinConta>): Promise<void> {
  const { error } = await supabase.from("fin_contas").update(patch as any).eq("id", id);
  if (error) throw error;
}

export async function desativarConta(id: string): Promise<void> {
  const { error } = await supabase.from("fin_contas").update({ ativo: false }).eq("id", id);
  if (error) throw error;
}

// ─── Categorias ──────────────────────────────────────────────────────────
export async function listarCategorias(tipo?: FinMovimentoTipo): Promise<FinCategoria[]> {
  let q = supabase.from("fin_categorias").select("*").eq("ativo", true).order("ordem").order("nome");
  if (tipo) q = q.eq("tipo", tipo);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as FinCategoria[];
}

// ─── Centros de custo ────────────────────────────────────────────────────
export async function listarCentrosCusto(): Promise<FinCentroCusto[]> {
  const { data, error } = await supabase
    .from("fin_centros_custo").select("*").eq("ativo", true).order("nome");
  if (error) throw error;
  return (data ?? []) as FinCentroCusto[];
}

export async function criarCentroCusto(input: Partial<FinCentroCusto>): Promise<FinCentroCusto> {
  const { data, error } = await supabase.from("fin_centros_custo").insert(input as any).select("*").single();
  if (error) throw error;
  return data as FinCentroCusto;
}

// ─── Fornecedores ────────────────────────────────────────────────────────
export async function listarFornecedores(busca?: string): Promise<FinFornecedor[]> {
  let q = supabase.from("fin_fornecedores").select("*").eq("ativo", true).order("nome").limit(50);
  if (busca && busca.length >= 2) q = q.ilike("nome", `%${busca}%`);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as FinFornecedor[];
}

export async function criarFornecedor(input: Partial<FinFornecedor>): Promise<FinFornecedor> {
  const { data, error } = await supabase.from("fin_fornecedores").insert(input as any).select("*").single();
  if (error) throw error;
  return data as FinFornecedor;
}

// ─── Lançamentos ────────────────────────────────────────────────────────
export interface FiltroLancamento {
  contaId?: string;
  tipo?: FinMovimentoTipo;
  status?: FinStatus;
  categoriaId?: string;
  centroCustoId?: string;
  dataInicio?: string;
  dataFim?: string;
  busca?: string;
}

export async function listarLancamentos(filtro: FiltroLancamento = {}): Promise<FinLancamentoExtenso[]> {
  let q = supabase.from("fin_lancamentos").select("*").order("data", { ascending: false }).order("created_at", { ascending: false });
  if (filtro.contaId) q = q.eq("conta_id", filtro.contaId);
  if (filtro.tipo) q = q.eq("tipo", filtro.tipo);
  if (filtro.status) q = q.eq("status", filtro.status);
  if (filtro.categoriaId) q = q.eq("categoria_id", filtro.categoriaId);
  if (filtro.centroCustoId) q = q.eq("centro_custo_id", filtro.centroCustoId);
  if (filtro.dataInicio) q = q.gte("data", filtro.dataInicio);
  if (filtro.dataFim) q = q.lte("data", filtro.dataFim);
  if (filtro.busca && filtro.busca.length >= 2) q = q.ilike("descricao", `%${filtro.busca}%`);
  const { data, error } = await q.limit(300);
  if (error) throw error;
  const lancs = (data ?? []) as FinLancamento[];
  if (lancs.length === 0) return [];

  // Join manual com nomes (mais rápido + à prova de fk)
  const contaIds = Array.from(new Set(lancs.map(l => l.conta_id))).filter(Boolean);
  const catIds   = Array.from(new Set(lancs.map(l => l.categoria_id).filter(Boolean))) as string[];
  const ccIds    = Array.from(new Set(lancs.map(l => l.centro_custo_id).filter(Boolean))) as string[];
  const fornIds  = Array.from(new Set(lancs.map(l => l.fornecedor_id).filter(Boolean))) as string[];
  const pessoaIds = Array.from(new Set(lancs.map(l => l.pessoa_id).filter(Boolean))) as string[];

  const [{ data: contas }, { data: cats }, { data: ccs }, { data: forns }, { data: pessoas }] = await Promise.all([
    contaIds.length ? supabase.from("fin_contas").select("id, nome").in("id", contaIds) : Promise.resolve({ data: [] }),
    catIds.length   ? supabase.from("fin_categorias").select("id, nome, cor").in("id", catIds) : Promise.resolve({ data: [] }),
    ccIds.length    ? supabase.from("fin_centros_custo").select("id, nome").in("id", ccIds) : Promise.resolve({ data: [] }),
    fornIds.length  ? supabase.from("fin_fornecedores").select("id, nome").in("id", fornIds) : Promise.resolve({ data: [] }),
    pessoaIds.length ? supabase.from("membros").select("id, nome_completo").in("id", pessoaIds) : Promise.resolve({ data: [] }),
  ]);

  const mC = new Map((contas ?? []).map((c: any) => [c.id, c.nome]));
  const mK = new Map((cats ?? []).map((c: any) => [c.id, { nome: c.nome, cor: c.cor }]));
  const mCC = new Map((ccs ?? []).map((c: any) => [c.id, c.nome]));
  const mF = new Map((forns ?? []).map((f: any) => [f.id, f.nome]));
  const mP = new Map((pessoas ?? []).map((p: any) => [p.id, p.nome_completo]));

  return lancs.map(l => ({
    ...l,
    conta_nome:      mC.get(l.conta_id),
    categoria_nome:  l.categoria_id ? mK.get(l.categoria_id)?.nome : undefined,
    categoria_cor:   l.categoria_id ? mK.get(l.categoria_id)?.cor ?? null : null,
    centro_nome:     l.centro_custo_id ? mCC.get(l.centro_custo_id) : undefined,
    fornecedor_nome: l.fornecedor_id ? mF.get(l.fornecedor_id) : undefined,
    pessoa_nome:     l.pessoa_id ? mP.get(l.pessoa_id) : undefined,
  }));
}

export async function criarLancamento(input: Partial<FinLancamento>): Promise<FinLancamento> {
  const { data, error } = await supabase.from("fin_lancamentos").insert(input as any).select("*").single();
  if (error) throw error;
  return data as FinLancamento;
}

export async function atualizarLancamento(id: string, patch: Partial<FinLancamento>): Promise<void> {
  const { error } = await supabase.from("fin_lancamentos").update(patch as any).eq("id", id);
  if (error) throw error;
}

export async function excluirLancamento(id: string): Promise<void> {
  // tenta apagar comprovante junto
  const { data: l } = await supabase.from("fin_lancamentos").select("comprovante_url").eq("id", id).maybeSingle();
  if (l?.comprovante_url) await removerComprovante(l.comprovante_url);
  const { error } = await supabase.from("fin_lancamentos").delete().eq("id", id);
  if (error) throw error;
}

// ─── Comprovantes (storage: fin-comprovantes) ───────────────────────────
export const FIN_COMPROVANTE_MAX = 5 * 1024 * 1024;
export const FIN_COMPROVANTE_MIMES = ["image/jpeg", "image/png", "image/jpg", "application/pdf"];

export async function uploadComprovante(file: File, lancamentoId: string): Promise<string> {
  if (file.size > FIN_COMPROVANTE_MAX) throw new Error("Arquivo > 5MB");
  if (!FIN_COMPROVANTE_MIMES.includes(file.type)) throw new Error("Formato inválido (JPG/PNG/PDF)");
  const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
  const path = `${lancamentoId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("fin-comprovantes").upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw error;
  return path;
}

export async function removerComprovante(path: string): Promise<void> {
  await supabase.storage.from("fin-comprovantes").remove([path]);
}

export async function comprovanteSignedUrl(path: string, segs = 600): Promise<string | null> {
  const { data } = await supabase.storage.from("fin-comprovantes").createSignedUrl(path, segs);
  return data?.signedUrl ?? null;
}

// ─── Resumo / Dashboard ─────────────────────────────────────────────────
export async function resumoFinanceiroMes(): Promise<FinResumoMes | null> {
  const { data, error } = await supabase.from("vw_fin_resumo_mes").select("*").maybeSingle();
  if (error) throw error;
  return (data ?? null) as FinResumoMes | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────
export function brl(v: number | null | undefined): string {
  return (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ─── Editar categoria ───────────────────────────────────────────────────
export async function criarCategoria(input: Partial<FinCategoria>): Promise<FinCategoria> {
  const { data, error } = await supabase.from("fin_categorias")
    .insert(input as any).select("*").single();
  if (error) throw error;
  return data as FinCategoria;
}

export async function atualizarCategoria(id: string, patch: Partial<FinCategoria>): Promise<void> {
  const { error } = await supabase.from("fin_categorias").update(patch as any).eq("id", id);
  if (error) throw error;
}

export async function excluirCategoria(id: string): Promise<void> {
  const { error } = await supabase.from("fin_categorias").delete().eq("id", id);
  if (error) throw error;
}

export async function listarCategoriasTodas(): Promise<FinCategoria[]> {
  const { data, error } = await supabase
    .from("fin_categorias").select("*").order("tipo").order("ordem").order("nome");
  if (error) throw error;
  return (data ?? []) as FinCategoria[];
}

// ─── Reativar conta ─────────────────────────────────────────────────────
export async function reativarConta(id: string): Promise<void> {
  const { error } = await supabase.from("fin_contas").update({ ativo: true }).eq("id", id);
  if (error) throw error;
}

export async function excluirConta(id: string): Promise<void> {
  const { error } = await supabase.from("fin_contas").delete().eq("id", id);
  if (error) throw error;
}

// ─── Transferência entre contas ──────────────────────────────────────────
// Cria 2 lançamentos vinculados (saída origem + entrada destino).
// Se falhar no meio, tenta reverter o primeiro.
export async function transferir(input: {
  contaOrigemId: string;
  contaDestinoId: string;
  valor: number;
  data: string;
  descricao?: string | null;
  comprovanteFile?: File | null;
}): Promise<void> {
  if (input.contaOrigemId === input.contaDestinoId) {
    throw new Error("Origem e destino precisam ser contas diferentes");
  }
  if (input.valor <= 0) throw new Error("Valor inválido");

  // Buscar nomes pra descrição
  const [orig, dest] = await Promise.all([
    carregarConta(input.contaOrigemId),
    carregarConta(input.contaDestinoId),
  ]);
  if (!orig || !dest) throw new Error("Conta inválida");

  const descBase = input.descricao?.trim() ||
    `Transferência: ${orig.nome} → ${dest.nome}`;

  // 1) saída na origem
  const saida = await criarLancamento({
    tipo: "saida",
    data: input.data,
    valor: input.valor,
    conta_id: input.contaOrigemId,
    status: "realizado",
    descricao: `${descBase} (saída)`,
    origem: "transferencia",
  });

  try {
    // 2) entrada no destino — referencia a saída como pai
    await criarLancamento({
      tipo: "entrada",
      data: input.data,
      valor: input.valor,
      conta_id: input.contaDestinoId,
      status: "realizado",
      descricao: `${descBase} (entrada)`,
      origem: "transferencia",
      lancamento_pai_id: saida.id,
    } as any);

    // 3) Upload de comprovante (opcional) — anexa ao lançamento da saída
    if (input.comprovanteFile) {
      const path = await uploadComprovante(input.comprovanteFile, saida.id);
      await atualizarLancamento(saida.id, { comprovante_url: path });
    }
  } catch (e: any) {
    // Reverte: se a entrada falhou, apaga a saída pra não ficar inconsistente
    await excluirLancamento(saida.id).catch(() => {});
    throw e;
  }
}

export async function buscarFornecedorPorCnpj(cnpjDigitos: string): Promise<FinFornecedor | null> {
  if (!cnpjDigitos || cnpjDigitos.length < 11) return null;
  const { data } = await supabase.from("fin_fornecedores")
    .select("*")
    .eq("cnpj_cpf", cnpjDigitos)
    .limit(1).maybeSingle();
  return (data ?? null) as FinFornecedor | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// FASE 3 — Recorrências + Contas a Pagar/Receber
// ═══════════════════════════════════════════════════════════════════════════

export type FinFrequencia = "mensal" | "bimestral" | "trimestral" | "semestral" | "anual";

export const FREQUENCIA_LABEL: Record<FinFrequencia, string> = {
  mensal: "Mensal", bimestral: "Bimestral", trimestral: "Trimestral",
  semestral: "Semestral", anual: "Anual",
};

export interface FinRecorrencia {
  id: string;
  descricao: string;
  tipo: FinMovimentoTipo;
  valor: number;
  valor_variavel: boolean;
  conta_id: string;
  categoria_id: string | null;
  centro_custo_id: string | null;
  fornecedor_id: string | null;
  frequencia: FinFrequencia;
  dia_vencimento: number;
  data_inicio: string;
  data_fim: string | null;
  ativo: boolean;
  ajusta_dia_util: boolean;
  lembrar_5d: boolean;
  lembrar_1d: boolean;
  lembrar_dia: boolean;
  ultimo_gerado_ate: string | null;
  observacao: string | null;
}

export interface FinVencimento {
  id: string; data: string; tipo: FinMovimentoTipo;
  status: FinStatus; valor: number; descricao: string | null;
  conta_id: string; conta_nome: string | null;
  categoria_id: string | null; categoria_nome: string | null; categoria_cor: string | null;
  fornecedor_id: string | null; fornecedor_nome: string | null;
  dias_para_vencer: number;
  urgencia: "vencido" | "vence_hoje" | "urgente" | "esta_semana" | "futuro";
}

// ─── CRUD ────────────────────────────────────────────────────────────────
export async function listarRecorrencias(incluirInativas = false): Promise<FinRecorrencia[]> {
  let q = supabase.from("fin_recorrencias").select("*").order("dia_vencimento").order("descricao");
  if (!incluirInativas) q = q.eq("ativo", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as FinRecorrencia[];
}

export async function criarRecorrencia(input: Partial<FinRecorrencia>): Promise<FinRecorrencia> {
  const { data, error } = await supabase.from("fin_recorrencias").insert(input as any).select("*").single();
  if (error) throw error;
  return data as FinRecorrencia;
}

export async function atualizarRecorrencia(id: string, patch: Partial<FinRecorrencia>): Promise<void> {
  const { error } = await supabase.from("fin_recorrencias").update(patch as any).eq("id", id);
  if (error) throw error;
}

export async function excluirRecorrencia(id: string): Promise<void> {
  const { error } = await supabase.from("fin_recorrencias").delete().eq("id", id);
  if (error) throw error;
}

// ─── Gerar previstos ────────────────────────────────────────────────────
export async function gerarRecorrencias(opts: { ateData?: string; recorrenciaId?: string } = {}): Promise<number> {
  const { data, error } = await supabase.rpc("fin_gerar_recorrencias", {
    p_ate_data: opts.ateData ?? null,
    p_recorrencia_id: opts.recorrenciaId ?? null,
  });
  if (error) throw error;
  return data as number;
}

// ─── Próximos vencimentos ──────────────────────────────────────────────
export async function listarProximosVencimentos(opts: {
  ateData?: string; tipo?: FinMovimentoTipo;
} = {}): Promise<FinVencimento[]> {
  let q = supabase.from("vw_fin_proximos_vencimentos").select("*").order("data");
  if (opts.ateData) q = q.lte("data", opts.ateData);
  if (opts.tipo)   q = q.eq("tipo", opts.tipo);
  const { data, error } = await q.limit(200);
  if (error) throw error;
  return (data ?? []) as FinVencimento[];
}

// ─── Confirmar pagamento — previsto → realizado ─────────────────────────
export async function confirmarPagamento(lancamentoId: string, opts?: {
  dataPagamento?: string; valorReal?: number;
}): Promise<void> {
  const patch: any = {
    status: "realizado",
    data_pagamento: opts?.dataPagamento ?? new Date().toISOString().slice(0, 10),
  };
  if (opts?.valorReal && opts.valorReal > 0) patch.valor = opts.valorReal;
  await atualizarLancamento(lancamentoId, patch);
}

// ═══════════════════════════════════════════════════════════════════════════
// FASE 5 — Malote Contábil (relatório mensal consolidado)
// ═══════════════════════════════════════════════════════════════════════════

export interface ResumoMensal {
  ano: number;
  mes: number;
  totalEntradas: number;
  totalSaidas: number;
  resultado: number;
  qtdLancamentos: number;
  porCategoria: { id: string | null; nome: string; tipo: FinMovimentoTipo; total: number; cor: string | null }[];
  porConta:    { id: string; nome: string; entradas: number; saidas: number; saldo: number }[];
  lancamentos: FinLancamentoExtenso[];
}

export async function resumoMensal(ano: number, mes: number): Promise<ResumoMensal> {
  const ini = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const fim = new Date(ano, mes, 0).toISOString().slice(0, 10); // último dia

  const lancs = await listarLancamentos({
    dataInicio: ini, dataFim: fim,
  });
  // Filtra: só realizados/conciliados entram no malote
  const realizados = lancs.filter(l => l.status === "realizado" || l.status === "conciliado");

  const totalEntradas = realizados.filter(l => l.tipo === "entrada").reduce((s, l) => s + Number(l.valor), 0);
  const totalSaidas   = realizados.filter(l => l.tipo === "saida").reduce((s, l) => s + Number(l.valor), 0);

  // Por categoria
  const catMap = new Map<string, { nome: string; tipo: FinMovimentoTipo; total: number; cor: string | null }>();
  realizados.forEach(l => {
    const key = l.categoria_id ?? "_sem";
    const ex = catMap.get(key);
    const nome = l.categoria_nome ?? "Sem categoria";
    const cor = l.categoria_cor ?? null;
    if (ex) ex.total += Number(l.valor);
    else catMap.set(key, { nome, tipo: l.tipo, total: Number(l.valor), cor });
  });
  const porCategoria = Array.from(catMap.entries())
    .map(([id, v]) => ({ id: id === "_sem" ? null : id, ...v }))
    .sort((a, b) => b.total - a.total);

  // Por conta
  const conMap = new Map<string, { nome: string; entradas: number; saidas: number }>();
  realizados.forEach(l => {
    const key = l.conta_id;
    const nome = l.conta_nome ?? "—";
    const ex = conMap.get(key);
    if (ex) {
      if (l.tipo === "entrada") ex.entradas += Number(l.valor);
      else ex.saidas += Number(l.valor);
    } else {
      conMap.set(key, {
        nome,
        entradas: l.tipo === "entrada" ? Number(l.valor) : 0,
        saidas:   l.tipo === "saida"   ? Number(l.valor) : 0,
      });
    }
  });
  const porConta = Array.from(conMap.entries()).map(([id, v]) => ({
    id, ...v, saldo: v.entradas - v.saidas,
  })).sort((a, b) => Math.abs(b.entradas - b.saidas) - Math.abs(a.entradas - a.saidas));

  return {
    ano, mes,
    totalEntradas, totalSaidas,
    resultado: totalEntradas - totalSaidas,
    qtdLancamentos: realizados.length,
    porCategoria, porConta,
    lancamentos: realizados,
  };
}

// ─── Exportação CSV ─────────────────────────────────────────────────────
export function gerarCSV(lancamentos: FinLancamentoExtenso[]): string {
  const linhas = [
    "Data,Tipo,Conta,Categoria,Centro Custo,Fornecedor,Descricao,Valor,Status,Documento"
  ];
  lancamentos.forEach(l => {
    const campos = [
      l.data,
      l.tipo,
      l.conta_nome ?? "",
      l.categoria_nome ?? "",
      l.centro_nome ?? "",
      l.fornecedor_nome ?? "",
      (l.descricao ?? "").replace(/"/g, '""'),
      Number(l.valor).toFixed(2).replace(".", ","),
      l.status,
      l.documento_numero ?? "",
    ];
    linhas.push(campos.map(c => `"${c}"`).join(","));
  });
  return linhas.join("\n");
}

export function downloadCSV(nome: string, conteudo: string) {
  const blob = new Blob([conteudo], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nome;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}
