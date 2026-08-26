// ─── pgmPainelService.ts — Acompanhamento dos Pequenos Grupos ──────────────
//
// Só leitura, e **nada foi criado no banco para isto**. As três fontes já
// existiam e estavam entre os objetos que nunca eram consultados:
//
//   pgm_resumo_geral()      números do topo
//   pgm_alertas_ausencia()  quem está faltando seguido — a ação pastoral
//   vw_pgm_grupos_resumo    um resumo por grupo, com líder e horário
//
// ── POR QUE HÁ UMA CONSULTA A MAIS ─────────────────────────────────────────
//
// `pgm_resumo_geral()` devolve `presenca_media_pct`, e esse número é ambíguo
// por construção. O corpo dela faz:
//
//   case when total = 0 then 0 else 100.0 * presentes / total end
//   ...
//   coalesce((select round(avg(...)) from rs), 0)
//
// Ou seja: **reunião sem chamada vale 0%, e "nenhuma reunião" também vale
// 0%.** Os três casos — ninguém foi, ninguém registrou, não houve reunião —
// chegam à tela com a mesma cara.
//
// Medido em produção em 26/08/2026: existe **uma** reunião registrada, de
// 11/06/2026, fora da janela de 30 dias que a função usa. Os 0% que ela
// devolve hoje significam "não houve reunião no período", e mostrá-los como
// frequência acusaria um esvaziamento que não aconteceu.
//
// É a mesma armadilha da EBD, e recebe o mesmo tratamento: contamos quantas
// reuniões existem na janela e, se não houver nenhuma, a tela diz isso em vez
// de exibir um zero.
//
// A função não foi alterada — outras telas podem lê-la, e mudar o
// significado de uma coluna existente quebraria quem já a consome.

import { supabase } from "@/integrations/supabase/client";

export interface PgmResumo {
  total_grupos: number;
  grupos_ativos: number;
  multiplicadores: number;
  total_membros: number;
  reunioes_semana: number;
  presenca_media_pct: number;
  pedidos_ativos: number;
}

export interface PgmGrupo {
  id: string;
  nome: string;
  ativo: boolean;
  lider_nome: string | null;
  co_lider_nome: string | null;
  bairro: string | null;
  dia_semana: number | null;
  horario: string | null;
  qtd_membros: number;
}

export interface PgmAlerta {
  pessoa_id: string;
  nome: string;
  grupo_id: string;
  grupo_nome: string;
  faltas_seguidas: number;
  ultima_presenca: string | null;
}

export interface PgmPainel {
  resumo: PgmResumo | null;
  /**
   * Reuniões registradas nos últimos 30 dias — a mesma janela que
   * `pgm_resumo_geral` usa para a média.
   *
   * Zero aqui significa que `presenca_media_pct` não é uma frequência: é o
   * `coalesce` da função. Ver o cabeçalho.
   */
  reunioesUltimos30d: number;
}

const DIA_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** "terça, 19h00" — nulo vira string vazia, sem inventar horário. */
export function quandoSeReune(g: PgmGrupo): string {
  const dia = g.dia_semana !== null && g.dia_semana >= 0 && g.dia_semana <= 6
    ? DIA_SEMANA[g.dia_semana] : null;
  const hora = g.horario ? g.horario.slice(0, 5).replace(":", "h") : null;
  return [dia, hora].filter(Boolean).join(", ");
}

export async function carregarPainelPgm(): Promise<PgmPainel> {
  const trintaDiasAtras = new Date();
  trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);
  const desde = trintaDiasAtras.toISOString().slice(0, 10);

  // ── As duas buscas que saíram, e como trazê-las de volta ────────────────
  //
  // Em 26/08/2026 os blocos "Faltando seguido" e "Grupos" foram desativados
  // no painel: ele serve para o contexto geral, e as duas listas eram o
  // detalhe. As buscas saíram junto — eram duas requisições paralelas cujo
  // resultado ninguém desenhava.
  //
  // Para restaurar, acrescentar ao `Promise.all`:
  //
  //   supabase.from("vw_pgm_grupos_resumo" as any)
  //     .select("id, nome, ativo, lider_nome, co_lider_nome, bairro, " +
  //             "dia_semana, horario, qtd_membros")
  //     .order("ativo", { ascending: false }).order("nome"),
  //   supabase.rpc("pgm_alertas_ausencia" as any),
  //
  // e devolver `grupos` e `alertas` outra vez. `PgmGrupo`, `PgmAlerta` e
  // `quandoSeReune()` continuam aqui, prontos.
  const [resumoRes, reunioesRes] = await Promise.all([
    supabase.rpc("pgm_resumo_geral" as any),
    supabase
      .from("pgm_reunioes")
      .select("id", { count: "exact", head: true })
      .gte("data", desde),
  ]);

  if (resumoRes.error) throw resumoRes.error;

  return {
    resumo: ((resumoRes.data as any[]) ?? [])[0] ?? null,
    reunioesUltimos30d: reunioesRes.count ?? 0,
  };
}
