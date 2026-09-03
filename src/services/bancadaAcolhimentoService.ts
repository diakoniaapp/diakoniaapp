// ─── bancadaAcolhimentoService.ts ────────────────────────────────────────────
// A bancada da Comunhão, Integração e Crescimento — a porta da frente.
//
// ── AS DUAS PERGUNTAS QUE ELA RESPONDE ───────────────────────────────────────
//
// 1. Quem chegou e ainda espera. Medido em 03/09/2026: três visitantes ativos,
//    doze tarefas de acolhimento, TODAS abertas e TODAS vencidas — a mais
//    antiga com 32 dias de atraso. O último ato de acolhimento registrado foi
//    em 28/08.
//
// 2. Quem entrou e ainda não pertence a nada. Integrar não é cadastrar. Dos 38
//    que entraram em doze meses, 28 estão em classe de EBD, 2 em PGM e 1 serve
//    em área. Oito não estão em nenhum dos três. E dos 30 congregados, ZERO
//    servem — número que só aparece quando alguém pergunta.
//
// ── POR QUE "PERTENCER" É EBD, PGM OU ÁREA ───────────────────────────────────
//
// São os três laços que a igreja de fato mantém e registra. Não é uma teoria
// de integração: é o que existe no banco e o que a Comunhão pode fazer alguma
// coisa a respeito — convidar para uma classe, para um grupo, para servir.
//
// Estar em UM dos três já conta. Cobrar os três de toda gente transformaria a
// lista num alarme permanente que ninguém termina.

import { supabase } from "@/integrations/supabase/client";

/**
 * A área dona das tarefas de acolhimento — hoje "Crescimento", mas o código
 * não deve saber disso pelo nome. `ministerios.area_acolhimento_id` é o
 * mesmo desenho de `ministerios.modulo`, um nível abaixo: aponta para a área
 * certa mesmo que amanhã ela seja renomeada de novo.
 *
 * `null` quando nenhum ministério com módulo de acolhimento existe, ou
 * quando existe mas ainda não apontou uma área — a tela que usa isto trata
 * os dois casos como "sem dono", e não inventa um.
 */
export async function idDaAreaDeAcolhimento(): Promise<string | null> {
  const { data } = await supabase
    .from("ministerios").select("area_acolhimento_id")
    .eq("modulo", "acolhimento").maybeSingle();
  return (data as any)?.area_acolhimento_id ?? null;
}

export interface TarefaDeAcolhimento {
  id: string;
  titulo: string;
  data: string;
  visitante_id: string | null;
  visitante_nome: string | null;
  /** Dias de atraso. Zero ou negativo = ainda no prazo. */
  atraso: number;
}

export interface PessoaSemLaco {
  id: string;
  nome: string;
  desde: string | null;
  tipo: string;
}

export interface BancadaAcolhimento {
  visitantesAtivos: number;
  tarefasAbertas: number;
  tarefasVencidas: number;
  /** As vencidas primeiro, da mais atrasada para a menos. */
  tarefas: TarefaDeAcolhimento[];

  /** Último ato de acolhimento — não o cadastro, que é ruído de importação. */
  ultimoAtoEm: string | null;

  novos: number;
  novosEmEbd: number;
  novosEmPgm: number;
  novosServindo: number;
  /** Novos e congregados sem nenhum dos três laços. */
  semLaco: PessoaSemLaco[];

  congregados: number;
  congregadosServindo: number;
}

const DIA = 86_400_000;

export async function carregarBancadaAcolhimento(): Promise<BancadaAcolhimento | null> {
  const hoje = new Date();
  const dozeMeses = new Date(hoje.getTime() - 365 * DIA).toISOString().slice(0, 10);

  const [tarefas, pessoas, historico, pgm, ebd, areas] = await Promise.all([
    supabase.from("acolhimento_tarefas")
      .select("id, titulo, data, concluida, visitante_id")
      .eq("concluida", false)
      .order("data"),
    supabase.from("membros")
      .select("id, nome_completo, tipo_pessoa, status, data_entrada")
      .eq("status", "ativo"),
    // "cadastro" são as 273 linhas que a importação criou. Contá-las como ato
    // de acolhimento diria que a igreja acolheu 293 vezes, quando acolheu 20.
    supabase.from("visita_historico")
      .select("created_at")
      .neq("tipo", "cadastro")
      .order("created_at", { ascending: false })
      .limit(1),
    supabase.from("pgm_membros").select("pessoa_id"),
    supabase.from("ebd_matriculas").select("pessoa_id"),
    supabase.from("area_voluntarios").select("membro_id").eq("status", "ativa"),
  ]);

  const gente = (pessoas.data ?? []) as any[];
  if (gente.length === 0) return null;

  const nomeDe = new Map(gente.map(p => [p.id, p.nome_completo as string]));

  const emPgm = new Set((pgm.data ?? []).map((r: any) => r.pessoa_id));
  const emEbd = new Set((ebd.data ?? []).map((r: any) => r.pessoa_id));
  const servindo = new Set((areas.data ?? []).map((r: any) => r.membro_id));
  const temLaco = (id: string) => emPgm.has(id) || emEbd.has(id) || servindo.has(id);

  const hojeISO = hoje.toISOString().slice(0, 10);
  const listaTarefas: TarefaDeAcolhimento[] = ((tarefas.data ?? []) as any[]).map(t => ({
    id: t.id,
    titulo: t.titulo ?? "—",
    data: t.data,
    visitante_id: t.visitante_id,
    visitante_nome: t.visitante_id ? (nomeDe.get(t.visitante_id) ?? null) : null,
    atraso: t.data ? Math.floor((Date.parse(hojeISO) - Date.parse(t.data)) / DIA) : 0,
  })).sort((a, b) => b.atraso - a.atraso);

  const visitantes = gente.filter(p => p.tipo_pessoa === "visitante");
  const congregados = gente.filter(p => p.tipo_pessoa === "congregado");
  const novos = gente.filter(p => p.data_entrada && p.data_entrada > dozeMeses);

  // Visitante entra na lista de quem não pertence a nada mesmo sem
  // `data_entrada`: ele ainda não entrou, e é justamente por isso que está lá.
  const candidatos = [...novos, ...congregados, ...visitantes];
  const vistos = new Set<string>();
  const semLaco: PessoaSemLaco[] = [];
  for (const p of candidatos) {
    if (vistos.has(p.id) || temLaco(p.id)) continue;
    vistos.add(p.id);
    semLaco.push({
      id: p.id, nome: p.nome_completo, desde: p.data_entrada ?? null, tipo: p.tipo_pessoa,
    });
  }
  semLaco.sort((a, b) => (b.desde ?? "").localeCompare(a.desde ?? ""));

  return {
    visitantesAtivos: visitantes.length,
    tarefasAbertas: listaTarefas.length,
    tarefasVencidas: listaTarefas.filter(t => t.atraso > 0).length,
    tarefas: listaTarefas,

    ultimoAtoEm: (historico.data ?? [])[0]?.created_at?.slice(0, 10) ?? null,

    novos: novos.length,
    novosEmEbd: novos.filter(p => emEbd.has(p.id)).length,
    novosEmPgm: novos.filter(p => emPgm.has(p.id)).length,
    novosServindo: novos.filter(p => servindo.has(p.id)).length,
    semLaco,

    congregados: congregados.length,
    congregadosServindo: congregados.filter(p => servindo.has(p.id)).length,
  };
}
