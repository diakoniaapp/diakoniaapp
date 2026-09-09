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
  | "entrada_rol"
  | "cadastro_sistema"
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
  // "Primeiro culto" — só para VISITANTE. É a história real de quem chegou:
  // alguém apareceu, foi cadastrado, e aquela data É o primeiro culto.
  cadastro:            { label: "Primeiro culto",      emoji: "🏠", cor: "text-info-text bg-info-soft border-info-line" },
  // Membro/congregado com `data_entrada` conhecida — o marco real da
  // caminhada (assembleia, batismo...), não a data em que a LINHA nasceu
  // no banco. Ver `VisitanteTimeline.tsx` e o pedido dela em 09/09/2026.
  entrada_rol:         { label: "Entrada no rol",       emoji: "📜", cor: "text-gold bg-warning-soft border-warning-line" },
  // Membro/congregado SEM `data_entrada` — o fallback quando só se sabe
  // quando o cadastro foi digitado, nunca quando a pessoa entrou de fato.
  // Existe pra não deixar a ficha sem nenhum marco, mas não finge ser
  // "Primeiro culto": diz exatamente o que é.
  cadastro_sistema:    { label: "Cadastro no sistema",  emoji: "🗂️", cor: "text-muted-foreground bg-muted border-border" },
  whatsapp:            { label: "WhatsApp",             emoji: "💬", cor: "text-success-text bg-success-soft border-success-line" },
  ligacao:             { label: "Ligação",              emoji: "📞", cor: "text-info-text bg-info-soft border-info-line" },
  visita_presencial:   { label: "Visita presencial",    emoji: "🚪", cor: "text-warning-text bg-warning-soft border-warning-line" },
  retorno_culto:       { label: "Retornou ao culto",    emoji: "✅", cor: "text-warning-text bg-warning-soft border-warning-line" },
  evento:              { label: "Evento especial",      emoji: "📅", cor: "text-violeta-text bg-violeta-soft border-violeta-line" },
  observacao:          { label: "Contato registrado",   emoji: "📝", cor: "text-muted-foreground bg-muted border-border" },
  promocao_congregado: { label: "Tornou-se Congregado", emoji: "✨", cor: "text-success-text bg-success-soft border-success-line" },
  promocao_membro:     { label: "Tornou-se Membro",     emoji: "🌟", cor: "text-gold bg-warning-soft border-warning-line" },
  email:               { label: "E-mail",               emoji: "✉️", cor: "text-info-text bg-info-soft border-info-line" },
};
