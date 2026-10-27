// ─── contribuicoesService — o que a tela Doadores lê (27/10/2026) ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Só LEITURA, sem agregar no banco: traz as linhas mínimas (pessoa, data, valor, categoria) desde o piso de 01/01/2026 e deixa o cálculo para `lib/contribuicoes` (o mesmo código que o e-mail ao pastor
// usará). Medido em 27/10/2026: 1.309 contribuições identificadas desde o piso = 2 páginas de 1.000; cabe em memória. A consulta NÃO usa `listarLancamentos` (teto de 300 linhas — o defeito que
// `doadorService` registra); pagina de 1.000 em 1.000, com `id` como desempate para a paginação não repetir nem pular linha de mesma data.
import { supabase } from "@/integrations/supabase/client";
import { lerContribuicoesDoPiso } from "../../supabase/functions/_shared/contribuicoes/carregar";
import type { LinhaDeContribuicao, PessoaDaBase } from "@/lib/contribuicoes";

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

/** As contribuições (Dízimos, Ofertas, Missões) realizadas/conciliadas de 01/01/2026 até `fim`, com ou sem pessoa ligada. A consulta é a MESMA do e-mail ao pastor (`_shared/contribuicoes/carregar.ts`). */
export async function carregarContribuicoes(fim: string): Promise<LinhaDeContribuicao[]> {
  return lerContribuicoesDoPiso(supabase, fim);
}

/** Membros e congregados ATIVOS, com a família (vínculos familiares) de cada um. Quem não está na base (inativo, ex-membro, visitante) volta só pelo nome, em `carregarNomes`. */
export async function carregarBaseDePessoas(): Promise<PessoaDaBase[]> {
  const pessoas = await paginar<{ id: string; nome_completo: string; tipo_pessoa: string; status: string; data_nascimento: string | null }>((de, ate) =>
    supabase.from("membros").select("id, nome_completo, tipo_pessoa, status, data_nascimento")
      .eq("status", "ativo").in("tipo_pessoa", ["membro", "congregado"]).order("id", { ascending: true }).range(de, ate));
  const vinculos = await paginar<{ membro_id: string; familia_id: string }>((de, ate) =>
    supabase.from("vinculos_familiares").select("membro_id, familia_id").order("id", { ascending: true }).range(de, ate));
  const familiaDe = new Map(vinculos.map(v => [v.membro_id, v.familia_id]));
  return pessoas.map(p => ({ id: p.id, nome: p.nome_completo, tipo_pessoa: p.tipo_pessoa, status: p.status, data_nascimento: p.data_nascimento, familia_id: familiaDe.get(p.id) ?? null }));
}

/** Os nomes de quem contribuiu e não está na base (inativos, ex-membros…). Em blocos, para a URL do `in()` não estourar. */
export async function carregarNomes(ids: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase.from("membros").select("id, nome_completo").in("id", ids.slice(i, i + 200));
    if (error) throw new Error(error.message);
    for (const p of data ?? []) mapa.set(p.id, p.nome_completo);
  }
  return mapa;
}

// ── o registro de quem VÊ a lista nominal ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export type AcaoDoRegistro = "ver_pessoas" | "ver_nao_contribuiram" | "exportar_pessoas" | "exportar_nao_contribuiram" | "ver_pessoa";
/**
 * `ok`: gravou. `indisponivel`: a função ainda não existe no banco (migration 20261027160000 não aplicada) — a tela mostra a lista COM um aviso. Qualquer outro erro (sem permissão, rede)
 * NÃO libera a lista: sem registro, sem nomes.
 */
export interface ResultadoDoRegistro { ok: boolean; indisponivel?: boolean; erro?: string }   // (sem união discriminada: o TypeScript deste projeto não é estrito e não estreitaria por `ok`)

export async function registrarAcessoNominal(acao: AcaoDoRegistro, filtros: Record<string, unknown>, total: number | null): Promise<ResultadoDoRegistro> {
  try {
    const { error } = await supabase.rpc("contribuicoes_registrar_acesso" as never, { p_acao: acao, p_filtros: filtros, p_total: total } as never);
    if (!error) return { ok: true };
    const faltaAFuncao = (error as { code?: string }).code === "PGRST202" || /could not find the function|does not exist/i.test(error.message);
    return { ok: false, indisponivel: faltaAFuncao, erro: error.message };
  } catch (e) {
    return { ok: false, indisponivel: false, erro: e instanceof Error ? e.message : "Falha ao registrar o acesso." };
  }
}
