// ─── perfilServico.ts ────────────────────────────────────────────────────────
// Quando a pessoa pode servir.
//
// ── POR QUE ISTO É A SPRINT 2, E NÃO A 1 ─────────────────────────────────────
//
// A tabela `perfil_servico` existe no banco desde que a estrutura de escalas
// foi criada, com dias, turnos, frequência, descanso e restrições. Tinha zero
// linhas e zero referências no código.
//
// Ela é a ÚNICA coisa genuinamente ausente de todo o ecossistema de escalas
// auditado: o resto existe e só precisava ser ligado. Sem ela:
//
//   · `sugerir_voluntarios_escala` não tem em que diferenciar as pessoas —
//     testado em produção, os 23 voluntários da Recepção saem todos com 80
//   · o painel de voluntários mostraria 74 pessoas com disponibilidade vazia
//   · "quem está disponível domingo à noite?" continua sem resposta
//
// ── O QUE NÃO ESTÁ AQUI, DE PROPÓSITO ────────────────────────────────────────
//
// `areas_preferidas` e `areas_evitar` existem na tabela e pesam no score
// (+10 e −20), mas não entram no formulário de cadastro. Elas são sobre
// RELAÇÃO COM UM LUGAR, não sobre agenda — e pedir isso no cadastro convida
// alguém a listar onde não quer servir antes de ter servido em lugar nenhum.
// O lugar delas é o próprio vínculo, quando a área é atribuída.
//
// `carga_atual_mes`, `nivel_sobrecarga` e `score_engajamento` também ficam de
// fora: são CALCULADOS pelo gatilho `trg_atualizar_carga` a cada escala
// confirmada. Escrever esses campos daqui seria disputar com o banco.

import { supabase } from "@/integrations/supabase/client";
import { conferir, type ResultadoEscrita } from "@/lib/escritaConferida";

export type DiaSemana = "domingo" | "segunda" | "terca" | "quarta" | "quinta" | "sexta" | "sabado";
export type Turno = "manha" | "tarde" | "noite" | "dia_todo";
export type Frequencia = "toda_semana" | "quinzenal" | "mensal" | "eventual" | "sob_demanda";

export const DIAS: { valor: DiaSemana; curto: string; longo: string }[] = [
  { valor: "domingo", curto: "Dom", longo: "Domingo" },
  { valor: "segunda", curto: "Seg", longo: "Segunda" },
  { valor: "terca",   curto: "Ter", longo: "Terça" },
  { valor: "quarta",  curto: "Qua", longo: "Quarta" },
  { valor: "quinta",  curto: "Qui", longo: "Quinta" },
  { valor: "sexta",   curto: "Sex", longo: "Sexta" },
  { valor: "sabado",  curto: "Sáb", longo: "Sábado" },
];

export const TURNOS: { valor: Turno; rotulo: string }[] = [
  { valor: "manha",    rotulo: "Manhã" },
  { valor: "tarde",    rotulo: "Tarde" },
  { valor: "noite",    rotulo: "Noite" },
  { valor: "dia_todo", rotulo: "Dia todo" },
];

/**
 * A ordem importa: ela vai do mais frequente ao menos, e é assim que a lista
 * aparece na tela. "Sob demanda" no fim não é rebaixamento — é a pessoa que
 * disse "me chame quando precisar", e essa é uma resposta legítima.
 */
export const FREQUENCIAS: { valor: Frequencia; rotulo: string; ajuda: string }[] = [
  { valor: "toda_semana", rotulo: "Toda semana", ajuda: "Está na escala como regra" },
  { valor: "quinzenal",   rotulo: "Quinzenal",   ajuda: "Uma escala sim, uma não" },
  { valor: "mensal",      rotulo: "Uma vez por mês", ajuda: "O ritmo mais comum" },
  { valor: "eventual",    rotulo: "De vez em quando", ajuda: "Sem compromisso fixo" },
  { valor: "sob_demanda", rotulo: "Quando precisarem", ajuda: "Me chame se faltar gente" },
];

export interface PerfilServico {
  dias_disponiveis:   DiaSemana[];
  turnos_disponiveis: Turno[];
  frequencia_maxima:  Frequencia;
  max_escalas_mes:    number;
  em_descanso:        boolean;
  descanso_ate:       string | null;
  motivo_descanso:    string | null;
  restricoes:         string | null;
}

/**
 * O que uma pessoa sem perfil tem.
 *
 * `dias_disponiveis` vazio NÃO quer dizer "nunca pode": quer dizer "ninguém
 * perguntou". A diferença é a razão de o painel precisar dizer "sem
 * disponibilidade informada" em vez de "indisponível" — a segunda seria uma
 * afirmação que ninguém fez.
 */
export const PERFIL_VAZIO: PerfilServico = {
  dias_disponiveis:   [],
  turnos_disponiveis: [],
  frequencia_maxima:  "mensal",   // o mesmo padrão que a view assume
  max_escalas_mes:    4,          // idem: COALESCE(ps.max_escalas_mes, 4)
  em_descanso:        false,
  descanso_ate:       null,
  motivo_descanso:    null,
  restricoes:         null,
};

/** `null` quando a pessoa ainda não tem perfil — diferente de perfil vazio. */
export async function carregarPerfil(pessoaId: string): Promise<PerfilServico | null> {
  const { data, error } = await supabase
    .from("perfil_servico")
    .select("dias_disponiveis, turnos_disponiveis, frequencia_maxima, max_escalas_mes, em_descanso, descanso_ate, motivo_descanso, restricoes")
    .eq("pessoa_id", pessoaId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    dias_disponiveis:   (data.dias_disponiveis   ?? []) as DiaSemana[],
    turnos_disponiveis: (data.turnos_disponiveis ?? []) as Turno[],
    frequencia_maxima:  (data.frequencia_maxima  ?? "mensal") as Frequencia,
    max_escalas_mes:    data.max_escalas_mes ?? 4,
    em_descanso:        data.em_descanso ?? false,
    descanso_ate:       data.descanso_ate,
    motivo_descanso:    data.motivo_descanso,
    restricoes:         data.restricoes,
  };
}

/**
 * Grava. `upsert` por `pessoa_id`, que tem restrição única.
 *
 * O gatilho `trg_atualizar_carga` também cria linhas nesta tabela, na primeira
 * escala da pessoa — por isso INSERT direto não serve: quem já serviu já tem
 * linha. `onConflict: "pessoa_id"` cobre os dois caminhos.
 *
 * Não toca em `carga_atual_mes` nem `nivel_sobrecarga`: são do gatilho.
 */
export async function salvarPerfil(pessoaId: string, p: PerfilServico): Promise<ResultadoEscrita> {
  return conferir(
    await supabase
      .from("perfil_servico")
      .upsert(
        {
          pessoa_id:          pessoaId,
          dias_disponiveis:   p.dias_disponiveis,
          turnos_disponiveis: p.turnos_disponiveis,
          frequencia_maxima:  p.frequencia_maxima,
          max_escalas_mes:    p.max_escalas_mes,
          em_descanso:        p.em_descanso,
          // Descanso desligado apaga data e motivo. Guardar "volta em 30/09"
          // de um descanso que acabou é pior que não guardar nada: alguém lê
          // e conclui que a pessoa continua fora.
          descanso_ate:       p.em_descanso ? p.descanso_ate : null,
          motivo_descanso:    p.em_descanso ? (p.motivo_descanso?.trim() || null) : null,
          restricoes:         p.restricoes?.trim() || null,
          ativo:              true,
        },
        { onConflict: "pessoa_id" },
      )
      .select("id"),
    "A disponibilidade",
  );
}

/** Uma linha legível para o painel e para a ficha. */
export function resumoLegivel(p: PerfilServico | null): string {
  if (!p) return "Disponibilidade não informada";
  if (p.em_descanso) {
    const ate = p.descanso_ate
      ? new Date(p.descanso_ate + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
      : null;
    return ate ? `Em descanso até ${ate}` : "Em descanso";
  }
  if (p.dias_disponiveis.length === 0) return "Disponibilidade não informada";

  const dias = p.dias_disponiveis.length === 7
    ? "Todos os dias"
    : p.dias_disponiveis
        .map(d => DIAS.find(x => x.valor === d)?.curto ?? d)
        .join(", ");

  const turnos = p.turnos_disponiveis.includes("dia_todo") || p.turnos_disponiveis.length === 0
    ? ""
    : " · " + p.turnos_disponiveis.map(t => TURNOS.find(x => x.valor === t)?.rotulo ?? t).join(", ").toLowerCase();

  return dias + turnos;
}
