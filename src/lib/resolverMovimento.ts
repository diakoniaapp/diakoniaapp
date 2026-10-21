// ─── lib/resolverMovimento.ts — a pergunta "O que este movimento do extrato é?", respondida em UM lugar (puro, testado) ──────────────────────────────
//
// Decisão dela (20/10/2026): a ordem H0 → H4. Antes desta função a resposta estava espalhada: `analisar` (as situações), `CartaoDaLinha` (condições de tela) e a
// guarda D3 (quem tem candidata). Agora o cartão, a guarda, a lista com painel (Fase 3) e a visão por obrigação leem o MESMO resultado.
//
//   H0  já registrado       — vincular (outro arquivo / lançamento já feito) ou conciliar com o realizado que casou
//   H1  obrigação aberta    — liquidar a conta (exata, com diferença, ou a escolher entre várias)
//   H2  recorrência         — o contrato existe, a conta do mês não: gerar e liquidar
//   H3  transferência/débito— transferência entre contas provável, ou débito automático previsto
//   H4  nada encontrado     — registrar como despesa/receita nova (só aqui entram categoria, centro, projeto)
//   resolvida               — já registrada pelo mesmo identificador, ou ignorada: nada a decidir

import type { DocumentoDoExtrato } from "./documentoDoExtrato";
import type { JaRegistrado } from "./movimentoJaRegistrado";
import type { RecorrenciaCompativel } from "./recorrenciaCompativel";

export interface LinhaResolvivel {
  tx: { tipo: string };
  situacao: string;
  lancamentoId?: string;
  semVinculo?: boolean;
  documentos?: DocumentoDoExtrato[];
  jaRegistrado?: JaRegistrado;
  recorrenciaCompativel?: RecorrenciaCompativel;
  debito?: unknown;
  transferenciaProvavel?: { confianca: number; contaNome?: string };
  sugestao?: { transferencia?: boolean };
}

export type Resolucao =
  | { h: "H0"; modo: "vincular"; lancamentoId: string; jaRegistrado: JaRegistrado }
  | { h: "H0"; modo: "conciliar"; lancamentoId: string; semVinculo: boolean }
  | { h: "H0"; modo: "ambigua" }
  | { h: "H1"; documento: DocumentoDoExtrato; exato: boolean; ambiguo: boolean; /** já é uma proposta de liquidação (a análise teve certeza) ou só a dica de uma conta provável */ proposta: boolean }
  | { h: "H2"; recorrencia: RecorrenciaCompativel }
  | { h: "H3"; modo: "debito" | "transferencia"; lancamentoId?: string }
  | { h: "H4" }
  | { h: "resolvida"; motivo: "ja_registrada" | "ignorada" };

export const ROTULO_DA_HIPOTESE: Record<Resolucao["h"], string> = {
  H0: "Já registrado", H1: "Conta em aberto", H2: "Recorrência", H3: "Transferência / débito", H4: "Nada encontrado", resolvida: "Resolvido",
};

/** Uma transferência provável a partir de 75% já tira a linha de receita/despesa (mesmo corte de `marcarTransferenciasProvaveis`). */
const CORTE_DA_TRANSFERENCIA = 75;

export function resolverMovimento(l: LinhaResolvivel): Resolucao {
  switch (l.situacao) {
    case "ignorada": return { h: "resolvida", motivo: "ignorada" };
    case "ja_registrada": return { h: "resolvida", motivo: "ja_registrada" };
    case "vincular":
      if (l.jaRegistrado && l.lancamentoId) return { h: "H0", modo: "vincular", lancamentoId: l.lancamentoId, jaRegistrado: l.jaRegistrado };
      break;
    case "conciliar":
      if (l.lancamentoId) return { h: "H0", modo: "conciliar", lancamentoId: l.lancamentoId, semVinculo: !!l.semVinculo };
      break;
    case "ambigua": return { h: "H0", modo: "ambigua" };
    case "debito_encontrado": return { h: "H3", modo: "debito", lancamentoId: l.lancamentoId };
    case "documento":
      if (l.documentos?.[0]) return h1(l.documentos[0], true);
      break;
    case "nova":
      // a conta em aberto vem ANTES da transferência provável: um pagamento de conta não vira transferência por ter o mesmo valor de um lançamento de outra conta
      if (l.documentos?.[0]) return h1(l.documentos[0], false);
      if (l.recorrenciaCompativel) return { h: "H2", recorrencia: l.recorrenciaCompativel };
      if (l.sugestao?.transferencia || (l.transferenciaProvavel && l.transferenciaProvavel.confianca >= CORTE_DA_TRANSFERENCIA)) return { h: "H3", modo: "transferencia" };
      break;
  }
  return { h: "H4" };
}

function h1(documento: DocumentoDoExtrato, proposta: boolean): Resolucao {
  return { h: "H1", documento, exato: !!documento.exato, ambiguo: !!documento.ambiguo, proposta };
}

/** A linha tem uma CANDIDATA (conta em aberto ou recorrência): criar despesa nova exige o motivo. */
export function temCandidata(r: Resolucao): boolean {
  return r.h === "H1" || r.h === "H2" || (r.h === "H0" && r.modo === "vincular");
}
