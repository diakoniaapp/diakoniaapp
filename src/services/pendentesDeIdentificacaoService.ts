// ─── pendentesDeIdentificacaoService — a fila de Pendentes de Identificação (27/10/2026, Fase 3) ────────────────────────────────────────────────────────────────────────────────────────────────────
// Lê as contribuições desde o piso (todas, para a taxa) e a triagem vigente; grava o vínculo (pessoa e, se houver, família) no próprio lançamento — a trilha `fin_lancamento_historico` já registra quem
// mudou — e as decisões "anônimo", "ignorado" e "desfeita" pela função `contribuicao_triar` (migration 20261027220000). Toda escrita é CONFERIDA: um UPDATE barrado pela RLS devolve sucesso com zero linhas
// (`escritaConferida.ts`). O vínculo só grava em lançamento que AINDA está sem pessoa (`pessoa_id is null`): se outra pessoa vinculou antes, o clique recusa em vez de sobrescrever.
import { supabase } from "@/integrations/supabase/client";
import { conferir } from "@/lib/escritaConferida";
import { PISO_DE_IDENTIFICACAO, tipoDaContribuicao } from "@/lib/contribuicoes";
import type { CandidatoNome } from "@/lib/fuzzyNome";
import { NOTA_DE_CONTRIBUICAO_CONFIRMADA, type ContribuicaoParaTriagem, type DecisaoDeTriagem } from "@/lib/identificacaoDeContribuicoes";
import { buscarPessoasParaLancamento, carimboDeConferencia } from "@/services/finService";

const PAGINA = 1000;
async function paginar<T>(consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const todas: T[] = [];
  for (let p = 0; ; p++) {
    const { data, error } = await consulta(p * PAGINA, p * PAGINA + PAGINA - 1);
    if (error) throw new Error(error.message);
    todas.push(...(data ?? []));
    if (!data || data.length < PAGINA) break;
  }
  return todas;
}

/** Todas as contribuições realizadas (Dízimos, Ofertas, Missões) desde 01/01/2026, com ou sem pessoa — a taxa precisa do todo, a fila só dos sem pessoa. */
export async function carregarContribuicoesParaTriagem(): Promise<ContribuicaoParaTriagem[]> {
  const { data: cats, error } = await supabase.from("fin_categorias").select("id, nome").eq("tipo", "entrada");
  if (error) throw new Error(error.message);
  const nomePorId = new Map<string, string>();
  for (const c of cats ?? []) if (tipoDaContribuicao(c.nome) !== null) nomePorId.set(c.id, c.nome);
  if (nomePorId.size === 0) return [];
  const brutas = await paginar<{ id: string; data: string; valor: number; categoria_id: string; descricao: string | null; observacoes: string | null; origem: string | null; forma_pagamento: string | null; pessoa_id: string | null; familia_id: string | null; fornecedor_id: string | null; conta_id: string | null; conferencia_nota: string | null }>((de, ate) =>
    supabase.from("fin_lancamentos").select("id, data, valor, categoria_id, descricao, observacoes, origem, forma_pagamento, pessoa_id, familia_id, fornecedor_id, conta_id, conferencia_nota")
      .eq("tipo", "entrada").in("status", ["realizado", "conciliado"]).in("categoria_id", [...nomePorId.keys()]).gte("data", PISO_DE_IDENTIFICACAO)
      .order("data", { ascending: false }).order("id", { ascending: true }).range(de, ate) as never);   // `conferencia_nota` ainda não está no types.ts gerado
  // a conta de cada lançamento (nome e tipo), para o aviso de possível movimentação interna
  const { data: contas, error: eContas } = await supabase.from("fin_contas").select("id, nome, tipo");
  if (eContas) throw new Error(eContas.message);
  const contaPorId = new Map((contas ?? []).map(c => [c.id, c]));
  // o favorecido ligado a uma pessoa: só dos lançamentos SEM pessoa (é para eles que a fila sugere), em blocos de 200 para a URL não estourar
  const idsDeFavorecido = [...new Set(brutas.filter(l => !l.pessoa_id && l.fornecedor_id).map(l => l.fornecedor_id!))];
  const pessoaDoFavorecido = new Map<string, string>();
  for (let i = 0; i < idsDeFavorecido.length; i += 200) {
    // `pessoa_id` de fin_fornecedores ainda não está no types.ts gerado (a coluna existe no banco desde o Favorecido Financeiro): leitura tipada à mão, como em finService
    const r = (await supabase.from("fin_fornecedores").select("id, pessoa_id" as never).in("id", idsDeFavorecido.slice(i, i + 200)).not("pessoa_id" as never, "is", null)) as unknown as { data: { id: string; pessoa_id: string | null }[] | null; error: { message: string } | null };
    if (r.error) throw new Error(r.error.message);
    for (const f of r.data ?? []) if (f.pessoa_id) pessoaDoFavorecido.set(f.id, f.pessoa_id);
  }
  return brutas.map(l => ({ id: l.id, data: l.data, valor: Number(l.valor), categoria: nomePorId.get(l.categoria_id) ?? null, descricao: l.descricao, observacoes: l.observacoes, origem: l.origem, forma_pagamento: l.forma_pagamento, pessoa_id: l.pessoa_id, familia_id: l.familia_id, conferencia_nota: l.conferencia_nota, conta_nome: l.conta_id ? contaPorId.get(l.conta_id)?.nome ?? null : null, conta_tipo: l.conta_id ? (contaPorId.get(l.conta_id)?.tipo as string | undefined) ?? null : null, fornecedor_pessoa_id: l.fornecedor_id ? pessoaDoFavorecido.get(l.fornecedor_id) ?? null : null }));
}

export interface TriagemVigente { lancamento_id: string; decisao: DecisaoDeTriagem; motivo: string | null; por_nome: string | null; em: string }
export interface TriagemCarregada { vigentes: TriagemVigente[]; /** a migration 20261027220000 ainda não foi aplicada */ indisponivel: boolean }

/** A decisão vigente de cada lançamento. Sem a view (migration pendente) devolve `indisponivel` em vez de falhar: a fila continua útil para vincular pessoa. */
export async function carregarTriagem(): Promise<TriagemCarregada> {
  try {
    const todas = await paginar<TriagemVigente>((de, ate) => supabase.from("fin_contribuicao_triagem_atual" as never).select("lancamento_id, decisao, motivo, por_nome, em").range(de, ate) as never);
    return { vigentes: todas, indisponivel: false };
  } catch (e) {
    if (/does not exist|could not find the table|PGRST205|42P01/i.test(e instanceof Error ? e.message : "")) return { vigentes: [], indisponivel: true };
    throw e;
  }
}

/** Os candidatos para sugerir: toda pessoa do cadastro (nome e id). */
export async function carregarCandidatosDeNome(): Promise<CandidatoNome[]> {
  const pessoas = await paginar<{ id: string; nome_completo: string }>((de, ate) => supabase.from("membros").select("id, nome_completo").order("id", { ascending: true }).range(de, ate));
  return pessoas.map(p => ({ id: p.id, nome: p.nome_completo }));
}

export type ResultadoDaEscrita = { ok: boolean; erro?: string };   // sem união discriminada: o TypeScript do projeto não é estrito

/** Vincula a contribuição a uma pessoa (e à família dela, se informada). Só grava se o lançamento ainda estiver sem pessoa. */
export async function vincularContribuicao(lancamentoId: string, pessoaId: string, familiaId: string | null = null): Promise<ResultadoDaEscrita> {
  const r = conferir(
    await supabase.from("fin_lancamentos").update({ pessoa_id: pessoaId, ...(familiaId ? { familia_id: familiaId } : {}) }).eq("id", lancamentoId).is("pessoa_id", null).select("id"),
    "O vínculo da contribuição",
  );
  return r.ok ? { ok: true } : { ok: false, erro: r.erro };
}

/**
 * "É contribuição — não avisar mais": a Tesouraria conferiu um lançamento que parecia movimentação interna e confirmou que é contribuição. Grava o carimbo de conferência (quem e quando) e a nota;
 * não muda valor, categoria, conta nem status.
 */
export async function confirmarComoContribuicao(lancamentoId: string): Promise<ResultadoDaEscrita> {
  const carimbo = await carimboDeConferencia();
  const r = conferir(
    await supabase.from("fin_lancamentos").update({ ...carimbo, conferencia_nota: NOTA_DE_CONTRIBUICAO_CONFIRMADA } as never).eq("id", lancamentoId).select("id"),
    "A confirmação da contribuição",
  );
  return r.ok ? { ok: true } : { ok: false, erro: r.erro };
}

/** Desfaz um vínculo feito agora: só remove se a pessoa ainda for a mesma que foi vinculada (não apaga o trabalho de outro). A trilha do lançamento registra os dois movimentos. */
export async function desvincularContribuicao(lancamentoId: string, pessoaId: string, tinhaFamilia: boolean): Promise<ResultadoDaEscrita> {
  const r = conferir(
    await supabase.from("fin_lancamentos").update({ pessoa_id: null, ...(tinhaFamilia ? { familia_id: null } : {}) }).eq("id", lancamentoId).eq("pessoa_id", pessoaId).select("id"),
    "A remoção do vínculo",
  );
  return r.ok ? { ok: true } : { ok: false, erro: r.erro };
}

/** "anônimo", "ignorado" ou "desfeita" — pela função do banco, que confere o papel e que o lançamento é uma contribuição sem pessoa. */
export async function triarContribuicao(lancamentoId: string, decisao: DecisaoDeTriagem | "desfeita", motivo?: string): Promise<ResultadoDaEscrita> {
  const { error } = await supabase.rpc("contribuicao_triar" as never, { p_lancamento: lancamentoId, p_decisao: decisao, p_motivo: motivo ?? null } as never);
  if (!error) return { ok: true };
  const faltaAFuncao = (error as { code?: string }).code === "PGRST202" || /could not find the function/i.test(error.message);
  return { ok: false, erro: faltaAFuncao ? "A classificação ainda não está disponível no banco (migration 20261027220000 pendente)." : error.message };
}

// ── buscar pessoa e família para vincular ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface PessoaParaVincular { id: string; nome: string }
export async function buscarPessoas(termo: string): Promise<PessoaParaVincular[]> {
  return buscarPessoasParaLancamento(termo, true);
}

export interface FamiliaParaVincular { id: string; nome: string; membros: (PessoaParaVincular & { responsavel: boolean })[] }
/** As famílias cujo nome contém o termo, com os membros de cada uma (o responsável marcado). */
export async function buscarFamilias(termo: string): Promise<FamiliaParaVincular[]> {
  if (termo.trim().length < 2) return [];
  const { data: familias, error } = await supabase.from("familias").select("id, nome_familia").ilike("nome_familia", `%${termo.trim()}%`).order("nome_familia").limit(8);
  if (error) throw new Error(error.message);
  if (!familias || familias.length === 0) return [];
  const { data: vinculos, error: e2 } = await supabase.from("vinculos_familiares").select("familia_id, membro_id, responsavel_familia").in("familia_id", familias.map(f => f.id));
  if (e2) throw new Error(e2.message);
  const ids = [...new Set((vinculos ?? []).map(v => v.membro_id))];
  const { data: pessoas } = ids.length ? await supabase.from("membros").select("id, nome_completo").in("id", ids) : { data: [] as { id: string; nome_completo: string }[] };
  const nomePor = new Map((pessoas ?? []).map(p => [p.id, p.nome_completo]));
  return familias.map(f => ({
    id: f.id, nome: f.nome_familia,
    membros: (vinculos ?? []).filter(v => v.familia_id === f.id).map(v => ({ id: v.membro_id, nome: nomePor.get(v.membro_id) ?? "—", responsavel: !!v.responsavel_familia }))
      .sort((a, b) => Number(b.responsavel) - Number(a.responsavel) || a.nome.localeCompare(b.nome, "pt-BR")),
  }));
}

/** A família de uma pessoa (a primeira), para vincular as duas de uma vez quando a pessoa tem família cadastrada. */
export async function familiaDaPessoa(pessoaId: string): Promise<string | null> {
  const { data } = await supabase.from("vinculos_familiares").select("familia_id").eq("membro_id", pessoaId).limit(1);
  return data && data[0] ? data[0].familia_id : null;
}
