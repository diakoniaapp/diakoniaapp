// ─── lib/sondagemDeRegras.ts — o RESUMO da sondagem das regras de atraso nos anexos existentes (puro, testado) ───────────────────────────────────────────────────────────────────
//
// Fase 0 da proposta (docs/ANALISE_REGRAS_DE_ATRASO_2026-10-27.md): antes de construir, medir com os documentos DA IGREJA quantos trazem multa/juros legíveis. A sondagem SÓ LÊ — nada é gravado.
// Cada anexo vira um `ResultadoDaSondagem`; aqui se contam por situação e por favorecido.

export type SituacaoDoAnexo = "com_regra" | "so_multa" | "so_juros" | "sem_regra" | "sem_texto" | "erro";

export interface ResultadoDaSondagem {
  anexoId: string;
  tipo: string;
  favorecido: string | null;
  situacao: SituacaoDoAnexo;
  multa: boolean;
  juros: boolean;
  desconto: boolean;
  naoReceberApos: boolean;
  correcao: string | null;
  /** confiança do leitor (0–100) */
  confianca: number;
  /** o trecho original que gerou a regra (só o das regras, nunca o texto inteiro do documento) */
  trechos: string[];
}

export function situacaoDe(r: { multa: boolean; juros: boolean }): SituacaoDoAnexo {
  return r.multa && r.juros ? "com_regra" : r.multa ? "so_multa" : r.juros ? "so_juros" : "sem_regra";
}

export interface ResumoPorFavorecido { favorecido: string; anexos: number; comRegra: number; pct: number }
export interface ResumoDaSondagem {
  total: number;
  porSituacao: Record<SituacaoDoAnexo, number>;
  /** dos que tiveram TEXTO lido (os escaneados sem texto não contam para a taxa) */
  lidos: number;
  /** multa E juros legíveis, sobre os lidos */
  pctComRegraCompleta: number | null;
  /** pelo menos multa OU juros, sobre os lidos */
  pctComAlgumaRegra: number | null;
  semTextoPct: number | null;
  naoReceberApos: number;
  comDesconto: number;
  comCorrecao: number;
  /** os favorecidos mais frequentes, com a taxa de cada um */
  porFavorecido: ResumoPorFavorecido[];
  /** alguns trechos de exemplo (distintos), para ver o formato real dos documentos */
  exemplos: string[];
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);

export function resumirSondagem(resultados: readonly ResultadoDaSondagem[], maxFavorecidos = 15, maxExemplos = 8): ResumoDaSondagem {
  const porSituacao: Record<SituacaoDoAnexo, number> = { com_regra: 0, so_multa: 0, so_juros: 0, sem_regra: 0, sem_texto: 0, erro: 0 };
  for (const r of resultados) porSituacao[r.situacao]++;
  const lidos = porSituacao.com_regra + porSituacao.so_multa + porSituacao.so_juros + porSituacao.sem_regra;
  const algum = porSituacao.com_regra + porSituacao.so_multa + porSituacao.so_juros;

  const fav = new Map<string, { anexos: number; comRegra: number }>();
  for (const r of resultados) {
    if (r.situacao === "sem_texto" || r.situacao === "erro") continue;
    const k = r.favorecido?.trim() || "(sem favorecido)";
    const e = fav.get(k) ?? { anexos: 0, comRegra: 0 };
    e.anexos++;
    if (r.situacao !== "sem_regra") e.comRegra++;
    fav.set(k, e);
  }
  const porFavorecido = [...fav.entries()].map(([favorecido, e]) => ({ favorecido, anexos: e.anexos, comRegra: e.comRegra, pct: pct(e.comRegra, e.anexos) ?? 0 }))
    .sort((a, b) => b.anexos - a.anexos || a.favorecido.localeCompare(b.favorecido, "pt-BR")).slice(0, maxFavorecidos);

  const exemplos: string[] = [];
  for (const r of resultados) for (const t of r.trechos) if (!exemplos.includes(t) && exemplos.length < maxExemplos) exemplos.push(t);

  return {
    total: resultados.length, porSituacao, lidos,
    pctComRegraCompleta: pct(porSituacao.com_regra, lidos), pctComAlgumaRegra: pct(algum, lidos),
    semTextoPct: pct(porSituacao.sem_texto, resultados.length),
    naoReceberApos: resultados.filter(r => r.naoReceberApos).length,
    comDesconto: resultados.filter(r => r.desconto).length,
    comCorrecao: resultados.filter(r => r.correcao).length,
    porFavorecido, exemplos,
  };
}
