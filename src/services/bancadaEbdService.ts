// ─── A bancada da Educação Cristã ─────────────────────────────────────────
//
// O painel de ministério é o mesmo formulário para os onze — Áreas, Quem
// serve, Escalas, Checklist. Para a Educação Cristã isso diz quase nada: ela
// tem 8 voluntários e **87 matrículas ativas**, e o que a líder precisa saber
// não é quem serve, é quais classes pararam de fazer chamada.
//
// Medido em 02/09/2026, antes de escrever uma linha desta tela:
//
//   classe                     alunos  prof  aulas  com chamada  última
//   Berçário                        9     0      1            0  nunca
//   Crianças                        3     1      2            1  07/06
//   Juniores                        6     1      4            0  nunca
//   Adolescentes                    9     2      2            1  21/06
//   Jovens                          8     2      0            0  nunca
//   Adultos                        19     3      1            0  nunca
//   Classe Professora Edna         23     2      3            1  23/08
//   Classe Isac Rodrigues          10     2      1            0  nunca
//
// Cinco das oito nunca tiveram chamada. O Berçário tem nove crianças e nenhum
// professor cadastrado. Jovens tem oito alunos e nenhuma aula lançada. Nada
// disso aparece hoje em lugar nenhum do sistema.
//
// ── A REGRA QUE ATRAVESSA TUDO AQUI ────────────────────────────────────────
//
// Nenhum número sem a base dele. `aulasComChamada` é o denominador honesto —
// dividir presenças pelas aulas LANÇADAS daria 21% para quem não faltou a
// uma, e a culpa seria da chamada que não foi feita. É o mesmo cuidado que
// `minhaEbd` já toma na Home, pelo mesmo motivo.

import { supabase } from "@/integrations/supabase/client";

export interface ClasseNaBancada {
  id: string;
  nome: string;
  cor: string | null;
  /** "de 26 a 56 anos" · "a partir de 40 anos" · "todas as idades". */
  faixa: string;
  /** "mulheres" · "homens" · null quando é mista. */
  publico: string | null;
  matriculados: number;
  professores: number;
  aulasLancadas: number;
  aulasComChamada: number;
  /** ISO da última aula que teve chamada, ou null se nunca houve. */
  ultimaChamada: string | null;
}

export interface AlunoForaDaFaixa {
  pessoaId: string;
  nome: string;
  idade: number;
  classeAtual: string;
  classeSugerida: string | null;
}

export interface BancadaEbd {
  classes: ClasseNaBancada[];
  /** Soma das matrículas ativas — não das linhas de `ebd_matriculas`. */
  matriculados: number;
  professores: number;
  /** Classes com aluno e sem nenhum professor cadastrado. */
  semProfessor: ClasseNaBancada[];
  /** Classes com aluno e sem nenhuma chamada registrada. */
  semChamada: ClasseNaBancada[];
  /** A chamada mais recente de toda a Escola, ou null. */
  ultimaChamada: string | null;
  /**
   * Alunos que passaram da faixa da classe onde estão.
   *
   * Vem de `vw_ebd_alertas_idade`, que já existia no banco e nenhuma tela
   * abria. Pode voltar vazia por RLS — quem lidera o ministério só enxerga a
   * ficha de quem serve com ele, e aluno de EBD não é voluntário. Nesse caso
   * a tela cala em vez de afirmar "nenhum".
   */
  foraDaFaixa: AlunoForaDaFaixa[];
}

/** "de 26 a 56 anos" · "a partir de 40 anos" · "até 8 anos". */
function faixaEmPalavras(min: number | null, max: number | null): string {
  if (min != null && max != null) return `de ${min} a ${max} anos`;
  if (min != null) return `a partir de ${min} anos`;
  if (max != null) return `até ${max} anos`;
  return "todas as idades";
}

export async function carregarBancadaEbd(): Promise<BancadaEbd | null> {
  const { data: classes } = await supabase
    .from("ebd_classes")
    .select("id, nome, cor, genero, idade_min, idade_max, ordem")
    .eq("ativo", true)
    .order("ordem");

  if (!classes || classes.length === 0) return null;

  const ids = classes.map((c) => c.id);

  const [{ data: mats }, { data: profs }, { data: aulas }] = await Promise.all([
    supabase.from("ebd_matriculas").select("classe_id").eq("ativo", true).in("classe_id", ids),
    supabase.from("ebd_professores").select("classe_id").eq("ativo", true).in("classe_id", ids),
    supabase.from("ebd_aulas").select("id, classe_id, data").in("classe_id", ids),
  ]);

  // As presenças vêm por aula, não por classe: uma consulta só, e o mapa
  // aula→classe resolve o resto. Buscar por classe seriam oito idas ao banco.
  const idsAula = (aulas ?? []).map((a) => a.id);
  const { data: presencas } = idsAula.length
    ? await supabase.from("ebd_presencas").select("aula_id").in("aula_id", idsAula)
    : { data: [] as { aula_id: string }[] };

  const classeDaAula = new Map<string, string>();
  for (const a of aulas ?? []) classeDaAula.set(a.id, a.classe_id);
  const dataDaAula = new Map<string, string>();
  for (const a of aulas ?? []) dataDaAula.set(a.id, a.data as string);

  const conta = (linhas: { classe_id: string }[] | null) => {
    const m = new Map<string, number>();
    for (const l of linhas ?? []) m.set(l.classe_id, (m.get(l.classe_id) ?? 0) + 1);
    return m;
  };
  const porMatricula = conta(mats);
  const porProfessor = conta(profs);
  const porAula = conta((aulas ?? []).map((a) => ({ classe_id: a.classe_id })));

  // Aulas DISTINTAS que têm alguma presença lançada — o denominador honesto.
  const aulasChamadas = new Set((presencas ?? []).map((p) => p.aula_id));
  const chamadasPorClasse = new Map<string, number>();
  const ultimaPorClasse = new Map<string, string>();
  for (const idAula of aulasChamadas) {
    const cid = classeDaAula.get(idAula);
    if (!cid) continue;
    chamadasPorClasse.set(cid, (chamadasPorClasse.get(cid) ?? 0) + 1);
    const d = dataDaAula.get(idAula);
    if (d && (!ultimaPorClasse.get(cid) || d > ultimaPorClasse.get(cid)!)) {
      ultimaPorClasse.set(cid, d);
    }
  }

  const lista: ClasseNaBancada[] = classes.map((c) => ({
    id: c.id,
    nome: c.nome,
    cor: c.cor ?? null,
    faixa: faixaEmPalavras(c.idade_min, c.idade_max),
    publico:
      c.genero === "feminino" ? "mulheres"
      : c.genero === "masculino" ? "homens"
      : null,
    matriculados: porMatricula.get(c.id) ?? 0,
    professores: porProfessor.get(c.id) ?? 0,
    aulasLancadas: porAula.get(c.id) ?? 0,
    aulasComChamada: chamadasPorClasse.get(c.id) ?? 0,
    ultimaChamada: ultimaPorClasse.get(c.id) ?? null,
  }));

  // ── Os alunos fora da faixa ──────────────────────────────────────────
  //
  // `.catch` e não `try` porque o supabase-js não lança: devolve `{ error }`.
  // Uma lista vazia aqui pode significar "não há nenhum" OU "a RLS não me
  // deixa ver a ficha deles" — e a tela trata os dois casos igual, calando.
  const { data: alertas } = await supabase
    .from("vw_ebd_alertas_idade")
    .select("pessoa_id, nome_completo, idade_atual, classe_atual, classe_sugerida_id");

  const nomeDaClasse = new Map(lista.map((c) => [c.id, c.nome]));
  const foraDaFaixa: AlunoForaDaFaixa[] = (alertas ?? []).map((a: any) => ({
    pessoaId: a.pessoa_id,
    nome: a.nome_completo,
    idade: a.idade_atual,
    classeAtual: a.classe_atual,
    classeSugerida: a.classe_sugerida_id ? nomeDaClasse.get(a.classe_sugerida_id) ?? null : null,
  }));

  const comAluno = lista.filter((c) => c.matriculados > 0);
  const datas = lista.map((c) => c.ultimaChamada).filter(Boolean) as string[];

  return {
    classes: lista,
    matriculados: lista.reduce((s, c) => s + c.matriculados, 0),
    professores: lista.reduce((s, c) => s + c.professores, 0),
    semProfessor: comAluno.filter((c) => c.professores === 0),
    semChamada: comAluno.filter((c) => c.aulasComChamada === 0),
    ultimaChamada: datas.length ? datas.sort()[datas.length - 1] : null,
    foraDaFaixa,
  };
}
