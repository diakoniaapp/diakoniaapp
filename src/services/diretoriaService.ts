// ─── diretoriaService.ts — quem é a diretoria, lido da ficha da pessoa ──────
//
// ── O QUE ISTO SUBSTITUI ──────────────────────────────────────────────────
//
// A diretoria vinha de `pessoa_cargo_estatutario`, uma tabela de vínculo com
// `cargos_estatutarios`. Três telas liam essa junção com a mesma consulta
// copiada — Organograma, Estrutura da Igreja e PessoaCard — e as três traziam
// um comentário confessando "TABELA AUSENTE EM PRODUCAO".
//
// A tabela existe. Está vazia:
//
//     pessoa_cargo_estatutario     0 linhas
//     v_diretoria_atual            0 linhas   (a view que depende dela)
//     cargos_estatutarios          6 cargos semeados, sem ninguém ligado
//     cargos_institucionais       21 linhas = 3 cópias idênticas de 7 cargos
//
// Ou seja: dois cadastros de cargo, sobrepostos entre si, um deles com os
// dados semeados três vezes, e nenhuma pessoa ligada a nenhum dos dois. O
// organograma mostrava "Nenhum cargo estatutário cadastrado ainda" desde
// sempre, e a instrução na tela mandava atribuir num lugar que a ficha não
// tinha.
//
// Por decisão: a diretoria passa a ser lida de `membros.funcao_ministerial`,
// que é onde a igreja já está preenchendo. Uma verdade, no lugar onde a
// secretaria já digita.
//
// ── O QUE SE GANHA E O QUE SE PERDE ───────────────────────────────────────
//
// Ganha-se: quem preenche a ficha vê o organograma mudar. Antes eram dois
// cadastros e um deles ninguém sabia que existia.
//
// Perde-se: histórico de sucessão. `pessoa_cargo_estatutario` guardaria todos
// os mandatos que a pessoa já teve; a ficha guarda um. Enquanto a pergunta for
// "quem é o tesoureiro hoje", uma linha por pessoa responde. No dia em que for
// "quem foi tesoureiro antes", a tabela volta — e as duas datas da ficha
// (`funcao_inicio`, `funcao_fim`) são a semente daquela migração.
//
// As tabelas antigas ficam onde estão, vazias. Não removi nada: apagar tabela
// é irreversível e ninguém pediu.

import { supabase } from "@/integrations/supabase/client";
import {
  FUNCOES_DIRETORIA, FUNCOES_NO_REGIMENTO, nomesDaFuncao,
  nivelDiretoria, rotuloFuncao, mandatoLegivel,
} from "@/lib/funcaoMinisterial";

export interface CargoDiretoria {
  id: string;
  /** O valor do enum, para casar o cargo pelos apelidos do regimento. */
  funcao: string;
  cargo: string;
  nivel: number;
  pessoa_id: string;
  pessoa_nome: string;
  pessoa_foto: string | null;
  mandato: string | null;
}

/**
 * A diretoria atual, ordenada por nível e nome.
 *
 * Só gente ativa: um tesoureiro desligado não deve seguir no organograma da
 * igreja, e o cadastro já sabe disso pelo status.
 */
export async function carregarDiretoria(): Promise<CargoDiretoria[]> {
  const { data, error } = await supabase
    .from("membros")
    .select("id, nome_completo, foto_url, funcoes_ministeriais, funcao_inicio, funcao_fim")
    .eq("status", "ativo")
    // `overlaps`: quem tem QUALQUER função de regimento na lista. Filtrar pela
    // principal deixaria de fora o diácono que também é tesoureiro — ele
    // aparece no catálogo como Diácono e sumiria da Tesouraria.
    .overlaps("funcoes_ministeriais", FUNCOES_NO_REGIMENTO)
    .order("nome_completo");

  if (error || !data) return [];

  // UMA LINHA POR CARGO, e não por pessoa. Quem for 1º Tesoureiro e também
  // Auditor(a) aparece nos dois lugares do quadro — é o que uma lista de
  // diretoria precisa mostrar, e o motivo de a lista de funções existir.
  return data
    .flatMap((m) =>
      ((m.funcoes_ministeriais ?? []) as string[])
        .filter((f) => (FUNCOES_NO_REGIMENTO as string[]).includes(f))
        .map((f) => ({
          // Chave por pessoa + função: o id da pessoa sozinho repetiria para
          // quem acumula, e o React reclamaria de chave duplicada.
          id: `${m.id}-${f}`,
          funcao: f,
          cargo: rotuloFuncao(f),
          nivel: nivelDiretoria(f),
          pessoa_id: m.id,
          pessoa_nome: m.nome_completo,
          pessoa_foto: m.foto_url ?? null,
          // A vigência é uma só, por decisão: vale para a função principal.
          // Quando a pessoa acumula dois cargos de mandato, os dois mostram a
          // mesma data — e é por isso que a decisão foi registrada.
          mandato: mandatoLegivel(m.funcao_inicio, m.funcao_fim),
        })),
    )
    .sort((a, b) => a.nivel - b.nivel || a.cargo.localeCompare(b.cargo));
}

/** Os cargos de diretoria de UMA pessoa — pode ser mais de um. */
export async function cargosDaPessoa(pessoaId: string): Promise<
  { cargo: string; nivel: number; mandato: string | null }[]
> {
  const { data } = await supabase
    .from("membros")
    .select("funcoes_ministeriais, funcao_inicio, funcao_fim")
    .eq("id", pessoaId)
    .maybeSingle();

  if (!data) return [];

  return ((data.funcoes_ministeriais ?? []) as string[])
    .filter((f) => (FUNCOES_DIRETORIA as string[]).includes(f))
    .map((f) => ({
      cargo: rotuloFuncao(f),
      nivel: nivelDiretoria(f),
      mandato: mandatoLegivel(data.funcao_inicio, data.funcao_fim),
    }))
    .sort((a, b) => a.nivel - b.nivel);
}

// ─── Ligar o Regimento à ficha ─────────────────────────────────────────────
//
// `documento_estrutura` é o regimento: quais cargos a igreja tem, com a base
// institucional de cada um ("Eleição 2026"). Isso é documento, e continua
// sendo documento.
//
// O que NÃO devia estar ali é o nome da pessoa, digitado à mão no campo
// `descricao`. Estava, e já tinha divergido do cadastro: o regimento dizia
// "Elizabeth Aganetti Monteiro" e a ficha, "Elizabeth Aganetti Monteiro
// Goncalves". Duas telas da mesma página, dois nomes para a mesma pessoa.
//
// Agora o cargo continua vindo do regimento e o OCUPANTE vem da ficha. Quando
// o nome do cargo não corresponde a nenhuma função — "Pastoral", "Jurídico
// Parlamentar", "Auditoria" —, o texto do documento fica como está: são
// entradas que descrevem colegiado e histórico, não um posto de uma pessoa só.

/**
 * Compara nome de cargo com rótulo de função ignorando o que não distingue:
 * caixa, acento e o adjetivo "estatutária", que o regimento usa e a lista não.
 *
 *   "1ª Secretária Estatutária"  →  "1a secretaria"
 *   "1ª Secretária"              →  "1a secretaria"
 */
const chaveCargo = (s: string): string =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
   .toLowerCase()
   .replace(/\bestatutari[ao]\b/g, "")
   .replace(/[^a-z0-9]+/g, " ")
   .trim();

/**
 * Quem ocupa hoje o cargo com este nome, segundo a ficha das pessoas.
 *
 * Devolve LISTA, e não uma pessoa: "1º Tesoureiro" é posto de um, mas
 * "Auditoria" é colegiado e pode ter três. Uma função só encolheria o
 * colegiado ao primeiro nome em ordem alfabética, sem avisar.
 *
 * Vazia quando o cargo não corresponde a nenhuma função — e aí quem manda
 * continua sendo o texto do documento.
 */
export function ocupantesDoCargo(
  nomeCargo: string,
  diretoria: CargoDiretoria[],
): CargoDiretoria[] {
  const alvo = chaveCargo(nomeCargo);
  return diretoria.filter(d =>
    nomesDaFuncao(d.funcao).some(nome => chaveCargo(nome) === alvo),
  );
}

/**
 * Os diáconos em exercício, com a data de ordenação.
 *
 * Fica aqui e não no quadro do conselho porque a diaconia responde a outra
 * pergunta. No conselho, o diácono aparece por ter assento; na diaconia,
 * aparece por ser diácono — com há quanto tempo, que é o que a igreja
 * costuma querer saber e a view do conselho não carrega.
 */
export async function carregarDiaconato(): Promise<{
  id: string; nome_completo: string; data_ordenacao_diaconal: string | null;
}[]> {
  const { data } = await supabase
    .from("membros")
    .select("id, nome_completo, data_ordenacao_diaconal")
    .eq("status", "ativo")
    .contains("funcoes_ministeriais", ["diacono"])
    .order("nome_completo");

  return data ?? [];
}
