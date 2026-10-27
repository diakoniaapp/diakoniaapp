// ─── lib/situacaoDoLancamentoNovo.ts — em que situação um lançamento NOVO nasce (puro, testado) ───────────────────────────────────────────────────────
//
// Auditoria da Tesouraria (27/10/2026, F-07): o formulário abria TODO lançamento novo como "Realizado". Para uma despesa isso registrava uma conta a pagar como já paga — mexia no saldo na hora e pulava a
// liquidação, a documentação exigida e o vínculo com o extrato. O modelo dela: a despesa NASCE PREVISTA; vira realizada quando é paga e conciliada quando o banco confirma.
//   · saída digitada à mão → Prevista;
//   · saída que vem do EXTRATO do banco (rascunho do OFX) → Realizada: o movimento já aconteceu;
//   · entrada → Realizada (a oferta do dia já entrou).
// "Conciliado" nunca se escolhe na criação: quem concilia é o vínculo com o extrato (ou a conferência, na edição).

export type SituacaoNova = "previsto" | "realizado";

export function situacaoInicial(tipo: "entrada" | "saida", vemDoExtrato: boolean): SituacaoNova {
  return tipo === "saida" && !vemDoExtrato ? "previsto" : "realizado";
}

/** A opção "Conciliado" do seletor de situação: só na edição, ou quando o lançamento nasce de uma linha do extrato. */
export const ofereceConciliado = (editando: boolean, vemDoExtrato: boolean): boolean => editando || vemDoExtrato;
