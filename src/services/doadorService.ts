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
// Nenhuma tabela nova, nenhuma migration — é agrupamento em memória sobre
// `fin_lancamentos` que já existe, mesmo padrão do DRE (item 5) e por isso
// com o mesmo limite: a lista GERAL é sempre de UM ano (mesmo motivo do
// DRE — `listarLancamentos` tem teto de 300 linhas; um ano de dízimos
// semanais de uma igreja pequena/média cabe, um recorte maior arrisca
// truncar em silêncio). O HISTÓRICO de uma pessoa específica pode ser
// "todo o período" com segurança, porque é filtrado a UMA pessoa — mesmo
// depois de anos, dificilmente passa de 300 lançamentos.
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
 * `status` realizado/conciliado) num ano, com o total de cada um. Ordem
 * alfabética por nome — NÃO por valor. A nota de privacidade do roadmap
 * já registrava o risco pastoral de expor isto como "ranking de
 * doadores"; quem quiser ordenar por valor na tela pode, mas o padrão
 * não é um placar.
 */
export async function listarDoadoresComResumo(ano: number): Promise<DoadorResumo[]> {
  const lancs = await listarLancamentos({
    tipo: "entrada",
    dataInicio: `${ano}-01-01`,
    dataFim: `${ano}-12-31`,
  });
  const contribuicoes = lancs.filter(l =>
    (l.status === "realizado" || l.status === "conciliado") && l.pessoa_id,
  );

  const porPessoa = new Map<string, DoadorResumo>();
  contribuicoes.forEach(l => {
    const pessoaId = l.pessoa_id!;
    const ex = porPessoa.get(pessoaId);
    if (ex) {
      ex.totalAno += Number(l.valor);
      ex.qtdContribuicoesAno += 1;
      if (!ex.ultimaContribuicao || l.data > ex.ultimaContribuicao) ex.ultimaContribuicao = l.data;
    } else {
      porPessoa.set(pessoaId, {
        pessoaId,
        nome: l.pessoa_nome ?? "—",
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
