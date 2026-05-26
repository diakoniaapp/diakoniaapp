export type EventoStatus = "agendado" | "realizado" | "cancelado";
export type EventoTipo = "culto" | "reuniao" | "ensaio" | "acao_social" | "curso" | "outro";
export type Resp = "principal" | "apoio";
export type AgendaView = "dia" | "semana" | "mes" | "lista";
export type ColorBy = "ministerio" | "tipo";
export type CategoriaEvento = "igreja" | "batista" | "feriado" | "aniversario" | "casamento";

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
}

export const TIPO_LABEL: Record<EventoTipo, string> = {
  culto: "Culto",
  reuniao: "Reunião",
  ensaio: "Ensaio",
  acao_social: "Ação Social",
  curso: "Curso/Treinamento",
  outro: "Outro",
};

export const STATUS_LABEL: Record<EventoStatus, string> = {
  agendado: "Agendado",
  realizado: "Realizado",
  cancelado: "Cancelado",
};

export const DEFAULT_FILTROS: AgendaFiltros = {
  ministerios: [],
  areas: [],
  tipos: [],
  locais: [],
  status: ["agendado", "realizado", "cancelado"],
  colorBy: "tipo",
  categorias: ["igreja", "batista", "feriado", "aniversario", "casamento"],
};