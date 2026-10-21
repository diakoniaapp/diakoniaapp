// ─── lib/movimentoJaRegistrado.ts — H0: este movimento do extrato JÁ está registrado? (puro, testado) ───────────────
//
// ACHADO de 20/10/2026 (docs/ANALISE_CONCILIACAO_POR_OBRIGACAO_2026-10-20.md): o FITID do Bradesco NÃO é estável entre exportações — ele
// depende da posição da linha no arquivo (o PIX de R$ 760 de 02/10 é N11D35 no arquivo de 08/10 e N10335 no de 20/10). A análise só
// reconhecia o que já importou por FITID igual; a regra de 08/10 ainda EXCLUÍA, como "pertencente a outra linha", todo lançamento que
// carregasse uma marca [ofx:…]. Resultado: reimportar um arquivo que se sobrepõe ao anterior gravou 52 movimentos em duplicidade.
//
// Aqui a identidade do movimento é a IMPRESSÃO DIGITAL — sentido + valor + dia — pareada 1 PARA 1:
//   · quem entra no pareamento são lançamentos que já têm dono (marca [ofx:…] ou liquidação com identificador do banco), nunca previstos;
//   · se TODAS as marcas do lançamento estão neste arquivo, ele pertence a uma linha daqui (já foi reconhecido pelo FITID): fica de fora;
//   · cada lançamento serve a UMA linha; duas linhas iguais no dia só casam com dois lançamentos (o n-ésimo com o n-ésimo), então dois PIX de
//     R$ 20 no mesmo dia não se confundem com um só;
//   · o dia do lançamento é o do pagamento (`data_pagamento`) ou o da `data`: uma recorrência vence dia 05 e o banco debitou dia 02.
// O resultado é só uma PROPOSTA ("Vincular"): a pessoa confirma, ou diz "é outro pagamento".

export interface LancamentoComDono {
  id: string;
  tipo: "entrada" | "saida";
  valor: number;
  /** vencimento/data do lançamento AAAA-MM-DD */
  data: string;
  data_pagamento?: string | null;
  /** os identificadores do banco que ele já carrega (marcas [ofx:…] e o da liquidação) */
  fitids: string[];
  origem: string;
  status: string;
  /** para a ordem estável do pareamento */
  criadoEm: string;
  /** como a tela chama o lançamento (favorecido/descrição) */
  rotulo?: string | null;
}

export interface MovimentoDoArquivo { fitid: string; tipo: "entrada" | "saida"; valor: number; data: string }

export interface JaRegistrado {
  lancamento: LancamentoComDono;
  /** um dos identificadores que o lançamento já carrega (o do outro arquivo) */
  fitidAntigo: string;
  /** o lançamento tem exatamente o dia do banco no pagamento (mais forte que só o vencimento igual) */
  mesmoDiaDePagamento: boolean;
  motivo: string;
}

const dinheiro = (n: number) => n.toFixed(2);
const dm = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
const chave = (tipo: string, valor: number, dia: string) => `${tipo}|${dinheiro(valor)}|${dia}`;

const COMO_FOI: Record<string, string> = {
  recorrencia: "a recorrência, já baixada", manual: "lançado à mão", importado_ofx: "importado de outro arquivo OFX", importado_omie: "trazido do Omie",
  transferencia: "registrado como transferência",
};

/**
 * Para cada linha do arquivo que NÃO foi reconhecida por FITID, o lançamento que já representa aquele movimento (se houver).
 * `linhas` na ordem do arquivo; devolve um mapa fitid → lançamento.
 */
export function acharJaRegistrados(
  linhas: MovimentoDoArquivo[],
  lancamentos: LancamentoComDono[],
  fitidsDoArquivo: ReadonlySet<string>,
): Map<string, JaRegistrado> {
  const out = new Map<string, JaRegistrado>();
  const elegiveis = lancamentos
    .filter(l => l.status !== "previsto" && l.fitids.length > 0 && !l.fitids.some(f => fitidsDoArquivo.has(f)))
    .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm) || a.id.localeCompare(b.id));

  const porChave = new Map<string, LancamentoComDono[]>();
  for (const l of elegiveis) {
    const dias = new Set([l.data_pagamento ? String(l.data_pagamento).slice(0, 10) : null, String(l.data).slice(0, 10)].filter((d): d is string => !!d));
    for (const d of dias) {
      const k = chave(l.tipo, l.valor, d);
      if (!porChave.has(k)) porChave.set(k, []);
      porChave.get(k)!.push(l);
    }
  }

  const usados = new Set<string>();
  for (const linha of linhas) {
    const candidatos = (porChave.get(chave(linha.tipo, linha.valor, linha.data)) ?? []).filter(l => !usados.has(l.id));
    if (candidatos.length === 0) continue;
    // o que o banco debitou NAQUELE dia vale mais do que o que só venceu naquele dia
    const escolhido = candidatos.find(l => l.data_pagamento && String(l.data_pagamento).slice(0, 10) === linha.data) ?? candidatos[0];
    usados.add(escolhido.id);
    const fitidAntigo = escolhido.fitids[0];
    out.set(linha.fitid, {
      lancamento: escolhido, fitidAntigo,
      mesmoDiaDePagamento: !!escolhido.data_pagamento && String(escolhido.data_pagamento).slice(0, 10) === linha.data,
      motivo: `${COMO_FOI[escolhido.origem] ?? "já registrado"}${escolhido.rotulo ? ` (${escolhido.rotulo})` : ""} — mesmo valor e mesmo dia (${dm(linha.data)}); ` +
        `o identificador do banco era ${fitidAntigo} e neste arquivo é ${linha.fitid} (o banco numera cada exportação)`,
    });
  }
  return out;
}

/** Os identificadores do banco que um texto de observações carrega: `[ofx:FITID]`. (As marcas do PDF do Invest Fácil — `[ofx:PDF:…]` — não são do OFX.) */
export function fitidsDasObservacoes(observacoes: string | null | undefined): string[] {
  const out: string[] = [];
  for (const m of (observacoes ?? "").matchAll(/\[ofx:([^\]]+)\]/g)) if (!m[1].startsWith("PDF:")) out.push(m[1]);
  return out;
}
