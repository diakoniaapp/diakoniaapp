// ─── carregar — a MESMA consulta das contribuições, para a tela e para a Edge Function (27/10/2026) ───────────────────────────────────────────────────────────────────────────────────────
// O e-mail ao pastor tem de dizer o MESMO número que a tela Doadores: por isso a consulta mora aqui, num arquivo só, e a tela (`contribuicoesService`) e a função (`contribuicoes-enviar`) a chamam.
// `cliente` é só o que se usa do supabase-js (o módulo não importa a biblioteca). Desde 01/01/2026 (piso) até `fim`; só Dízimos, Ofertas e Missões; paginado de 1.000 em 1.000 com `id` de desempate.
import { PISO_DE_IDENTIFICACAO, tipoDaContribuicao, type LinhaDeContribuicao, type PessoaDaBase } from "./analise.ts";

const PAGINA = 1000;

export async function lerContribuicoesDoPiso(cliente: { from: (tabela: string) => any }, fim: string): Promise<LinhaDeContribuicao[]> {
  const cats = await cliente.from("fin_categorias").select("id, nome").eq("tipo", "entrada");
  if (cats.error) throw new Error(cats.error.message);
  const nomePorId = new Map<string, string>();
  for (const c of (cats.data ?? []) as { id: string; nome: string }[]) if (tipoDaContribuicao(c.nome) !== null) nomePorId.set(c.id, c.nome);
  if (nomePorId.size === 0) return [];

  const brutas: { pessoa_id: string | null; data: string; valor: number; categoria_id: string }[] = [];
  for (let p = 0; ; p++) {
    const r = await cliente.from("fin_lancamentos").select("pessoa_id, data, valor, categoria_id")
      .eq("tipo", "entrada").in("status", ["realizado", "conciliado"])
      .in("categoria_id", [...nomePorId.keys()]).gte("data", PISO_DE_IDENTIFICACAO).lte("data", fim)
      .order("data", { ascending: true }).order("id", { ascending: true }).range(p * PAGINA, p * PAGINA + PAGINA - 1);
    if (r.error) throw new Error(r.error.message);
    brutas.push(...(r.data ?? []));
    if (!r.data || r.data.length < PAGINA) break;
  }
  return brutas.map(l => ({ pessoa_id: l.pessoa_id, data: l.data, valor: Number(l.valor), categoria: nomePorId.get(l.categoria_id) ?? null }));
}

/**
 * Membros e congregados ATIVOS, com a família (vínculo familiar) de cada um — a base do bloco "Sem contribuição" e da adesão. A MESMA consulta da tela e do e-mail; o e-mail só usa as
 * contagens (nenhum nome sai da função). Em blocos de 1.000 com `id` de desempate.
 */
export async function lerBaseDePessoas(cliente: { from: (tabela: string) => any }): Promise<PessoaDaBase[]> {
  const paginar = async <T>(consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> => {
    const todas: T[] = [];
    for (let p = 0; ; p++) {
      const r = await consulta(p * PAGINA, p * PAGINA + PAGINA - 1);
      if (r.error) throw new Error(r.error.message);
      todas.push(...(r.data ?? []));
      if (!r.data || r.data.length < PAGINA) break;
    }
    return todas;
  };
  const pessoas = await paginar<{ id: string; nome_completo: string; tipo_pessoa: string; status: string; data_nascimento: string | null }>((de, ate) =>
    cliente.from("membros").select("id, nome_completo, tipo_pessoa, status, data_nascimento").eq("status", "ativo").in("tipo_pessoa", ["membro", "congregado"]).order("id", { ascending: true }).range(de, ate));
  const vinculos = await paginar<{ membro_id: string; familia_id: string }>((de, ate) =>
    cliente.from("vinculos_familiares").select("membro_id, familia_id").order("id", { ascending: true }).range(de, ate));
  const familiaDe = new Map(vinculos.map(v => [v.membro_id, v.familia_id]));
  return pessoas.map(p => ({ id: p.id, nome: p.nome_completo, tipo_pessoa: p.tipo_pessoa, status: p.status, data_nascimento: p.data_nascimento, familia_id: familiaDe.get(p.id) ?? null }));
}

/** O nome de cada pessoa pedida (quem contribuiu mas não está na base: inativo, ex-membro). Só para o relatório nominal do pastor; em blocos de 200 para a URL não estourar. */
export async function lerNomesDePessoas(cliente: { from: (tabela: string) => any }, ids: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 200) {
    const r = await cliente.from("membros").select("id, nome_completo").in("id", ids.slice(i, i + 200));
    if (r.error) throw new Error(r.error.message);
    for (const p of (r.data ?? []) as { id: string; nome_completo: string }[]) mapa.set(p.id, p.nome_completo);
  }
  return mapa;
}
