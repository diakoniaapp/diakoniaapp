// ─── faturaCartao.ts — leitura do extrato de cartão Bradesco (por cartão) ──
//
// Pedido da Telma (15/09/2026): trazer os pagamentos de 2024 do cartão
// Visa pro sistema — não passaram pelo Omie (só os anos seguintes
// passaram). Ela só tem os PDFs de fatura, não um CSV do Omie.
//
// Calibrado em cima de dois extratos REAIS de janeiro/2024 (baixados por
// ela, um por titular de cartão — a conta tem vários cartões, um por
// pessoa: "MARIA R M ALVES", "SIDNEY V FILHO"...). Formato "Net Empresa"
// do Bradesco — bem mais simples que a Consulta da NF-e (ocrService.ts):
// cada linha de transação já sai inteira, sem o problema de rótulo numa
// linha e valor na linha seguinte.
//
// Achado real ao ler os dois extratos: as datas da tabela vêm só "DD/MM",
// SEM ano — e não são todas do mês da fatura. A fatura de Janeiro/2024
// (venc. 10/01/2024) trazia transações de 01/09, 05/12 e 20/04, 30/11,
// 01/12, todas de 2023 (a fatura fecha ~10 dias antes do vencimento e
// cobre o mês anterior; uma parcela "009/009" pode carregar a data da
// COMPRA original, meses atrás). Regra usada: se o mês da transação for
// MAIOR que o mês de referência da fatura, o ano é o ANTERIOR ao da
// fatura; senão, é o mesmo ano — testado contra as duas faturas reais
// (nenhuma data caiu no ano errado).
import { textoDoPdf } from "@/services/ocrService";

export interface TransacaoFatura {
  data: string;          // ISO YYYY-MM-DD, já com o ano inferido
  dataRelativa: string;  // "DD/MM" como veio no extrato — pra conferência
  historico: string;
  valor: number;          // sempre positivo — sinal vira `tipo`
  tipo: "entrada" | "saida"; // "entrada" = estorno/crédito (valor negativo no extrato)
}

export interface FaturaCartaoLida {
  titular: string;           // "MARIA R M ALVES" (sem o "- VISA")
  numeroCartao: string;      // só os 4 últimos dígitos visíveis, "XXXX.XXXX.XXXX.7682"
  mesReferencia: number;     // 1-12
  anoReferencia: number;
  dataVencimento: string | null; // ISO
  transacoes: TransacaoFatura[];
  totalDeclarado: number | null; // "Total:" do extrato — pra conferir contra a soma das linhas
  totalCalculado: number;        // soma de `transacoes` (saída − entrada)
}

const NOME_MES: Record<string, number> = {
  janeiro: 1, fevereiro: 2, março: 3, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

function paraNumeroBr(s: string): number {
  return parseFloat(s.replace(/\s/g, "").replace(/\./g, "").replace(",", "."));
}

// "01/09 AUDIO SETUP 004/005 0,00 0,0000 376,20" — data, histórico, US$
// (2 casas), cotação US$ (4 casas — distingue de US$ pela quantidade de
// dígitos depois da vírgula, mesmo truque usado pra separar quantidade de
// valor nos itens de nota fiscal), R$ (2 casas, pode vir negativo com um
// espaço antes do sinal: "- 64,79", um estorno).
const REGEX_LINHA_TRANSACAO =
  /^(\d{2}\/\d{2})\s+(.+?)\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s+(\d+,\d{4})\s+(-?\s?\d{1,3}(?:\.\d{3})*,\d{2})$/;

function inferirAno(mesTransacao: number, mesReferencia: number, anoReferencia: number): number {
  return mesTransacao > mesReferencia ? anoReferencia - 1 : anoReferencia;
}

/** Lê um texto já extraído (via `textoDoPdf`) de UM extrato de cartão —
    um titular, um mês. Devolve `null` quando o texto não bate com o
    formato reconhecido (não inventa titular/transação de um formato não
    calibrado — mesma regra do `extrairItensDaNota`). */
export function lerFaturaCartao(texto: string): FaturaCartaoLida | null {
  const mNome = texto.match(/Nome:\s*([^\n]+?)\s*-\s*VISA/i);
  const mCartao = texto.match(/Número do cartão:\s*([^\n]+)/i);
  const mMes = texto.match(/Mês:\s*([A-Za-zçÇãÃ]+)\/(\d{4})/i);
  const mVenc = texto.match(/Data de vencimento:\s*(\d{2})\/(\d{2})\/(\d{4})/i);

  if (!mNome || !mMes) return null;
  const mesReferencia = NOME_MES[mMes[1].toLowerCase()];
  if (!mesReferencia) return null;
  const anoReferencia = Number(mMes[2]);

  const dataVencimento = mVenc ? `${mVenc[3]}-${mVenc[2]}-${mVenc[1]}` : null;

  const transacoes: TransacaoFatura[] = [];
  for (const linhaBruta of texto.split("\n")) {
    const linha = linhaBruta.trim();
    const m = linha.match(REGEX_LINHA_TRANSACAO);
    if (!m) continue;
    const [, dataRelativa, historico, , , valorTexto] = m;
    const [dd, mm] = dataRelativa.split("/").map(Number);
    const ano = inferirAno(mm, mesReferencia, anoReferencia);
    const valorBruto = paraNumeroBr(valorTexto);
    transacoes.push({
      data: `${ano}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`,
      dataRelativa,
      historico: historico.trim(),
      valor: Math.abs(valorBruto),
      tipo: valorBruto < 0 ? "entrada" : "saida",
    });
  }

  const mTotal = texto.match(/\nTotal:\s*[\d,.]+\s+(-?\s?\d{1,3}(?:\.\d{3})*,\d{2})/i);
  const totalDeclarado = mTotal ? paraNumeroBr(mTotal[1]) : null;
  const totalCalculado = transacoes.reduce(
    (s, t) => s + (t.tipo === "saida" ? t.valor : -t.valor), 0,
  );

  return {
    titular: mNome[1].trim(),
    numeroCartao: mCartao ? mCartao[1].trim() : "",
    mesReferencia,
    anoReferencia,
    dataVencimento,
    transacoes,
    totalDeclarado,
    totalCalculado: Math.round(totalCalculado * 100) / 100,
  };
}

/** Lê um arquivo PDF de fatura direto — usa `textoDoPdf` (texto exato,
    sem OCR). Se o PDF não tiver camada de texto aproveitável (escaneado),
    devolve `null` — este formato não tem fallback de OCR: a tabela de
    transações é densa demais pra arriscar um erro de leitura em dado
    financeiro histórico sem conferência nenhuma. */
export async function lerFaturaCartaoDeArquivo(file: File): Promise<FaturaCartaoLida | null> {
  const texto = await textoDoPdf(file);
  if (!texto) return null;
  return lerFaturaCartao(texto);
}
