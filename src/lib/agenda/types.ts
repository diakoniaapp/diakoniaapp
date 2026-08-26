export type EventoStatus = "agendado" | "realizado" | "cancelado";
export type EventoTipo = "culto" | "reuniao" | "ensaio" | "acao_social" | "curso" | "live" | "palestra" | "comunhao" | "outro";
export type Resp = "principal" | "apoio";
export type AgendaView = "dia" | "semana" | "mes" | "lista";
export type ColorBy = "ministerio" | "tipo";
export type CategoriaEvento = "igreja" | "batista" | "feriado" | "aniversario" | "casamento" | "arrecadacao";

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
  status: ["agendado", "realizado", "cancelado"],
  colorBy: "tipo",
  categorias: ["igreja", "batista", "feriado", "aniversario", "casamento", "arrecadacao"],
  tiposConhecidos: TODOS_OS_TIPOS,
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

  return { ...DEFAULT_FILTROS, ...(p as Partial<AgendaFiltros>) };
}