// ─── meuEspacoService — o que o sistema sabe sobre QUEM ESTÁ OLHANDO ───────
//
// Todo o resto deste projeto responde perguntas sobre os outros: quem não foi
// procurado, quem passou da faixa da EBD, quem está sobrecarregado. Este
// arquivo responde a única pergunta que faltava — "e eu?".
//
// ── O ELO ──────────────────────────────────────────────────────────────────
//
// Nada aqui funciona sem `pessoaId`, que vem de `useAuth` e sai de
// `profiles.pessoa_id`. NÃO é `user.id`: a conta e a ficha são registros
// diferentes, e o banco tinha duas políticas inteiras baseadas em confundir os
// dois — ver o comentário em `useAuth.pessoaId`.
//
// ── A REGRA QUE ATRAVESSA O ARQUIVO ────────────────────────────────────────
//
// Toda função aqui devolve, junto do número, a BASE dele. Não é preciosismo:
// a EBD tem 14 aulas e só 3 com chamada registrada. Dizer "sua frequência é
// 33%" culparia o aluno por uma chamada que o professor não fez. O tipo
// obriga quem desenha a tela a ter em mãos o denominador.

import { supabase } from "@/integrations/supabase/client";
import { conferir, type ResultadoEscrita } from "@/lib/escritaConferida";
import { normalizarTelefone } from "@/lib/telefone";
import { listarGruposDaPessoa, sugerirPgmPorBairro } from "@/services/pgmService";

// ─── Minha ficha ──────────────────────────────────────────────────────────

/** Os campos da própria ficha: os que a pessoa vê e os que ela edita. */
export interface MinhaFicha {
  id: string;
  nome_completo: string;
  nome_social: string | null;
  tipo_pessoa: string | null;
  status: string | null;
  foto_url: string | null;
  // ── editáveis ──
  data_nascimento: string | null;
  /** Dia e mês sem ano, para quem veio do sistema antigo. Ver `lib/idade.ts`. */
  nascimento_dia_mes: string | null;
  data_casamento: string | null;
  telefone_celular: string | null;
  email: string | null;
  cep: string | null;
  endereco: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  // ── só leitura: decisão da igreja, não dado da pessoa ──
  estado_civil: string | null;
  funcoes_ministeriais: string[] | null;
  data_membro: string | null;
  /**
   * Não é editável aqui, e ainda assim vem: é o sexo que decide entre "Pr." e
   * "Pra." na assinatura do convite que a pessoa compartilha. Sem ele,
   * `tratamento()` cala — e assinar sem tratamento é melhor que assinar
   * errado. Ver `lib/agenda/convite.ts`.
   */
  sexo: string | null;
}

// Literal único, e não concatenação: o supabase-js LÊ esta string em tempo de
// tipo para montar o retorno. Partida em pedaços com `+`, ela vira `string`,
// a inferência desiste e o resultado chega como `GenericStringError`.
const CAMPOS_FICHA =
  "id, nome_completo, nome_social, tipo_pessoa, status, foto_url, data_nascimento, nascimento_dia_mes, data_casamento, telefone_celular, email, cep, endereco, numero, complemento, bairro, cidade, uf, estado_civil, funcoes_ministeriais, data_membro, sexo";

export async function minhaFicha(pessoaId: string): Promise<MinhaFicha | null> {
  const { data } = await supabase
    .from("membros").select(CAMPOS_FICHA).eq("id", pessoaId).maybeSingle();
  return (data as unknown as MinhaFicha) ?? null;
}

/** Exatamente os campos que `salvar_meus_dados` aceita — nem um a mais. */
export interface MeusDadosEditaveis {
  nome_completo: string;
  data_nascimento: string | null;
  data_casamento: string | null;
  telefone_celular: string | null;
  email: string | null;
  cep: string | null;
  endereco: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
}

/**
 * Grava a própria ficha.
 *
 * Vai por RPC e não por `.update()` de propósito. A RLS decide QUAIS LINHAS,
 * nunca quais colunas: uma política que deixasse a pessoa corrigir o CEP
 * deixaria também mudar o próprio `tipo_pessoa` para "membro" e escrever nas
 * observações pastorais. A função nomeia o que é editável, num lugar só.
 *
 * Ver a migration `20260901120000_cada_um_cuida_da_propria_ficha.sql`.
 */
export async function salvarMeusDados(d: MeusDadosEditaveis) {
  // `vazio` porque a função recebe `date` e o input HTML devolve "" quando
  // limpo — e "" não converte para date, estoura no Postgres.
  const vazio = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);
  return conferir(
    await supabase.rpc("salvar_meus_dados" as never, {
      p_nome_completo:    d.nome_completo,
      p_data_nascimento:  vazio(d.data_nascimento),
      p_data_casamento:   vazio(d.data_casamento),
      // `normalizarTelefone` acrescenta o DDI 55, que a coluna exige por CHECK
      // (`^55[0-9]{10,11}$`). O campo da tela guarda só os dígitos digitados —
      // "21983991229" —, e sem esta linha o banco recusaria.
      //
      // A função no banco faz a MESMA normalização, de propósito: ela é a
      // porta única, e uma porta que só abre para quem já sabe o formato não
      // é porta. Aqui é conveniência; lá é contrato.
      p_telefone_celular: vazio(normalizarTelefone(d.telefone_celular)),
      p_email:            vazio(d.email),
      p_cep:              vazio(d.cep),
      p_endereco:         vazio(d.endereco),
      p_numero:           vazio(d.numero),
      p_complemento:      vazio(d.complemento),
      p_bairro:           vazio(d.bairro),
      p_cidade:           vazio(d.cidade),
      p_uf:               vazio(d.uf),
    } as never),
    "Seus dados",
  );
}

// ─── Minha EBD ────────────────────────────────────────────────────────────

export interface MinhaEbd {
  classeId: string;
  classe: string;
  cor: string | null;
  /** A pessoa dá aula nesta classe, e não assiste. Muda o texto inteiro. */
  souProfessor: boolean;
  tipoProfessor: string | null;
  /** Aulas da classe que TÊM chamada registrada. É o denominador honesto. */
  aulasComChamada: number;
  /** Aulas da classe lançadas no sistema, com ou sem chamada. */
  aulasLancadas: number;
  /** Presenças minhas dentro das aulas com chamada. */
  presencas: number;
  /** Data da última aula com chamada, para a tela dizer desde quando. */
  ultimaChamada: string | null;
}

/**
 * A classe da pessoa e a frequência dela — com o denominador junto.
 *
 * ── POR QUE `aulasComChamada` E NÃO `aulasLancadas` ────────────────────────
 *
 * Medido em 01/09/2026: 14 aulas lançadas, 3 com presença registrada, 9
 * presenças no total. Dividir por 14 daria 21% para quem não faltou a uma
 * aula sequer. O número que se pode dividir é o das aulas em que ALGUÉM foi
 * chamado; as outras não dizem nada sobre ninguém.
 *
 * E quando `aulasComChamada` é zero, não há fração possível — a tela precisa
 * dizer isso em vez de mostrar 0%.
 */
export async function minhaEbd(pessoaId: string): Promise<MinhaEbd | null> {
  const [{ data: mat }, { data: prof }] = await Promise.all([
    supabase.from("ebd_matriculas")
      .select("classe_id, ebd_classes(id, nome, cor)")
      .eq("pessoa_id", pessoaId).eq("ativo", true).maybeSingle(),
    supabase.from("ebd_professores")
      .select("classe_id, tipo, ebd_classes(id, nome, cor)")
      .eq("pessoa_id", pessoaId).eq("ativo", true).maybeSingle(),
  ]);

  // Professor primeiro: quem dá aula numa classe e está matriculado em outra
  // pertence, para efeito desta tela, à que ele conduz.
  const fonte = prof ?? mat;
  if (!fonte) return null;
  const classe: any = (fonte as any).ebd_classes;
  const classeId = (fonte as any).classe_id as string;
  if (!classe) return null;

  const { data: aulas } = await supabase
    .from("ebd_aulas").select("id, data").eq("classe_id", classeId);
  const idsAula = (aulas ?? []).map((a: any) => a.id);

  let aulasComChamada = 0, presencas = 0, ultimaChamada: string | null = null;
  if (idsAula.length) {
    const { data: pres } = await supabase
      .from("ebd_presencas").select("aula_id, pessoa_id, presente").in("aula_id", idsAula);
    const comChamada = new Set((pres ?? []).map((p: any) => p.aula_id));
    aulasComChamada = comChamada.size;
    presencas = (pres ?? []).filter((p: any) => p.pessoa_id === pessoaId && p.presente).length;
    const datas = (aulas ?? [])
      .filter((a: any) => comChamada.has(a.id))
      .map((a: any) => a.data as string).sort();
    ultimaChamada = datas.length ? datas[datas.length - 1] : null;
  }

  return {
    classeId,
    classe: classe.nome,
    cor: classe.cor ?? null,
    souProfessor: !!prof,
    tipoProfessor: prof ? ((prof as any).tipo ?? null) : null,
    aulasComChamada,
    aulasLancadas: idsAula.length,
    presencas,
    ultimaChamada,
  };
}

// ─── O convite à classe, para quem não está em nenhuma ────────────────────

export interface ConviteEbd {
  classeId: string;
  classe: string;
  cor: string | null;
  descricao: string | null;
  /** "para mulheres, de 30 a 45 anos" — o motivo, em palavras. */
  criterio: string;
}

/**
 * A classe sugerida para quem ainda não estuda em nenhuma.
 *
 * ── QUEM ESCOLHE É O BANCO ─────────────────────────────────────────────────
 *
 * `sugerir_classe_ebd(nascimento, sexo)` já existia e não era chamada por
 * ninguém. Ela filtra por faixa etária e gênero, prefere a classe específica
 * de gênero sobre a mista e, entre as que servem, a de faixa mais estreita —
 * que é a regra "sexo e/ou idade" ditada pela igreja, escrita em SQL.
 *
 * É SECURITY DEFINER, o que passa a importar depois de 20260901240000: o
 * membro comum não lê a matrícula de ninguém, e mesmo assim recebe a
 * sugestão.
 *
 * ── QUANDO NÃO DÁ PARA SUGERIR ─────────────────────────────────────────────
 *
 * Sem data de nascimento não há idade, e sem idade nenhuma das 8 classes
 * casa — todas têm faixa etária definida. São 54 das 297 fichas nessa
 * situação. Aqui a função devolve `null` e a tela pede o dado, em vez de
 * chutar: sugerir a turma errada é pior que não sugerir.
 *
 * `nascimento_dia_mes` (dia e mês sem ano, herança do sistema antigo) NÃO
 * serve de substituto — dele não sai idade.
 */
export async function conviteEbd(
  dataNascimento: string | null | undefined,
  sexo: string | null | undefined,
): Promise<ConviteEbd | null> {
  if (!dataNascimento) return null;

  const { data: classeId, error } = await supabase.rpc("sugerir_classe_ebd", {
    p_data_nascimento: dataNascimento,
    p_sexo: sexo ?? undefined,
  });
  if (error || !classeId) return null;

  const { data: classe } = await supabase
    .from("ebd_classes")
    .select("id, nome, cor, descricao, genero, idade_min, idade_max")
    .eq("id", classeId as string)
    .maybeSingle();
  if (!classe) return null;

  return {
    classeId: classe.id,
    classe: classe.nome,
    cor: classe.cor ?? null,
    descricao: classe.descricao ?? null,
    criterio: criterioDaClasse(classe.genero, classe.idade_min, classe.idade_max),
  };
}

/** "para mulheres, de 30 a 45 anos" · "de 18 a 29 anos" · "aberta a todas as idades". */
function criterioDaClasse(
  genero: string | null,
  min: number | null,
  max: number | null,
): string {
  const publico =
    genero === "masculino" ? "para homens"
    : genero === "feminino" ? "para mulheres"
    : null;

  const faixa =
    min != null && max != null ? `de ${min} a ${max} anos`
    : min != null ? `a partir de ${min} anos`
    : max != null ? `até ${max} anos`
    : null;

  const partes = [publico, faixa].filter(Boolean);
  return partes.length ? partes.join(", ") : "aberta a todas as idades";
}

// ─── Meu Pequeno Grupo ────────────────────────────────────────────────────

export interface GrupoResumo {
  id: string;
  nome: string;
  dia_semana: number | null;
  horario: string | null;
  bairro: string | null;
  endereco: string | null;
  whatsapp_link: string | null;
}

export interface MeuPgm {
  /** O grupo de que a pessoa participa, se participa. */
  meu: (GrupoResumo & { papel: string | null }) | null;
  /**
   * Sugestões para quem não participa de nenhum — os grupos do mesmo bairro
   * primeiro, e os demais depois. Nunca vazio quando há grupo ativo: um
   * convite a atravessar a cidade ainda é melhor que nenhum convite.
   */
  sugestoes: GrupoResumo[];
  /** Se as sugestões saíram do bairro da pessoa ou são o resto da lista. */
  sugestaoPorBairro: boolean;
}

const CAMPOS_GRUPO = "id, nome, dia_semana, horario, bairro, endereco, whatsapp_link";

/**
 * O Pequeno Grupo da pessoa — ou o convite ao mais próximo.
 *
 * ── REUSA O QUE JÁ EXISTIA ─────────────────────────────────────────────────
 *
 * A primeira versão consultava `pgm_membros` e `pgm_grupos` à mão e comparava
 * bairro com uma normalização própria. Duas coisas já estavam prontas e não
 * eram chamadas por ninguém — apareceram na auditoria de 01/09:
 *
 *   `listarGruposDaPessoa()`    o vínculo da pessoa
 *   `sugerirPgmPorBairro()`     a sugestão, via RPC `pgm_sugerir_por_bairro`
 *
 * A RPC é melhor que a minha comparação: além do bairro, ela traz o NÚMERO DE
 * MEMBROS de cada grupo e o nome do LÍDER, e ordena do maior para o menor.
 * Convidar alguém para o grupo mais cheio do bairro é melhor conselho que
 * convidar para o primeiro em ordem alfabética.
 *
 * ── O QUE ELA NÃO FAZ, E POR ISSO O RECUO FICA ─────────────────────────────
 *
 * A RPC casa o bairro com `lower()` e nada mais — quem não tem grupo no
 * próprio bairro recebe lista vazia. O recuo para "todos os grupos ativos"
 * continua aqui: um convite a atravessar a cidade ainda é melhor que nenhum.
 */
export async function meuPgm(pessoaId: string, meuBairro?: string | null): Promise<MeuPgm> {
  const meus = await listarGruposDaPessoa(pessoaId);
  const primeiro = meus[0] as any;
  if (primeiro?.grupo) {
    return {
      meu: { ...(primeiro.grupo as GrupoResumo), papel: primeiro.papel ?? null },
      sugestoes: [],
      sugestaoPorBairro: false,
    };
  }

  const doBairro = meuBairro?.trim()
    ? await sugerirPgmPorBairro(meuBairro).catch(() => [])
    : [];
  if (doBairro.length > 0) {
    return {
      meu: null,
      // A RPC não devolve `endereco` nem `whatsapp_link`; o cartão de sugestão
      // não os usa, e inventar `null` é mais honesto que buscá-los de novo.
      sugestoes: doBairro.map(g => ({
        id: g.id, nome: g.nome, dia_semana: g.dia_semana, horario: g.horario,
        bairro: g.bairro, endereco: null, whatsapp_link: null,
      })),
      sugestaoPorBairro: true,
    };
  }

  const { data: grupos } = await supabase
    .from("pgm_grupos").select(CAMPOS_GRUPO).eq("ativo", true).order("nome");
  return {
    meu: null,
    sugestoes: (grupos ?? []) as GrupoResumo[],
    sugestaoPorBairro: false,
  };
}

// ─── A minha semana ───────────────────────────────────────────────────────

export interface CompromissoMeu {
  tipo: "escala" | "ebd" | "pgm";
  titulo: string;
  detalhe: string | null;
  /** yyyy-mm-dd. */
  data: string;
  hora: string | null;
  para: string | null;
  /** Escala aceita, recusada ou ainda sem resposta. */
  status: string | null;
}

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/**
 * O que a igreja espera desta pessoa nos próximos dias.
 *
 * Só existem três fontes de compromisso pessoal neste banco: a escala de
 * serviço, a aula da EBD e a reunião do PGM. Nenhuma delas tinha tela que
 * respondesse "e eu?" — a escala se via pelo evento, a EBD pela classe, o PGM
 * pelo grupo. Sempre pelo lado de quem organiza.
 *
 * ── LÊ A VIEW `v_minha_escala`, E NÃO A TABELA ─────────────────────────────
 *
 * A primeira versão montava o JOIN à mão sobre `escala_voluntarios`. A view já
 * existia, com o mesmo JOIN e mais três colunas, e nenhuma tela a abria —
 * apareceu na auditoria de 01/09 entre as 15 views nunca consultadas.
 *
 * E ela acerta onde a minha errava: filtrava por `status` fora de
 * `["recusado", "cancelado", "removido"]`, e os dois últimos NÃO EXISTEM no
 * enum `status_presenca_escala` — que tem pendente, confirmado, recusado,
 * ausente e presente. Dois terços daquele filtro não filtravam nada.
 *
 * A view descarta o recusado e o passado; aqui só resta cortar o fim da
 * janela e filtrar a pessoa.
 */
export async function minhaSemana(pessoaId: string, dias = 7): Promise<CompromissoMeu[]> {
  // Data local, nunca `toISOString()`: das 21h à meia-noite em Brasília ele
  // devolve o dia seguinte, e a semana começaria amanhã.
  const d = new Date();
  const iso = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  const fim = iso(new Date(d.getFullYear(), d.getMonth(), d.getDate() + dias));

  const { data } = await supabase
    .from("v_minha_escala")
    .select("titulo, data_evento, hora_inicio, local, funcao, status, area_nome, pessoa_id")
    .eq("pessoa_id", pessoaId)
    .lte("data_evento", fim)
    .order("data_evento");

  return ((data ?? []) as any[]).map(e => ({
    tipo: "escala" as const,
    titulo: e.titulo ?? "Escala de serviço",
    // A área entra no detalhe junto da função: "Recepção · Porta principal"
    // diz mais que a função sozinha, e a view já traz as duas.
    detalhe: [e.area_nome, e.funcao].filter(Boolean).join(" · ") || null,
    data: e.data_evento,
    hora: e.hora_inicio ? String(e.hora_inicio).slice(0, 5) : null,
    para: e.local ?? null,
    status: e.status ?? null,
  }));
}

// ─── O que a igreja é, para quem assina o convite ─────────────────────────

export interface IdentidadeParaConvite {
  igreja: string | null;
  /** O canal do YouTube, se houver — vira o atalho `/live` em `convite.ts`. */
  canalYoutube: string | null;
}

/**
 * O nome da igreja e o canal, para a mensagem que a pessoa compartilha.
 *
 * Os dois já estavam cadastrados em `identidade_igreja` e nenhum convite os
 * usava: o nome saía escrito à mão nas telas, e o canal — que está em
 * `redes_sociais` ao lado do Instagram e do Facebook — não saía em lugar
 * nenhum. Era informação guardada onde nenhum código alcançava.
 */
export async function identidadeParaConvite(): Promise<IdentidadeParaConvite> {
  const { data } = await supabase
    .from("identidade_igreja").select("nome_igreja, redes_sociais")
    .eq("ativa", true).maybeSingle();
  const redes = ((data as any)?.redes_sociais ?? []) as { plataforma?: string; url?: string }[];
  const yt = redes.find(r => (r.plataforma ?? "").toLowerCase() === "youtube");
  return {
    igreja: (data as any)?.nome_igreja ?? null,
    canalYoutube: yt?.url ?? null,
  };
}

/** "quinta-feira" a partir do número que `pgm_grupos.dia_semana` guarda. */
export function nomeDoDia(n: number | null | undefined): string | null {
  if (n === null || n === undefined) return null;
  return DIAS[n] ?? null;
}

// ═══════════════════════════════════════════════════════════════════════════
// ONDE EU SIRVO, E O QUE EU FAÇO LÁ
// ═══════════════════════════════════════════════════════════════════════════
//
// 114 dos 132 vínculos ativos não dizem o que a pessoa faz. Pedir que um líder
// preencha 114 linhas é pedir a uma pessoa o que 86 sabem melhor: quem sabe o
// que o Fulano faz na Recepção é o Fulano.
//
// O desenho é o do IDE Escalas, verificado antes de escrever: o voluntário
// escolhe entre as funções da área, a liderança é notificada e confirma. O
// banco já impõe as três amarras — só a própria pessoa declara, só como
// `autodeclarada`, e nunca já confirmada.

export interface AreaOndeSirvo {
  vinculo_id: string;
  area_id: string;
  area_nome: string;
  ministerio_nome: string;
  /** "Líder" ou "Co-líder", derivado de `areas.lider_id`. Nunca digitado. */
  lideranca: "Líder" | "Co-líder" | null;
  /** O que a área oferece. Vazia = a área ainda não declarou postos. */
  catalogo: { id: string; nome: string }[];
  /** O que eu já ocupo ali. */
  meus: { ligacao_id: string; posto_id: string; nome: string; pendente: boolean }[];
}

export async function ondeEuSirvo(pessoaId: string): Promise<AreaOndeSirvo[]> {
  const { data } = await supabase
    .from("area_voluntarios")
    .select(`
      id, area_id,
      areas(id, nome, lider_id, co_lider_id, ministerios!areas_ministerio_id_fkey(nome)),
      area_voluntario_funcoes(id, area_funcao_id, confirmada_em, area_funcoes(nome))
    `)
    .eq("membro_id", pessoaId)
    .eq("status", "ativa");

  if (!data || data.length === 0) return [];

  // O catálogo vem à parte: o embed acima traz só os postos que EU ocupo, e a
  // pergunta que a tela faz é "o que existe aqui que eu ainda não disse".
  const areaIds = (data as any[]).map(r => r.area_id).filter(Boolean);
  const { data: postos } = await supabase
    .from("area_funcoes")
    .select("id, area_id, nome")
    .in("area_id", areaIds)
    .eq("ativo", true)
    .order("ordem");

  const porArea = new Map<string, { id: string; nome: string }[]>();
  for (const p of (postos ?? []) as any[]) {
    const lista = porArea.get(p.area_id) ?? [];
    lista.push({ id: p.id, nome: p.nome });
    porArea.set(p.area_id, lista);
  }

  return (data as any[])
    .filter(r => r.areas)
    .map(r => ({
      vinculo_id: r.id,
      area_id: r.area_id,
      area_nome: r.areas.nome ?? "—",
      ministerio_nome: r.areas.ministerios?.nome ?? "—",
      lideranca: r.areas.lider_id === pessoaId ? "Líder" as const
               : r.areas.co_lider_id === pessoaId ? "Co-líder" as const
               : null,
      catalogo: porArea.get(r.area_id) ?? [],
      meus: (r.area_voluntario_funcoes ?? []).map((l: any) => ({
        ligacao_id: l.id,
        posto_id: l.area_funcao_id,
        nome: l.area_funcoes?.nome ?? "—",
        pendente: l.confirmada_em === null,
      })),
    }))
    .sort((a, b) => a.ministerio_nome.localeCompare(b.ministerio_nome, "pt-BR")
                 || a.area_nome.localeCompare(b.area_nome, "pt-BR"));
}

/**
 * "É isto que eu faço aqui."
 *
 * Nasce pendente, e é o banco que garante: a política de INSERT do voluntário
 * exige `origem = 'autodeclarada'` e `confirmada_em` nulo. Se esta função
 * tentasse autoconfirmar, a linha seria recusada — o que foi conferido no
 * ensaio da migration, com a conta do pastor Lúcio.
 */
export async function declararPosto(vinculoId: string, postoId: string): Promise<ResultadoEscrita> {
  const resultado = await supabase.from("area_voluntario_funcoes").insert({
    area_voluntario_id: vinculoId,
    area_funcao_id: postoId,
    origem: "autodeclarada",
  }).select("id");
  return conferir(resultado, "A sua função");
}

/** Desdizer, enquanto ninguém confirmou. Depois disso é assunto da equipe. */
export async function retirarDeclaracao(ligacaoId: string): Promise<ResultadoEscrita> {
  const resultado = await supabase
    .from("area_voluntario_funcoes").delete().eq("id", ligacaoId).select("id");
  return conferir(resultado, "A sua função");
}
