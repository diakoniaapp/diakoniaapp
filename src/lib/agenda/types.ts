export type EventoStatus = "agendado" | "realizado" | "cancelado";
export type EventoTipo = "culto" | "reuniao" | "ensaio" | "acao_social" | "curso" | "live" | "palestra" | "comunhao" | "outro";
export type Resp = "principal" | "apoio";
export type AgendaView = "dia" | "semana" | "mes" | "lista";
export type ColorBy = "ministerio" | "tipo";
export type CategoriaEvento =
  | "igreja" | "aniversario" | "casamento" | "arrecadacao"
  // As Datas Especiais — ver o cabeçalho delas em externalEvents.ts.
  | "crista" | "batista" | "familiar" | "profissional" | "feriado" | "institucional";

export type RecorrenciaFreq = "nao" | "diario" | "semanal" | "mensal" | "anual" | "personalizado";

export interface RecorrenciaRegra {
  freq: Exclude<RecorrenciaFreq, "nao">;
  intervalo: number; // every N
  dias_semana?: number[]; // 0=Sun..6=Sat (apenas semanal)
  fim:
    | { tipo: "nunca" }
    | { tipo: "data"; data: string } // yyyy-mm-dd
    | { tipo: "ocorrencias"; n: number };
}

export interface EventoRow {
  id: string;
  titulo: string;
  tipo: EventoTipo;
  data: string; // yyyy-mm-dd
  hora_inicio: string | null;
  hora_fim: string | null;
  local: string | null;
  local_id: string | null;
  descricao: string | null;
  status: EventoStatus;
  cor: string | null;
  ministerio_principal_id: string | null;
  recorrencia_id: string | null;
  recorrencia_regra: RecorrenciaRegra | null;
  is_excecao: boolean;
  ocorrencia_original_data: string | null;
  serie_origem_id: string | null;
}

// Evento "expandido" para uma ocorrência concreta na visualização
export interface EventoOcorrencia {
  key: string; // id+data
  baseId: string;
  serieId: string | null; // recorrencia_id
  isExcecao: boolean;
  isOcorrenciaVirtual: boolean; // true se gerada da regra (sem linha própria)
  data: string;
  ocorrencia_original_data: string | null;
  evento: EventoRow;
  /** Origem do evento. "igreja" = registro local. */
  categoria?: CategoriaEvento;
  /** Bloqueia edição (eventos externos / institucionais). */
  externalReadOnly?: boolean;
  /** F13: marca quando há outras ocorrências sobrepostas no mesmo local (uso compartilhado). */
  compartilhado?: boolean;
}

export interface MinisterioOpt { id: string; nome: string; sigla: string | null; ativo: boolean; }
export interface AreaOpt { id: string; nome: string; ministerio_id: string; ativo: boolean; }
export interface LocalOpt {
  id: string;
  nome: string;
  nome_completo: string | null;
  status: "ativo" | "inativo";
  permite_agendamento: boolean;
}

export interface AgendaFiltros {
  ministerios: string[];
  areas: string[];
  tipos: EventoTipo[];
  locais: string[];
  status: EventoStatus[];
  colorBy: ColorBy;
  /** Categorias visíveis. */
  categorias?: CategoriaEvento[];
  /**
   * Os tipos que existiam da última vez que este filtro foi gravado.
   *
   * Serve para distinguir as duas únicas coisas que a ausência de um tipo em
   * `tipos` pode significar: **a pessoa desmarcou** ou **o tipo não existia**.
   * Sem essa memória as duas são idênticas no `localStorage`, e a segunda
   * esconde eventos que ninguém pediu para esconder — ver `migrarFiltros`.
   */
  tiposConhecidos?: EventoTipo[];
  /**
   * O mesmo, para categorias (22/10/2026). Sem isso, as categorias novas
   * (cristãs, familiares, institucionais) nasceriam FORA da lista salva de
   * quem já tinha filtro — e não apareceriam para ninguém que já usava a
   * Agenda. Ver `migrarFiltros`.
   */
  categoriasConhecidas?: CategoriaEvento[];
  /**
   * O mesmo para ministérios, áreas e locais (16/10/2026): os ids que existiam da última vez. Sem essa memória a tela tratava TODO id fora da seleção como "novo" e o
   * remarcava a cada abertura — a escolha "só o Templo" não sobrevivia a fechar a Agenda. Com ela, só o que nasceu depois entra marcado sozinho.
   */
  ministeriosConhecidos?: string[];
  areasConhecidas?: string[];
  locaisConhecidos?: string[];
}

export const TIPO_LABEL: Record<EventoTipo, string> = {
  culto: "Culto",
  reuniao: "Reunião",
  ensaio: "Ensaio",
  acao_social: "Ação Social",
  curso: "Curso/Treinamento",
  live: "Live",
  palestra: "Palestra",
  comunhao: "Comunhão",
  outro: "Outro",
};

export const STATUS_LABEL: Record<EventoStatus, string> = {
  agendado: "Agendado",
  realizado: "Realizado",
  cancelado: "Cancelado",
};

/**
 * Todos os tipos de evento, na ordem em que aparecem no filtro.
 *
 * Sai de `TIPO_LABEL` em vez de ser uma lista à parte: acrescentar `live` ao
 * enum e esquecer de somar aqui daria um tipo que nasce desmarcado enquanto
 * todos os outros vêm marcados — e ninguém repara num item a menos numa lista
 * de nove.
 */
export const TODOS_OS_TIPOS = Object.keys(TIPO_LABEL) as EventoTipo[];

/** Todas as categorias da agenda: as da igreja, as de pessoas e as seis das Datas Especiais. */
export const TODAS_AS_CATEGORIAS: CategoriaEvento[] = [
  "igreja", "aniversario", "casamento", "arrecadacao",
  "crista", "batista", "familiar", "profissional", "feriado", "institucional",
];

/**
 * As que a agenda mostra sem ninguém pedir: todas, menos as profissionais.
 *
 * "Dia do Médico", "Dia do Contador", "Dia do Engenheiro"… são vinte linhas
 * por ano que só fazem sentido para quem as quer — decisão dela, 22/10/2026.
 * Quem marca a caixa passa a vê-las; "Mostrar tudo" também as liga.
 */
export const CATEGORIAS_PADRAO: CategoriaEvento[] = TODAS_AS_CATEGORIAS.filter((c) => c !== "profissional");

/**
 * As seis que existiam antes das Datas Especiais. É o que um filtro gravado
 * sem `categoriasConhecidas` conhecia — ver `migrarFiltros`.
 */
const CATEGORIAS_ATE_OUT_2026: CategoriaEvento[] = ["igreja", "batista", "feriado", "aniversario", "casamento", "arrecadacao"];
export const TODOS_OS_STATUS = Object.keys(STATUS_LABEL) as EventoStatus[];

export const DEFAULT_FILTROS: AgendaFiltros = {
  ministerios: [],
  areas: [],
  // Todos marcados, como `status` e `categorias` logo abaixo.
  //
  // `tipos` era o único enum pequeno que nascia vazio, e o painel ficava
  // dizendo duas coisas ao mesmo tempo: nenhum tipo marcado, e a agenda cheia
  // de eventos de todos os tipos. Por dentro estava certo — `filtros.tipos`
  // vazio significa "sem restrição" — mas quem abre o filtro lê os
  // quadradinhos, não o `if`. Nove caixas vazias sobre uma lista completa
  // parecem um filtro quebrado.
  tipos: TODOS_OS_TIPOS,
  locais: [],
  status: TODOS_OS_STATUS,
  colorBy: "tipo",
  categorias: CATEGORIAS_PADRAO,
  tiposConhecidos: TODOS_OS_TIPOS,
  categoriasConhecidas: TODAS_AS_CATEGORIAS,
};

/**
 * Traz um filtro gravado no navegador para o formato de hoje.
 *
 * ── O DEFEITO QUE ISTO EVITA ─────────────────────────────────────────────
 *
 * Enquanto `tipos` nascia vazio, vazio significava "sem restrição" e um tipo
 * novo no enum aparecia sozinho na agenda de todo mundo. Ao passar a gravar
 * os nove tipos marcados, isso se inverteu: o décimo tipo nasceria FORA da
 * lista salva de cada usuário, e todos os eventos dele sumiriam da agenda —
 * sem erro, com um discreto "9/10" no chip.
 *
 * Não é hipótese: `live`, `palestra` e `comunhao` entraram no enum em
 * 26/08/2026, e a igreja usa os três.
 *
 * `tiposConhecidos` desfaz o empate. Um tipo que falta em `tipos` mas consta
 * de `tiposConhecidos` foi desmarcado por alguém, e continua desmarcado. Um
 * tipo que não consta de nenhum dos dois é novo, e entra marcado.
 *
 * ── POR QUE FILTRO SEM `tiposConhecidos` NÃO GANHA NADA ──────────────────
 *
 * Um filtro gravado antes desta versão não tem como dizer se `["culto"]` é
 * escolha de alguém ou resquício. Tratá-lo como "conhece todos os tipos de
 * hoje" preserva a escolha, que é o que dói perder; o preço é que um tipo
 * criado ANTES desta versão e nunca visto por essa pessoa fica desmarcado.
 * Nenhum tipo está nessa situação hoje.
 *
 * É uma função pura, e não um trecho dentro do `useState` da tela, porque o
 * defeito acima só aparece meses depois de escrito — a única forma de saber
 * que continua consertado é um teste, e teste precisa poder chamá-la.
 */
export function migrarFiltros(gravado: unknown): AgendaFiltros {
  const p = { ...(gravado as Record<string, unknown>) };

  // Categorias vazias ANTES de qualquer outra regra: "nenhuma categoria" escondia a agenda inteira, e o passo da arrecadação abaixo transformava o vazio em ["arrecadacao"] —
  // quem desmarcou tudo reabria vendo só a camada de arrecadação.
  if (!Array.isArray(p.categorias) || p.categorias.length === 0) p.categorias = CATEGORIAS_PADRAO;

  // Categoria nova entra marcada — se for das que aparecem por padrão. É a
  // mesma lógica de `tiposConhecidos` logo abaixo: o que falta em `categorias`
  // mas consta de `categoriasConhecidas` foi desmarcado por alguém e continua
  // desmarcado. As profissionais nascem desmarcadas para todo mundo.
  {
    const conhecidas: string[] = Array.isArray(p.categoriasConhecidas)
      ? (p.categoriasConhecidas as string[])
      : CATEGORIAS_ATE_OUT_2026;
    const atuais = (p.categorias as string[]).filter((c) => TODAS_AS_CATEGORIAS.includes(c as CategoriaEvento));
    const novas = CATEGORIAS_PADRAO.filter((c) => !conhecidas.includes(c) && !atuais.includes(c));
    p.categorias = [...atuais, ...novas];
    if ((p.categorias as string[]).length === 0) p.categorias = CATEGORIAS_PADRAO;
    p.categoriasConhecidas = TODAS_AS_CATEGORIAS;
  }

  // Camada de arrecadação: quem tem filtro anterior a ela não a veria.
  if (Array.isArray(p.categorias) && !p.categorias.includes("arrecadacao")) {
    p.categorias = [...p.categorias, "arrecadacao"];
  }

  const conhecidos: string[] = Array.isArray(p.tiposConhecidos)
    ? (p.tiposConhecidos as string[])
    : TODOS_OS_TIPOS;
  const novos = TODOS_OS_TIPOS.filter((t) => !conhecidos.includes(t));

  if (!Array.isArray(p.tipos) || p.tipos.length === 0) {
    // Vazio nunca quis dizer "esconder tudo" — o `if` que filtra é
    // `filtros.tipos.length && …`, então quem gravou vazio via todos os
    // tipos. Marcar todos não muda o que essa pessoa vê; faz a tela dizer a
    // verdade sobre isso.
    p.tipos = TODOS_OS_TIPOS;
  } else if (novos.length > 0) {
    // `filter` antes de concatenar, e não `[...tipos, ...novos]` direto.
    //
    // As duas listas podem se sobrepor: basta `tiposConhecidos` estar
    // desatualizado enquanto `tipos` já traz o tipo. A concatenação crua
    // duplicava — e duplicata aqui não dá erro, só faz o chip anunciar
    // "17/9" e o `includes` do filtro trabalhar à toa. Foi o teste
    // "nunca sai com tipo repetido" que apontou isto.
    const atuais = p.tipos as EventoTipo[];
    p.tipos = [...atuais, ...novos.filter((t) => !atuais.includes(t))];
  }
  p.tiposConhecidos = TODOS_OS_TIPOS;

  // Status e categorias também nunca ficam vazios (16/10/2026). Status vazio era gravado por "Mostrar tudo"/"Limpar" e voltava com as três caixas desmarcadas; categorias vazias
  // escondem a agenda INTEIRA (o filtro de categoria, ao contrário dos outros, não trata vazio como "sem restrição"). Em ambos, vazio ⇒ tudo marcado: o que a pessoa via não muda.
  if (!Array.isArray(p.status) || p.status.length === 0) p.status = TODOS_OS_STATUS;

  return { ...DEFAULT_FILTROS, ...(p as Partial<AgendaFiltros>) };
}

/** Os universos de opções que só a tela conhece (ministérios, áreas e locais carregados do banco). */
export interface UniversoDosFiltros { ministerios: string[]; areas: string[]; locais: string[] }

/**
 * Todos os filtros marcados — a Agenda como ela deve abrir. Preserva só a preferência de exibição (`colorBy`).
 *
 * "Nenhuma caixa marcada" nunca é um estado válido: para os filtros de lista vazio significa "sem restrição" e para categoria significa "agenda vazia"; nos dois casos a tela mostra
 * quadradinhos vazios, que é como um filtro quebrado parece. O estado de "ver tudo" se escreve com tudo marcado.
 */
export function filtrosTodosMarcados(atual: AgendaFiltros, universo: UniversoDosFiltros): AgendaFiltros {
  return {
    ...atual,
    ministerios: universo.ministerios, areas: universo.areas, locais: universo.locais,
    tipos: TODOS_OS_TIPOS, status: TODOS_OS_STATUS, categorias: TODAS_AS_CATEGORIAS,
    tiposConhecidos: TODOS_OS_TIPOS, categoriasConhecidas: TODAS_AS_CATEGORIAS,
    ministeriosConhecidos: universo.ministerios, areasConhecidas: universo.areas, locaisConhecidos: universo.locais,
  };
}

/**
 * Inclui, marcados, os itens que NASCERAM depois da última vez (ministério, área ou local novo) — e só eles.
 *
 * · lista vazia (nunca houve seleção) ⇒ tudo marcado, que é como a Agenda abre;
 * · sem memória (filtro gravado antes desta regra) ⇒ todos os itens contam como novos, uma única vez: nada some do que a pessoa via;
 * · com memória ⇒ o que a pessoa desmarcou continua desmarcado: é a "última seleção" sendo restaurada.
 */
export function incluirNovos(selecionados: string[], conhecidos: string[] | undefined, todos: string[]): { selecionados: string[]; conhecidos: string[]; mudou: boolean } {
  const sabidos = conhecidos ?? [];
  const novos = todos.filter((id) => !sabidos.includes(id));
  if (selecionados.length === 0) return { selecionados: todos, conhecidos: todos, mudou: true };
  if (novos.length === 0) return { selecionados, conhecidos: sabidos, mudou: false };
  return { selecionados: [...selecionados, ...novos.filter((id) => !selecionados.includes(id))], conhecidos: [...new Set([...sabidos, ...todos])], mudou: true };
}

/** Algum filtro deixa de fora parte do que existe? (a mesma definição do contador do botão Filtros) */
export function algumFiltroRestringe(f: AgendaFiltros, universo: UniversoDosFiltros): boolean {
  const restringe = (sel: number, total: number) => sel > 0 && sel < total;
  return restringe(f.ministerios.length, universo.ministerios.length) || restringe(f.areas.length, universo.areas.length)
    || restringe(f.locais.length, universo.locais.length) || restringe(f.tipos.length, TODOS_OS_TIPOS.length)
    || restringe(f.status.length, TODOS_OS_STATUS.length) || categoriasRestringem(f.categorias);
}

/**
 * Categoria restringe quando falta alguma das que aparecem POR PADRÃO.
 *
 * Não é "falta alguma de todas": as profissionais vêm desmarcadas de fábrica,
 * e contar isso como filtro ligado deixaria o aviso "há filtros ativos" aceso
 * para todo mundo, sempre — e um aviso sempre aceso não avisa nada.
 */
export function categoriasRestringem(categorias: CategoriaEvento[] | undefined): boolean {
  const sel = categorias ?? CATEGORIAS_PADRAO;
  return sel.length > 0 && CATEGORIAS_PADRAO.some((c) => !sel.includes(c));
}
