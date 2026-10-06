// ─── services/missoesService.ts — dados e gravações dos Indicadores Missionários ───
//
// Modelagem aprovada em 06/10/2026 (docs/INDICADORES_MISSIONARIOS_MODELAGEM.md). As contas ficam em
// `lib/missoesModelo.ts`; aqui só busca e grava.
//
// Funciona ANTES e DEPOIS das migrations 20261006180000/190000/200000: cada recurso novo (campo de
// campanha, ajustes, metas, marca de projeto missionário) é sondado uma vez; se não existir, o painel
// mostra o que dá para mostrar e diz o que falta, em vez de quebrar.

import { supabase } from "@/integrations/supabase/client";
import { conferir } from "@/lib/escritaConferida";
import {
  listarCentrosCusto, listarLancamentosSemTeto, listarProjetosTodos, listarRecorrencias,
  type FinLancamentoExtenso, type FinProjeto,
} from "@/services/finService";
import {
  classeDoCentro, VALOR_QUE_FECHA_CICLO, type AjusteDoFundo, type CampanhaMissionaria, type ClasseDeCentro, type MetaDeCampanha,
} from "@/lib/missoesModelo";
import { valorMensalDaRecorrencia } from "@/lib/missoesRecorrencia";

// ── sondagem dos recursos novos ───────────────────────────────────────────

const cache = new Map<string, boolean>();
async function existe(tabela: string, coluna: string): Promise<boolean> {
  const chave = `${tabela}.${coluna}`;
  const guardado = cache.get(chave);
  if (guardado !== undefined) return guardado;
  const { error } = await supabase.from(tabela as never).select(coluna).limit(1);
  const ok = !error;
  cache.set(chave, ok);
  return ok;
}
/** Esquece a sondagem (depois de ela aplicar as migrations, sem recarregar a página). */
export function esquecerSondagemDeMissoes() { cache.clear(); }

export const RECADO_MIGRATION_DE_MISSOES =
  "Falta aplicar as migrations de missões (20261006180000 a 20261006200000) no banco.";

export interface RecursosDeMissoes {
  campanha: boolean;
  ajustes: boolean;
  metas: boolean;
  projetoMissionario: boolean;
}

export async function recursosDeMissoes(): Promise<RecursosDeMissoes> {
  const [campanha, ajustes, metas, projetoMissionario] = await Promise.all([
    existe("fin_lancamentos", "campanha_missionaria"),
    existe("fin_ajustes_fundo_missionario", "id"),
    existe("fin_metas_campanha", "ano"),
    existe("fin_projetos", "missionario"),
  ]);
  return { campanha, ajustes, metas, projetoMissionario };
}

// ── leitura ───────────────────────────────────────────────────────────────

export interface ProjetoMissionario {
  projeto: FinProjeto;
  arrecadado: number;
  gasto: number;
}

export interface DadosDeMissoes {
  /** Entradas da categoria "Ofertas para Missões". */
  entradas: FinLancamentoExtenso[];
  /** Envio Oficial: saídas das categorias de repasse missionário. */
  envios: FinLancamentoExtenso[];
  /** Saídas dos subcentros de Sustento (e do antigo Pastor Missionário). */
  sustento: FinLancamentoExtenso[];
  /** Subcentro antigo; vazio depois da migration dos 4 subcentros. */
  mobilizacao: FinLancamentoExtenso[];
  /** Saídas do subcentro Campanhas (o Envio Oficial também está aqui; o modelo não conta duas vezes). */
  campanhasSaidas: FinLancamentoExtenso[];
  projetosSaidas: FinLancamentoExtenso[];
  ofertasSaidas: FinLancamentoExtenso[];
  ajustes: AjusteDoFundo[];
  metas: MetaDeCampanha[];
  /** Compromisso mensal já convertido em valor por mês; null = nenhuma recorrência de sustento. */
  recorrenciasDeSustento: { valor: number }[] | null;
  projetos: ProjetoMissionario[];
  recursos: RecursosDeMissoes;
}

const unicos = (ls: FinLancamentoExtenso[]) => Array.from(new Map(ls.map(l => [l.id, l])).values());

export async function carregarDadosDeMissoes(opts: {
  categoriaDeEntradaId: string | null;
  categoriasDeRepasseIds: string[];
}): Promise<DadosDeMissoes> {
  const recursos = await recursosDeMissoes();
  const centros = await listarCentrosCusto();
  const porClasse = (c: ClasseDeCentro) => centros.filter(x => classeDoCentro(x.nome) === c).map(x => x.id);
  // Só SAÍDAS dos centros: a oferta que mora em Campanhas Missionárias não é custo.
  const buscarSaidasDe = async (ids: string[]) =>
    unicos((await Promise.all(ids.map(id => listarLancamentosSemTeto({ tipo: "saida", centroCustoId: id })))).flat());
  const idsSustento = porClasse("sustento");

  const [entradas, envios, sustento, mobilizacao, campanhasSaidas, projetosSaidas, ofertasSaidas, ajustes, metas, recorrencias, projetos] = await Promise.all([
    opts.categoriaDeEntradaId
      ? listarLancamentosSemTeto({ tipo: "entrada", categoriaId: opts.categoriaDeEntradaId })
      : Promise.resolve([] as FinLancamentoExtenso[]),
    Promise.all(opts.categoriasDeRepasseIds.map(id => listarLancamentosSemTeto({ tipo: "saida", categoriaId: id }))).then(r => unicos(r.flat())),
    buscarSaidasDe(idsSustento),
    buscarSaidasDe(porClasse("mobilizacao")),
    buscarSaidasDe(porClasse("campanhas")),
    buscarSaidasDe(porClasse("projetos")),
    buscarSaidasDe(porClasse("ofertas")),
    recursos.ajustes ? lerAjustes() : Promise.resolve([] as AjusteDoFundo[]),
    recursos.metas ? lerMetas() : Promise.resolve([] as MetaDeCampanha[]),
    listarRecorrencias().catch(() => []),
    recursos.projetoMissionario ? lerProjetosMissionarios() : Promise.resolve([] as ProjetoMissionario[]),
  ]);

  const doSustento = recorrencias.filter(r =>
    r.ativo && r.tipo === "saida" && r.centro_custo_id && idsSustento.includes(r.centro_custo_id));
  return {
    entradas, envios, sustento, mobilizacao, campanhasSaidas, projetosSaidas, ofertasSaidas, ajustes, metas, projetos, recursos,
    recorrenciasDeSustento: doSustento.length
      ? doSustento.map(r => ({ valor: valorMensalDaRecorrencia(Number(r.valor), r.frequencia) }))
      : null,
  };
}

async function lerAjustes(): Promise<AjusteDoFundo[]> {
  const { data, error } = await supabase.from("fin_ajustes_fundo_missionario")
    .select("*").order("data_referencia").order("criado_em");
  if (error) throw error;
  return (data ?? []).map(a => ({ ...a, valor: Number(a.valor) })) as AjusteDoFundo[];
}

async function lerMetas(): Promise<MetaDeCampanha[]> {
  const { data, error } = await supabase.from("fin_metas_campanha").select("*").order("ano");
  if (error) throw error;
  return (data ?? []).map(m => ({ campanha: m.campanha, ano: m.ano, valor: Number(m.valor) }));
}

async function lerProjetosMissionarios(): Promise<ProjetoMissionario[]> {
  const todos = await listarProjetosTodos();
  const missionarios = todos.filter(p => p.missionario === true);
  return Promise.all(missionarios.map(async projeto => {
    const ls = await listarLancamentosSemTeto({ projetoId: projeto.id });
    const real = ls.filter(l => l.status === "realizado" || l.status === "conciliado");
    const soma = (tipo: string) => Math.round(real.filter(l => l.tipo === tipo).reduce((s, l) => s + Number(l.valor), 0) * 100) / 100;
    return { projeto, arrecadado: soma("entrada"), gasto: soma("saida") };
  }));
}

// ── gravação ──────────────────────────────────────────────────────────────

const ehColunaAusente = (e: { message?: string; code?: string }) =>
  e.code === "42703" || e.code === "42P01" || e.code === "PGRST204" || e.code === "PGRST205"
  || /campanha_missionaria|fin_ajustes_fundo_missionario|fin_metas_campanha/.test(e.message ?? "");

/** Classifica várias ofertas/remessas de uma vez. Confere cada bloco: zero linhas = a RLS barrou. */
export async function classificarCampanhaEmLote(ids: string[], campanha: CampanhaMissionaria | null): Promise<number> {
  const BLOCO = 100;
  let gravadas = 0;
  for (let i = 0; i < ids.length; i += BLOCO) {
    const bloco = ids.slice(i, i + BLOCO);
    const res = await supabase.from("fin_lancamentos")
      .update({ campanha_missionaria: campanha } as never).in("id", bloco).select("id");
    if (res.error && ehColunaAusente(res.error)) throw new Error(RECADO_MIGRATION_DE_MISSOES);
    const r = conferir(res, "A classificação das ofertas");
    if (!r.ok) throw new Error(r.erro);
    gravadas += res.data?.length ?? 0;
    if ((res.data?.length ?? 0) < bloco.length) {
      throw new Error(`Só ${res.data?.length ?? 0} de ${bloco.length} lançamentos foram atualizados — confira e tente de novo.`);
    }
  }
  return gravadas;
}

export async function criarAjusteDoFundo(a: { data_referencia: string; descricao: string; valor: number; justificativa?: string }) {
  const res = await supabase.from("fin_ajustes_fundo_missionario").insert({
    data_referencia: a.data_referencia, descricao: a.descricao.trim(), valor: a.valor,
    justificativa: a.justificativa?.trim() || null,
  } as never).select("id");
  if (res.error && ehColunaAusente(res.error)) throw new Error(RECADO_MIGRATION_DE_MISSOES);
  const r = conferir(res, "O ajuste");
  if (!r.ok) throw new Error(r.erro);
}

/** Ajuste nunca se apaga: desativa-se (e pode ser reativado). */
export async function definirAjusteAtivo(id: string, ativo: boolean) {
  const res = await supabase.from("fin_ajustes_fundo_missionario").update({ ativo } as never).eq("id", id).select("id");
  const r = conferir(res, "O ajuste");
  if (!r.ok) throw new Error(r.erro);
}

export async function definirMetaDeCampanha(campanha: CampanhaMissionaria, ano: number, valor: number | null) {
  if (valor === null) {
    const res = await supabase.from("fin_metas_campanha").delete().eq("campanha", campanha).eq("ano", ano).select("campanha");
    if (res.error && ehColunaAusente(res.error)) throw new Error(RECADO_MIGRATION_DE_MISSOES);
    if (res.error) throw new Error(res.error.message);
    return;                                  // meta que não existia = 0 linhas, e não é erro
  }
  const res = await supabase.from("fin_metas_campanha")
    .upsert({ campanha, ano, valor } as never, { onConflict: "campanha,ano" }).select("campanha");
  if (res.error && ehColunaAusente(res.error)) throw new Error(RECADO_MIGRATION_DE_MISSOES);
  const r = conferir(res, "A meta");
  if (!r.ok) throw new Error(r.erro);
}

/**
 * A campanha ABERTA hoje (a oposta da última remessa que fechou ciclo, ≥ R$ 20.000) — a sugestão para
 * uma oferta nova. Uma consulta pequena (só as maiores remessas), para o formulário de lançamento não
 * carregar o histórico inteiro. null = não dá para sugerir (sem migration, ou sem remessa fechadora).
 */
export async function campanhaAbertaAgora(categoriasDeRepasseIds: string[]): Promise<CampanhaMissionaria | null> {
  if (categoriasDeRepasseIds.length === 0 || !(await existe("fin_lancamentos", "campanha_missionaria"))) return null;
  const { data, error } = await supabase.from("fin_lancamentos")
    .select("campanha_missionaria, data, data_pagamento")
    .in("categoria_id", categoriasDeRepasseIds).eq("tipo", "saida").in("status", ["realizado", "conciliado"])
    .gte("valor", VALOR_QUE_FECHA_CICLO).in("campanha_missionaria", ["mundiais", "nacionais"])
    .order("data", { ascending: false }).limit(1);
  if (error || !data?.length) return null;
  return data[0].campanha_missionaria === "mundiais" ? "nacionais" : "mundiais";
}
