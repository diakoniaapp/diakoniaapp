// ─── types/visitante.ts — Tipos do módulo de acolhimento pastoral ─────────────

// Status da trilha de acolhimento (enum espelhado do banco)
export type StatusAcolhimento =
  | "novo"
  | "contatar"
  | "contatado"
  | "retornou"
  | "em_relacionamento"
  | "em_acompanhamento"
  | "congregado"
  | "membro";

export const STATUS_ACOLHIMENTO_CONFIG: {
  value: StatusAcolhimento;
  label: string;
  descricao: string;
  cor: string;
  corTexto: string;
}[] = [
  { value: "novo",              label: "Novo",               descricao: "Primeiro contato registrado",         cor: "bg-slate-100",    corTexto: "text-slate-700"   },
  { value: "contatar",          label: "A contatar",          descricao: "Aguardando primeiro contato",         cor: "bg-orange-100",   corTexto: "text-orange-700"  },
  { value: "contatado",         label: "Contatado",           descricao: "Já recebeu contato da equipe",        cor: "bg-yellow-100",   corTexto: "text-yellow-700"  },
  { value: "retornou",          label: "Retornou",            descricao: "Visitou mais de uma vez",             cor: "bg-green-100",    corTexto: "text-green-700"   },
  { value: "em_relacionamento", label: "Em relacionamento",   descricao: "Participando de grupos ou eventos",   cor: "bg-emerald-100",  corTexto: "text-emerald-700" },
  { value: "em_acompanhamento", label: "Em acompanhamento",   descricao: "Sendo cuidado ativamente",            cor: "bg-teal-100",     corTexto: "text-teal-700"    },
  { value: "congregado",        label: "Congregado",          descricao: "Tornou-se congregado",                cor: "bg-purple-100",   corTexto: "text-purple-700"  },
  { value: "membro",            label: "Membro",              descricao: "Membro formal da igreja",             cor: "bg-indigo-100",   corTexto: "text-indigo-700"  },
];

// Índice da trilha (sem congregado/membro — esses são transições)
export const TRILHA_ACOLHIMENTO: StatusAcolhimento[] = [
  "novo", "contatar", "contatado", "retornou", "em_relacionamento", "em_acompanhamento",
];

export interface Visitante {
  id:                  string;
  nome_completo:       string;
  telefone_celular:    string | null;
  telefone_fixo:       string | null;
  email:               string | null;
  status_acolhimento:  StatusAcolhimento | null;
  tipo_pessoa:         string;
  observacoes_pastorais: string | null;
  responsavel_id:      string | null;
  quem_convidou_id:    string | null;
  numero_visitas:      number | null;
  ultimo_contato_em:   string | null;
  ultimo_contato_tipo: string | null;
  data_congregado:     string | null;
  data_membro:         string | null;
  created_at:          string;
  updated_at:          string;
  // campos extras (join)
  como_conheceu:       string | null;
  bairro:              string | null;
  data_nascimento:     string | null;
  sexo:                string | null;
}

export interface HistoricoItem {
  id:          string;
  tipo:        string;
  observacao:  string | null;
  created_at:  string;
}

export interface AcompanhamentoItem {
  id:              string;
  status:          string;
  contato_feito:   boolean;
  data_contato:    string | null;
  visita_realizada: boolean;
  data_visita:     string | null;
  proximo_passo:   string | null;
  observacoes:     string | null;
  created_at:      string;
}
