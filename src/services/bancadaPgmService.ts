// ─── A bancada dos Pequenos Grupos ────────────────────────────────────────
//
// A bancada do ministério que opera o módulo PGM
// (`ministerios.modulo = 'pgm'`). Hoje é o Pastoral, cuja única área se chama
// "Pequenos Grupos Multiplicadores" — e o nome diz o trabalho: multiplicar.
//
// ── O QUE ESTE MÓDULO PEDE QUE OS OUTROS DOIS NÃO PEDEM ────────────────────
//
// A Escola Bíblica cuida de quem já está nela; o Bazar cuida do que já foi
// reservado. Um ministério de Pequenos Grupos tem uma terceira pergunta, e
// ela é a razão de ser dele: **onde ainda não há grupo?**
//
// Por isso esta bancada mede duas coisas que as outras não medem — os
// bairros onde a igreja tem gente e não tem grupo, e o tamanho da distância
// entre "membros da igreja" e "membros de algum grupo".
//
// ── MEDIDO EM 02/09/2026, ANTES DE ESCREVER ────────────────────────────────
//
//   4 grupos, 3 ativos e 1 inativo
//   TODOS os quatro em Praça da Bandeira
//   6 pessoas em grupos, de 297 membros da igreja
//   3 dos 4 nunca registraram reunião — e o único registro é do inativo
//   PGO Mães Unidas em Oração: 0 membros
//   Maracanã: 40 membros da igreja, nenhum grupo
//
// O convite que a Home faz ("um Pequeno Grupo perto da sua casa") só alcança
// quem mora em Praça da Bandeira. Para os outros bairros ele cai no recuo de
// "todos os grupos ativos" — que é melhor que nada, e ainda assim é uma
// travessia da cidade.

import { supabase } from "@/integrations/supabase/client";

export interface GrupoNaBancada {
  id: string;
  nome: string;
  lider: string | null;
  bairro: string | null;
  /** "terça, 19:00" · "domingo" · "sem dia definido". */
  quando: string;
  membros: number;
  reunioes: number;
  /** ISO da última reunião registrada, ou null se nunca houve. */
  ultimaReuniao: string | null;
  ativo: boolean;
}

export interface BairroSemGrupo {
  bairro: string;
  membros: number;
}

export interface BancadaPgm {
  grupos: GrupoNaBancada[];
  /** Pessoas distintas em algum grupo ativo. */
  participantes: number;
  /** Membros ativos da igreja, para dar a base do número acima. */
  membrosDaIgreja: number;
  /** Grupos ativos que nunca registraram reunião. */
  semReuniao: GrupoNaBancada[];
  /** Grupos ativos sem nenhum membro. */
  semMembros: GrupoNaBancada[];
  /** Onde a igreja tem gente e não tem grupo, do maior para o menor. */
  bairrosSemGrupo: BairroSemGrupo[];
  /**
   * Quantos membros ativos NÃO têm bairro preenchido.
   *
   * A lista de bairros órfãos é honesta só com este número ao lado: sem
   * bairro na ficha, a pessoa não entra em nenhuma conta — nem na dos que
   * têm grupo perto, nem na dos que não têm.
   */
  semBairroNaFicha: number;
}

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

function quandoEmPalavras(dia: number | null, horario: string | null): string {
  const d = dia != null && dia >= 0 && dia <= 6 ? DIAS[dia] : null;
  const h = horario ? horario.slice(0, 5) : null;
  if (d && h) return `${d}, ${h}`;
  if (d) return d;
  if (h) return `às ${h}`;
  return "sem dia definido";
}

export async function carregarBancadaPgm(): Promise<BancadaPgm | null> {
  const { data: grupos } = await supabase
    .from("pgm_grupos")
    .select("id, nome, bairro, dia_semana, horario, ativo, lider_id")
    .order("nome");

  if (!grupos) return null;

  const ids = grupos.map((g) => g.id);
  const idsLider = grupos.map((g) => g.lider_id).filter(Boolean) as string[];

  const [{ data: membros }, { data: reunioes }, { data: lideres }, { data: daIgreja }] =
    await Promise.all([
      ids.length
        ? supabase.from("pgm_membros").select("grupo_id, pessoa_id").eq("ativo", true).in("grupo_id", ids)
        : Promise.resolve({ data: [] as { grupo_id: string; pessoa_id: string }[] }),
      ids.length
        ? supabase.from("pgm_reunioes").select("grupo_id, data").in("grupo_id", ids)
        : Promise.resolve({ data: [] as { grupo_id: string; data: string }[] }),
      idsLider.length
        ? supabase.from("membros").select("id, nome_completo").in("id", idsLider)
        : Promise.resolve({ data: [] as { id: string; nome_completo: string }[] }),
      // Só o bairro e o status: é tudo o que a conta precisa, e pedir a ficha
      // inteira de 297 pessoas para contar bairro seria carregar o cadastro
      // da igreja numa tela que não o mostra.
      supabase.from("membros").select("bairro").eq("status", "ativo"),
    ]);

  const nomeDoLider = new Map((lideres ?? []).map((m) => [m.id, m.nome_completo]));

  const porGrupo = new Map<string, number>();
  for (const m of membros ?? []) porGrupo.set(m.grupo_id, (porGrupo.get(m.grupo_id) ?? 0) + 1);

  const reuniaoPorGrupo = new Map<string, number>();
  const ultimaPorGrupo = new Map<string, string>();
  for (const r of reunioes ?? []) {
    reuniaoPorGrupo.set(r.grupo_id, (reuniaoPorGrupo.get(r.grupo_id) ?? 0) + 1);
    const atual = ultimaPorGrupo.get(r.grupo_id);
    if (r.data && (!atual || r.data > atual)) ultimaPorGrupo.set(r.grupo_id, r.data);
  }

  const lista: GrupoNaBancada[] = grupos.map((g) => ({
    id: g.id,
    nome: g.nome,
    lider: g.lider_id ? nomeDoLider.get(g.lider_id) ?? null : null,
    bairro: g.bairro ?? null,
    quando: quandoEmPalavras(g.dia_semana, g.horario),
    membros: porGrupo.get(g.id) ?? 0,
    reunioes: reuniaoPorGrupo.get(g.id) ?? 0,
    ultimaReuniao: ultimaPorGrupo.get(g.id) ?? null,
    ativo: !!g.ativo,
  }));

  // ── Onde a igreja tem gente e não tem grupo ─────────────────────────
  //
  // A comparação é por bairro normalizado — minúsculas e sem espaço nas
  // pontas —, porque "Maracanã" e "maracanã " são o mesmo lugar e o cadastro
  // não é uniforme.
  const normalizar = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
  const comGrupo = new Set(
    lista.filter((g) => g.ativo && g.bairro).map((g) => normalizar(g.bairro)),
  );

  const contagem = new Map<string, { nome: string; n: number }>();
  let semBairro = 0;
  for (const m of daIgreja ?? []) {
    const bruto = (m.bairro ?? "").trim();
    if (!bruto) { semBairro++; continue; }
    const chave = normalizar(bruto);
    if (comGrupo.has(chave)) continue;
    const atual = contagem.get(chave);
    if (atual) atual.n++;
    else contagem.set(chave, { nome: bruto, n: 1 });
  }

  const ativos = lista.filter((g) => g.ativo);

  return {
    grupos: lista,
    participantes: new Set((membros ?? []).map((m) => m.pessoa_id)).size,
    membrosDaIgreja: (daIgreja ?? []).length,
    semReuniao: ativos.filter((g) => g.reunioes === 0),
    semMembros: ativos.filter((g) => g.membros === 0),
    bairrosSemGrupo: [...contagem.values()]
      .sort((a, b) => b.n - a.n)
      .slice(0, 4)
      .map((x) => ({ bairro: x.nome, membros: x.n })),
    semBairroNaFicha: semBairro,
  };
}
