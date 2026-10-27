// ─── carregar — a MESMA consulta das contribuições, para a tela e para a Edge Function (27/10/2026) ───────────────────────────────────────────────────────────────────────────────────────
// O e-mail ao pastor tem de dizer o MESMO número que a tela Doadores: por isso a consulta mora aqui, num arquivo só, e a tela (`contribuicoesService`) e a função (`contribuicoes-enviar`) a chamam.
// `cliente` é só o que se usa do supabase-js (o módulo não importa a biblioteca). Desde 01/01/2026 (piso) até `fim`; só Dízimos, Ofertas e Missões; paginado de 1.000 em 1.000 com `id` de desempate.
import { PISO_DE_IDENTIFICACAO, tipoDaContribuicao, type LinhaDeContribuicao } from "./analise.ts";

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
