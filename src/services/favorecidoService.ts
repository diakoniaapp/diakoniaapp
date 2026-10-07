// ─── favorecidoService.ts — o Favorecido Financeiro: pessoa (vinculada ao Cadastro de Pessoas) ou empresa ────
//
// Migrations 20261007130000/130100. O cadastro que se chamava "fornecedor" (`fin_fornecedores`) passou a ser o de
// Favorecidos; `pessoa_id` é a ponte para o Cadastro de Pessoas. Aqui: achar a pessoa, ver se já há cadastro financeiro
// dela (mesmo CPF/nome — para LIGAR em vez de duplicar) e vincular. A função do banco é idempotente e só deixa uma pessoa
// ter um favorecido. Docs: docs/FAVORECIDO_FINANCEIRO.md.

import { supabase } from "@/integrations/supabase/client";
import { buscarFornecedor, type FinFornecedor } from "@/services/finService";

export interface PessoaBusca { id: string; nome: string; vinculo: string; telefone: string | null; favorecidoId: string | null }
export interface CandidatoFinanceiro { id: string; nome: string; tipo: string | null; cnpj_cpf: string | null; lancamentos: number; motivo: string }

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Pessoas do cadastro pelo nome — sem exigir acento ("jose" acha "José"): as vogais e o c viram `_` (um caractere qualquer)
 * na busca do banco, e o resultado é conferido de novo, já sem acento, aqui.
 */
export async function buscarPessoasParaFavorecido(termo: string): Promise<PessoaBusca[]> {
  const limpo = termo.trim();
  if (limpo.length < 2) return [];
  const padrao = "%" + semAcento(limpo).replace(/[%_]/g, "").replace(/[aeiouc]/g, "_") + "%";
  const { data, error } = await supabase.from("membros")
    .select("id, nome_completo, tipo_pessoa, telefone_celular").ilike("nome_completo", padrao).order("nome_completo").limit(40);
  if (error) throw new Error(error.message);
  const alvo = semAcento(limpo);
  const pessoas = (data ?? []).filter(p => semAcento(p.nome_completo).includes(alvo)).slice(0, 8);
  if (pessoas.length === 0) return [];
  const { data: favs } = await supabase.from("fin_fornecedores").select("id, pessoa_id").in("pessoa_id" as never, pessoas.map(p => p.id) as never);
  const ja = new Map(((favs ?? []) as unknown as { id: string; pessoa_id: string }[]).map(f => [f.pessoa_id, f.id]));
  return pessoas.map(p => ({ id: p.id, nome: p.nome_completo, vinculo: String(p.tipo_pessoa), telefone: p.telefone_celular, favorecidoId: ja.get(p.id) ?? null }));
}

/** Cadastros financeiros EXISTENTES que parecem ser esta pessoa (mesmo CPF ou mesmo nome) e ainda não são de ninguém. */
export async function candidatosDaPessoa(pessoaId: string): Promise<CandidatoFinanceiro[]> {
  const { data, error } = await supabase.rpc("fin_favorecido_candidatos" as never, { p_pessoa_id: pessoaId } as never);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as CandidatoFinanceiro[]).map(c => ({ ...c, lancamentos: Number(c.lancamentos) }));
}

/** Cria o favorecido da pessoa — ou LIGA o cadastro financeiro existente indicado. Idempotente. Devolve o favorecido completo. */
export async function vincularPessoaComoFavorecido(pessoaId: string, cadastroExistenteId?: string): Promise<FinFornecedor> {
  const { data, error } = await supabase.rpc("fin_vincular_pessoa_favorecido" as never,
    { p_pessoa_id: pessoaId, p_fornecedor_id: cadastroExistenteId ?? null } as never);
  if (error) throw new Error(error.message);
  const f = await buscarFornecedor(data as unknown as string);
  if (!f) throw new Error("O favorecido foi criado, mas não consegui abri-lo.");
  return f;
}

/** O vínculo na igreja da pessoa de um favorecido (para mostrar na ficha). */
export async function pessoaDoFavorecido(pessoaId: string): Promise<{ id: string; nome: string; vinculo: string } | null> {
  const { data } = await supabase.from("membros").select("id, nome_completo, tipo_pessoa").eq("id", pessoaId).maybeSingle();
  return data ? { id: data.id, nome: data.nome_completo, vinculo: String(data.tipo_pessoa) } : null;
}
