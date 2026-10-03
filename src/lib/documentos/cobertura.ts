// ─── lib/documentos/cobertura.ts — o KPI oficial: cobertura documental ──────
//
// Definição (decisão da Telma, 03/10/2026 — "passa a ser nosso indicador oficial"):
//
//   cobertura = saídas pagas que EXIGEM documento e TÊM pelo menos um anexo
//               ÷ saídas pagas que EXIGEM documento
//
// "Exige" = saída paga (realizado/conciliado), não transferência, de categoria que
// não dispensa documento (Tarifas Bancárias, IOF, Juros, Encargos Bancários) —
// ver `dispensaDocumento` em `lib/pacoteContabil.ts`. É a MESMA conta da tela de
// Auditoria de documentos (`resumirAuditoria`): `exigem = com + sem`.
//
// Linha de base medida em 03/10/2026: 2 de 772 saídas de 2026 = 0,3%.
// Documento de apoio: docs/LINHA_BASE_COBERTURA_DOCUMENTAL.md.

/** Onde estávamos antes da Central de Documentos. */
export const COBERTURA_LINHA_DE_BASE = {
  data: "03/10/2026",
  ano: 2026,
  comDocumento: 2,
  exigem: 772,
  percentual: 0.3,
} as const;

/** A trilha que ela quer acompanhar depois da implantação: 0,3% → 15% → 45% → 80%. */
export const COBERTURA_TRILHA: readonly number[] = [COBERTURA_LINHA_DE_BASE.percentual, 15, 45, 80];

/** Meta do projeto e meta ideal. */
export const COBERTURA_META = 80;
export const COBERTURA_META_IDEAL = 95;

/** 0–100, sem arredondar (quem formata decide). Sem saída que exija: 0. */
export function percentualCobertura(comDocumento: number, exigem: number): number {
  return exigem > 0 ? (comDocumento / exigem) * 100 : 0;
}

/** "0,3" · "15" · "45,2" — pt-BR, no máximo uma casa decimal (a linha de base é
 *  0,3%: arredondar pra inteiro mostraria "0%" e esconderia o que se acompanha). */
export function formatarPercentual(p: number): string {
  return p.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

export interface MarcoDaTrilha {
  valor: number;
  /** A cobertura de hoje já chegou nele. */
  atingido: boolean;
  /** É o marco que se persegue agora (o primeiro ainda não atingido). */
  proximo: boolean;
}

/** A trilha com o estado de cada marco. O primeiro (0,3%) é a linha de base e
 *  conta como atingido: ninguém está abaixo do ponto de partida. */
export function marcosDaTrilha(percentual: number): MarcoDaTrilha[] {
  let achouProximo = false;
  return COBERTURA_TRILHA.map((valor, i) => {
    const atingido = i === 0 || percentual >= valor;
    const proximo = !atingido && !achouProximo;
    if (proximo) achouProximo = true;
    return { valor, atingido, proximo };
  });
}

/** Quantos pontos percentuais faltam pro próximo marco (ou pra meta ideal, se a
 *  trilha já foi cumprida). `null` quando já passou da meta ideal. */
export function faltaParaOProximo(percentual: number): { alvo: number; pontos: number } | null {
  const proximo = marcosDaTrilha(percentual).find(m => m.proximo);
  if (proximo) return { alvo: proximo.valor, pontos: proximo.valor - percentual };
  if (percentual < COBERTURA_META_IDEAL) return { alvo: COBERTURA_META_IDEAL, pontos: COBERTURA_META_IDEAL - percentual };
  return null;
}
