// ─── voluntariosPainel.ts ────────────────────────────────────────────────────
// A leitura do painel de voluntários. Nenhum cálculo novo.
//
// Tudo vem de `v_voluntarios_completo`, que já existia no banco e nunca tinha
// sido aberta por nenhuma tela. A única coisa que este arquivo faz além de ler
// é AGRUPAR: a view é por (pessoa, área), então quem serve em duas áreas do
// mesmo ministério aparece duas vezes nela. No painel do ministério, essa
// pessoa é uma pessoa só, com duas áreas.
//
// ── A DISTINÇÃO QUE SUSTENTA A TELA INTEIRA ──────────────────────────────────
//
// Quatro colunas da view vêm de COALESCE e MEDEM 100% DE COBERTURA SEM TER
// DADO NENHUM:
//
//   max_escalas_mes   COALESCE(ps.max_escalas_mes, 4)
//   carga_atual_mes   COALESCE(ps.carga_atual_mes, 0)
//   nivel_sobrecarga  COALESCE(ps.nivel_sobrecarga, 0)
//   em_descanso       COALESCE(ps.em_descanso, false)
//
// Uma tela que mostrasse "0 de 4 escalas" para os 74 estaria afirmando um teto
// que ninguém definiu, e um "não está em descanso" que ninguém confirmou.
//
// O sinal que separa os dois casos é `dias_disponiveis`: ele NÃO é coalescido,
// então vem `null` para quem não tem linha em `perfil_servico`, e `[]` para
// quem tem linha mas não marcou dia nenhum. É a diferença entre "ninguém
// perguntou" e "perguntaram e ela não marcou".
//
// Por isso `temPerfil` existe, e por isso a tela mostra a barra de carga só
// para quem tem perfil.

import { supabase } from "@/integrations/supabase/client";
import { DIAS, TURNOS, type DiaSemana, type Turno, type Frequencia } from "@/services/perfilServico";

export interface AtuacaoNoMinisterio {
  area_id: string;
  area_nome: string;
  funcao: string | null;
  desde: string | null;
}

export interface VoluntarioDoPainel {
  pessoa_id: string;
  nome_completo: string;
  telefone: string | null;
  atuacoes: AtuacaoNoMinisterio[];

  /** `false` quando não há linha em `perfil_servico` — ver o comentário acima. */
  temPerfil: boolean;

  dias: DiaSemana[];
  turnos: Turno[];
  frequencia: Frequencia | null;
  restricoes: string | null;

  emDescanso: boolean;
  descansoAte: string | null;

  /** Só significam alguma coisa quando `temPerfil`. */
  cargaMes: number;
  maxMes: number;
  sobrecarga: number;

  ultimaEscala: string | null;
  /** `null` quando nunca serviu. */
  diasSemServir: number | null;
}

export async function voluntariosDoMinisterio(ministerioId: string): Promise<VoluntarioDoPainel[]> {
  const { data, error } = await supabase
    .from("v_voluntarios_completo")
    .select("*")
    .eq("ministerio_id", ministerioId)
    .order("nome_completo");

  if (error || !data) return [];

  const porPessoa = new Map<string, VoluntarioDoPainel>();

  for (const l of data as any[]) {
    const atuacao: AtuacaoNoMinisterio = {
      area_id:   l.area_id,
      area_nome: (l.area_nome ?? "—").trim(),
      funcao:    l.funcao,
      desde:     l.data_inicio,
    };

    const jaVisto = porPessoa.get(l.pessoa_id);
    if (jaVisto) { jaVisto.atuacoes.push(atuacao); continue; }

    const ultima = l.ultima_escala_em as string | null;

    porPessoa.set(l.pessoa_id, {
      pessoa_id:     l.pessoa_id,
      nome_completo: l.nome_completo ?? "—",
      telefone:      l.telefone_celular,
      atuacoes:      [atuacao],

      temPerfil:  l.dias_disponiveis !== null,
      dias:       (l.dias_disponiveis   ?? []) as DiaSemana[],
      turnos:     (l.turnos_disponiveis ?? []) as Turno[],
      frequencia: l.frequencia_maxima as Frequencia | null,
      restricoes: l.restricoes,

      emDescanso:  !!l.em_descanso,
      descansoAte: l.descanso_ate,

      cargaMes:   l.carga_atual_mes  ?? 0,
      maxMes:     l.max_escalas_mes  ?? 4,
      sobrecarga: l.nivel_sobrecarga ?? 0,

      ultimaEscala:  ultima,
      diasSemServir: ultima
        ? Math.floor((Date.now() - new Date(ultima + "T12:00:00").getTime()) / 86_400_000)
        : null,
    });
  }

  return [...porPessoa.values()];
}

// ── Os estados que a tela mostra ────────────────────────────────────────────
//
// A ordem é a de urgência para quem monta escala, e "sem_perfil" NÃO é o pior:
// é só o mais comum hoje, e some sozinho conforme a igreja preenche.

export type EstadoVoluntario = "descanso" | "no_limite" | "sumido" | "sem_perfil" | "disponivel";

export function estadoDe(v: VoluntarioDoPainel): EstadoVoluntario {
  if (v.emDescanso) return "descanso";
  if (v.temPerfil && v.cargaMes >= v.maxMes) return "no_limite";
  if (v.diasSemServir !== null && v.diasSemServir >= 60) return "sumido";
  if (!v.temPerfil) return "sem_perfil";
  return "disponivel";
}

export const ROTULO_ESTADO: Record<EstadoVoluntario, string> = {
  descanso:   "Em descanso",
  no_limite:  "No limite do mês",
  sumido:     "Sem servir",
  // "Sem disponibilidade" e NÃO "indisponível": a segunda seria uma afirmação
  // que ninguém fez. A pessoa pode servir todos os dias — só não contou.
  sem_perfil: "Sem disponibilidade",
  disponivel: "Disponível",
};

/** Uma linha de resumo da disponibilidade, para a lista. */
export function quandoServe(v: VoluntarioDoPainel): string {
  if (!v.temPerfil) return "Ninguém perguntou ainda";
  if (v.emDescanso) {
    const ate = v.descansoAte
      ? new Date(v.descansoAte + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
      : null;
    return ate ? `Volta em ${ate}` : "Sem data de volta";
  }
  if (v.dias.length === 0) return "Não marcou nenhum dia";

  const dias = v.dias.length === 7
    ? "Todos os dias"
    : v.dias.map(d => DIAS.find(x => x.valor === d)?.curto ?? d).join(", ");

  const turnos = v.turnos.length === 0 || v.turnos.includes("dia_todo")
    ? ""
    : " · " + v.turnos.map(t => TURNOS.find(x => x.valor === t)?.rotulo.toLowerCase() ?? t).join(", ");

  return dias + turnos;
}
