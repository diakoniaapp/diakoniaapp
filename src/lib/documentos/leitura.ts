// ─── lib/documentos/leitura.ts — texto de um documento fiscal → campos ───────
//
// Peça da Central de Documentos Contábeis (Fase 1). PURA: recebe o TEXTO (do
// PDF, por `ocrService.textoDoPdf`, ou de OCR) e devolve o que dá pra saber do
// documento, com os candidatos a valor em vez de um número só.
//
// Por que não reaproveitar `ocrService.extrairCamposDoTexto`: ele foi calibrado
// pro formulário de lançamento, que quer UM valor pra pré-preencher, e tem
// defeitos medidos em 03/10/2026 em documentos reais (37 PDFs):
//   1. cupom de supermercado com desconto: lê o valor BRUTO ("Valor total
//      94,45"); o lançamento tem o líquido (94,45 − 8,32 = 86,13);
//   2. lê PERCENTUAL como dinheiro: o rodapé "Estadual R$ 260,18 (1.084,08%)"
//      virou um cupom de R$ 1.084,08 (era de R$ 24,00);
//   3. não reconhece "VALOR À PAGAR" com acento (OCR);
//   4. em DANFE / "Consulta da NF-e" não acha o emitente (a razão virou
//      "www.nfe.fazenda.gov.br/portal") e a data sai errada.
// Mexer lá mudaria o comportamento do formulário; aqui é módulo novo, sem risco.
//
// Lições dos formatos reais, validadas contra os PDFs (cada uma tem teste):
//   · o total do cupom às vezes vem SOZINHO na linha de baixo ("Valor a pagar
//     R$:" ⏎ "104,75");
//   · pagamento MISTO (cartão 80,00 + dinheiro 50,00 − troco 25,25 = 104,75): as
//     PARTES nunca viram candidato — só o total pago;
//   · DANFE: o total fica na linha SEGUINTE a "VALOR TOTAL DA NOTA";
//   · NFS-e: "Data e Hora da emissão da NFS-e"; boleto e fatura têm VENCIMENTO,
//     não emissão;
//   · OCR escreve "TEF ON R$ 39,95".
//
// O que é EXATO e o que é palpite: a chave de acesso (44 dígitos) traz CNPJ do
// emitente, modelo, série e número SEM ambiguidade — é a fonte preferida. O
// resto (valor, data) é heurística sobre o texto.

import { identificarGuia } from "./guia";

export const CNPJ_DA_IGREJA = "27639285000161";

export type TipoDocumentoLido =
  | "nfe" | "nfce" | "nfse" | "boleto" | "guia" | "fatura" | "rpa" | "rsp" | "dps" | "xml" | "desconhecido";

export interface ValorCandidato {
  valor: number;
  /** Texto pronto pra mostrar como motivo ("valor total 94,45 − descontos 8,32"). */
  origem: string;
  /** `true` = o valor impresso no documento; `false` = derivado (líquido, pago). */
  bruto: boolean;
  /** `true` = achado por varredura ("algum R$ no documento"), não por rótulo —
   *  vale menos no casamento. */
  aproximado?: boolean;
}

export interface DuplicataLida { vencimento: string | null; valor: number }

export interface DocumentoLido {
  tipo: TipoDocumentoLido;
  /** Razão social do emitente (palpite — não travar na tela). */
  emitente: string | null;
  /** CNPJ do emitente, só dígitos; nunca o da igreja. */
  cnpj: string | null;
  numero: string | null;
  /** `AAAA-MM-DD`. */
  emissao: string | null;
  /** `AAAA-MM-DD` — boleto/fatura: o documento não tem emissão útil, tem vencimento. */
  vencimento: string | null;
  /** Do mais confiável pro menos; sem repetir valor. */
  valores: ValorCandidato[];
  duplicatas: DuplicataLida[];
  /** Chave de acesso (44 dígitos), quando existe. */
  chave: string | null;
}

// ── números ─────────────────────────────────────────────────────────────────

const NUM = String.raw`(\d{1,3}(?:\.\d{3})*|\d+),(\d{2,3})`;

function paraNumero(inteiro: string, centavos: string): number {
  // "255,300" (3 casas, rodapé da Consulta da NF-e) → 255,30
  return Number(`${inteiro.replace(/\./g, "")}.${centavos.slice(0, 2)}`);
}

function arredonda(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Sem acento e em minúsculas, pra casar rótulo ("À PAGAR" = "a pagar"). */
function plano(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// ── chave de acesso ─────────────────────────────────────────────────────────

/** 44 dígitos, em blocos de 4 separados por espaço, ponto ou nada. */
export function extrairChave(texto: string): string | null {
  for (const m of texto.matchAll(/(?:\d{4}[\s.]?){10}\d{4}(?!\d)/g)) {
    const dig = m[0].replace(/\D/g, "");
    if (dig.length === 44) return dig;
  }
  const solta = texto.match(/(?<!\d)\d{44}(?!\d)/);
  return solta ? solta[0] : null;
}

function dadosDaChave(chave: string) {
  return {
    cnpj: chave.slice(6, 20),
    modelo: chave.slice(20, 22),
    numero: String(Number(chave.slice(25, 34))),
  };
}

// ── tipo ────────────────────────────────────────────────────────────────────

function descobrirTipo(texto: string, modelo: string | null): TipoDocumentoLido {
  if (modelo === "55") return "nfe";
  if (modelo === "65") return "nfce";
  const t = plano(texto);
  // RPA / RSP / DPS (tipos nativos): RPA = Recibo de Pagamento a Autônomo, RSP = Recibo de
  // Sustento Pastoral, DPS = Demonstrativo de Pagamento de Salário (definição final dela,
  // 03/10/2026, olhando os documentos reais). Três degraus, do mais firme ao mais solto:
  //   1. o TÍTULO que a igreja imprime;
  //   2. as expressões do dia a dia que ela listou (DPS: folha de pagamento, contracheque,
  //      holerite, recibo de salário · RSP: sustento/verba pastoral, ajuda/sustento
  //      ministerial);
  //   3. a sigla sozinha.
  // Os degraus 2 e 3 só valem sem cara de NFS-e (uma nota de serviço pode citar "folha de
  // pagamento" ou "DPS" com outro sentido). RPS (Recibo Provisório de Serviços) deixou de
  // existir como tipo: não é da rotina da igreja.
  const ehNfse = /nfs-?e|nota fiscal de servico/.test(t);
  // GUIA (ISS, DARF, GPS, FGTS, IRRF, DAS, taxas): vem ANTES de tudo — uma guia de ISS cita NFS-e, e
  // uma guia nunca deve cair em "boleto"/"fatura"/"outro" (pedido dela, 06/10/2026). O reconhecimento
  // exige a frase própria da guia, não a sigla solta (folha de pagamento e NFS-e citam INSS/ISS).
  if (identificarGuia(texto)) return "guia";
  if (/recibo de pagamento (a|de) autonomo/.test(t)) return "rpa";
  if (/recibo de sustento pastoral/.test(t)) return "rsp";
  if (/demonstrativo de pagamento de salario/.test(t)) return "dps";
  if (!ehNfse && /sustento pastoral|verba pastoral|ajuda ministerial|sustento ministerial/.test(t)) return "rsp";
  if (!ehNfse && /folha de pagamento|contra-?cheque|holerite|recibo de salario/.test(t)) return "dps";
  if (!ehNfse && /\brpa\b/.test(t)) return "rpa";
  if (!ehNfse && /\brsp\b/.test(t)) return "rsp";
  if (!ehNfse && /\bdps\b/.test(t)) return "dps";
  if (/nfs-?e|prestador do servico|prestador de servicos|nota fiscal de servico/.test(t)) return "nfse";
  if (/danfe/.test(t) && !/nfc-?e|consumidor/.test(t)) return "nfe";
  if (/nfc-?e|nota fiscal de consumidor|via consumidor/.test(t)) return "nfce";
  if (/linha digitavel|beneficiario|nosso numero|ficha de compensacao|valor do documento/.test(t)) return "boleto";
  if (/\bfatura\b|conta de (agua|luz|energia|gas)|vencimento/.test(t)) return "fatura";
  if (/nota fiscal eletronica/.test(t)) return "nfe";
  return "desconhecido";
}

// ── emitente ────────────────────────────────────────────────────────────────

function soDigitos(s: string): string {
  return s.replace(/\D/g, "");
}

const REGEX_CNPJ_FORMATADO = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g;

function cnpjsDoTexto(texto: string): string[] {
  const achados = new Set<string>();
  for (const m of texto.matchAll(REGEX_CNPJ_FORMATADO)) achados.add(soDigitos(m[0]));
  // "CNPJ: 18301506000104" / "CNPJ 18301506000104" (sem pontuação, com rótulo)
  for (const m of texto.matchAll(/CNPJ[^\d\n]{0,6}(\d{14})(?!\d)/gi)) achados.add(m[1]);
  return [...achados];
}

const PARECE_NOME = /^[A-ZÀ-Ú0-9][A-ZÀ-Ú0-9 .,&'/-]{5,}$/;

/** Razão social do emitente, pelos formatos reais vistos:
 *  DANFE: "RECEBEMOS DE <NOME> OS PRODUTOS…";
 *  Consulta da NF-e: linha "<CNPJ> <NOME> <IE> <UF>" logo após "Emitente";
 *  NFS-e: o nome na linha de BAIXO de "<CNPJ> … Prestador do Serviço";
 *  cupom (NFC-e): a linha de texto logo acima de "CNPJ: <emitente>". */
function emitenteNome(texto: string, cnpj: string | null): string | null {
  const danfe = texto.match(/RECEBEMOS DE\s+(.+?)\s+OS PRODUTOS/i);
  if (danfe) return danfe[1].trim();
  if (!cnpj) return null;

  const linhas = texto.split(/\r?\n/).map(l => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    if (!soDigitos(l).includes(cnpj)) continue;
    // formato "<CNPJ formatado> <NOME ...> <IE numérica> <UF>"
    const cons = l.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\s+([A-ZÀ-Ú][^\d]{3,}?)(?:\s+\d{4,}|\s+[A-Z]{2}$|$)/);
    if (cons && !/prestador|tomador/i.test(cons[1])) return cons[1].trim();
    // NFS-e: o nome vem na linha de baixo
    if (/prestador/i.test(l) && linhas[i + 1]) {
      const nome = linhas[i + 1].replace(/\s*-\s*$/, "").trim();
      if (PARECE_NOME.test(nome)) return nome;
    }
    // cupom: nome na linha de cima
    const acima = linhas[i - 1];
    if (acima && PARECE_NOME.test(acima) && !/CNPJ|CPF|NFC|DANFE|CHAVE/i.test(acima)) return acima;
  }
  return null;
}

// ── datas ───────────────────────────────────────────────────────────────────

function paraIso(dd: string, mm: string, aaaa: string): string | null {
  const d = new Date(Number(aaaa), Number(mm) - 1, Number(dd));
  if (isNaN(d.getTime()) || d.getMonth() !== Number(mm) - 1) return null;
  return `${aaaa}-${mm}-${dd}`;
}

const REGEX_DATA = /(\d{2})\/(\d{2})\/(20\d{2})/;

function primeiraDataApos(texto: string, rotulo: RegExp, janela = 260): string | null {
  const m = texto.match(new RegExp(`${rotulo.source}[\\s\\S]{0,${janela}}`, "i"));
  if (!m) return null;
  const d = m[0].match(REGEX_DATA);
  return d ? paraIso(d[1], d[2], d[3]) : null;
}

/** Emissão, nunca "Data/Hora da Consulta" nem eventos posteriores (ciência da
 *  operação): o rótulo manda; sem rótulo, não adivinha. */
function dataEmissao(texto: string): string | null {
  return (
    // NFS-e: "Data e Hora da emissão da NFS-e" (os valores vêm na linha de baixo)
    primeiraDataApos(texto, /data\s+e\s+hora\s+da\s+emiss[ãa]o\s+da\s+nfs-?e/, 200)
    // "Data de Emissão" / "DATA DA EMISSÃO" — a primeira data logo depois do rótulo
    ?? primeiraDataApos(texto, /DATA\s+D[AE]\s+EMISS[ÃA]O/)
    // cupom: "Emissão: 07/08/2026 17:22:42"
    ?? (() => { const m = texto.match(/Emiss[ãa]o\s*:?\s*(\d{2})\/(\d{2})\/(20\d{2})/i); return m ? paraIso(m[1], m[2], m[3]) : null; })()
    // DANFE compacto: "NF-e 24/03/2026 VALOR TOTAL"
    ?? (() => { const m = texto.match(/NF-?e\s+(?:EMISS[ÃA]O:?\s*)?(\d{2})\/(\d{2})\/(20\d{2})/i); return m ? paraIso(m[1], m[2], m[3]) : null; })()
    // OCR de cupom: "Data de Autorização 18/08/2026" é o mesmo dia da emissão
    ?? (() => { const m = texto.match(/Data de Autoriza[çc][ãa]o\s*:?\s*(\d{2})\/(\d{2})\/(20\d{2})/i); return m ? paraIso(m[1], m[2], m[3]) : null; })()
  );
}

/** Vencimento (boleto, fatura de concessionária). */
function dataVencimento(texto: string): string | null {
  return primeiraDataApos(texto, /vencimento/i, 160);
}

// ── número do documento ─────────────────────────────────────────────────────

function numeroDoc(texto: string, daChave: string | null): string | null {
  if (daChave) return daChave;
  const m = texto.match(/N[úu]mero\s*:?\s*(\d{1,9})\b/i) || texto.match(/\bN[ºo°]\.?\s*([\d.]{1,12})/i);
  return m ? m[1].replace(/\./g, "").replace(/^0+(?=\d)/, "") : null;
}

// ── valores ─────────────────────────────────────────────────────────────────

/** Valor NA MESMA LINHA do rótulo (`[ \t]`, nunca `\s`: atravessar a quebra pegava
 *  o número da linha seguinte — "Valor pago R$ ⏎ Dinheiro 87,00"). */
function pegar(t: string, rotulo: RegExp): number | null {
  const m = t.match(new RegExp(`${rotulo.source}[^\\d\\n%]{0,14}${NUM}(?!\\d|\\s*%)`, "i"));
  return m ? paraNumero(m[1], m[2]) : null;
}

/** Rótulo que termina a linha e o valor sozinho na linha seguinte
 *  ("Valor a pagar R$:" ⏎ "104,75"). */
function naLinhaSeguinte(t: string, rotulo: RegExp): number | null {
  const linhas = t.split("\n").map(l => l.trim());
  for (let i = 0; i < linhas.length - 1; i++) {
    if (!rotulo.test(linhas[i]) || new RegExp(NUM).test(linhas[i])) continue;
    for (let j = i + 1; j < Math.min(i + 3, linhas.length); j++) {
      if (!linhas[j]) continue;
      const m = linhas[j].match(new RegExp(`^(?:r\\$\\s*)?${NUM}$`));
      return m ? paraNumero(m[1], m[2]) : null;
    }
  }
  return null;
}

/** DANFE / Consulta: o total é o ÚLTIMO número da linha DEPOIS do cabeçalho
 *  "VALOR TOTAL DA NOTA" (é sempre o último rótulo daquela linha de cabeçalho). */
function totalDaNota(t: string): number | null {
  const linhas = t.split("\n");
  for (let i = 0; i < linhas.length - 1; i++) {
    if (!/valor total da nota/.test(linhas[i]) || new RegExp(NUM).test(linhas[i].slice(linhas[i].search(/valor total da nota/)))) continue;
    const todos = [...linhas[i + 1].matchAll(new RegExp(NUM, "g"))];
    if (todos.length) { const u = todos[todos.length - 1]; return paraNumero(u[1], u[2]); }
  }
  return null;
}

/** Linhas que falam de tributo, desconto, multa… NÃO são o valor da compra. */
const LINHA_QUE_NAO_E_VALOR = /\btrib|icms|issqn|\biss\b|\bpis\b|cofins|aprox|lei federal|ibpt|desconto|abatiment|multa|juros|bonifica|troco|difal/;

const fmt = (n: number) => n.toFixed(2).replace(".", ",");

export function valoresDoTexto(texto: string): ValorCandidato[] {
  const t = plano(texto);
  const saida: ValorCandidato[] = [];
  const add = (valor: number | null, origem: string, bruto: boolean, aproximado = false) => {
    if (valor == null || !(valor > 0)) return;
    const v = arredonda(valor);
    if (saida.some(x => Math.abs(x.valor - v) < 0.005)) return;
    saida.push({ valor: v, origem, bruto, ...(aproximado ? { aproximado: true } : {}) });
  };

  // total impresso: "Valor total R$: 94,45" · "VALOR TOTAL: R$ 519,80" · "Valor Total da Nota" ⏎ …255,300
  const totalRot = /valor\s+total(?:\s+da\s+nota(?:\s+fiscal)?)?(?:[ \t]+r\$)?[ \t]*:?/;
  const total = pegar(t, totalRot) ?? naLinhaSeguinte(t, /valor\s+total(?:[ \t]+r\$)?[ \t]*:?$/) ?? totalDaNota(t);

  const desconto = pegar(t, /descontos?(?:[ \t]+r\$)?[ \t]*:?/);
  const aPagar = pegar(t, /valor\s+a\s+pagar(?:[ \t]+r\$)?[ \t]*:?/) ?? naLinhaSeguinte(t, /valor\s+a\s+pagar(?:[ \t]+r\$)?[ \t]*:?$/);
  const liquido = pegar(t, /valor\s+liquido/);
  const doDocumento = pegar(t, /valor\s+do\s+documento/);
  const doServico = pegar(t, /valor\s+(?:l[ií]quido\s+)?d[oa]s?\s+(?:nfs-?e|servico)/);
  // NÃO há candidato "valor pago": em cupom é o dinheiro ENTREGUE (com troco),
  // não o líquido ("Valor pago ⏎ Dinheiro 87,00" para uma compra de 86,13).

  // 1) o que o documento diz que se paga
  add(aPagar, `valor a pagar ${aPagar != null ? fmt(aPagar) : ""}`.trim(), false);
  add(liquido, `valor líquido ${liquido != null ? fmt(liquido) : ""}`.trim(), false);
  add(doDocumento, `valor do documento ${doDocumento != null ? fmt(doDocumento) : ""}`.trim(), true);
  add(doServico, `valor do serviço ${doServico != null ? fmt(doServico) : ""}`.trim(), true);

  // 2) total − desconto (cupom com desconto)
  if (total != null && desconto != null && desconto > 0 && desconto < total) {
    add(total - desconto, `valor total ${fmt(total)} − descontos ${fmt(desconto)}`, false);
  }

  // 3) TOTAL PAGO = soma das formas de pagamento − troco. Nunca as partes: com
  //    pagamento misto (cartão 80,00 + dinheiro 50,00 − troco 25,25) as partes
  //    (24,75 e 80,00) casariam com lançamentos que não têm nada a ver.
  const dinheiro = pegar(t, /dinheiro/);
  const troco = pegar(t, /troco/);
  const cartao = (() => { const m = t.match(new RegExp(`cart[aã]o[^\\d\\n]{0,25}${NUM}(?!\\d|\\s*%)`)); return m ? paraNumero(m[1], m[2]) : null; })();
  const pix = pegar(t, /\bpix/);
  const formas: [string, number][] = [];
  if (cartao != null) formas.push(["cartão", cartao]);
  if (dinheiro != null) formas.push(["dinheiro", dinheiro]);
  if (pix != null) formas.push(["PIX", pix]);
  if (formas.length) {
    const soma = formas.reduce((s, [, v]) => s + v, 0);
    const descTroco = troco && troco > 0 ? ` − troco ${fmt(troco)}` : "";
    add(soma - (troco ?? 0), `${formas.map(([n, v]) => `${n} ${fmt(v)}`).join(" + ")}${descTroco}`, false);
  }

  // 4) soma dos itens do cupom ("Qtde.: 4 UN: UN Vl. Unit.: 6 24,00") — só quando
  //    o documento não traz total/a pagar legível (colunas que o PDF embaralha)
  const itens = [...t.matchAll(new RegExp(String.raw`qtde\.?:?\s*[\d.,]+\s*un:?\s*\w*\s*vl\.?\s*unit\.?:?\s*[\d.,]+\s+${NUM}`, "g"))];
  if (itens.length > 0 && total == null && aPagar == null) {
    add(itens.reduce((s, m) => s + paraNumero(m[1], m[2]), 0), `soma dos ${itens.length} item(ns) do cupom`, false);
  }

  // 5) o total bruto impresso (o lançamento NÃO costuma ter esse quando há
  //    desconto, mas é o valor certo quando não há)
  add(total, `valor total ${total != null ? fmt(total) : ""}`.trim(), true);

  // 6) varredura: nenhum rótulo deu valor → o maior "R$ n,nn" que NÃO esteja numa
  //    linha de tributo/desconto/multa e NÃO seja percentual. Aproximado.
  if (saida.length === 0) {
    const cands: number[] = [];
    for (const linha of t.split("\n")) {
      if (LINHA_QUE_NAO_E_VALOR.test(linha)) continue;
      for (const m of linha.matchAll(new RegExp(String.raw`r\$\s*${NUM}(?!\d|\s*%)`, "g"))) cands.push(paraNumero(m[1], m[2]));
    }
    const maior = cands.filter(v => v > 0).sort((a, b) => b - a)[0];
    add(maior ?? null, "maior valor com R$ no documento (leitura aproximada)", true, true);
  }
  return saida;
}

function duplicatasDoTexto(texto: string): DuplicataLida[] {
  const out: DuplicataLida[] = [];
  for (const m of texto.matchAll(new RegExp(String.raw`venc\.?\s*:?\s*(\d{2})/(\d{2})/(20\d{2})\s*\n?\s*valor\s*r?\$?\s*${NUM}`, "gi"))) {
    out.push({ vencimento: paraIso(m[1], m[2], m[3]), valor: paraNumero(m[4], m[5]) });
  }
  return out;
}

// ── ponto de entrada ────────────────────────────────────────────────────────

export function lerDocumento(texto: string): DocumentoLido {
  const chave = extrairChave(texto);
  const dc = chave ? dadosDaChave(chave) : null;

  // CNPJ do emitente: a chave manda (exata); sem ela, o primeiro CNPJ que não é
  // o da igreja — o destinatário é sempre a igreja e também aparece no texto.
  const cnpjs = cnpjsDoTexto(texto).filter(c => c !== CNPJ_DA_IGREJA);
  const cnpj = dc && dc.cnpj !== CNPJ_DA_IGREJA ? dc.cnpj : (cnpjs[0] ?? null);
  const tipo = descobrirTipo(texto, dc?.modelo ?? null);

  return {
    tipo,
    emitente: emitenteNome(texto, cnpj),
    cnpj,
    numero: numeroDoc(texto, dc?.numero ?? null),
    emissao: dataEmissao(texto),
    // boleto e fatura: o que vale é o vencimento (onde o pagamento costuma cair)
    vencimento: tipo === "boleto" || tipo === "fatura" || tipo === "nfse" ? dataVencimento(texto) : null,
    valores: valoresDoTexto(texto),
    duplicatas: duplicatasDoTexto(texto),
    chave,
  };
}
