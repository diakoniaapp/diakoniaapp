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
import { conferir } from "@/lib/escritaConferida";

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
      p_telefone_celular: vazio(d.telefone_celular),
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

export async function meuPgm(pessoaId: string, meuBairro?: string | null): Promise<MeuPgm> {
  const { data: vinculo } = await supabase
    .from("pgm_membros")
    .select(`papel, pgm_grupos(${CAMPOS_GRUPO})`)
    .eq("pessoa_id", pessoaId).eq("ativo", true).maybeSingle();

  if (vinculo && (vinculo as any).pgm_grupos) {
    return {
      meu: { ...(vinculo as any).pgm_grupos, papel: (vinculo as any).papel ?? null },
      sugestoes: [],
      sugestaoPorBairro: false,
    };
  }

  const { data: grupos } = await supabase
    .from("pgm_grupos").select(CAMPOS_GRUPO).eq("ativo", true).order("nome");
  const todos = (grupos ?? []) as GrupoResumo[];

  // Comparação sem acento e sem caixa: "Vila Isabel" e "vila isabel" são o
  // mesmo bairro, e o cadastro tem as duas grafias.
  const limpar = (s?: string | null) =>
    (s ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const alvo = limpar(meuBairro);
  const doBairro = alvo ? todos.filter(g => limpar(g.bairro) === alvo) : [];

  return {
    meu: null,
    sugestoes: doBairro.length ? doBairro : todos,
    sugestaoPorBairro: doBairro.length > 0,
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
 * serviço, a aula da EBD e a reunião do PGM. Nenhuma delas tem tela que
 * responda "e eu?" — a escala se vê pelo evento, a EBD pela classe, o PGM
 * pelo grupo. Sempre pelo lado de quem organiza.
 */
export async function minhaSemana(pessoaId: string, dias = 7): Promise<CompromissoMeu[]> {
  // Data local, nunca `toISOString()`: das 21h à meia-noite em Brasília ele
  // devolve o dia seguinte, e a semana começaria amanhã.
  const d = new Date();
  const iso = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  const hoje = iso(d);
  const fim = iso(new Date(d.getFullYear(), d.getMonth(), d.getDate() + dias));

  const { data: escalado } = await supabase
    .from("escala_voluntarios")
    .select("status, funcao, escalas(titulo, data_evento, hora_inicio, local)")
    .eq("pessoa_id", pessoaId);

  const fora = new Set(["recusado", "cancelado", "removido"]);
  const lista: CompromissoMeu[] = [];

  for (const e of (escalado ?? []) as any[]) {
    const esc = e.escalas;
    if (!esc?.data_evento) continue;
    if (esc.data_evento < hoje || esc.data_evento > fim) continue;
    if (fora.has(String(e.status ?? ""))) continue;
    lista.push({
      tipo: "escala",
      titulo: esc.titulo ?? "Escala de serviço",
      detalhe: e.funcao ?? null,
      data: esc.data_evento,
      hora: esc.hora_inicio ? String(esc.hora_inicio).slice(0, 5) : null,
      para: esc.local ?? null,
      status: e.status ?? null,
    });
  }

  return lista.sort((a, b) =>
    a.data === b.data ? (a.hora ?? "").localeCompare(b.hora ?? "") : a.data.localeCompare(b.data));
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
