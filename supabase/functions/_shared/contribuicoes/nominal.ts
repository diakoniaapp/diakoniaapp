// ─── nominal — as listas COM NOMES do relatório do pastor, sem nenhum valor (27/10/2026) ──────────────────────────────────────────────────────────────────────────────────────────────────────
// Decisão dela (27/10/2026): o modelo Pastor pode levar nomes por e-mail — nome, última contribuição, frequência e situação (recorrente, novo, sem contribuição no período, sem contribuição há mais de 90 dias) —,
// mas NUNCA valor individual, média individual nem total contribuído. A garantia é de TIPO: `LinhaNominal` não tem campo de valor; quem monta a linha não recebe o valor (só datas, contagens e situação).
// Cada visualização e cada envio de relatório com nomes fica registrado (`contribuicoes_acessos` + `comunicacao_envios`), e o servidor recusa se o registro falhar.
import { ORDENACAO_PADRAO, type OrdenacaoDasListas } from "./blocos.ts";
import { diasEntre, resumirPessoas, type AnaliseDosSemContribuicao, type LinhaDeContribuicao, type PessoaSemContribuicao, type ResumoDePessoa } from "./analise.ts";

export interface LinhaNominal {
  /** a classificação (#): a posição na lista, já na ordem escolhida */
  posicao: number;
  nome: string;
  /** AAAA-MM-DD da última contribuição (a do período, ou a anterior a ele); `null` = nenhuma desde 01/01/2026 */
  ultima: string | null;
  /** quantas contribuições no período (só para quem contribuiu); frequência, não valor */
  contribuicoes: number | null;
  /** o que a linha diz sobre a pessoa, em palavras */
  situacao: string;
}

export interface ListasNominais { contribuiram: LinhaNominal[]; semContribuicao: LinhaNominal[] }


function situacaoDeQuemContribuiu(r: ResumoDePessoa): string {
  if (r.recorrente === true) return "Recorrente";
  if (r.nova === true) return "Novo";
  return "Contribuiu no período";
}

function situacaoDeQuemNaoContribuiu(p: PessoaSemContribuicao): string {
  if (p.classificacao === "nunca") return "Nenhuma contribuição desde 01/01/2026";
  if (p.dias !== null && p.dias > 180) return "Sem contribuição há mais de 180 dias";
  if (p.dias !== null && p.dias > 90) return "Sem contribuição há mais de 90 dias";
  return "Sem contribuição no período";
}

/** O que a ordenação enxerga de cada pessoa. O `total` SÓ ordena (opção "valor total contribuído"): nunca chega à linha que sai. */
interface ParaOrdenar { nome: string; ultima: string | null; quantidade: number; total: number; dias: number | null }
type Comparador = (a: ParaOrdenar, b: ParaOrdenar) => number;
const porNome: Comparador = (a, b) => a.nome.localeCompare(b.nome, "pt-BR");
const porQuantidade: Comparador = (a, b) => b.quantidade - a.quantidade;
/** última contribuição, a mais recente primeiro; quem não tem nenhuma (nulo) fica por último */
const porUltima: Comparador = (a, b) => (b.ultima ?? "").localeCompare(a.ultima ?? "");
const porValor: Comparador = (a, b) => b.total - a.total;
/** há mais tempo sem contribuir primeiro; "nenhuma desde 01/01/2026" (nulo) vem antes de todos */
const porTempoSemContribuir: Comparador = (a, b) => (b.dias ?? Number.MAX_SAFE_INTEGER) - (a.dias ?? Number.MAX_SAFE_INTEGER);

const COMPARADORES: Record<OrdenacaoDasListas, Comparador[]> = {
  quantidade: [porQuantidade, porUltima, porNome],
  valor_total: [porValor, porQuantidade, porUltima, porNome],
  ultima_contribuicao: [porUltima, porQuantidade, porNome],
  nome_az: [porNome],
  nome_za: [(a, b) => porNome(b, a)],
  tempo_sem_contribuir: [porTempoSemContribuir, porNome],
};

/** Ordena pela escolha e numera (#). Estável: o que empata em todos os critérios segue em ordem alfabética (o último critério já é o nome). */
function ordenarENumerar(itens: (ParaOrdenar & { situacao: string })[], ordenacao: OrdenacaoDasListas): LinhaNominal[] {
  const cadeia = COMPARADORES[ordenacao];
  const ordenados = [...itens].sort((a, b) => { for (const c of cadeia) { const r = c(a, b); if (r !== 0) return r; } return porNome(a, b); });
  return ordenados.map((i, k) => ({ posicao: k + 1, nome: i.nome, ultima: i.ultima, contribuicoes: i.quantidade, situacao: i.situacao }));
}

/**
 * Monta as duas listas, ordenadas e numeradas. `nomes` traz o nome de quem contribuiu (pode não estar na base: inativo, ex-membro); `semContribuicao` vem da análise da base.
 * O `total` de cada pessoa só entra na ORDENAÇÃO (e só quando escolhida): a linha que sai não tem campo de valor.
 */
export function listasNominaisDoEmail(
  linhas: LinhaDeContribuicao[], periodo: { ini: string; fim: string }, nomes: Map<string, string>, semContribuicao: AnaliseDosSemContribuicao, ordenacao: OrdenacaoDasListas = ORDENACAO_PADRAO,
): ListasNominais {
  const contribuiram = resumirPessoas(linhas, periodo).map(r => ({
    nome: nomes.get(r.pessoaId) ?? "(nome não encontrado)", ultima: r.ultima, quantidade: r.quantidade, total: r.total, dias: diasEntre(r.ultima, periodo.fim), situacao: situacaoDeQuemContribuiu(r),
  }));
  const sem = semContribuicao.lista.map(p => ({ nome: p.nome, ultima: p.ultima, quantidade: 0, total: 0, dias: p.dias, situacao: situacaoDeQuemNaoContribuiu(p) }));
  return { contribuiram: ordenarENumerar(contribuiram, ordenacao), semContribuicao: ordenarENumerar(sem, ordenacao).map(l => ({ ...l, contribuicoes: null })) };
}

/** Quantos nomes a lista leva (vai para o registro de acesso). */
export const totalDeNomes = (l: ListasNominais) => l.contribuiram.length + l.semContribuicao.length;

