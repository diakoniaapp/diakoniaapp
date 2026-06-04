// ─── visitanteService.ts — Lógica de negócio do módulo de acolhimento ────────
// Toda operação com Supabase fica aqui. Componentes só chamam funções.

import { supabase } from "@/integrations/supabase/client";
import { logHistorico } from "@/lib/historicoFluxo";
import { calcularEtapa, getMensagem, buildWhatsAppLink } from "@/lib/visitantesFluxo";
import type { Visitante, StatusAcolhimento, AcompanhamentoItem } from "@/types/visitante";

// ─── Leitura ──────────────────────────────────────────────────────────────────

/** Busca um visitante pelo ID com todos os campos relevantes. */
export async function buscarVisitante(id: string): Promise<Visitante | null> {
  const { data, error } = await supabase
    .from("membros")
    .select(`
      id, nome_completo, telefone_celular, telefone_fixo, email,
      status_acolhimento, tipo_pessoa, observacoes_pastorais,
      responsavel_id, quem_convidou_id, numero_visitas,
      ultimo_contato_em, ultimo_contato_tipo,
      data_congregado, data_membro, created_at, updated_at,
      como_conheceu, bairro, data_nascimento, sexo
    `)
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return data as Visitante;
}

/** Lista todos os visitantes ativos, ordenados por data de cadastro. */
export async function listarVisitantes(): Promise<Visitante[]> {
  const { data } = await supabase
    .from("membros")
    .select(`
      id, nome_completo, telefone_celular, status_acolhimento, tipo_pessoa,
      numero_visitas, ultimo_contato_em, ultimo_contato_tipo,
      data_congregado, created_at, updated_at,
      observacoes_pastorais, responsavel_id
    `)
    .eq("tipo_pessoa", "visitante")
    .order("created_at", { ascending: true });

  return (data ?? []) as Visitante[];
}

/** Busca o histórico de interações de um visitante. */
export async function buscarHistorico(visitanteId: string) {
  const { data } = await supabase
    .from("visita_historico")
    .select("id, tipo, observacao, created_at")
    .eq("visitante_id", visitanteId)
    .order("created_at", { ascending: false })
    .limit(20);

  return data ?? [];
}

/** Busca os acompanhamentos registrados. */
export async function buscarAcompanhamentos(
  visitanteId: string
): Promise<AcompanhamentoItem[]> {
  const { data } = await supabase
    .from("acompanhamentos_visitante")
    .select("*")
    .eq("membro_id", visitanteId)
    .order("created_at", { ascending: false })
    .limit(10);

  return (data ?? []) as AcompanhamentoItem[];
}

// ─── Atualizações ─────────────────────────────────────────────────────────────

/** Avança o status de acolhimento e registra no histórico. */
export async function atualizarStatusAcolhimento(
  visitanteId: string,
  novoStatus:  StatusAcolhimento,
  statusAnterior: StatusAcolhimento | null
): Promise<{ ok: boolean; erro?: string }> {
  const { error } = await supabase
    .from("membros")
    .update({ status_acolhimento: novoStatus, updated_at: new Date().toISOString() })
    .eq("id", visitanteId);

  if (error) return { ok: false, erro: error.message };

  await logHistorico(
    visitanteId,
    "observacao",
    `Status de acolhimento atualizado: ${statusAnterior ?? "—"} → ${novoStatus}`
  );

  return { ok: true };
}

/** Salva observações pastorais. */
export async function salvarObservacoes(
  visitanteId: string,
  observacoes: string
): Promise<{ ok: boolean; erro?: string }> {
  const { error } = await supabase
    .from("membros")
    .update({ observacoes_pastorais: observacoes.trim() || null, updated_at: new Date().toISOString() })
    .eq("id", visitanteId);

  if (error) return { ok: false, erro: error.message };
  return { ok: true };
}

/** Registra um novo acompanhamento (contato, visita, próximo passo). */
export async function registrarAcompanhamento(params: {
  visitanteId:     string;
  contatoFeito:    boolean;
  visitaRealizada: boolean;
  proximoPasso:    string;
  observacoes:     string;
  responsavelId?:  string;
}): Promise<{ ok: boolean; erro?: string }> {
  const { error } = await supabase
    .from("acompanhamentos_visitante")
    .insert({
      membro_id:        params.visitanteId,
      status:           "concluido",
      contato_feito:    params.contatoFeito,
      visita_realizada: params.visitaRealizada,
      proximo_passo:    params.proximoPasso.trim() || null,
      observacoes:      params.observacoes.trim() || null,
      responsavel_id:   params.responsavelId ?? null,
      data_contato:     params.contatoFeito ? new Date().toISOString().split("T")[0] : null,
      data_visita:      params.visitaRealizada ? new Date().toISOString().split("T")[0] : null,
    });

  if (error) return { ok: false, erro: error.message };

  await logHistorico(
    params.visitanteId,
    params.visitaRealizada ? "visita_presencial" : params.contatoFeito ? "ligacao" : "observacao",
    params.observacoes || params.proximoPasso || null
  );

  return { ok: true };
}

// ─── Transição pastoral ───────────────────────────────────────────────────────

/**
 * Torna um visitante congregado.
 * - Atualiza tipo_pessoa → "congregado"
 * - Atualiza status_acolhimento → "congregado"
 * - Define data_congregado
 * - Preserva todo o histórico (nada é apagado)
 */
export async function tornarCongregado(
  visitanteId: string,
  nomeCompleto: string
): Promise<{ ok: boolean; erro?: string }> {
  const hoje = new Date().toISOString().split("T")[0];

  const { error } = await supabase
    .from("membros")
    .update({
      tipo_pessoa:        "congregado",
      status_acolhimento: "congregado",
      data_congregado:    hoje,
      updated_at:         new Date().toISOString(),
    })
    .eq("id", visitanteId);

  if (error) return { ok: false, erro: error.message };

  // Registra o marco pastoral no histórico
  await logHistorico(
    visitanteId,
    "promocao_congregado",
    `${nomeCompleto} foi recebido como congregado em ${new Date().toLocaleDateString("pt-BR")}.`
  );

  return { ok: true };
}

/**
 * Torna um congregado membro formal.
 * - Atualiza tipo_pessoa → "membro"
 * - Atualiza status_acolhimento → "membro"
 * - Define data_membro
 */
export async function tornarMembro(
  pessoaId: string,
  nomeCompleto: string
): Promise<{ ok: boolean; erro?: string }> {
  const hoje = new Date().toISOString().split("T")[0];

  const { error } = await supabase
    .from("membros")
    .update({
      tipo_pessoa:        "membro",
      status_acolhimento: "membro",
      data_membro:        hoje,
      updated_at:         new Date().toISOString(),
    })
    .eq("id", pessoaId);

  if (error) return { ok: false, erro: error.message };

  await logHistorico(
    pessoaId,
    "promocao_membro",
    `${nomeCompleto} foi recebido como membro em ${new Date().toLocaleDateString("pt-BR")}.`
  );

  return { ok: true };
}

// ─── Funções de integração segura ────────────────────────────────────────────

/**
 * Busca o nome do responsável pelo ID (para exibir na ficha).
 * Silencia erro — responsável é opcional.
 */
export async function buscarNomeResponsavel(
  responsavelId: string | null
): Promise<string | null> {
  if (!responsavelId) return null;
  try {
    // Tenta profiles.nome primeiro
    const { data: prof } = await supabase
      .from("profiles")
      .select("nome")
      .eq("id", responsavelId)
      .maybeSingle();
    if (prof?.nome) return prof.nome;

    // Fallback: membros.nome_completo
    const { data: mem } = await supabase
      .from("membros")
      .select("nome_completo")
      .eq("id", responsavelId)
      .maybeSingle();
    return mem?.nome_completo ?? null;
  } catch {
    return null;
  }
}

/**
 * Versão integrada e segura de tornarCongregado:
 * - Verifica duplicidade (telefone já na tabela como congregado/membro)
 * - Preserva nome, telefone e histórico
 * - Retorna pessoaId para navegação direta na ficha
 */
export async function tornarCongregadoIntegrado(
  visitante: Pick<Visitante, "id" | "nome_completo" | "telefone_celular">
): Promise<{ ok: boolean; erro?: string; pessoaId?: string }> {
  const tel = visitante.telefone_celular?.replace(/\D/g, "") ?? "";

  // Verificar duplicidade: já existe congregado/membro com este telefone?
  if (tel) {
    const { data: dup } = await supabase
      .from("membros")
      .select("id, nome_completo, tipo_pessoa")
      .eq("telefone_celular", visitante.telefone_celular ?? "")
      .in("tipo_pessoa", ["congregado", "membro"])
      .neq("id", visitante.id)  // excluir o próprio registro
      .maybeSingle();

    if (dup) {
      return {
        ok:   false,
        erro: `Já existe um(a) ${dup.tipo_pessoa} com este telefone: ${dup.nome_completo}. Verifique antes de converter.`,
      };
    }
  }

  // Promover na tabela
  const hoje = new Date().toISOString().split("T")[0];
  const { error } = await supabase
    .from("membros")
    .update({
      tipo_pessoa:        "congregado",
      status_acolhimento: "congregado",
      data_congregado:    hoje,
      updated_at:         new Date().toISOString(),
    })
    .eq("id", visitante.id);

  if (error) return { ok: false, erro: error.message };

  await logHistorico(
    visitante.id,
    "promocao_congregado",
    `${visitante.nome_completo} foi recebido como congregado em ${new Date().toLocaleDateString("pt-BR")}.`
  );

  return { ok: true, pessoaId: visitante.id };
}

// ─── Dashboard: resumos ───────────────────────────────────────────────────────

export interface ResumoVisitantes {
  total:            number;
  novos:            number;    // cadastrados nos últimos 7 dias
  emAcompanhamento: number;    // status: contatado, retornou, em_relacionamento, em_acompanhamento
  semContato:       number;    // último contato há mais de 7 dias
  prontosCrescer:   number;    // ≥3 visitas ou em_acompanhamento
  convertidos:      number;    // data_congregado não nulo (histórico)
}

export async function getResumoVisitantes(): Promise<ResumoVisitantes> {
  const { data } = await supabase
    .from("membros")
    .select("id, status_acolhimento, created_at, ultimo_contato_em, numero_visitas, data_congregado")
    .eq("tipo_pessoa", "visitante");

  const lista = data ?? [];
  const agora = Date.now();
  const dias7  = 7  * 86_400_000;

  return {
    total:            lista.length,
    novos:            lista.filter(v => agora - new Date(v.created_at).getTime() < dias7).length,
    emAcompanhamento: lista.filter(v =>
      ["contatado", "retornou", "em_relacionamento", "em_acompanhamento"].includes(v.status_acolhimento ?? "")
    ).length,
    semContato: lista.filter(v =>
      !v.ultimo_contato_em || agora - new Date(v.ultimo_contato_em).getTime() > dias7
    ).length,
    prontosCrescer: lista.filter(v =>
      (v.numero_visitas ?? 0) >= 3 || v.status_acolhimento === "em_acompanhamento"
    ).length,
    convertidos: lista.filter(v => !!v.data_congregado).length,
  };
}

// ─── WhatsApp ─────────────────────────────────────────────────────────────────

/**
 * Abre WhatsApp com mensagem pastoral contextualizada e registra no histórico.
 */
export function enviarMensagemPastoral(
  visitante: Pick<Visitante, "id" | "nome_completo" | "telefone_celular" | "numero_visitas" | "status_acolhimento" | "ultimo_contato_em" | "created_at">
): void {
  const tel = visitante.telefone_celular?.replace(/\D/g, "") ?? "";
  if (!tel || tel.length < 10) return;

  const etapa = calcularEtapa({
    id:                  visitante.id,
    nome_completo:       visitante.nome_completo,
    telefone:            tel,
    numero_visitas:      visitante.numero_visitas ?? 1,
    status_acolhimento:  visitante.status_acolhimento,
    ultimo_contato_em:   visitante.ultimo_contato_em,
    created_at:          visitante.created_at,
    dias_desde_cadastro: Math.floor((Date.now() - new Date(visitante.created_at).getTime()) / 86_400_000),
    etapa_fluxo:         "boas_vindas",
    prioridade:          "baixa",
    precisa_acao:        false,
  });

  const mensagem = getMensagem(etapa, visitante.nome_completo);
  const link     = buildWhatsAppLink(tel, mensagem);
  window.open(link, "_blank", "noopener,noreferrer");

  // Registra o contato no histórico (assíncrono, não bloqueia)
  logHistorico(visitante.id, "whatsapp", `Mensagem enviada na etapa: ${etapa}`);
}
