// ─── visitanteService.ts — Lógica de negócio do módulo de acolhimento ────────
// Toda operação com Supabase fica aqui. Componentes só chamam funções.

import { supabase } from "@/integrations/supabase/client";
import { logHistorico } from "@/lib/historicoFluxo";
import { conferir } from "@/lib/escritaConferida";
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
  // `.select("id")` + conferir: sem isso, quando a política de RLS barra a
  // linha o Postgres afeta ZERO linhas e devolve sucesso — e o histórico,
  // logo abaixo, gravava assim mesmo. Ver lib/escritaConferida.ts.
  const r = conferir(
    await supabase
      .from("membros")
      .update({ status_acolhimento: novoStatus, updated_at: new Date().toISOString() })
      .eq("id", visitanteId)
      .select("id"),
    "O status de acolhimento",
  );
  if (!r.ok) return r;

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
  return conferir(
    await supabase
      .from("membros")
      .update({ observacoes_pastorais: observacoes.trim() || null, updated_at: new Date().toISOString() })
      .eq("id", visitanteId)
      .select("id"),
    "A observação pastoral",
  );
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

  // Este era o pior dos cinco: quando a política barrava, a promoção não
  // acontecia E o histórico logo abaixo gravava "foi recebido como
  // congregado". Ficava um marco falso na vida da pessoa, com a ficha
  // dizendo o contrário.
  const r = conferir(
    await supabase
      .from("membros")
      .update({
        tipo_pessoa:        "congregado",
        status_acolhimento: "congregado",
        data_congregado:    hoje,
        updated_at:         new Date().toISOString(),
      })
      .eq("id", visitanteId)
      .select("id"),
    "A recepção como congregado",
  );
  if (!r.ok) return r;

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

  const r = conferir(
    await supabase
      .from("membros")
      .update({
        tipo_pessoa:        "membro",
        status_acolhimento: "membro",
        data_membro:        hoje,
        updated_at:         new Date().toISOString(),
      })
      .eq("id", pessoaId)
      .select("id"),
    "A recepção como membro",
  );
  if (!r.ok) return r;

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
  const r = conferir(
    await supabase
      .from("membros")
      .update({
        tipo_pessoa:        "congregado",
        status_acolhimento: "congregado",
        data_congregado:    hoje,
        updated_at:         new Date().toISOString(),
      })
      .eq("id", visitante.id)
      .select("id"),
    "A promoção a congregado",
  );
  if (!r.ok) return r;

  await logHistorico(
    visitante.id,
    "promocao_congregado",
    `${visitante.nome_completo} foi recebido como congregado em ${new Date().toLocaleDateString("pt-BR")}.`
  );

  return { ok: true, pessoaId: visitante.id };
}

// ─── Tarefas de acolhimento ───────────────────────────────────────────────────
//
// `acolhimento_tarefas` já existia no banco (INSERT em série em
// `MembroForm.tsx` ao cadastrar um visitante: 4 tarefas padrão — boas-
// vindas, contato, convite pro próximo evento, recontato), mas só aparecia
// dentro de um diálogo por vez
// (`AcolhimentoPanel.tsx`). O painel principal (`Visitantes.tsx`) pede pra
// ver isso de cara, por nome, sem abrir nada — daqui em diante.

export interface TarefaAcolhimento {
  id:             string;
  visitante_id:   string;
  titulo:         string;
  data:           string;
  concluida:      boolean;
  data_conclusao: string | null;
}

/**
 * Tarefas de acolhimento de vários visitantes de uma vez, agrupadas por
 * pessoa — uma consulta só pra lista inteira, não uma por cartão.
 */
export async function buscarTarefasDosVisitantes(
  visitanteIds: string[]
): Promise<Record<string, TarefaAcolhimento[]>> {
  if (visitanteIds.length === 0) return {};
  const { data } = await supabase
    .from("acolhimento_tarefas")
    .select("id, visitante_id, titulo, data, concluida, data_conclusao")
    .in("visitante_id", visitanteIds)
    .order("data", { ascending: true });

  const porVisitante: Record<string, TarefaAcolhimento[]> = {};
  for (const t of (data ?? []) as TarefaAcolhimento[]) {
    (porVisitante[t.visitante_id] ??= []).push(t);
  }
  return porVisitante;
}

/** Marca (ou desmarca) uma tarefa de acolhimento como concluída. */
export async function alternarTarefaAcolhimento(
  tarefaId: string,
  concluida: boolean
): Promise<{ ok: boolean; erro?: string }> {
  return conferir(
    await supabase
      .from("acolhimento_tarefas")
      .update({ concluida, data_conclusao: concluida ? new Date().toISOString() : null })
      .eq("id", tarefaId)
      .select("id"),
    "A tarefa",
  );
}

// ─── Dashboard: resumos ───────────────────────────────────────────────────────

export interface ResumoVisitantes {
  total:            number;
  novos:            number;    // cadastrados nos últimos 7 dias
  emAcompanhamento: number;    // status: contatado, retornou, em_relacionamento, em_acompanhamento
  semContato:       number;    // último contato há mais de 7 dias
  prontosCrescer:   number;    // ≥3 visitas ou em_acompanhamento
  convertidos:      number;    // congregaram nos últimos 90 dias (ver nota abaixo)
}

// Janela do indicador "Congregaram". 90 dias, não 7 como os outros — congregar
// é raro (medido em 08/09/2026: nenhum caso ainda no banco), então uma janela
// de 7 dias ficaria vazia quase sempre e pareceria quebrada mesmo funcionando.
const DIAS_JANELA_CONVERTIDOS = 90;

export async function getResumoVisitantes(): Promise<ResumoVisitantes> {
  const { data } = await supabase
    .from("membros")
    .select("id, status_acolhimento, created_at, ultimo_contato_em, numero_visitas, data_congregado")
    .eq("tipo_pessoa", "visitante");

  const lista = data ?? [];
  const agora = Date.now();
  const dias7  = 7  * 86_400_000;

  // ── "Congregaram" pede uma consulta À PARTE, não um filtro da lista acima ──
  //
  // Achado na auditoria de 08/09/2026: a consulta antiga contava
  // `data_congregado` dentro da MESMA lista que já veio filtrada por
  // `tipo_pessoa = 'visitante'`. Só que virar congregado é justamente o que
  // MUDA o `tipo_pessoa` de alguém — `tornarCongregado()` grava os dois campos
  // juntos. Ninguém é as duas coisas ao mesmo tempo, então o filtro de cima
  // torna o indicador estruturalmente zero: ele nunca poderia contar a pessoa
  // que procura, porque ela já não está mais na lista quando o campo que
  // procuramos é preenchido.
  //
  // A consulta certa não parte de "visitante" — parte de quem tem
  // `data_congregado` preenchida dentro da janela, seja qual for o
  // `tipo_pessoa` atual (hoje só `congregado` chega lá, mas não vale prender
  // a consulta a esse valor específico).
  const desde = new Date(agora - DIAS_JANELA_CONVERTIDOS * 86_400_000).toISOString().slice(0, 10);
  const { data: convertidosRecentes } = await supabase
    .from("membros")
    .select("id")
    .not("data_congregado", "is", null)
    .gte("data_congregado", desde);

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
    convertidos: (convertidosRecentes ?? []).length,
  };
}

// ─── Resumo agregado das tarefas de acolhimento ────────────────────────────

export interface ResumoTarefasAcolhimento {
  total:  number;
  feitas: number;
  /** 0-100. Sem tarefa nenhuma (ninguém pra acolher), fica 0 — não NaN. */
  pct:    number;
}

/**
 * O percentual agregado de tarefas de acolhimento concluídas — o "motor" que
 * já existe em `/visitantes` (Painel de Visitantes), trazido pro Painel
 * Pastoral a pedido dela. Só conta tarefas de quem ainda é visitante — quem
 * já congregou ou virou membro sai da régua, do mesmo jeito que sai da
 * listagem principal de `/visitantes`.
 */
export async function resumoTarefasAcolhimento(): Promise<ResumoTarefasAcolhimento> {
  const { data: visitantes } = await supabase
    .from("membros")
    .select("id")
    .eq("tipo_pessoa", "visitante");

  const ids = (visitantes ?? []).map(v => v.id);
  if (ids.length === 0) return { total: 0, feitas: 0, pct: 0 };

  const { data: tarefas } = await supabase
    .from("acolhimento_tarefas")
    .select("concluida")
    .in("visitante_id", ids);

  const total  = tarefas?.length ?? 0;
  const feitas = (tarefas ?? []).filter(t => t.concluida).length;
  return { total, feitas, pct: total ? Math.round((feitas / total) * 100) : 0 };
}

// ─── WhatsApp ─────────────────────────────────────────────────────────────────

/**
 * Abre WhatsApp com mensagem pastoral contextualizada e registra no histórico.
 */
export function enviarMensagemPastoral(
  visitante: Pick<Visitante, "id" | "nome_completo" | "telefone_celular" | "numero_visitas" | "status_acolhimento" | "ultimo_contato_em" | "created_at" | "tipo_pessoa">
): void {
  const tel = visitante.telefone_celular?.replace(/\D/g, "") ?? "";
  if (!tel || tel.length < 10) return;

  // A regua de etapas foi desenhada para VISITANTE: ela conta dias desde o
  // cadastro. Num membro esse numero e sempre grande, entao ele cairia em
  // "nao voltou" e receberia "Sentimos a sua falta!" — para quem esta na
  // igreja todo domingo. Membro e congregado ficam em "em_acompanhamento",
  // que e a mensagem neutra e cabe em qualquer um.
  //
  // Ate aqui esse era o comportamento de fato, mas por acidente: a chamada
  // abaixo passava um OBJETO onde calcularEtapa espera dois valores
  // (numero_visitas, created_at), como fazem os outros seis chamadores. Com
  // um objeto no lugar do numero e undefined no lugar da data, todas as
  // comparacoes falhavam e a funcao caia sempre na ultima linha. Resultado: a
  // igreja tinha quatro mensagens pastorais escritas e usava uma so.
  const ehMembroOuCongregado = ["membro", "congregado"].includes(visitante.tipo_pessoa);
  const etapa = ehMembroOuCongregado
    ? "em_acompanhamento" as const
    : calcularEtapa(visitante.numero_visitas ?? 1, visitante.created_at);

  const mensagem = getMensagem(etapa, visitante.nome_completo);
  const link     = buildWhatsAppLink(tel, mensagem);
  window.open(link, "_blank", "noopener,noreferrer");

  // Registra o contato no histórico (assíncrono, não bloqueia)
  logHistorico(visitante.id, "whatsapp", `Mensagem enviada na etapa: ${etapa}`);
}
