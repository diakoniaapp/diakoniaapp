// ─── lib/documentos/arrecadacao.ts — código de barras / linha digitável de ARRECADAÇÃO ───
//
// `lib/boleto.ts` decodifica o boleto de COBRANÇA (47 dígitos) e recusa o de 48 ("conta de
// consumo"). Guia (DARF, GPS, FGTS, ISS, taxas) e fatura de concessionária (luz, água, telefone)
// usam o padrão FEBRABAN de ARRECADAÇÃO: o código de barras começa com 8 e a linha digitável tem
// 48 dígitos, em 4 blocos de 11 + 1 dígito verificador.
//
// Código de barras (44):
//   1      produto — sempre 8 (arrecadação)
//   2      segmento (1 prefeitura · 2 saneamento · 3 energia/gás · 4 telecom · 5 órgãos
//          governamentais · 6 carnês/assemelhados · 7 multas de trânsito · 9 uso do banco)
//   3      valor: 6 = efetivo/mód.10 · 7 = referência/mód.10 · 8 = efetivo/mód.11 · 9 = referência/mód.11
//   4      DV geral
//   5–15   valor (11 dígitos, centavos) — só quando o identificador diz "efetivo"
//   16–44  identificação da empresa/órgão e campo livre (varia por convênio)
//
// O VENCIMENTO não é padronizado nesse código (cada convênio põe o seu no campo livre): ele vem do
// TEXTO do documento. Aqui só o que é exato: tipo, valor e os dígitos verificadores.

export type SegmentoDeArrecadacao =
  | "prefeitura" | "saneamento" | "energia_gas" | "telecomunicacoes" | "orgao_governamental"
  | "carne" | "transito" | "uso_do_banco" | "outro";

export const ROTULO_DO_SEGMENTO: Record<SegmentoDeArrecadacao, string> = {
  prefeitura: "Prefeitura", saneamento: "Água e esgoto", energia_gas: "Energia / gás",
  telecomunicacoes: "Telecomunicações", orgao_governamental: "Órgão governamental",
  carne: "Carnê / assemelhados", transito: "Multa de trânsito", uso_do_banco: "Uso exclusivo do banco", outro: "Arrecadação",
};

const SEGMENTOS: Record<string, SegmentoDeArrecadacao> = {
  "1": "prefeitura", "2": "saneamento", "3": "energia_gas", "4": "telecomunicacoes",
  "5": "orgao_governamental", "6": "carne", "7": "transito", "9": "uso_do_banco",
};

export interface ArrecadacaoDecodificada {
  /** 44 dígitos. */
  codigoBarras: string;
  /** 48 dígitos (4 × 11 + DV). */
  linhaDigitavel: string;
  segmento: SegmentoDeArrecadacao;
  /** `null` quando o documento só traz valor de referência (o valor está no texto). */
  valor: number | null;
  /** 4 primeiros dígitos da identificação da empresa/órgão — a chave do CONVÊNIO. */
  empresa: string;
  /** Os 4 DVs de bloco (e o geral) conferem. */
  dvConfere: boolean;
}

const soDigitos = (s: string) => s.replace(/\D/g, "");

function modulo10(campo: string): number {
  let soma = 0, peso = 2;
  for (let i = campo.length - 1; i >= 0; i--) {
    let p = Number(campo[i]) * peso;
    if (p > 9) p = Math.floor(p / 10) + (p % 10);
    soma += p;
    peso = peso === 2 ? 1 : 2;
  }
  const r = soma % 10;
  return r === 0 ? 0 : 10 - r;
}

/** Módulo 11 da arrecadação: pesos 2–9 da direita para a esquerda; resto 0 ou 1 → DV 0. */
function modulo11(campo: string): number {
  let soma = 0, peso = 2;
  for (let i = campo.length - 1; i >= 0; i--) {
    soma += Number(campo[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const r = soma % 11;
  return r === 0 || r === 1 ? 0 : 11 - r;
}

const dvDe = (campo: string, mod11: boolean) => (mod11 ? modulo11(campo) : modulo10(campo));

/** `true` para um código de barras de 44 dígitos ou uma linha de 48 que é de arrecadação. */
export function ehArrecadacao(entrada: string): boolean {
  const d = soDigitos(entrada);
  return (d.length === 44 || d.length === 48) && d[0] === "8";
}

/** Lança erro com mensagem para a tela quando o tamanho não serve; os DVs vão em `dvConfere`. */
export function decodificarArrecadacao(entrada: string): ArrecadacaoDecodificada {
  const d = soDigitos(entrada);
  if (d[0] !== "8") throw new Error("Não é um código de arrecadação (deveria começar com 8).");

  let barras: string;
  let dvsDeBloco = true;
  if (d.length === 48) {
    const mod11 = d[2] === "8" || d[2] === "9";
    barras = "";
    for (let b = 0; b < 4; b++) {
      const bloco = d.slice(b * 12, b * 12 + 11);
      if (dvDe(bloco, mod11) !== Number(d[b * 12 + 11])) dvsDeBloco = false;
      barras += bloco;
    }
  } else if (d.length === 44) {
    barras = d;
  } else {
    throw new Error(`Código de arrecadação tem 44 ou 48 números — encontrei ${d.length}.`);
  }

  const mod11 = barras[2] === "8" || barras[2] === "9";
  const semDvGeral = barras.slice(0, 3) + barras.slice(4);
  const dvGeralOk = dvDe(semDvGeral, mod11) === Number(barras[3]);

  const linha = d.length === 48 ? d : Array.from({ length: 4 }, (_, b) => {
    const bloco = barras.slice(b * 11, b * 11 + 11);
    return bloco + dvDe(bloco, mod11);
  }).join("");

  const efetivo = barras[2] === "6" || barras[2] === "8";
  const centavos = Number(barras.slice(4, 15));
  return {
    codigoBarras: barras,
    linhaDigitavel: linha,
    segmento: SEGMENTOS[barras[1]] ?? "outro",
    valor: efetivo && centavos > 0 ? centavos / 100 : null,
    empresa: barras.slice(15, 19),
    dvConfere: dvsDeBloco && dvGeralOk,
  };
}
