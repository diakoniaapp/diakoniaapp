// ─── nominal — as listas COM NOMES do relatório do pastor, sem nenhum valor (27/10/2026) ──────────────────────────────────────────────────────────────────────────────────────────────────────
// Decisão dela (27/10/2026): o modelo Pastor pode levar nomes por e-mail — nome, última contribuição, frequência e situação (recorrente, novo, sem contribuição no período, sem contribuição há mais de 90 dias) —,
// mas NUNCA valor individual, média individual nem total contribuído. A garantia é de TIPO: `LinhaNominal` não tem campo de valor; quem monta a linha não recebe o valor (só datas, contagens e situação).
// Cada visualização e cada envio de relatório com nomes fica registrado (`contribuicoes_acessos` + `comunicacao_envios`), e o servidor recusa se o registro falhar.
import { resumirPessoas, type AnaliseDosSemContribuicao, type LinhaDeContribuicao, type PessoaSemContribuicao, type ResumoDePessoa } from "./analise.ts";

export interface LinhaNominal {
  nome: string;
  /** AAAA-MM-DD da última contribuição (a do período, ou a anterior a ele); `null` = nenhuma desde 01/01/2026 */
  ultima: string | null;
  /** quantas contribuições no período (só para quem contribuiu); frequência, não valor */
  contribuicoes: number | null;
  /** o que a linha diz sobre a pessoa, em palavras */
  situacao: string;
}

export interface ListasNominais { contribuiram: LinhaNominal[]; semContribuicao: LinhaNominal[] }

const porNome = (a: LinhaNominal, b: LinhaNominal) => a.nome.localeCompare(b.nome, "pt-BR");

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

/**
 * Monta as duas listas. `nomes` traz o nome de quem contribuiu (pode não estar na base: inativo, ex-membro); `semContribuicao` já vem da análise da base (alfabética).
 * Nenhum valor entra: `resumirPessoas` devolve o total, mas ESTA função não o lê.
 */
export function listasNominaisDoEmail(
  linhas: LinhaDeContribuicao[], periodo: { ini: string; fim: string }, nomes: Map<string, string>, semContribuicao: AnaliseDosSemContribuicao,
): ListasNominais {
  const contribuiram: LinhaNominal[] = resumirPessoas(linhas, periodo).map(r => ({
    nome: nomes.get(r.pessoaId) ?? "(nome não encontrado)", ultima: r.ultima, contribuicoes: r.quantidade, situacao: situacaoDeQuemContribuiu(r),
  }));
  const sem: LinhaNominal[] = semContribuicao.lista.map(p => ({ nome: p.nome, ultima: p.ultima, contribuicoes: null, situacao: situacaoDeQuemNaoContribuiu(p) }));
  return { contribuiram: contribuiram.sort(porNome), semContribuicao: sem.sort(porNome) };
}

/** Quantos nomes a lista leva (vai para o registro de acesso). */
export const totalDeNomes = (l: ListasNominais) => l.contribuiram.length + l.semContribuicao.length;

