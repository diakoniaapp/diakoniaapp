// ============================================================
// historicoFluxo.ts
// Helper para gravar log imutável de interações pastorais
// na tabela visita_historico
// ============================================================

import { supabase } from "@/integrations/supabase/client";

export type TipoHistorico =
  | "whatsapp"
  | "ligacao"
  | "visita_presencial"
  | "email"
  | "retorno_culto"
  | "evento"
  | "observacao"
  | "cadastro"
  | "promocao_congregado"
  | "promocao_membro";

/**
 * Insere um registro no histórico pastoral.
 * Silencia erros (não quebra o fluxo principal).
 */
export async function logHistorico(
  visitanteId: string,
  tipo: TipoHistorico,
  observacao?: string | null
): Promise<void> {
  try {
    await supabase
      .from("visita_historico")
      .insert({
        visitante_id: visitanteId,
        tipo,
        observacao: observacao?.trim() || null,
      });
  } catch {
    // silencia — histórico é secondary, nunca bloqueia ação principal
  }
}

/**
 * Labels e cores por tipo de evento histórico
 */
export const HISTORICO_CONFIG: Record<
  TipoHistorico,
  { label: string; cor: string; emoji: string }
> = {
  cadastro:            { label: "Primeiro culto",      emoji: "🏠", cor: "text-info-text bg-info-soft border-info-line" },
  whatsapp:            { label: "WhatsApp",             emoji: "💬", cor: "text-success-text bg-success-soft border-success-line" },
  ligacao:             { label: "Ligação",              emoji: "📞", cor: "text-info-text bg-info-soft border-info-line" },
  visita_presencial:   { label: "Visita presencial",    emoji: "🚪", cor: "text-warning-text bg-warning-soft border-warning-line" },
  retorno_culto:       { label: "Retornou ao culto",    emoji: "✅", cor: "text-warning-text bg-warning-soft border-warning-line" },
  evento:              { label: "Evento especial",      emoji: "📅", cor: "text-purple-600 bg-purple-50 border-purple-200" },
  observacao:          { label: "Contato registrado",   emoji: "📝", cor: "text-muted-foreground bg-muted border-border" },
  promocao_congregado: { label: "Tornou-se Congregado", emoji: "✨", cor: "text-success-text bg-success-soft border-success-line" },
  promocao_membro:     { label: "Tornou-se Membro",     emoji: "🌟", cor: "text-gold bg-warning-soft border-warning-line" },
  email:               { label: "E-mail",               emoji: "✉️", cor: "text-info-text bg-info-soft border-info-line" },
};
