// ─── painelMinisterioService — a bancada de quem lidera ────────────────────
//
// O sistema tinha telas SOBRE ministérios — a lista em `/ministerios`, as
// áreas em `/areas`, os voluntários em `/ministerios/:id/voluntarios` — e
// nenhuma tela DE um ministério. Quem lidera precisava de três endereços para
// montar na cabeça a resposta de "como está o meu?".
//
// ── O QUE ESTE ARQUIVO DESCOBRIU AO SER ESCRITO ────────────────────────────
//
// **`checklist_area` e `checklist_execucao` já existiam, com zero linhas.** O
// checklist de tarefas por área foi modelado e nunca construído — mais duas
// entre os 57 objetos dormentes que o CLAUDE.md registra. Este serviço é o
// primeiro a escrever nelas.
//
// **`liderancas` está vazia, e isso quebra o que parecia funcionar.** A função
// `fn_meu_ministerio_id()` lê de lá e sempre devolve NULL. Sete políticas de
// RLS dependem dela — `lider_select_areas_proprias`,
// `lider_select_escalas_proprias`, `lider_insert_evento_proprio` e outras — e
// nenhuma jamais liberou uma linha.
//
// É o mesmo defeito das políticas de `membros` corrigidas em 01/09: uma tabela
// de ligação que o código presume cheia e o banco tem vazia. Aqui a saída foi
// a mesma: perguntar a quem de fato sabe. A liderança REAL está em
// `ministerios.lider_id / vice_lider_id / co_lider_id` e em
// `areas.lider_id / co_lider_id` — preenchidas para os 11 ministérios.
//
// O sistema continua funcionando por causa das políticas largas que existem em
// paralelo (`Autenticados leem areas`, `esc_select` com `true`). Ou seja: a
// leitura funciona apesar da função, não por causa dela.

import { supabase } from "@/integrations/supabase/client";
import { conferir } from "@/lib/escritaConferida";

// ─── Quem lidera o quê ────────────────────────────────────────────────────

export interface MinisterioQueLidero {
  id: string;
  nome: string;
  sigla: string | null;
  cor: string | null;
  /** "Líder", "Vice-líder", "Líder de área" — como esta pessoa entra aqui. */
  comoLidero: string;
  /** As áreas deste ministério que ela lidera. Vazio = lidera o ministério. */
  areasQueLidero: string[];
}

/**
 * Os ministérios cuja bancada esta pessoa abre.
 *
 * Lê as colunas de liderança direto das tabelas, e não `fn_meu_ministerio_id()`
 * — ver a nota do cabeçalho: a função consulta uma tabela vazia.
 *
 * Quem lidera uma ÁREA entra pelo ministério dela. Medido em 01/09/2026: das
 * três contas do sistema, uma lidera três áreas em dois ministérios distintos
 * (Administração e Pastoral) e nenhuma lidera um ministério inteiro. Sem o
 * caminho pela área, a tela nasceria vazia para todo mundo.
 */
export async function meusMinisterios(pessoaId: string): Promise<MinisterioQueLidero[]> {
  const [{ data: mins }, { data: areas }] = await Promise.all([
    supabase.from("ministerios")
      .select("id, nome, sigla, cor, lider_id, vice_lider_id, co_lider_id")
      .eq("ativo", true),
    supabase.from("areas")
      .select("id, nome, ministerio_id, lider_id, co_lider_id, ministerios!areas_ministerio_id_fkey(id, nome, sigla, cor)")
      .eq("ativo", true),
  ]);

  const porId = new Map<string, MinisterioQueLidero>();

  for (const m of (mins ?? []) as any[]) {
    const papel =
      m.lider_id === pessoaId ? "Líder"
      : m.vice_lider_id === pessoaId ? "Vice-líder"
      : m.co_lider_id === pessoaId ? "Co-líder"
      : null;
    if (!papel) continue;
    porId.set(m.id, {
      id: m.id, nome: m.nome, sigla: m.sigla, cor: m.cor,
      comoLidero: papel, areasQueLidero: [],
    });
  }

  for (const a of (areas ?? []) as any[]) {
    if (a.lider_id !== pessoaId && a.co_lider_id !== pessoaId) continue;
    const m = a.ministerios;
    if (!m) continue;
    const ja = porId.get(m.id);
    if (ja) {
      // Já entrou por liderar o ministério: o papel maior manda, e a área
      // vira só um detalhe da mesma linha.
      ja.areasQueLidero.push(a.nome);
      continue;
    }
    porId.set(m.id, {
      id: m.id, nome: m.nome, sigla: m.sigla, cor: m.cor,
      comoLidero: "Líder de área", areasQueLidero: [a.nome],
    });
  }

  return [...porId.values()].sort((x, y) => x.nome.localeCompare(y.nome, "pt-BR"));
}

// ─── A bancada de um ministério ───────────────────────────────────────────

export interface AreaDoMinisterio {
  id: string;
  nome: string;
  cor: string | null;
  lider: string | null;
  dia_reuniao: string | null;
  horario_reuniao: string | null;
  min_voluntarios: number | null;
  max_voluntarios: number | null;
  voluntarios: number;
  /** Tarefas ativas no checklist desta área. */
  tarefas: number;
}

/**
 * ── DUAS ARMADILHAS DE `v_voluntarios_completo`, MEDIDAS ────────────────────
 *
 * **1. `status_voluntario` não é o `status_voluntario` da tabela.** A view faz
 * `av.status AS status_voluntario`, ou seja, renomeia a coluna de ATUAÇÃO
 * (`atuacao_status`: ativa / encerrada) e encobre a coluna homônima de
 * `area_voluntarios`, que tem outros valores (ativo / em_descanso / inativo /
 * afastado).
 *
 * Contado em 01/09/2026: a view devolve `"ativa"` para as 128 linhas — nenhum
 * `"ativo"` jamais aparece. Comparar com `"ativo"` dá zero, e a tela mostrava
 * "0 voluntários · 21 pessoas afastadas" para um ministério com 21 servindo.
 *
 * **2. `nivel_sobrecarga` é NÚMERO, não rótulo.** `COALESCE(ps.nivel_sobrecarga,
 * 0)`. Comparar com `"alto"` nunca casa. O corte que o sistema usa é `>= 7`,
 * em `SinaisDeVoluntariado.tsx:83`; o máximo hoje é 3.
 *
 * Os dois erros passaram por `tsc` e por 142 testes. Só apareceram na tela.
 */
export interface VoluntarioDoMinisterio {
  pessoa_id: string;
  nome_completo: string;
  telefone_celular: string | null;
  area_id: string | null;
  area_nome: string | null;
  funcao: string | null;
  /** `ativa` | `encerrada` — é o status de ATUAÇÃO. Ver a nota acima. */
  status_voluntario: string | null;
  ultima_escala_em: string | null;
  total_escalas: number | null;
  carga_atual_mes: number | null;
  /** 0 a 10. O sistema trata `>= 7` como sobrecarga. Ver a nota acima. */
  nivel_sobrecarga: number | null;
  em_descanso: boolean | null;
}

/** Serve hoje. A view diz "ativa" (atuação), nunca "ativo". */
export function estaServindo(v: Pick<VoluntarioDoMinisterio, "status_voluntario">): boolean {
  return v.status_voluntario === "ativa";
}

/**
 * O corte de sobrecarga do sistema, num lugar só.
 *
 * `>= 7` é o número que `SinaisDeVoluntariado` já usava. Repeti-lo à mão numa
 * segunda tela é como as duas passam a discordar quando alguém ajustar uma.
 */
export const SOBRECARGA_MINIMA = 7;

export function estaSobrecarregado(v: Pick<VoluntarioDoMinisterio, "nivel_sobrecarga" | "em_descanso">): boolean {
  return (v.nivel_sobrecarga ?? 0) >= SOBRECARGA_MINIMA && !v.em_descanso;
}

export interface EscalaDoMinisterio {
  id: string;
  titulo: string | null;
  data_evento: string;
  hora_inicio: string | null;
  local: string | null;
  status: string | null;
  area_id: string | null;
  area_nome: string | null;
  /** Quantos foram escalados, e quantos responderam sim. */
  escalados: number;
  confirmados: number;
}

export interface TarefaDaArea {
  id: string;
  area_id: string;
  nome_tarefa: string;
  descricao: string | null;
  ordem: number | null;
  obrigatoria: boolean | null;
}

export interface PainelMinisterio {
  id: string;
  nome: string;
  sigla: string | null;
  objetivo: string | null;
  /**
   * Qual módulo do sistema este ministério opera — `ebd`, `arrecadacao` ou
   * `pgm`. Vem de `ministerios.modulo` (migration 20260902100000) e decide
   * qual bancada específica a tela mostra ANTES das quatro seções comuns.
   * `null` para os dez que ainda não foram ligados a nenhum.
   */
  modulo: "ebd" | "arrecadacao" | "pgm" | "acolhimento" | "diaconia" | null;
  lider: string | null;
  areas: AreaDoMinisterio[];
  voluntarios: VoluntarioDoMinisterio[];
  /** Só as que ainda vão acontecer — é o que `v_proximas_escalas` traz. */
  escalas: EscalaDoMinisterio[];
  /**
   * Quantas escalas o ministério já teve, passadas incluídas.
   *
   * Existe para uma frase: sem ele a tela não distingue "nunca houve escala"
   * de "as que houve já passaram", e as duas dizem coisas diferentes a quem
   * lidera.
   */
  totalDeEscalas: number;
  tarefas: TarefaDaArea[];
}

/** Data local em ISO. `toISOString()` é UTC — das 21h à meia-noite dá amanhã. */
function hojeIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function carregarPainelMinisterio(ministerioId: string): Promise<PainelMinisterio | null> {
  const { data: min } = await supabase
    .from("ministerios")
    .select("id, nome, sigla, objetivo, lider_id, modulo")
    .eq("id", ministerioId).maybeSingle();
  if (!min) return null;

  const [{ data: areas }, { data: vols }, { data: escalas }, { data: lider }] = await Promise.all([
    supabase.from("areas")
      .select("id, nome, cor_identidade, dia_reuniao, horario_reuniao, min_voluntarios, max_voluntarios, lider_id")
      .eq("ministerio_id", ministerioId).eq("ativo", true).order("nome"),
    // A view já traz carga, sobrecarga e descanso calculados. Ela existia e
    // nenhuma tela além de `/ministerios/:id/voluntarios` a abria.
    supabase.from("v_voluntarios_completo")
      .select("pessoa_id, nome_completo, telefone_celular, area_id, area_nome, funcao, status_voluntario, ultima_escala_em, total_escalas, carga_atual_mes, nivel_sobrecarga, em_descanso")
      .eq("ministerio_id", ministerioId),
    // ── A VIEW CONTA, E CONTA MELHOR ─────────────────────────────────
    //
    // `v_proximas_escalas` já agrega total, confirmados, pendentes e
    // recusados por escala. A primeira versão desta função buscava
    // `escala_voluntarios` numa segunda consulta e somava à mão — e juntava
    // pendente com recusado, que são respostas opostas.
    //
    // A view só traz o que ainda vai acontecer, que é o que a seção mostra.
    // Quantas escalas o ministério já teve no total vem separado, abaixo:
    // sem esse número, a tela não saberia distinguir "nunca houve escala" de
    // "as que houve já passaram", e as duas frases são diferentes.
    supabase.from("v_proximas_escalas")
      .select("id, titulo, data_evento, hora_inicio, local, status, area_id, area_nome, total_escalados, confirmados")
      .eq("ministerio_id", ministerioId).order("data_evento"),
    supabase.from("membros").select("nome_completo").eq("id", (min as any).lider_id ?? "").maybeSingle(),
  ]);

  const idsArea = (areas ?? []).map((a: any) => a.id);

  // Checklist e contagem de escalados: duas consultas que só fazem sentido
  // depois de saber as áreas e as escalas. `in` com lista vazia devolve zero
  // linhas no PostgREST, mas gasta a viagem — daí os `if`.
  const idsArea2 = (areas ?? []).map((a: any) => a.id);
  const [{ data: tarefas }, { count: totalEscalas }] = await Promise.all([
    idsArea2.length
      ? supabase.from("checklist_area")
          .select("id, area_id, nome_tarefa, descricao, ordem, obrigatoria")
          .in("area_id", idsArea2).eq("ativo", true).order("ordem")
      : Promise.resolve({ data: [] as any[] }),
    // Só a contagem, sem trazer linha: é usada para uma frase.
    supabase.from("escalas").select("id", { count: "exact", head: true })
      .eq("ministerio_id", ministerioId),
  ]);
  const porArea = new Map<string, number>();
  for (const v of (vols ?? []) as any[]) {
    // `estaServindo`, e nao `=== "ativo"`: a view devolve "ativa".
    if (v.area_id && estaServindo(v)) {
      porArea.set(v.area_id, (porArea.get(v.area_id) ?? 0) + 1);
    }
  }
  const tarefasPorArea = new Map<string, number>();
  for (const t of (tarefas ?? []) as any[]) {
    tarefasPorArea.set(t.area_id, (tarefasPorArea.get(t.area_id) ?? 0) + 1);
  }

  return {
    id: (min as any).id,
    nome: (min as any).nome,
    sigla: (min as any).sigla,
    objetivo: (min as any).objetivo,
    modulo: ((min as any).modulo ?? null) as "ebd" | "arrecadacao" | "pgm" | "acolhimento" | "diaconia" | null,
    lider: (lider as any)?.nome_completo ?? null,
    areas: ((areas ?? []) as any[]).map(a => ({
      id: a.id, nome: a.nome, cor: a.cor_identidade,
      lider: null,
      dia_reuniao: a.dia_reuniao, horario_reuniao: a.horario_reuniao,
      min_voluntarios: a.min_voluntarios, max_voluntarios: a.max_voluntarios,
      voluntarios: porArea.get(a.id) ?? 0,
      tarefas: tarefasPorArea.get(a.id) ?? 0,
    })),
    voluntarios: ((vols ?? []) as any[]) as VoluntarioDoMinisterio[],
    // Os números já vêm somados da view; aqui só se renomeia.
    escalas: ((escalas ?? []) as any[]).map(e => ({
      id: e.id, titulo: e.titulo, data_evento: e.data_evento,
      hora_inicio: e.hora_inicio, local: e.local, status: e.status,
      area_id: e.area_id, area_nome: e.area_nome ?? null,
      escalados: e.total_escalados ?? 0,
      confirmados: e.confirmados ?? 0,
    })),
    totalDeEscalas: totalEscalas ?? 0,
    tarefas: ((tarefas ?? []) as any[]) as TarefaDaArea[],
  };
}

/** As escalas que ainda vão acontecer — a parte do painel que pede ação. */
export function escalasFuturas(escalas: EscalaDoMinisterio[]): EscalaDoMinisterio[] {
  const hoje = hojeIso();
  return escalas
    .filter(e => e.data_evento >= hoje && e.status !== "cancelada")
    .sort((a, b) => a.data_evento.localeCompare(b.data_evento));
}

// ─── O checklist ──────────────────────────────────────────────────────────

/**
 * Cria uma tarefa no checklist de uma área.
 *
 * Escrita conferida porque a RLS aqui é mais estreita que o portão da tela:
 * `staff_insert_checklist_area` exige `admin` ou `lideranca`, e o painel abre
 * também para `secretaria`, `pastor` e `diakonia`. Sem `conferir()`, a
 * secretária criaria uma tarefa, a tela diria "pronto" e nada teria sido
 * gravado — o defeito que `escritaConferida.ts` existe para impedir.
 */
export async function criarTarefa(
  areaId: string,
  nomeTarefa: string,
  opcoes: { descricao?: string | null; obrigatoria?: boolean; ordem?: number } = {},
) {
  return conferir(
    await supabase.from("checklist_area").insert({
      area_id: areaId,
      nome_tarefa: nomeTarefa.trim(),
      descricao: opcoes.descricao?.trim() || null,
      obrigatoria: opcoes.obrigatoria ?? false,
      ordem: opcoes.ordem ?? 0,
      ativo: true,
    }).select("id"),
    "A tarefa",
  );
}

/**
 * Aposenta uma tarefa.
 *
 * `ativo = false`, e não DELETE: é a convenção deste banco — 40 tabelas têm
 * `ativo` e só uma tem `deleted_at`. E aqui há um motivo a mais: apagar a
 * tarefa levaria junto o histórico de quem a executou, que é o que dá sentido
 * a ter registrado.
 */
export async function aposentarTarefa(tarefaId: string) {
  return conferir(
    await supabase.from("checklist_area").update({ ativo: false }).eq("id", tarefaId).select("id"),
    "A tarefa",
  );
}

export interface ExecucaoDaTarefa {
  tarefa_id: string;
  status: string | null;
  executado_em: string | null;
  executado_por: string | null;
}

/** O que já foi conferido nesta escala. */
export async function execucoesDaEscala(escalaId: string): Promise<ExecucaoDaTarefa[]> {
  const { data } = await supabase
    .from("checklist_execucao")
    .select("tarefa_id, status, executado_em, executado_por")
    .eq("escala_id", escalaId);
  return ((data ?? []) as any[]) as ExecucaoDaTarefa[];
}

/**
 * Marca (ou desmarca) uma tarefa numa escala.
 *
 * `upsert` na chave (escala, tarefa): marcar duas vezes é o mesmo gesto
 * repetido, não duas execuções. Desmarcar volta para `pendente` em vez de
 * apagar a linha — assim o "quem" e o "quando" da conferência anterior não
 * somem quando alguém corrige um clique errado.
 */
export async function marcarTarefa(
  escalaId: string,
  tarefaId: string,
  concluida: boolean,
  pessoaId: string | null,
) {
  return conferir(
    await supabase.from("checklist_execucao").upsert(
      {
        escala_id: escalaId,
        tarefa_id: tarefaId,
        status: concluida ? "concluido" : "pendente",
        executado_por: concluida ? pessoaId : null,
        executado_em: concluida ? new Date().toISOString() : null,
      },
      { onConflict: "escala_id,tarefa_id" },
    ).select("id"),
    "A conferência",
  );
}
