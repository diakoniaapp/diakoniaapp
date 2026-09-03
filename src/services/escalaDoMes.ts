// ─── escalaDoMes.ts — o que o motor do rodízio precisa, e o que ele devolve ──
//
// Este arquivo fala com o banco; `rodizio.ts` não fala. A separação é de
// propósito: o motor é testável porque não sabe o que é uma tabela.
//
// ── DE ONDE VÊM OS EVENTOS ───────────────────────────────────────────────────
//
// Da agenda. A igreja cria o culto e marca que ele precisa do apoio deste
// ministério — `evento_ministerios` —, ou de uma área específica dele,
// `evento_areas`. As duas portas contam, e o ministério marcado vale por todas
// as suas áreas ativas: quem pede "apoio da Comunhão" está pedindo Recepção e
// Introdução, que é o que a Comunhão tem.
//
// Nada é criado aqui. Se o mês não tem eventos, a escala do mês é vazia — e a
// tela diz isso, em vez de inventar domingos.

import { supabase } from "@/integrations/supabase/client";
import { conferir, type ResultadoEscrita } from "@/lib/escritaConferida";
import { tetoDeclarado } from "@/services/voluntariosPainel";
import type { DiaSemana, Turno, Frequencia } from "@/services/perfilServico";
import type { EventoParaEscalar, CandidatoDaArea, PlanoDoMes } from "@/services/rodizio";

export interface MesDoRodizio {
  eventos: EventoParaEscalar[];
  candidatos: CandidatoDaArea[];
  /** Áreas do ministério, para a tela dizer o que existe mesmo sem evento. */
  areas: { id: string; nome: string; minimo: number }[];
}

export function limitesDoMes(ano: number, mes: number): { de: string; ate: string } {
  const dois = (n: number) => String(n).padStart(2, "0");
  const ultimoDia = new Date(ano, mes, 0).getDate();
  return { de: `${ano}-${dois(mes)}-01`, ate: `${ano}-${dois(mes)}-${dois(ultimoDia)}` };
}

export async function carregarMes(
  ministerioId: string, ano: number, mes: number,
): Promise<MesDoRodizio> {
  const { de, ate } = limitesDoMes(ano, mes);

  const [{ data: areasData }, { data: porMinisterio }, { data: porArea }, { data: vols }] =
    await Promise.all([
      supabase.from("areas").select("id, nome, min_voluntarios")
        .eq("ministerio_id", ministerioId).eq("ativo", true).order("nome"),
      supabase.from("evento_ministerios").select("evento_id").eq("ministerio_id", ministerioId),
      supabase.from("evento_areas").select("evento_id, area_id"),
      supabase.from("v_voluntarios_completo").select("*").eq("ministerio_id", ministerioId),
    ]);

  const areas = (areasData ?? []).map((a: any) => ({
    id: a.id, nome: a.nome ?? "—",
    // `min_voluntarios` é o piso que a própria igreja declarou por área. Onde
    // ela não declarou, uma pessoa — porque zero vagas não é uma escala.
    minimo: Math.max(1, a.min_voluntarios ?? 1),
  }));
  const idsDeArea = new Set(areas.map(a => a.id));

  // evento → áreas que ele precisa deste ministério
  const precisa = new Map<string, Set<string>>();
  for (const r of (porMinisterio ?? []) as any[]) {
    precisa.set(r.evento_id, new Set(areas.map(a => a.id)));
  }
  for (const r of (porArea ?? []) as any[]) {
    if (!idsDeArea.has(r.area_id)) continue;
    const atual = precisa.get(r.evento_id) ?? new Set<string>();
    atual.add(r.area_id);
    precisa.set(r.evento_id, atual);
  }

  let eventos: EventoParaEscalar[] = [];
  if (precisa.size > 0) {
    const { data: evs } = await supabase
      .from("eventos")
      .select("id, titulo, data, hora_inicio, status")
      .in("id", [...precisa.keys()])
      .gte("data", de).lte("data", ate)
      .order("data");

    eventos = ((evs ?? []) as any[])
      // Culto cancelado não precisa de recepção.
      .filter(e => e.status !== "cancelado")
      .map(e => ({
        evento_id: e.id,
        titulo: e.titulo ?? "Sem título",
        data: e.data,
        hora_inicio: e.hora_inicio,
        areas: areas
          .filter(a => precisa.get(e.id)?.has(a.id))
          .map(a => ({ area_id: a.id, area_nome: a.nome, minimo: a.minimo })),
      }))
      .filter(e => e.areas.length > 0);
  }

  const hoje = Date.now();
  const candidatos: CandidatoDaArea[] = ((vols ?? []) as any[])
    .filter(l => l.status_voluntario === "ativa")
    .map(l => {
      const ultima = l.ultima_escala_em as string | null;
      return {
        pessoa_id: l.pessoa_id,
        nome: l.nome_completo ?? "—",
        area_id: l.area_id,
        dias: (l.dias_disponiveis ?? []) as DiaSemana[],
        turnos: (l.turnos_disponiveis ?? []) as Turno[],
        maxMes: tetoDeclarado(l.frequencia_maxima as Frequencia | null),
        cargaMes: l.carga_atual_mes ?? 0,
        diasSemServir: ultima
          ? Math.floor((hoje - new Date(ultima + "T12:00:00").getTime()) / 86_400_000)
          : null,
        emDescanso: !!l.em_descanso,
      };
    });

  return { eventos, candidatos, areas };
}

/**
 * Grava o plano como RASCUNHO.
 *
 * ── A REGRA QUE PROTEGE O TRABALHO DE QUEM MEXEU À MÃO ──────────────────────
 *
 * Gerar de novo apaga só o que a MÁQUINA sugeriu — `sugerido_automaticamente`.
 * Quem o líder pôs ali com o dedo fica, e o rodízio preenche o que sobra. Sem
 * isto, clicar duas vezes desfaz uma tarde de ajustes, e ninguém clica uma
 * terceira.
 *
 * ── E POR QUE NÃO CRIA ESCALA REPETIDA ─────────────────────────────────────
 *
 * Reaproveita a escala existente do par (área, evento). Há duplicatas em
 * produção — duas "Recepção — Culto da Manhã · 06/09" — e um gerador que
 * cria sem procurar as multiplicaria a cada clique.
 */
export async function gravarRascunho(
  ministerioId: string, plano: PlanoDoMes, criadoPorPessoaId: string | null,
): Promise<ResultadoEscrita & { escalas?: number; pessoas?: number }> {
  const comGente = plano.vagas.filter(v => v.escalados.length > 0);
  if (comGente.length === 0) return { ok: false, erro: "O rodízio não encontrou ninguém para escalar." };

  // `escalas.criado_por` referencia `membros(id)` — a FICHA, não a conta.
  // A primeira versão gravava `auth.getUser().id`, o id da CONTA, e o banco
  // recusava com "violates foreign key constraint escalas_criado_por_fkey".
  // conta ≠ ficha, pela enésima vez nesta casa: quem chama já tem o
  // `pessoaId` do `useAuth()`, e é esse que se passa aqui.
  let escalasTocadas = 0;
  let pessoasGravadas = 0;

  for (const vaga of comGente) {
    const { data: existentes } = await supabase
      .from("escalas").select("id")
      .eq("area_id", vaga.area_id).eq("evento_id", vaga.evento_id)
      .order("created_at").limit(1);

    let escalaId: string | undefined = (existentes ?? [])[0]?.id;

    if (!escalaId) {
      const criada = await supabase.from("escalas").insert({
        evento_id: vaga.evento_id,
        area_id: vaga.area_id,
        ministerio_id: ministerioId,
        titulo: `${vaga.area_nome} — ${vaga.titulo}`,
        data_evento: vaga.data,
        status: "planejada",
        criado_por: criadoPorPessoaId,
      }).select("id");
      const rc = conferir(criada, "A escala");
      if (!rc.ok) return rc;
      escalaId = (criada.data as any[])[0].id;
    }

    await supabase.from("escala_voluntarios")
      .delete().eq("escala_id", escalaId).eq("sugerido_automaticamente", true);

    const linhas = vaga.escalados.map(e => ({
      escala_id: escalaId,
      pessoa_id: e.pessoa_id,
      area_id: vaga.area_id,
      status: "pendente" as const,
      sugerido_automaticamente: true,
      observacoes: e.porque,
    }));

    const gravadas = await supabase.from("escala_voluntarios").insert(linhas).select("id");
    const rc = conferir(gravadas, "Os escalados");
    if (!rc.ok) return rc;

    escalasTocadas++;
    pessoasGravadas += linhas.length;
  }

  return { ok: true, escalas: escalasTocadas, pessoas: pessoasGravadas };
}
