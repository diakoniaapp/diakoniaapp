// ─── boleto.ts — decodificação de linha digitável de boleto bancário ─────
//
// Fase 4.2 do roadmap Financeiro (docs/ROADMAP_FINANCEIRO_ERP.md) — leitor
// de boleto, começando pela parte que não depende de câmera nem de
// decisão da Telma: colar os 47 dígitos da linha digitável e decodificar
// valor + vencimento de forma determinística. Não é OCR nem "achismo" —
// a linha digitável tem posições fixas e dígito verificador (módulo 10)
// em cada um dos 3 primeiros campos, então dá pra confirmar que os
// números foram digitados/colados certo antes de usar.
//
// Estrutura dos 47 dígitos (padrão FEBRABAN, boleto de COBRANÇA — conta
// de consumo/convênio é outro formato, de 48 dígitos com módulo 11 nos 4
// campos, fora do escopo desta primeira versão):
//   Campo 1 (10): banco(3) + moeda(1) + campo-livre(5) + DV(1)
//   Campo 2 (11): campo-livre(10) + DV(1)
//   Campo 3 (11): campo-livre(10) + DV(1)
//   Campo 4 (1):  DV geral (módulo 11 sobre os 44 dígitos do código de
//                 barras) — NÃO verificado aqui, ver nota abaixo
//   Campo 5 (14): fator de vencimento(4) + valor(10)
//
// O DV geral fica de fora de propósito: seu módulo 11 tem uma regra de
// exceção pra resto 0/1/10 fácil de implementar errado, e os 3 DVs de
// campo (módulo 10, mais simples) já pegam a esmagadora maioria dos erros
// de digitação — arriscar um checksum financeiro errado por cobrir o
// último caso vale menos que declarar o limite.
import { daquiADias } from "./data";

export interface BoletoDecodificado {
  linhaDigitavel: string;      // só os dígitos, 47
  banco: string;                // código do banco, 3 dígitos
  valor: number | null;        // null se o boleto não fixa valor (alguns não fixam)
  vencimento: string | null;   // YYYY-MM-DD, null se o fator vier zerado
}

// 07/10/1997 — dia 0 da tabela CLÁSSICA de fator de vencimento FEBRABAN.
// Achado numa revisão em 13/09/2026 (não tinha sido considerado quando
// este arquivo foi escrito, no mesmo dia): o fator chegou no teto 9999
// em 21/02/2025, e a FEBRABAN reiniciou a contagem pra 1000 a partir de
// 22/02/2025 — confirmado com fontes do setor (Sankhya, KMEE, Senior,
// fev/2025). Sem isso, TODO boleto lido depois de 21/02/2025 (ou seja,
// qualquer um lido por este sistema, já que hoje é 13/09/2026) decodifica
// pra uma data ~24 anos no passado, porque o mesmo fator pequeno agora
// significa outra data. Fator nunca foi < 1000 em nenhum dos dois ciclos
// (a tabela clássica também só usava 1000-9999 na prática), então
// `fator >= 1000` sempre cai no ciclo novo — o `< 1000` só existe aqui
// por segurança, não porque aconteça de verdade. Isso volta a quebrar
// perto de 2049, quando o fator novo chegar em 9999 de novo.
const EPOCA_FATOR_CLASSICA = "1997-10-07";
const EPOCA_FATOR_NOVA = "2025-02-22"; // fator 1000 = este dia

function soDigitos(s: string): string {
  return s.replace(/\D/g, "");
}

/** Dígito verificador módulo 10 de um campo (sem o DV) — peso 2,1,2,1... da direita pra esquerda. */
function modulo10(campoSemDv: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = campoSemDv.length - 1; i >= 0; i--) {
    let parcial = Number(campoSemDv[i]) * peso;
    if (parcial > 9) parcial = Math.floor(parcial / 10) + (parcial % 10);
    soma += parcial;
    peso = peso === 2 ? 1 : 2;
  }
  const resto = soma % 10;
  return resto === 0 ? 0 : 10 - resto;
}

/**
 * Decodifica uma linha digitável de boleto de COBRANÇA (47 dígitos).
 * Lança erro com mensagem pra tela se o tamanho ou algum DV de campo não
 * baterem — nunca devolve um valor/vencimento "no chute".
 */
export function decodificarLinhaDigitavel(entrada: string): BoletoDecodificado {
  const digitos = soDigitos(entrada);
  if (digitos.length !== 47) {
    throw new Error(
      digitos.length === 48
        ? "Isto parece conta de consumo (água, luz, telefone) — só boleto bancário é suportado por enquanto."
        : `A linha digitável de um boleto tem 47 números — encontrei ${digitos.length}.`,
    );
  }

  const campo1 = digitos.slice(0, 9);
  const dv1 = Number(digitos[9]);
  const campo2 = digitos.slice(10, 20);
  const dv2 = Number(digitos[20]);
  const campo3 = digitos.slice(21, 31);
  const dv3 = Number(digitos[31]);
  // digitos[32] = DV geral — não verificado, ver comentário no topo do arquivo.
  const fatorVencimento = digitos.slice(33, 37);
  const valorStr = digitos.slice(37, 47);

  if (modulo10(campo1) !== dv1 || modulo10(campo2) !== dv2 || modulo10(campo3) !== dv3) {
    throw new Error("Os números não conferem — confira se a linha digitável foi digitada/colada certa.");
  }

  const fator = Number(fatorVencimento);
  const vencimento = fator <= 0 ? null
    : fator >= 1000 ? daquiADias(EPOCA_FATOR_NOVA, fator - 1000)
    : daquiADias(EPOCA_FATOR_CLASSICA, fator);

  const valorCentavos = Number(valorStr);
  const valor = valorCentavos > 0 ? valorCentavos / 100 : null;

  return { linhaDigitavel: digitos, banco: digitos.slice(0, 3), valor, vencimento };
}

/**
 * Converte o código de barras impresso (44 dígitos, o que uma leitora de
 * câmera decodifica da listra — formato Interleaved 2 of 5) pra linha
 * digitável (47 dígitos, o que `decodificarLinhaDigitavel` espera).
 *
 * Pedido da Telma em 15/09/2026: "câmera ou leitor de código de barras" —
 * ler a listra em vez de digitar/colar os 47 números à mão. O código de
 * barras e a linha digitável carregam a MESMA informação em ordens
 * diferentes; a linha digitável só acrescenta 3 dígitos verificadores
 * (módulo 10, um por campo) que o código de barras não tem — por isso dá
 * pra reconstruir uma a partir da outra sem perder nada, sem chamada de
 * rede, com o mesmo `modulo10` que já decodifica a linha digitável.
 *
 * Layout do código de barras (padrão FEBRABAN, boleto de cobrança):
 *   banco(3) + moeda(1) + DV geral(1) + fator de vencimento(4) + valor(10)
 *   + campo livre(25)
 */
export function codigoBarrasParaLinhaDigitavel(entrada: string): string {
  const digitos = soDigitos(entrada);
  if (digitos.length !== 44) {
    throw new Error(`O código de barras de um boleto tem 44 números — encontrei ${digitos.length}.`);
  }

  const banco = digitos.slice(0, 3);
  const moeda = digitos.slice(3, 4);
  const dvGeral = digitos.slice(4, 5);
  const fatorValor = digitos.slice(5, 19); // fator de vencimento(4) + valor(10)
  const campoLivre = digitos.slice(19, 44); // 25 dígitos

  const campo1SemDv = banco + moeda + campoLivre.slice(0, 5);
  const campo2SemDv = campoLivre.slice(5, 15);
  const campo3SemDv = campoLivre.slice(15, 25);

  return campo1SemDv + modulo10(campo1SemDv)
    + campo2SemDv + modulo10(campo2SemDv)
    + campo3SemDv + modulo10(campo3SemDv)
    + dvGeral + fatorValor;
}

/** Lê tanto código de barras (44) quanto linha digitável (47) — o que a
 *  câmera/leitor devolver — e decodifica. Ponto único que
 *  `LeitorCodigoBarras.tsx` chama, pra não espalhar o "qual formato é
 *  esse" pela tela. */
export function decodificarBoleto(entrada: string): BoletoDecodificado {
  const digitos = soDigitos(entrada);
  if (digitos.length === 44) return decodificarLinhaDigitavel(codigoBarrasParaLinhaDigitavel(digitos));
  return decodificarLinhaDigitavel(digitos);
}
