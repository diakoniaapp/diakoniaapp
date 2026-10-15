// ─── mudarIntencao.ts — a ação "Mudar intenção" (Fase 2B): o que ela faz, o que bloqueia e o que a tela diz antes de confirmar ───────────────────────────
// Regra pura. O banco é quem manda (fin_mudar_intencao); aqui só se decide o que OFERECER e se redige a confirmação.

export type IntencaoTroca = "oferta" | "reembolso";
export const ROTULO_INTENCAO_TROCA: Record<IntencaoTroca, string> = { oferta: "Oferta", reembolso: "Reembolso" };

export function ehTrocavel(intencao: string): intencao is IntencaoTroca { return intencao === "oferta" || intencao === "reembolso"; }
export function intencaoOposta(atual: IntencaoTroca): IntencaoTroca { return atual === "oferta" ? "reembolso" : "oferta"; }

/** As consequências, na ordem em que o banco as executa. */
export function consequenciasDaMudanca(de: IntencaoTroca, para: IntencaoTroca): string[] {
  const c = [
    "A Declaração do Terceiro atual deixa de valer (a via antiga fica arquivada e visível no histórico).",
    "Toda aprovação já dada perde a validade: será preciso decidir de novo.",
    "A intenção volta a Relatado até a nova via ser assinada.",
    "A quitação é reavaliada e uma NOVA via da Declaração é gerada para o terceiro assinar.",
  ];
  if (de === "oferta") c.push("A obrigação deixa de estar quitada por terceiro: volta a ficar em aberto, e agora a igreja passa a dever o valor ao terceiro (reembolso), sujeito à aprovação.");
  else c.push("O reembolso deixa de ser uma dívida da igreja com o terceiro: passa a ser uma oferta, que só extingue a obrigação com a nota da igreja e a Declaração assinada.");
  return c;
}

export interface SituacaoParaTrocar {
  intencao: string;
  /** quanto do reembolso já foi pago (o saldo pago, no todo ou em parte) */
  reembolsado: number | null;
  /** a obrigação está em aberto (previsto ou quitada por terceiro) */
  aberta: boolean;
}

/** `null` = pode oferecer a ação; texto = por que não (a tela mostra o texto no lugar do botão). Enviada e período fechado quem diz é o banco, na hora. */
export function bloqueioDaMudanca(s: SituacaoParaTrocar): string | null {
  if (!ehTrocavel(s.intencao)) return null;
  if (!s.aberta) return null;                                    // despesa já paga/cancelada: o cartão nem oferece ações
  if (s.intencao === "reembolso" && (s.reembolsado ?? 0) > 0) return "Este reembolso já foi pago (no todo ou em parte): ele não volta a ser Oferta. Para desfazer o pagamento use o fluxo de estorno do reembolso.";
  return null;
}
