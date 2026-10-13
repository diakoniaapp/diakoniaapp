// ─── lib/encargos.ts — juros, multa e desconto como INFORMAÇÃO COMPLEMENTAR da obrigação (puro, testado) ─────────────────────────────────────────
//
// Decisão da tesouraria (opção A, 13/10/2026): uma obrigação continua sendo uma obrigação. O VALOR TOTAL PAGO fica na categoria do documento ("Impostos e
// Taxas" recebe os R$ 325,20 da guia do IPTU); juros, multa e desconto são campos dela, mostrados SEPARADAMENTE como informação complementar — nunca como
// linha do DRE, do orçamento ou do extrato. Aqui: o que há de encargo num lançamento e a soma de um conjunto deles.

export interface CamposDeEncargo {
  valor?: number | string | null;
  valor_original?: number | string | null;
  juros?: number | string | null;
  multa?: number | string | null;
  complemento?: number | string | null;
  ajuste?: number | string | null;
  desconto?: number | string | null;
}

const n = (v: unknown) => Math.round((Number(v) || 0) * 100) / 100;

export interface ItemDeEncargo { chave: "juros" | "multa" | "complemento" | "ajuste" | "desconto"; rotulo: string; valor: number }

const ROTULO: Record<ItemDeEncargo["chave"], string> = { juros: "Juros", multa: "Multa", complemento: "Complemento", ajuste: "Ajuste", desconto: "Desconto" };

/** Só o que existe (valor ≠ 0), na ordem de leitura da tesouraria. */
export function itensDeEncargo(l: CamposDeEncargo): ItemDeEncargo[] {
  return (["juros", "multa", "complemento", "ajuste", "desconto"] as const)
    .map(chave => ({ chave, rotulo: ROTULO[chave], valor: n(l[chave]) }))
    .filter(i => i.valor > 0.004);
}

export const temEncargos = (l: CamposDeEncargo) => itensDeEncargo(l).length > 0;

/**
 * "Valor original R$ 312,70 · Multa R$ 12,50" — a frase curta que acompanha a linha do extrato. Sem encargo, null.
 * O valor original é `valor_original` ou, na falta dele, o que sobra de `valor` tirando os encargos pagos a mais (e somando o desconto).
 */
export function resumoDoEncargo(l: CamposDeEncargo, formatar: (v: number) => string): string | null {
  const itens = itensDeEncargo(l);
  if (itens.length === 0) return null;
  const aMais = itens.filter(i => i.chave !== "desconto").reduce((s, i) => s + i.valor, 0);
  const desconto = itens.find(i => i.chave === "desconto")?.valor ?? 0;
  const original = l.valor_original != null && n(l.valor_original) > 0 ? n(l.valor_original) : n(n(l.valor) - aMais + desconto);
  return [`Valor original ${formatar(original)}`, ...itens.map(i => `${i.rotulo} ${i.chave === "desconto" ? "− " : ""}${formatar(i.valor)}`)].join(" · ");
}

export interface TotaisDeEncargos {
  juros: number; multas: number; descontos: number; outros: number;
  /** obrigações com algum encargo ou ajuste */ obrigacoes: number;
  /** só as que têm juros, multa ou desconto — as que os três indicadores mostram */ comIndicador: number;
}

/** Os três indicadores complementares (e "outros" = complemento + ajuste) de um conjunto de lançamentos. */
export function somarEncargos(lancamentos: CamposDeEncargo[]): TotaisDeEncargos {
  let juros = 0, multas = 0, descontos = 0, outros = 0, obrigacoes = 0, comIndicador = 0;
  for (const l of lancamentos) {
    if (!temEncargos(l)) continue;
    obrigacoes++;
    if (n(l.juros) > 0 || n(l.multa) > 0 || n(l.desconto) > 0) comIndicador++;
    juros += n(l.juros); multas += n(l.multa); descontos += n(l.desconto); outros += n(l.complemento) + n(l.ajuste);
  }
  const c = (x: number) => Math.round(x * 100) / 100;
  return { juros: c(juros), multas: c(multas), descontos: c(descontos), outros: c(outros), obrigacoes, comIndicador };
}
