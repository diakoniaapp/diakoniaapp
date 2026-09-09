// ─── painelTesourariaService.ts — os dados do Painel da Tesouraria ────────
//
// Sprint 1 do plano "Bancada da Tesouraria" (08/09/2026): só o que a frase-
// resumo e os dois primeiros blocos precisam — fiscal e caixa, os dois riscos
// que custam dinheiro de verdade quando alguém deixa passar (multa e dinheiro
// em espécie sem responsável claro). Pendências, conciliação e orçamento
// entram nos sprints seguintes, sobre este mesmo arquivo.
//
// O bloco Fiscal não duplica lógica: reaproveita `carregarResumoFiscal()` de
// `fiscalService.ts`, o mesmo dado que já vira o widget `AgendaFiscalUrgente`
// — e é por isso que este painel EMBUTE aquele componente em vez de reler o
// resumo fiscal aqui dentro. Só o de Caixa é novo, porque não havia, em lugar
// nenhum do sistema, uma lista de "todos os caixas abertos agora".

import { supabase } from "@/integrations/supabase/client";

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
