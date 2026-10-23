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
   * Ministérios, áreas e locais (16/10/2026): os ids que existiam da última vez. Sem essa memória a tela tratava TODO id fora da seleção como "novo" e o
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
 * As que os blocos do painel (Agenda do dia, da semana, impressão) mostram: todas, menos as profissionais.
 *
 * "Dia do Médico", "Dia do Contador"… são vinte linhas por ano que só fazem sentido para quem as quer (decisão dela, 22/10/2026) — para o painel isso continua valendo.
 * A TELA da Agenda é outra coisa: abre sempre com tudo marcado (`DEFAULT_FILTROS`).
 */
export const CATEGORIAS_PADRAO: CategoriaEvento[] = TODAS_AS_CATEGORIAS.filter((c) => c !== "profissional");

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
  categorias: TODAS_AS_CATEGORIAS,
};

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
 * Categoria restringe quando falta qualquer uma das categorias da Agenda.
 *
 * Desde 22/10/2026 a Agenda abre com TODAS marcadas (inclusive as profissionais), então qualquer caixa desmarcada é filtro ligado.
 */
export function categoriasRestringem(categorias: CategoriaEvento[] | undefined): boolean {
  const sel = categorias ?? TODAS_AS_CATEGORIAS;
  return sel.length > 0 && TODAS_AS_CATEGORIAS.some((c) => !sel.includes(c));
}
