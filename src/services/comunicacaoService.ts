// ─── comunicacaoService — o envio sob demanda de relatórios e o histórico de envios (27/10/2026) ──────────────────────────────────────────────────────────────────────────────────────────
// Fala com a Edge Function `contribuicoes-enviar` (prévia, teste, envio) e lê `comunicacao_envios` (só admin e diakonia — a política do banco manda). Os NÚMEROS do relatório nunca saem daqui: a função
// os calcula do banco; a tela só pede um período e uma lista de destinatários.
import { supabase } from "@/integrations/supabase/client";

export interface PeriodoDoRelatorio { ini: string; fim: string }
export interface PreviaDoRelatorio { assunto: string; html: string; texto: string; resumo: string; periodo: { ini: string; fim: string; ajustado: boolean } }
export interface ResultadoDoEnvio { enviados: number; falharam: number; historicoGravado: boolean; motivo?: "enviado_ha_pouco" }

/** Os filtros globais do relatório: a base analisada e as contribuições consideradas. */
export interface FiltrosDoRelatorio { base: string; categorias: string[]; ordenacao: string }

async function chamar(acao: "previa" | "teste" | "enviar", periodo: PeriodoDoRelatorio, blocos: string[], filtros: FiltrosDoRelatorio, destinatarios?: string[]) {
  const { data, error } = await supabase.functions.invoke("contribuicoes-enviar", { body: { acao, periodo, blocos, base: filtros.base, categorias: filtros.categorias, ordenacao: filtros.ordenacao, ...(destinatarios ? { destinatarios } : {}) } });
  if (error) {
    let msg = error.message;
    try { const j = await (error as unknown as { context?: Response }).context?.json?.(); if (j?.erro) msg = j.erro; } catch { /* fica a mensagem genérica */ }
    if (/Failed to send a request|Function not found|NOT_FOUND|404/i.test(msg)) msg = "A função de envio do relatório ainda não foi implantada no Supabase (contribuicoes-enviar) — veja docs/CONTRIBUICOES_EMAIL_IMPLANTACAO.md.";
    throw new Error(msg);
  }
  return data as Record<string, any>;
}

export async function previaDoRelatorioDeContribuicoes(periodo: PeriodoDoRelatorio, blocos: string[], filtros: FiltrosDoRelatorio): Promise<PreviaDoRelatorio> {
  const r = await chamar("previa", periodo, blocos, filtros);
  return { assunto: r.assunto ?? "", html: r.html ?? "", texto: r.texto ?? "", resumo: r.resumo ?? "", periodo: r.periodo ?? { ...periodo, ajustado: false } };
}

/** Manda o e-mail marcado [TESTE] SÓ para o e-mail cadastrado de quem está logado. */
export async function enviarTesteDoRelatorioDeContribuicoes(periodo: PeriodoDoRelatorio, blocos: string[], filtros: FiltrosDoRelatorio): Promise<{ enviadoPara: string }> {
  const r = await chamar("teste", periodo, blocos, filtros);
  return { enviadoPara: r.enviadoPara ?? "" };
}

export async function enviarRelatorioDeContribuicoes(periodo: PeriodoDoRelatorio, blocos: string[], filtros: FiltrosDoRelatorio, destinatarios: string[]): Promise<ResultadoDoEnvio> {
  const r = await chamar("enviar", periodo, blocos, filtros, destinatarios);
  return { enviados: r.enviados ?? 0, falharam: r.falharam ?? 0, historicoGravado: r.historicoGravado !== false, motivo: r.motivo };
}

// ── o histórico ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface EnvioDoHistorico {
  id: string; em: string; tipo: string; origem: "sob_demanda" | "teste"; solicitante_nome: string | null; assunto: string | null;
  destinatarios: { email: string; ok: boolean; erro: string | null }[]; parametros: { ini?: string; fim?: string; blocos?: string[]; base?: string; categorias?: string[]; ordenacao?: string; versao?: string }; resultado: "enviado" | "parcial" | "falhou";
}
export interface HistoricoDosEnvios { envios: EnvioDoHistorico[]; /** a tabela ainda não existe (migration 20261027180000 não aplicada) */ indisponivel: boolean }

export async function listarEnviosDaComunicacao(limite = 30): Promise<HistoricoDosEnvios> {
  const { data, error } = await supabase.from("comunicacao_envios" as never)
    .select("id, em, tipo, origem, solicitante_nome, assunto, destinatarios, parametros, resultado").order("em", { ascending: false }).limit(limite);
  if (error) {
    if ((error as { code?: string }).code === "PGRST205" || /could not find the table|does not exist/i.test(error.message)) return { envios: [], indisponivel: true };
    throw new Error(error.message);
  }
  return { envios: (data ?? []) as unknown as EnvioDoHistorico[], indisponivel: false };
}
