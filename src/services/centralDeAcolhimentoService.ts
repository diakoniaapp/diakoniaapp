// ─── centralDeAcolhimentoService — os dados e as ações da Central de Acolhimento ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Lê os visitantes (membros `tipo_pessoa = visitante`), os PEDIDOS de oração/contato que ainda esperam retorno (a fila do QR, `vw_visitantes_aguardando_contato`), as tarefas de acolhimento e quantos
// já viraram congregados; e grava as ações de um clique (registrar contato, registrar retorno, retorno feito, promover). A regra de prioridade e de próxima ação mora em `lib/centralDeAcolhimento.ts`.
import { supabase } from "@/integrations/supabase/client";
import { conferir } from "@/lib/escritaConferida";
import { avaliarEvolucao } from "@/lib/evolucaoFluxo";
import { logHistorico } from "@/lib/historicoFluxo";
import { preferenciaDeContato, rotulosDaOracao } from "@/lib/autocadastroVisitante";
import { calcularEtapa, getStatusPorEtapa } from "@/lib/visitantesFluxo";
import { daquiADias, hojeLocal } from "@/lib/data";
import { buscarTarefasDosVisitantes, alternarTarefaAcolhimento, type TarefaAcolhimento } from "@/services/visitanteService";
import type { PedidoDeCuidado, VisitanteBase } from "@/lib/centralDeAcolhimento";
import type { Membro } from "@/pages/Membros";

export interface VisitanteMembro extends Membro {
  numero_visitas?: number | null;
  ultimo_contato_em?: string | null;
  ultimo_contato_tipo?: string | null;
  data_congregado?: string | null;
  data_membro?: string | null;
  created_at: string;
}

export interface DadosDaCentral {
  visitantes: VisitanteMembro[];
  /** por id do visitante: o pedido de oração/contato mais antigo ainda sem retorno */
  pedidos: Map<string, PedidoDeCuidado & { checkinIds: string[] }>;
  /** quantos viraram congregados nos últimos 90 dias (já não são visitantes) */
  conversoes: number;
  tarefas: Record<string, TarefaAcolhimento[]>;
}

/** O que a regra pura precisa de cada visitante. `sugestaoDePromocao` vem de `avaliarEvolucao` (que olha o relógio) e por isso é calculada aqui, não na regra. */
export function paraBase(v: VisitanteMembro, pedido?: PedidoDeCuidado | null): VisitanteBase {
  const nv = v.numero_visitas ?? 1;
  return {
    id: v.id, nome: v.nome_completo, telefone: v.telefone_celular ?? null, bairro: v.bairro ?? null, numeroVisitas: nv, criadoEm: v.created_at,
    ultimoContatoEm: v.ultimo_contato_em ?? null, ultimoContatoTipo: v.ultimo_contato_tipo ?? null,
    sugestaoDePromocao: avaliarEvolucao({ tipo_pessoa: v.tipo_pessoa, numero_visitas: nv, ultimo_contato_tipo: v.ultimo_contato_tipo ?? null, created_at: v.created_at }).sugestao,
    pedido: pedido ?? null,
  };
}

type LinhaDaFila = {
  checkin_id: string; membro_id: string; data_visita: string; deseja_contato?: boolean; oracao_familia?: boolean; oracao_saude?: boolean; oracao_trabalho?: boolean; oracao_outro?: string | null;
  canal_contato?: string | null; horario_contato?: string | null;
};

/** Junta os check-ins pendentes de cada visitante num pedido só (o mais antigo manda na data; oração e contato somam). */
export function agruparPedidos(linhas: readonly LinhaDaFila[]): Map<string, PedidoDeCuidado & { checkinIds: string[] }> {
  const mapa = new Map<string, PedidoDeCuidado & { checkinIds: string[] }>();
  for (const l of [...linhas].sort((a, b) => String(a.data_visita).localeCompare(String(b.data_visita)))) {
    const oracao = rotulosDaOracao(l);
    const preferencia = preferenciaDeContato(l).replace(/^prefere /, "") || null;
    const atual = mapa.get(l.membro_id);
    if (!atual) {
      mapa.set(l.membro_id, { checkinId: l.checkin_id, checkinIds: [l.checkin_id], oracao, oracaoTexto: l.oracao_outro ?? null, quer_contato: !!l.deseja_contato, preferencia, dataVisita: String(l.data_visita).slice(0, 10) });
    } else {
      atual.checkinIds.push(l.checkin_id);
      for (const o of oracao) if (!atual.oracao.includes(o)) atual.oracao.push(o);
      atual.quer_contato = atual.quer_contato || !!l.deseja_contato;
      atual.preferencia = atual.preferencia ?? preferencia;
      atual.oracaoTexto = atual.oracaoTexto ?? l.oracao_outro ?? null;
    }
  }
  return mapa;
}

export async function carregarCentral(): Promise<DadosDaCentral> {
  const desde = daquiADias(hojeLocal(), -90);
  const [vis, fila, conv] = await Promise.all([
    supabase.from("membros").select("*").eq("tipo_pessoa", "visitante").order("created_at", { ascending: true }),
    // sem a migration do QR, ou sem permissão de leitura: a Central funciona do mesmo jeito, só sem os pedidos
    supabase.from("vw_visitantes_aguardando_contato" as never).select("*"),
    supabase.from("membros").select("id", { count: "exact", head: true }).eq("tipo_pessoa", "congregado").gte("data_congregado", desde),
  ]);
  if (vis.error) throw new Error(vis.error.message);
  const visitantes = (vis.data ?? []) as VisitanteMembro[];
  const pedidos = agruparPedidos(fila.error ? [] : ((fila.data ?? []) as unknown as LinhaDaFila[]));
  const tarefas = await buscarTarefasDosVisitantes(visitantes.map(v => v.id));
  return { visitantes, pedidos, conversoes: conv.error ? 0 : (conv.count ?? 0), tarefas };
}

// ── ações ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

// interface simples (não união discriminada): este projeto compila sem strictNullChecks, onde `if (!r.ok)` não estreita a união
export interface Resultado { ok: boolean; erro?: string }

/** Registra o contato (e o resultado dele). Grava `status_acolhimento` conforme a etapa. O `.select()` faz uma política que barra o UPDATE aparecer como erro, não como falso sucesso. */
export async function registrarContato(v: VisitanteMembro, tipo: string, observacao: string): Promise<Resultado> {
  const etapa = calcularEtapa(v.numero_visitas ?? 1, v.created_at);
  const { data, error } = await supabase.from("membros")
    .update({ ultimo_contato_em: new Date().toISOString(), status_acolhimento: getStatusPorEtapa(etapa), ultimo_contato_tipo: tipo, ultimo_contato_observacao: observacao || null } as never)
    .eq("id", v.id).select("id");
  if (error) return { ok: false, erro: error.message };
  if ((data?.length ?? 0) === 0) return { ok: false, erro: "Sem permissão para registrar o contato desta pessoa." };
  await logHistorico(v.id, "whatsapp", tipo + (observacao ? ` — ${observacao}` : ""));
  return { ok: true };
}

export async function registrarRetorno(v: VisitanteMembro): Promise<Resultado> {
  const nova = (v.numero_visitas ?? 1) + 1;
  const r = conferir(await supabase.from("membros").update({ numero_visitas: nova, ...(nova >= 2 ? { status_acolhimento: "retornou" } : {}) }).eq("id", v.id).select("id"), "O retorno");
  return r.ok ? { ok: true } : { ok: false, erro: r.erro };
}

/** "Retorno feito": o pedido de oração/contato foi atendido pessoalmente — sai da lista sem precisar de mensagem. */
export async function marcarRetornoFeito(checkinIds: readonly string[]): Promise<Resultado> {
  const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
  const r = conferir(
    await supabase.from("visitante_checkins" as never).update({ tratado_em: new Date().toISOString(), tratado_por: uid } as never).in("id" as never, [...checkinIds] as never).select("id"),
    "O retorno ao visitante",
  );
  return r.ok ? { ok: true } : { ok: false, erro: r.erro };
}

export async function promover(v: VisitanteMembro, para: "congregado" | "membro"): Promise<Resultado> {
  const agora = new Date().toISOString();
  // Se a política barrar, a pessoa NÃO muda de tipo: sem a conferência a tela comemoraria e a ficha continuaria dizendo visitante.
  const r = conferir(await supabase.from("membros").update({ tipo_pessoa: para, ...(para === "congregado" ? { data_congregado: agora } : { data_membro: agora }) } as never).eq("id", v.id).select("id"), "A mudança de vínculo");
  if (!r.ok) return { ok: false, erro: r.erro };
  await logHistorico(v.id, para === "congregado" ? "promocao_congregado" : "promocao_membro", `Promovido a ${para === "congregado" ? "Congregado" : "Membro"}`);
  return { ok: true };
}

export { alternarTarefaAcolhimento };
export type { TarefaAcolhimento };
