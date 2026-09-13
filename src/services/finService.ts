import { supabase } from "@/integrations/supabase/client";
import { hojeLocal } from "@/lib/data";
import { conferir } from "@/lib/escritaConferida";

// ─── Tipos ───────────────────────────────────────────────────────────────
export type FinContaTipo = "caixa" | "banco" | "pix" | "envelope" | "cartao" | "aplicacao" | "cofre";
export type FinMovimentoTipo = "entrada" | "saida";
export type FinStatus = "previsto" | "realizado" | "conciliado" | "cancelado" | "aguardando_aprovacao";
export type FinFormaPagamento = "pix" | "dinheiro" | "cartao_debito" | "cartao_credito" | "transferencia" | "boleto" | "envelope" | "outro";
// O enum `fin_centro_vinculo` no banco TEM "evento" (conferido direto no
// Postgres em 12/09/2026: `ministerio|area|ebd_classe|pgm_grupo|campanha|
// geral|evento`) — um comentário antigo em `FinancasCentros.tsx` dizia o
// contrário. `fin_seed_centros_custo()` é quem povoa `fin_centros_custo`
// automaticamente, e ela NÃO tem um passo para eventos (só ministérios,
// áreas, classes EBD, grupos de PGM, campanhas de EBD) — por isso nenhum
// centro com esse vínculo existe hoje. O tipo aqui reflete o banco, não
// o que já foi criado; ver o comentário de `VINCULO_LABEL` em
// `FinancasCentros.tsx` para o que falta de verdade (decidir QUAIS
// eventos merecem centro de custo próprio — não é todo culto de domingo).
export type FinCentroVinculo = "ministerio" | "area" | "ebd_classe" | "pgm_grupo" | "campanha" | "geral" | "evento" | "subgrupo_administracao";

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

// Fase 1 do projeto Tesouraria (12/09/2026): classificacao_dre é o
// agrupamento fixo do Plano de Contas Oficial 2025 (receitas_regulares /
// outras_receitas / despesas / despesas_financeiras / outras_despesas),
// populado nas 59 categorias oficiais. NULL numa categoria = fora do
// Plano Oficial (Campanhas, Eventos, Vendas, Materiais EBD, Outras
// despesas — uso interno de outro módulo, não entra na Prestação de
// Contas trimestral). Ver docs/PROJETO_TESOURARIA_PRESTACAO_CONTAS.md §6.1.
export type FinClassificacaoDRE =
  | "receitas_regulares" | "outras_receitas"
  | "despesas" | "despesas_financeiras" | "outras_despesas";

export interface FinCategoria {
  id: string;
  nome: string;
  tipo: FinMovimentoTipo;
  conta_contabil: string | null;
  classificacao_dre: FinClassificacaoDRE | null;
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

// Um lançamento que serve mais de um centro (a conta de luz do prédio,
// dividida entre os ministérios que usam o espaço) — `fin_lancamento_rateio`
// existia desde sempre, zero linhas, nenhuma tela. `lancamento_id` continua
// tendo o CENTRO PRINCIPAL em `fin_lancamentos.centro_custo_id` (o de maior
// percentual) — os relatórios por centro que já existem (Prestação de
// Contas, Top 5 da Visão Executiva, `vw_fin_centros_resumo`) somam por essa
// coluna, e nenhum deles foi refeito para ler o rateio. Fazer isso é
// trabalho à parte — listado no roadmap — porque envolve reescrever RPC/
// view que já rodam em produção, não só a tela de lançar.
export interface FinLancamentoRateio {
  id: string;
  lancamento_id: string;
  centro_custo_id: string;
  centro_nome?: string;
  percentual: number;
  valor: number;
  observacao: string | null;
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
  // `banco_nome`/`agencia`/`conta` já existiam na tabela (dado bancário pra
  // pagar por transferência) e não estavam nesta interface — por isso
  // nenhuma tela os usava. Acrescentados na Fase 4.1 do roadmap Financeiro
  // (ver docs/ROADMAP_FINANCEIRO_ERP.md), junto com a tela de cadastro.
  banco_nome: string | null;
  agencia: string | null;
  conta: string | null;
  categoria_padrao_id: string | null;
  ativo: boolean;
  observacao: string | null;
  created_at: string;
  updated_at: string;
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
  /** Quem mexeu por último e quando — carimbado em toda escrita que
      passa por `criarLancamento`/`atualizarLancamento` (ver comentário
      lá). Genérico ("última escrita"), não específico de aprovação. */
  audit_user_id?: string | null;
  audit_em?: string | null;
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
  const r = conferir(
    await supabase.from("fin_contas").update(patch as any).eq("id", id).select("id"),
    "A conta",
  );
  if (!r.ok) throw new Error(r.erro);
}

export async function desativarConta(id: string): Promise<void> {
  const r = conferir(
    await supabase.from("fin_contas").update({ ativo: false }).eq("id", id).select("id"),
    "A desativação da conta",
  );
  if (!r.ok) throw new Error(r.erro);
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

// ─── Rateio entre centros de custo ──────────────────────────────────────
export async function listarRateio(lancamentoId: string): Promise<FinLancamentoRateio[]> {
  const { data, error } = await supabase
    .from("fin_lancamento_rateio")
    .select("id, lancamento_id, centro_custo_id, percentual, valor, observacao")
    .eq("lancamento_id", lancamentoId);
  if (error) throw error;
  const rows = (data ?? []) as FinLancamentoRateio[];
  if (rows.length === 0) return rows;

  const ccIds = Array.from(new Set(rows.map(r => r.centro_custo_id)));
  const { data: ccs } = await supabase.from("fin_centros_custo").select("id, nome").in("id", ccIds);
  const mCC = new Map((ccs ?? []).map((c: any) => [c.id, c.nome]));
  return rows.map(r => ({ ...r, centro_nome: mCC.get(r.centro_custo_id) }));
}

/**
 * Substitui o rateio inteiro de um lançamento pelos itens dados —
 * apaga o que existia e grava de novo, mais simples que tentar casar
 * linha a linha, e o volume por lançamento é sempre pequeno (poucos
 * centros). `itens` já vem com `percentual` conferido em 100% pela tela;
 * esta função não reconfere, só grava.
 */
// Sem `conferir()` de propósito: apagar o rateio ANTERIOR de um lançamento
// que nunca teve rateio é 0 linhas de verdade, não RLS barrando — a mesma
// categoria de UPDATE/DELETE em massa que `escritaConferida.ts` documenta
// como ambígua (0 pode ser "nada pra apagar" ou "bloqueado"), então não
// entra no padrão. O INSERT que vem depois, esse sim, falha alto se a RLS
// barrar (erro de verdade, não sucesso silencioso).
export async function salvarRateio(
  lancamentoId: string,
  itens: { centroCustoId: string; percentual: number; valor: number; observacao?: string }[],
): Promise<void> {
  const { error: delError } = await supabase.from("fin_lancamento_rateio").delete().eq("lancamento_id", lancamentoId);
  if (delError) throw delError;

  if (itens.length === 0) return; // rateio removido — lançamento volta a ter um centro só

  const { error } = await supabase.from("fin_lancamento_rateio").insert(
    itens.map(i => ({
      lancamento_id: lancamentoId,
      centro_custo_id: i.centroCustoId,
      percentual: i.percentual,
      valor: i.valor,
      observacao: i.observacao ?? null,
    })),
  );
  if (error) throw error;
}

// ─── Fornecedores ────────────────────────────────────────────────────────
// `limit(200)`, não 50: o limite original era pensado pro autocomplete do
// `LancamentoForm` (poucos resultados de digitação), mas a tela de cadastro
// (Fase 4.1) lista TODOS os fornecedores — e uma igreja não tem volume que
// justifique paginação de verdade ainda.
export async function listarFornecedores(busca?: string, incluirInativos = false): Promise<FinFornecedor[]> {
  let q = supabase.from("fin_fornecedores").select("*").order("nome").limit(200);
  if (!incluirInativos) q = q.eq("ativo", true);
  if (busca && busca.length >= 2) q = q.ilike("nome", `%${busca}%`);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as FinFornecedor[];
}

export async function buscarFornecedor(id: string): Promise<FinFornecedor | null> {
  const { data, error } = await supabase.from("fin_fornecedores").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data ?? null) as FinFornecedor | null;
}

export async function criarFornecedor(input: Partial<FinFornecedor>): Promise<FinFornecedor> {
  const { data, error } = await supabase.from("fin_fornecedores").insert(input as any).select("*").single();
  if (error) throw error;
  return data as FinFornecedor;
}

// `ativo = false` em vez de apagar — mesma convenção do resto do banco
// ([§5.1 do CLAUDE.md](../../CLAUDE.md)). Usado tanto para editar a ficha
// quanto para inativar/reativar (patch `{ ativo: false | true }`).
export async function atualizarFornecedor(id: string, patch: Partial<FinFornecedor>): Promise<void> {
  const r = conferir(
    await supabase.from("fin_fornecedores").update(patch as any).eq("id", id).select("id"),
    "O fornecedor",
  );
  if (!r.ok) throw new Error(r.erro);
}

// ─── Lançamentos ────────────────────────────────────────────────────────
export interface FiltroLancamento {
  contaId?: string;
  tipo?: FinMovimentoTipo;
  status?: FinStatus;
  categoriaId?: string;
  centroCustoId?: string;
  pessoaId?: string;
  fornecedorId?: string;
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
  if (filtro.pessoaId) q = q.eq("pessoa_id", filtro.pessoaId);
  if (filtro.fornecedorId) q = q.eq("fornecedor_id", filtro.fornecedorId);
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

// `audit_user_id`/`audit_em` existiam desde a criação da tabela e
// nenhuma linha de código os preenchia (achado na auditoria do ERP
// financeiro, 12/09/2026) — "quem mexeu por último, quando", carimbado
// aqui, depois do `...input`/`...patch`, pra nunca ser sobrescrito por
// valor que vier de fora. Cobre toda escrita que passa por estas duas
// funções — que é, hoje, todo caminho do app (services e componentes
// sempre chamam `criarLancamento`/`atualizarLancamento`, nunca escrevem
// direto em `fin_lancamentos`). Não é um gatilho de banco: uma escrita
// que algum dia contornasse estas funções (SQL direto, RPC nova) não
// seria carimbada — um trigger cobriria isso também, mas pede migration
// e o token de gerenciamento está expirado agora; registrado no roadmap
// como possível endurecimento futuro.
export async function criarLancamento(input: Partial<FinLancamento>): Promise<FinLancamento> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  const payload = { ...input, audit_user_id: userId ?? null, audit_em: new Date().toISOString() };
  const { data, error } = await supabase.from("fin_lancamentos").insert(payload as any).select("*").single();
  if (error) throw error;
  return data as FinLancamento;
}

export async function atualizarLancamento(id: string, patch: Partial<FinLancamento>): Promise<void> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  const payload = { ...patch, audit_user_id: userId ?? null, audit_em: new Date().toISOString() };
  const r = conferir(
    await supabase.from("fin_lancamentos").update(payload as any).eq("id", id).select("id"),
    "O lançamento",
  );
  if (!r.ok) throw new Error(r.erro);
}

export async function excluirLancamento(id: string): Promise<void> {
  // tenta apagar comprovante junto
  const { data: l } = await supabase.from("fin_lancamentos").select("comprovante_url").eq("id", id).maybeSingle();
  if (l?.comprovante_url) await removerComprovante(l.comprovante_url);
  const r = conferir(
    await supabase.from("fin_lancamentos").delete().eq("id", id).select("id"),
    "O lançamento",
  );
  if (!r.ok) throw new Error(r.erro);
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
  const r = conferir(
    await supabase.from("fin_categorias").update(patch as any).eq("id", id).select("id"),
    "A categoria",
  );
  if (!r.ok) throw new Error(r.erro);
}

export async function excluirCategoria(id: string): Promise<void> {
  const r = conferir(
    await supabase.from("fin_categorias").delete().eq("id", id).select("id"),
    "A categoria",
  );
  if (!r.ok) throw new Error(r.erro);
}

export async function listarCategoriasTodas(): Promise<FinCategoria[]> {
  const { data, error } = await supabase
    .from("fin_categorias").select("*").order("tipo").order("ordem").order("nome");
  if (error) throw error;
  return (data ?? []) as FinCategoria[];
}

// ─── Reativar conta ─────────────────────────────────────────────────────
export async function reativarConta(id: string): Promise<void> {
  const r = conferir(
    await supabase.from("fin_contas").update({ ativo: true }).eq("id", id).select("id"),
    "A reativação da conta",
  );
  if (!r.ok) throw new Error(r.erro);
}

export async function excluirConta(id: string): Promise<void> {
  const r = conferir(
    await supabase.from("fin_contas").delete().eq("id", id).select("id"),
    "A conta",
  );
  if (!r.ok) throw new Error(r.erro);
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
  // Preenchido só por `listarRecorrencias()` (join manual, igual
  // `listarLancamentos`) — não existe na tabela. Fase 4.4 do roadmap
  // Financeiro: o dado (`fornecedor_id`) já existia e já era preenchível
  // no formulário desde sempre, mas nenhuma tela mostrava o nome.
  fornecedor_nome?: string;
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
  const recs = (data ?? []) as FinRecorrencia[];
  if (recs.length === 0) return recs;

  const fornIds = Array.from(new Set(recs.map(r => r.fornecedor_id).filter(Boolean))) as string[];
  if (fornIds.length === 0) return recs;
  const { data: forns } = await supabase.from("fin_fornecedores").select("id, nome").in("id", fornIds);
  const mF = new Map((forns ?? []).map((f: any) => [f.id, f.nome]));
  return recs.map(r => ({ ...r, fornecedor_nome: r.fornecedor_id ? mF.get(r.fornecedor_id) : undefined }));
}

export async function criarRecorrencia(input: Partial<FinRecorrencia>): Promise<FinRecorrencia> {
  const { data, error } = await supabase.from("fin_recorrencias").insert(input as any).select("*").single();
  if (error) throw error;
  return data as FinRecorrencia;
}

export async function atualizarRecorrencia(id: string, patch: Partial<FinRecorrencia>): Promise<void> {
  const r = conferir(
    await supabase.from("fin_recorrencias").update(patch as any).eq("id", id).select("id"),
    "A recorrência",
  );
  if (!r.ok) throw new Error(r.erro);
}

export async function excluirRecorrencia(id: string): Promise<void> {
  const r = conferir(
    await supabase.from("fin_recorrencias").delete().eq("id", id).select("id"),
    "A recorrência",
  );
  if (!r.ok) throw new Error(r.erro);
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
    data_pagamento: opts?.dataPagamento ?? hojeLocal(),
  };
  if (opts?.valorReal && opts.valorReal > 0) patch.valor = opts.valorReal;
  await atualizarLancamento(lancamentoId, patch);
}

// ─── Conciliação manual — realizado ⇄ conciliado ────────────────────────
//
// Item 6 do roadmap do ERP financeiro: o status `conciliado` já existia
// (e os relatórios já tratam `realizado`/`conciliado` como equivalentes
// para "dinheiro que já circulou"), mas nada na tela jamais o gravava —
// o botão "Conciliar" do Painel da Tesouraria só levava para o hub
// genérico. Sem importação de extrato ainda (OFX/CSV — depende do banco
// e formato que a Telma usar, decisão registrada no roadmap): isto é só
// a MARCAÇÃO manual, "bati este lançamento com o extrato do banco".
//
// Conciliar é reversível de propósito — um "bati" errado precisa ter
// volta sem virar exclusão.
export async function conciliarLancamento(lancamentoId: string): Promise<void> {
  await atualizarLancamento(lancamentoId, { status: "conciliado" });
}
export async function desconciliarLancamento(lancamentoId: string): Promise<void> {
  await atualizarLancamento(lancamentoId, { status: "realizado" });
}

/** Conciliar vários de uma vez — o caso real de bater um extrato inteiro. */
export async function conciliarEmLote(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const r = conferir(
    await supabase.from("fin_lancamentos").update({ status: "conciliado" }).in("id", ids).select("id"),
    "A conciliação",
  );
  if (!r.ok) throw new Error(r.erro);
}

// ─── Aprovar/rejeitar — aguardando_aprovacao → realizado | cancelado ────
//
// O status `aguardando_aprovacao` existe desde sempre em `fin_lancamentos`
// e o Painel da Tesouraria já lista essas pendências ("'aguardando
// aprovação' é decisão — alguém precisa dizer sim ou não", comentário em
// `painelTesourariaService.ts`) — mas não havia, em lugar nenhum do
// sistema, um botão que decidisse. Ligado em 12/09/2026, pedido dela
// ("Aprovação de Despesas" na missão do ERP Financeiro).
//
// Sem colunas novas de propósito nesta versão: `aprovado_por`/`aprovado_em`
// próprios ficam para quando o acesso de escrita ao banco desta sessão for
// restabelecido (o token de gerenciamento estava expirado em 12/09/2026) —
// ver `docs/ROADMAP_FINANCEIRO_ERP.md`. Por ora, aprovar carimba
// `data_pagamento` (o mesmo que `confirmarPagamento` já faz) e rejeitar
// guarda o motivo em `observacoes`, que já existe.
export async function aprovarLancamento(lancamentoId: string): Promise<void> {
  await atualizarLancamento(lancamentoId, {
    status: "realizado",
    data_pagamento: hojeLocal(),
  });
}

export async function rejeitarLancamento(lancamentoId: string, motivo: string): Promise<void> {
  const atual = await supabase.from("fin_lancamentos").select("observacoes").eq("id", lancamentoId).maybeSingle();
  const observacoesAnteriores = atual.data?.observacoes ?? "";
  const carimbo = `[Rejeitado em ${hojeLocal()}] ${motivo.trim()}`;
  await atualizarLancamento(lancamentoId, {
    status: "cancelado",
    observacoes: observacoesAnteriores ? `${observacoesAnteriores}\n${carimbo}` : carimbo,
  });
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

  // Transferência entre contas da própria igreja não é receita nem despesa
  // real — mesmo bug já corrigido em `vw_fin_resumo_mes` e
  // `dreService.gerarDRE` (12/09/2026): as duas pernas (`criarTransferencia`)
  // não têm categoria, e sem este filtro caíam em "Sem categoria" inflando
  // TOTAL DE ENTRADAS e TOTAL DE SAÍDAS igualmente. `porConta` continua
  // usando `realizados` (não filtrado) de propósito: ali a transferência É
  // movimento real daquela conta específica — só o total agregado e a
  // quebra por categoria (que não têm "categoria transferência") é que
  // precisam ignorá-la.
  const semTransferencia = realizados.filter(l => l.origem !== "transferencia");

  const totalEntradas = semTransferencia.filter(l => l.tipo === "entrada").reduce((s, l) => s + Number(l.valor), 0);
  const totalSaidas   = semTransferencia.filter(l => l.tipo === "saida").reduce((s, l) => s + Number(l.valor), 0);

  // Por categoria
  const catMap = new Map<string, { nome: string; tipo: FinMovimentoTipo; total: number; cor: string | null }>();
  semTransferencia.forEach(l => {
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

// ═══════════════════════════════════════════════════════════════════════════
// FASE 6 — Insights inteligentes + Previsão de caixa
// ═══════════════════════════════════════════════════════════════════════════

export interface FinAnomalia {
  categoria_id: string;
  categoria_nome: string;
  tipo: string;
  valor_mes: number;
  media_6m: number;
  variacao_pct: number | null;
  severidade: "novo" | "critico" | "atencao" | "normal";
}

export interface FinPrevisaoCaixa {
  saldo_atual: number;
  entradas_previstas_30d: number; saidas_previstas_30d: number; saldo_projetado_30d: number;
  entradas_previstas_60d: number; saidas_previstas_60d: number; saldo_projetado_60d: number;
  entradas_previstas_90d: number; saidas_previstas_90d: number; saldo_projetado_90d: number;
}

export interface FinComparativoMes {
  ano: number; mes: number; rotulo: string;
  entradas: number; saidas: number; resultado: number;
}

export interface FinTopFornecedor {
  fornecedor_id: string;
  fornecedor_nome: string;
  total: number;
  qtd_lancamentos: number;
}

export interface FinAlertaFinanceiro {
  tipo: string;
  titulo: string;
  descricao: string;
  severidade: "critico" | "atencao" | "info";
  link: string | null;
}

export async function anomaliasMes(ano?: number, mes?: number): Promise<FinAnomalia[]> {
  const { data, error } = await supabase.rpc("fin_anomalias_mes", {
    p_ano: ano ?? null,
    p_mes: mes ?? null,
  });
  if (error) throw error;
  return (data ?? []) as FinAnomalia[];
}

export async function previsaoCaixa(): Promise<FinPrevisaoCaixa | null> {
  const { data, error } = await supabase.rpc("fin_previsao_caixa");
  if (error) throw error;
  const arr = (data ?? []) as FinPrevisaoCaixa[];
  return arr[0] ?? null;
}

export async function comparativoMeses(n = 6): Promise<FinComparativoMes[]> {
  const { data, error } = await supabase.rpc("fin_comparativo_meses", { p_n: n });
  if (error) throw error;
  return (data ?? []) as FinComparativoMes[];
}

export async function topFornecedores(n = 10, dias = 90): Promise<FinTopFornecedor[]> {
  const { data, error } = await supabase.rpc("fin_top_fornecedores", { p_n: n, p_dias: dias });
  if (error) throw error;
  return (data ?? []) as FinTopFornecedor[];
}

export async function alertasFinanceiros(): Promise<FinAlertaFinanceiro[]> {
  const { data, error } = await supabase.rpc("fin_alertas_financeiros");
  if (error) throw error;
  return (data ?? []) as FinAlertaFinanceiro[];
}

// ═══════════════════════════════════════════════════════════════════════════
// FASE 7 — Centros de Custo Inteligentes
// ═══════════════════════════════════════════════════════════════════════════

export interface FinCentroResumo {
  id: string; nome: string;
  vinculo_tipo: FinCentroVinculo;
  vinculo_id: string | null;
  vinculo_nome: string | null;
  centro_pai_id: string | null;
  cor: string | null;
  ativo: boolean;
  gasto_90d: number;
  recebido_90d: number;
  gasto_mes: number;
  qtd_lancamentos_90d: number;
  ultima_movimentacao: string | null;
}

export interface FinOrcamento {
  id: string;
  ano: number;
  mes: number | null;
  centro_custo_id: string;
  categoria_id: string | null;
  valor_planejado: number;
  observacao: string | null;
}

export interface FinOrcamentoVsReal {
  id: string;
  ano: number;
  mes: number | null;
  centro_custo_id: string;
  centro_nome: string;
  categoria_id: string | null;
  valor_planejado: number;
  valor_real: number;
  percentual_consumido: number;
}

export interface FinAlertaCentro {
  centro_id: string;
  centro_nome: string;
  tipo_alerta: "acima_orcamento" | "orcamento_atencao" | "crescimento" | "sem_movimento";
  titulo: string;
  descricao: string;
  severidade: "critico" | "atencao" | "info";
}

// ─── Seed automático ───────────────────────────────────────────────────
export async function seedCentrosCusto(): Promise<{ criados: number; ja_existiam: number } | null> {
  const { data, error } = await supabase.rpc("fin_seed_centros_custo");
  if (error) throw error;
  const arr = (data ?? []) as any[];
  return arr[0] ?? null;
}

// ─── Listar com resumo ─────────────────────────────────────────────────
export async function listarCentrosComResumo(): Promise<FinCentroResumo[]> {
  const { data, error } = await supabase
    .from("vw_fin_centros_resumo").select("*").order("gasto_90d", { ascending: false });
  if (error) throw error;
  return (data ?? []) as FinCentroResumo[];
}

// ─── Orçamentos ────────────────────────────────────────────────────────
export async function listarOrcamentos(ano?: number, mes?: number | null): Promise<FinOrcamento[]> {
  let q = supabase.from("fin_orcamentos").select("*").order("ano", { ascending: false }).order("mes", { ascending: false });
  if (ano) q = q.eq("ano", ano);
  if (mes !== undefined) q = mes === null ? q.is("mes", null) : q.eq("mes", mes);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as FinOrcamento[];
}

export async function criarOrcamento(input: Partial<FinOrcamento>): Promise<FinOrcamento> {
  const { data, error } = await supabase.from("fin_orcamentos")
    .upsert(input as any, { onConflict: "ano,mes,centro_custo_id,categoria_id" })
    .select("*").single();
  if (error) throw error;
  return data as FinOrcamento;
}

export async function excluirOrcamento(id: string): Promise<void> {
  const r = conferir(await supabase.from("fin_orcamentos").delete().eq("id", id).select("id"), "O orçamento");
  if (!r.ok) throw new Error(r.erro);
}

export async function listarOrcamentoVsReal(): Promise<FinOrcamentoVsReal[]> {
  const { data, error } = await supabase
    .from("vw_fin_orcamento_vs_real").select("*")
    .order("percentual_consumido", { ascending: false });
  if (error) throw error;
  return (data ?? []) as FinOrcamentoVsReal[];
}

// ─── Alertas de centros ────────────────────────────────────────────────
export async function alertasCentros(): Promise<FinAlertaCentro[]> {
  const { data, error } = await supabase.rpc("fin_alertas_centros");
  if (error) throw error;
  return (data ?? []) as FinAlertaCentro[];
}

// ─── Sugestão automática ───────────────────────────────────────────────
export async function sugerirCentroPorCategoria(categoriaId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("fin_sugerir_centro_por_categoria", { p_categoria_id: categoriaId });
  if (error) return null;
  return (data as string | null) ?? null;
}
