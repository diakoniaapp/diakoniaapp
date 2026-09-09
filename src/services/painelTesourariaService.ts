// ─── painelTesourariaService.ts — os dados do Painel da Tesouraria ────────
//
// Sprint 1 do plano "Bancada da Tesouraria" (08/09/2026): fiscal e caixa, os
// dois riscos que custam dinheiro de verdade quando alguém deixa passar
// (multa e dinheiro em espécie sem responsável claro).
//
// Sprint 2: Pendências, Próximos vencimentos e Orçamento. Nenhum dos três
// precisou de tabela nova — `finService.ts` já tinha tudo, só nunca reunido
// num lugar que prioriza. `listarOrcamentoVsReal()` ficou de fora de
// propósito: `alertasCentros()` já entrega os MESMOS centros, só que
// classificados por severidade e com frase pronta — reconstruir o
// julgamento aqui a partir dos números crus duplicaria uma régua que já
// existe em `fin_alertas_centros` (RPC do banco).
//
// O bloco Fiscal não duplica lógica: reaproveita `carregarResumoFiscal()` de
// `fiscalService.ts`, o mesmo dado que já vira o widget `AgendaFiscalUrgente`
// — e é por isso que este painel EMBUTE aquele componente em vez de reler o
// resumo fiscal aqui dentro. Só o de Caixa é novo, porque não havia, em lugar
// nenhum do sistema, uma lista de "todos os caixas abertos agora".

import { supabase } from "@/integrations/supabase/client";
import { hojeMaisDias } from "@/lib/data";
import {
  listarLancamentos, listarProximosVencimentos, alertasCentros,
  type FinLancamentoExtenso, type FinVencimento, type FinAlertaCentro,
} from "@/services/finService";

export interface CaixaAberto {
  id: string;
  reserva_id: string;
  aberto_em: string;
  espaco_nome: string | null;
  finalidade: string | null;
}

export async function listarCaixasAbertos(): Promise<CaixaAberto[]> {
  const { data, error } = await supabase
    .from("arr_caixas")
    .select(`
      id, reserva_id, aberto_em,
      reserva:arr_reservas!reserva_id(
        finalidade,
        espaco:arr_espacos!espaco_id(nome)
      )
    `)
    .eq("estado", "aberto")
    .is("arquivado_em", null)
    .order("aberto_em", { ascending: true });

  if (error) throw error;

  // O embed de dois níveis vem como objeto (ou array, dependendo da relação
  // detectada pelo PostgREST) — normalizado aqui para não vazar esse detalhe
  // pra tela.
  return (data ?? []).map((c: any) => {
    const reserva = Array.isArray(c.reserva) ? c.reserva[0] : c.reserva;
    const espaco = reserva ? (Array.isArray(reserva.espaco) ? reserva.espaco[0] : reserva.espaco) : null;
    return {
      id: c.id,
      reserva_id: c.reserva_id,
      aberto_em: c.aberto_em,
      espaco_nome: espaco?.nome ?? null,
      finalidade: reserva?.finalidade ?? null,
    };
  });
}

/** "há poucos minutos" · "há 3h" · "há 2 dias" — mesma régua de `formatarAtualizadoHa`, em escala de dias. */
export function formatarTempoAberto(abertoEm: string): string {
  const ms = Date.now() - new Date(abertoEm).getTime();
  const horas = Math.floor(ms / 3_600_000);
  if (horas < 1) return "há poucos minutos";
  if (horas < 24) return `há ${horas}h`;
  const dias = Math.floor(horas / 24);
  return `há ${dias} ${dias === 1 ? "dia" : "dias"}`;
}

/** Caixa aberto por mais de 24h entra na frase como urgência, não só como fila. */
export const HORAS_CAIXA_URGENTE = 24;

export function caixaEhUrgente(c: CaixaAberto): boolean {
  return Date.now() - new Date(c.aberto_em).getTime() > HORAS_CAIXA_URGENTE * 3_600_000;
}

// ─── Pendências ─────────────────────────────────────────────────────────
//
// Duas naturezas diferentes, por isso o `motivo` em vez de uma lista só:
// "aguardando aprovação" é decisão (alguém precisa dizer sim ou não) e
// "sem comprovante" é documentação faltando na prestação de contas do mês.
// Confundir as duas na mesma frase esconderia qual delas trava o quê.

export type MotivoPendencia = "aprovacao" | "comprovante";

export interface PendenciaLancamento extends FinLancamentoExtenso {
  motivo: MotivoPendencia;
}

/** Janela do "sem comprovante": mais que isto é história, não pendência do dia a dia. */
export const DIAS_JANELA_COMPROVANTE = 30;

export async function listarPendencias(): Promise<PendenciaLancamento[]> {
  const [aguardando, realizadosRecentes] = await Promise.all([
    // Sem `dataInicio`: aprovação parada é decisão em aberto, e fica mais
    // urgente com o tempo — não menos. Não faz sentido ela "expirar" da lista.
    listarLancamentos({ status: "aguardando_aprovacao" }),
    listarLancamentos({ status: "realizado", dataInicio: hojeMaisDias(-DIAS_JANELA_COMPROVANTE) }),
  ]);

  const semComprovante = realizadosRecentes.filter(l => !l.comprovante_url);

  return [
    ...aguardando.map(l => ({ ...l, motivo: "aprovacao" as const })),
    ...semComprovante.map(l => ({ ...l, motivo: "comprovante" as const })),
  ];
}

// ─── Próximos vencimentos ───────────────────────────────────────────────
//
// Janela de 7 dias — o mesmo horizonte que "esta semana" já nomeia dentro de
// `FinVencimento.urgencia`. Vencimento mais distante que isto é recorrência
// ou orçamento, não "próximo".
export const DIAS_JANELA_VENCIMENTOS = 7;

export async function listarVencimentosDaSemana(): Promise<FinVencimento[]> {
  return listarProximosVencimentos({ ateData: hojeMaisDias(DIAS_JANELA_VENCIMENTOS) });
}

// ─── Orçamento ──────────────────────────────────────────────────────────
//
// Só os dois tipos de alerta que falam de ORÇAMENTO ("acima_orcamento" e
// "orcamento_atencao"). `alertasCentros()` também devolve "crescimento" e
// "sem_movimento" — sinais reais, mas de outra pergunta ("este centro mudou
// de padrão?"), não da que este bloco responde ("algum centro estourou?").
// Misturar os quatro tipos aqui repetiria o defeito que o Painel Pastoral já
// corrigiu: uma seção que promete uma coisa e mostra outra.
export async function listarAlertasOrcamento(): Promise<FinAlertaCentro[]> {
  const todos = await alertasCentros();
  return todos.filter(a => a.tipo_alerta === "acima_orcamento" || a.tipo_alerta === "orcamento_atencao");
}
