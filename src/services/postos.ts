// ─── postos.ts ───────────────────────────────────────────────────────────────
// O catálogo de postos de cada área, e quem ocupa cada um.
//
// Substitui a leitura de `area_voluntarios.funcao`, que era texto livre e, dos
// 132 vínculos ativos, guardava 84 vazios ou "Voluntário", 21 nomes de área e
// 9 "Líder" — 14% de informação. Ver as migrations 202609022700000 a 290000.
//
// ── DUAS CONSULTAS, E NÃO UMA VIEW ───────────────────────────────────────────
//
// `v_voluntarios_completo` não expõe o id do vínculo, só (pessoa, área). Em vez
// de mexer numa view que outras telas leem, este arquivo busca os vínculos
// direto e indexa por `pessoa|área` — que identifica um vínculo ativo tão bem
// quanto o id, e sem tocar em nada que já funciona.

import { supabase } from "@/integrations/supabase/client";
import { conferir, type ResultadoEscrita } from "@/lib/escritaConferida";

/** Um posto do catálogo: o que existe naquela área. */
export interface Posto {
  id: string;
  area_id: string;
  nome: string;
  ordem: number;
  min_por_escala: number;
}

/** Uma ocupação: fulano ocupa tal posto. */
export interface Ocupacao {
  id: string;
  area_voluntario_id: string;
  area_funcao_id: string;
  principal: boolean;
  /** `autodeclarada` ainda por confirmar aparece diferente na tela. */
  pendente: boolean;
}

export interface PostosDoMinisterio {
  /** Catálogo por área. Área sem posto vem com lista vazia, não ausente. */
  catalogo: Map<string, Posto[]>;
  /** `pessoa|area` → id do vínculo ativo. */
  vinculo: Map<string, string>;
  /** id do vínculo → o que a pessoa ocupa ali. */
  ocupacoes: Map<string, Ocupacao[]>;
  /**
   * `pessoa|area` → "Líder" ou "Co-líder", DERIVADO de `areas.lider_id`.
   *
   * Liderança nunca mais é digitada. Havia 9 vínculos com "Líder" escrito à
   * mão no campo de função e 12 líderes que a coluna conhecia e o texto não —
   * duas fontes para o mesmo fato, uma delas pela metade. Agora há uma, e a
   * outra não tem onde caber: o catálogo recusa "Líder" como nome de posto.
   */
  lideranca: Map<string, "Líder" | "Co-líder">;
}

export const chave = (pessoaId: string, areaId: string) => `${pessoaId}|${areaId}`;

export async function carregarPostos(ministerioId: string): Promise<PostosDoMinisterio> {
  const vazio: PostosDoMinisterio = {
    catalogo: new Map(), vinculo: new Map(), ocupacoes: new Map(), lideranca: new Map(),
  };

  const { data: areas } = await supabase
    .from("areas").select("id, lider_id, co_lider_id").eq("ministerio_id", ministerioId);
  const areaIds = (areas ?? []).map(a => a.id);
  if (areaIds.length === 0) return vazio;

  const [{ data: postos }, { data: vinculos }] = await Promise.all([
    supabase.from("area_funcoes")
      .select("id, area_id, nome, ordem, min_por_escala")
      .in("area_id", areaIds).eq("ativo", true).order("ordem"),
    supabase.from("area_voluntarios")
      .select("id, area_id, membro_id")
      .in("area_id", areaIds).eq("status", "ativa"),
  ]);

  const catalogo = new Map<string, Posto[]>();
  for (const id of areaIds) catalogo.set(id, []);
  for (const p of (postos ?? []) as any[]) {
    catalogo.get(p.area_id)?.push({
      id: p.id, area_id: p.area_id, nome: p.nome,
      ordem: p.ordem ?? 0, min_por_escala: p.min_por_escala ?? 0,
    });
  }

  const vinculo = new Map<string, string>();
  const idsVinculo: string[] = [];
  for (const v of (vinculos ?? []) as any[]) {
    vinculo.set(chave(v.membro_id, v.area_id), v.id);
    idsVinculo.push(v.id);
  }

  const ocupacoes = new Map<string, Ocupacao[]>();
  if (idsVinculo.length > 0) {
    const { data: ligacoes } = await supabase
      .from("area_voluntario_funcoes")
      .select("id, area_voluntario_id, area_funcao_id, principal, confirmada_em")
      .in("area_voluntario_id", idsVinculo);

    for (const l of (ligacoes ?? []) as any[]) {
      const lista = ocupacoes.get(l.area_voluntario_id) ?? [];
      lista.push({
        id: l.id,
        area_voluntario_id: l.area_voluntario_id,
        area_funcao_id: l.area_funcao_id,
        principal: !!l.principal,
        pendente: l.confirmada_em === null,
      });
      ocupacoes.set(l.area_voluntario_id, lista);
    }
  }

  const lideranca = new Map<string, "Líder" | "Co-líder">();
  for (const a of (areas ?? []) as any[]) {
    if (a.lider_id)    lideranca.set(chave(a.lider_id, a.id), "Líder");
    if (a.co_lider_id) lideranca.set(chave(a.co_lider_id, a.id), "Co-líder");
  }

  return { catalogo, vinculo, ocupacoes, lideranca };
}

/**
 * A liderança confirma o que o voluntário declarou.
 *
 * O caminho é o do IDE Escalas: quem melhor sabe o que o Fulano faz na
 * Recepção é o Fulano; quem responde pela equipe é que diz amém. Sem este
 * passo a autodeclaração seria só um campo livre com outro nome.
 */
export async function confirmarPosto(ligacaoId: string): Promise<ResultadoEscrita> {
  const { data: sessao } = await supabase.auth.getUser();
  const resultado = await supabase.from("area_voluntario_funcoes")
    .update({ confirmada_em: new Date().toISOString(), confirmada_por: sessao?.user?.id ?? null })
    .eq("id", ligacaoId)
    .select("id");
  return conferir(resultado, "A confirmação");
}

/**
 * Põe a pessoa num posto.
 *
 * O primeiro posto de um vínculo nasce principal — o Planning Center avisa que
 * gente em várias posições atrapalha escalar a equipe toda de uma vez, e
 * alguém tem de ser a resposta padrão. Do segundo em diante, não.
 */
export async function ocuparPosto(
  vinculoId: string, postoId: string, jaOcupaAlgum: boolean,
): Promise<ResultadoEscrita & { id?: string }> {
  const { data: sessao } = await supabase.auth.getUser();

  const resultado = await supabase.from("area_voluntario_funcoes").insert({
    area_voluntario_id: vinculoId,
    area_funcao_id: postoId,
    principal: !jaOcupaAlgum,
    // Marcado pela liderança nasce confirmado: ela É a confirmação. Só a
    // autodeclaração do voluntário, no Meu Espaço, entra pendente.
    origem: "lideranca",
    confirmada_em: new Date().toISOString(),
    confirmada_por: sessao?.user?.id ?? null,
  }).select("id");

  const rc = conferir(resultado, "O posto");
  if (!rc.ok) return rc;
  return { ok: true, id: (resultado.data as any[])[0].id };
}

export async function desocuparPosto(ligacaoId: string): Promise<ResultadoEscrita> {
  const resultado = await supabase
    .from("area_voluntario_funcoes").delete().eq("id", ligacaoId).select("id");
  return conferir(resultado, "O posto");
}

/**
 * Cria um posto novo no catálogo da área.
 *
 * Sem isto a tela seria inútil nas 13 áreas que ainda não têm catálogo nenhum:
 * uma fileira de etiquetas vazia e nenhum jeito de começar.
 *
 * O banco recusa nome genérico, "Líder", repetição e o nome da própria área —
 * as mensagens abaixo traduzem essas recusas, porque o texto do PostgreSQL não
 * é para ser lido por quem está cadastrando a equipe.
 */
export async function criarPosto(
  areaId: string, nome: string, ordem: number,
): Promise<ResultadoEscrita & { posto?: Posto }> {
  const limpo = nome.trim();
  if (!limpo) return { ok: false, erro: "Escreva o nome do posto." };

  const resultado = await supabase.from("area_funcoes")
    .insert({ area_id: areaId, nome: limpo, ordem })
    .select("id, area_id, nome, ordem, min_por_escala");

  if (resultado.error) return { ok: false, erro: traduzir(resultado.error.message, limpo) };

  const rc = conferir(resultado, "O posto");
  if (!rc.ok) return { ok: false, erro: rc.erro };

  const p = (resultado.data as any[])[0];
  return { ok: true, posto: { id: p.id, area_id: p.area_id, nome: p.nome,
                              ordem: p.ordem ?? 0, min_por_escala: p.min_por_escala ?? 0 } };
}

/**
 * Renomeia um posto do catálogo.
 *
 * O mesmo gatilho e o mesmo índice único de `criarPosto` valem aqui — eles
 * rodam em INSERT OU UPDATE. Não é preciso repetir as regras: um posto
 * renomeado para "Voluntário" é recusado do mesmo jeito que um criado assim.
 *
 * Não muda quem ocupa o posto. Renomear "Atendimento" para "Recepção de
 * visitante" continua sendo as mesmas pessoas, com o nome novo.
 */
export async function editarPosto(
  postoId: string, novoNome: string,
): Promise<ResultadoEscrita & { posto?: Posto }> {
  const limpo = novoNome.trim();
  if (!limpo) return { ok: false, erro: "Escreva o nome do posto." };

  const resultado = await supabase.from("area_funcoes")
    .update({ nome: limpo })
    .eq("id", postoId)
    .select("id, area_id, nome, ordem, min_por_escala");

  if (resultado.error) return { ok: false, erro: traduzir(resultado.error.message, limpo) };

  const rc = conferir(resultado, "O posto");
  if (!rc.ok) return { ok: false, erro: rc.erro };

  const p = (resultado.data as any[])[0];
  return { ok: true, posto: { id: p.id, area_id: p.area_id, nome: p.nome,
                              ordem: p.ordem ?? 0, min_por_escala: p.min_por_escala ?? 0 } };
}

function traduzir(mensagem: string, nome: string): string {
  const m = mensagem.toLowerCase();
  if (m.includes("area_funcoes_sem_repetir")) return `“${nome}” já existe nesta área.`;
  if (m.includes("repetir o nome da area")) return `“${nome}” é o nome da própria área. Diga o que a pessoa faz ali.`;
  if (m.includes("area_funcoes_nome_util")) {
    return `“${nome}” não descreve um posto. Liderança vem da área, e “Voluntário” é a ausência de resposta.`;
  }
  if (m.includes("row-level security")) return "Você só pode mexer nos postos das áreas que lidera.";
  return mensagem;
}
