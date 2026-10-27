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
  /** quantas contribuições no período (só para quem contribuiu); frequência, não valor */
  contribuicoes: number | null;
  /** meses (completos) do período em que deu dízimo, "2/6"; `null` quando não se aplica (quem não contribuiu, ou período sem mês completo) */
  meses?: string | null;
  /** o PERFIL DE CONTRIBUIÇÃO, em palavras (as definições estão no bloco "Como interpretar este relatório") */
  perfil: string;
}

export interface ListasNominais { contribuiram: LinhaNominal[]; semContribuicao: LinhaNominal[] }


/**
 * Recorrente · Novo dizimista · Parcial · Só ofertas — os perfis de quem contribuiu (decisão dela, 27/10/2026: "Contribuiu no período" era vago).
 * Parcial = deu dízimo em ALGUNS dos meses completos do período (a coluna "Meses com dízimo" mostra quantos: 2/6). Só ofertas = contribuiu, mas nunca com dízimo.
 * Período sem mês completo: não há "todos os meses" nem "alguns", então fica o texto genérico "Contribuiu no período".
 */
function perfilDeQuemContribuiu(r: ResumoDePessoa): string {
  if (r.recorrente === true) return "Recorrente";
  if (r.nova === true) return "Novo dizimista";
  if (!r.dizimista) return "Só ofertas";
  return r.mesesCompletos > 0 ? "Parcial" : "Contribuiu no período";
}
/** "2/6" — só quando o período tem mês completo e a pessoa é dizimista (ofertante e período curto não têm "meses com dízimo" a mostrar). */
const mesesDe = (r: ResumoDePessoa): string | null => (r.mesesCompletos > 0 && r.dizimista ? `${r.mesesComDizimo}/${r.mesesCompletos}` : null);

/**
 * Todo mundo que não contribuiu é "Sem contribuições no período analisado"; o complemento diz se também não há registro anterior ou há quanto tempo foi a última contribuição. NUNCA uma data fixa:
 * o relatório pode ter qualquer período (decisão dela, 27/10/2026), e as datas que aparecem são sempre as do filtro escolhido.
 */
function perfilDeQuemNaoContribuiu(p: PessoaSemContribuicao): string {
  if (p.classificacao === "nunca") return "Sem contribuições no período analisado · sem registro anterior";
  if (p.dias !== null && p.dias > 180) return "Sem contribuições no período analisado · última há mais de 180 dias";
  if (p.dias !== null && p.dias > 90) return "Sem contribuições no período analisado · última há mais de 90 dias";
  return "Sem contribuições no período analisado";
}

/** O que a ordenação enxerga de cada pessoa. O `total` SÓ ordena (opção "valor total contribuído"): nunca chega à linha que sai. */
interface ParaOrdenar { nome: string; ultima: string | null; quantidade: number; total: number; dias: number | null; meses?: string | null }
type Comparador = (a: ParaOrdenar, b: ParaOrdenar) => number;
const porNome: Comparador = (a, b) => a.nome.localeCompare(b.nome, "pt-BR");
const porQuantidade: Comparador = (a, b) => b.quantidade - a.quantidade;
/** última contribuição, a mais recente primeiro; quem não tem nenhuma (nulo) fica por último */
const porUltima: Comparador = (a, b) => (b.ultima ?? "").localeCompare(a.ultima ?? "");
const porValor: Comparador = (a, b) => b.total - a.total;
/** há mais tempo sem contribuir primeiro; quem não tem registro anterior (nulo) vem antes de todos */
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
function ordenarENumerar(itens: (ParaOrdenar & { perfil: string })[], ordenacao: OrdenacaoDasListas): LinhaNominal[] {
  const cadeia = COMPARADORES[ordenacao];
  const ordenados = [...itens].sort((a, b) => { for (const c of cadeia) { const r = c(a, b); if (r !== 0) return r; } return porNome(a, b); });
  return ordenados.map((i, k) => ({ posicao: k + 1, nome: i.nome, contribuicoes: i.quantidade, meses: i.meses ?? null, perfil: i.perfil }));   // a última contribuição só ORDENA (opção do construtor): não é coluna
}

/**
 * Monta as duas listas, ordenadas e numeradas. `nomes` traz o nome de quem contribuiu (pode não estar na base: inativo, ex-membro); `semContribuicao` vem da análise da base.
 * O `total` de cada pessoa só entra na ORDENAÇÃO (e só quando escolhida): a linha que sai não tem campo de valor.
 */
export function listasNominaisDoEmail(
  linhas: LinhaDeContribuicao[], periodo: { ini: string; fim: string }, nomes: Map<string, string>, semContribuicao: AnaliseDosSemContribuicao, ordenacao: OrdenacaoDasListas = ORDENACAO_PADRAO,
): ListasNominais {
  const contribuiram = resumirPessoas(linhas, periodo).map(r => ({
    nome: nomes.get(r.pessoaId) ?? "(nome não encontrado)", ultima: r.ultima, quantidade: r.quantidade, total: r.total, dias: diasEntre(r.ultima, periodo.fim), meses: mesesDe(r), perfil: perfilDeQuemContribuiu(r),
  }));
  const sem = semContribuicao.lista.map(p => ({ nome: p.nome, ultima: p.ultima, quantidade: 0, total: 0, dias: p.dias, perfil: perfilDeQuemNaoContribuiu(p) }));
  return { contribuiram: ordenarENumerar(contribuiram, ordenacao), semContribuicao: ordenarENumerar(sem, ordenacao).map(l => ({ ...l, contribuicoes: null })) };
}

/** Quantos nomes a lista leva (vai para o registro de acesso). */
export const totalDeNomes = (l: ListasNominais) => l.contribuiram.length + l.semContribuicao.length;

