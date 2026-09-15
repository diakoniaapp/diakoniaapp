// ─── doadorService.ts ────────────────────────────────────────────────────
//
// Histórico de contribuição por pessoa — item que a auditoria do ERP
// financeiro (12/09/2026) achou como gap ("CRM de doador"), mas não
// construiu na hora porque dependia de uma decisão de privacidade. `pessoa_
// id` em `fin_lancamentos` já existia e já resolvia pra nome; faltava só a
// tela. A Telma respondeu: "os tesoureiros e administrador do sistema
// podem ver tudo sobre as doações" — por isso as telas que usam este
// serviço são fechadas a `ROLES_DOADORES` (mais estreito que
// `ROLES_FINANCEIRO`), não à malha inteira do financeiro. Ver o comentário
// de `ROLES_DOADORES` em navConfig.ts.
//
// Nenhuma tabela nova, nenhuma migration.
//
// `listarDoadoresComResumo` NÃO usa `listarLancamentos` (teto de 300
// linhas) — usava até 15/09/2026, quando a Telma reportou a busca por
// "Ana Lúcia" sempre voltando vazia. A causa real não era a busca (essa
// tinha um bug de acento também, corrigido na tela): 2026 sozinho já
// tem **1.854 entradas** (volume que cresceu com a importação histórica
// do Omie, 13/09/2026) — o comentário antigo aqui dizia "um ano de
// dízimos semanais de uma igreja pequena/média cabe" em 300 linhas; não
// cabe mais. `listarLancamentos({dataInicio:'2026-01-01',...})`, ordenado
// por data DESCENDENTE com LIMIT 300, trazia só os ~300 lançamentos MAIS
// RECENTES do ano — a doação de janeiro da Ana Lúcia nunca chegava na
// lista. Corrigido com consulta direta e paginada (bloco de 1.000, o
// teto real do PostgREST deste projeto — conferido ao vivo) em vez de
// um teto arbitrário de 300.
//
// O HISTÓRICO de uma pessoa específica (`listarContribuicoesPessoa`)
// continua usando `listarLancamentos` normalmente — filtrado a UMA
// pessoa, mesmo depois de anos dificilmente passa de 300 lançamentos.
import { supabase } from "@/integrations/supabase/client";
import { listarLancamentos, type FinLancamentoExtenso } from "./finService";

export interface DoadorResumo {
  pessoaId: string;
  nome: string;
  totalAno: number;
  qtdContribuicoesAno: number;
  ultimaContribuicao: string | null;
}

/**
 * Lista quem contribuiu (`tipo: entrada`, `pessoa_id` preenchido,
 * `status` realizado/conciliado) num ano (ou num mês daquele ano, se
 * `mes` for dado — 1 a 12, pedido da Telma em 15/09/2026), com o total
 * de cada um. Ordem alfabética por nome — NÃO por valor. A nota de
 * privacidade do roadmap já registrava o risco pastoral de expor isto
 * como "ranking de doadores"; quem quiser ordenar por valor na tela
 * pode, mas o padrão não é um placar.
 */
export async function listarDoadoresComResumo(ano: number, mes?: number): Promise<DoadorResumo[]> {
  const dataInicio = mes ? `${ano}-${String(mes).padStart(2, "0")}-01` : `${ano}-01-01`;
  // Último dia do mês, não "01 do mês seguinte" — mesmo padrão de
  // `resumoMensal` em finService.ts (`new Date(ano, mes, 0)`, dia 0 do
  // mês seguinte = último dia do mês pedido).
  const dataFim = mes
    ? new Date(ano, mes, 0).toISOString().slice(0, 10)
    : `${ano}-12-31`;

  // Paginado — ver comentário do arquivo. 1000 é o teto real por
  // requisição do PostgREST deste projeto (pedir mais não adianta, o
  // servidor devolve 1000 mesmo assim); a página incompleta (< 1000)
  // marca o fim.
  const TAMANHO_PAGINA = 1000;
  const brutos: { pessoa_id: string; valor: number; data: string }[] = [];
  for (let pagina = 0; ; pagina++) {
    const { data, error } = await supabase
      .from("fin_lancamentos")
      .select("pessoa_id, valor, data")
      .eq("tipo", "entrada")
      .not("pessoa_id", "is", null)
      .in("status", ["realizado", "conciliado"])
      .gte("data", dataInicio)
      .lte("data", dataFim)
      .order("data", { ascending: true })
      .range(pagina * TAMANHO_PAGINA, pagina * TAMANHO_PAGINA + TAMANHO_PAGINA - 1);
    if (error) throw error;
    brutos.push(...((data ?? []) as { pessoa_id: string; valor: number; data: string }[]));
    if (!data || data.length < TAMANHO_PAGINA) break;
  }

  const pessoaIds = Array.from(new Set(brutos.map(l => l.pessoa_id)));
  const { data: pessoas } = pessoaIds.length
    ? await supabase.from("membros").select("id, nome_completo").in("id", pessoaIds)
    : { data: [] as { id: string; nome_completo: string }[] };
  const mapaNome = new Map((pessoas ?? []).map((p: any) => [p.id, p.nome_completo]));

  const porPessoa = new Map<string, DoadorResumo>();
  brutos.forEach(l => {
    const pessoaId = l.pessoa_id;
    const ex = porPessoa.get(pessoaId);
    if (ex) {
      ex.totalAno += Number(l.valor);
      ex.qtdContribuicoesAno += 1;
      if (!ex.ultimaContribuicao || l.data > ex.ultimaContribuicao) ex.ultimaContribuicao = l.data;
    } else {
      porPessoa.set(pessoaId, {
        pessoaId,
        nome: mapaNome.get(pessoaId) ?? "—",
        totalAno: Number(l.valor),
        qtdContribuicoesAno: 1,
        ultimaContribuicao: l.data,
      });
    }
  });

  return Array.from(porPessoa.values()).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/**
 * Histórico de contribuições de UMA pessoa — `ano` opcional filtra;
 * sem ele, é "todo o período" (seguro para uma pessoa só, ver comentário
 * do arquivo).
 */
export async function listarContribuicoesPessoa(pessoaId: string, ano?: number): Promise<FinLancamentoExtenso[]> {
  const lancs = await listarLancamentos({
    pessoaId,
    tipo: "entrada",
    dataInicio: ano ? `${ano}-01-01` : undefined,
    dataFim: ano ? `${ano}-12-31` : undefined,
  });
  return lancs.filter(l => l.status === "realizado" || l.status === "conciliado");
}
