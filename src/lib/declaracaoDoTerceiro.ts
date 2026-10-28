// ─── declaracaoDoTerceiro.ts — o TEXTO e o PDF da Declaração do Terceiro e do Recibo de Reembolso, gerados pelo sistema ──────────────────────────────────────────────
//
// Fase 1D-a. O usuário não escreve o documento: o sistema o monta com o que já está cadastrado (o conteúdo vem do banco, fin_declaracao_conteudo, e é o mesmo que fica guardado e com código de
// verificação). Cada via traz UMA frase, a da intenção registrada: não há caixas para marcar, então a intenção não pode ser trocada depois da assinatura. Aqui só se decide COMO o conteúdo vira texto e
// PDF; nada é recalculado. Centro e categoria saem como informação da igreja, fora do que o terceiro assina.
//
// O PDF é uma folha A4 com DUAS VIAS em A5 (a da igreja e a do declarante), separadas por uma linha de corte: imprime-se uma folha, corta-se ao meio, as duas partes são assinadas.
// O RECIBO DE REEMBOLSO (pagamento em espécie, cláusula 5.5 da Política) usa a mesma folha.
import { ROTULO_FORMA, type FormaDePagamento } from "@/lib/quitacao";

export interface DeclaradoNaDeclaracao {
  intencao: "reembolso" | "oferta";
  declarante_nome: string | null;
  declarante_documento: string | null;
  fornecedor_nome: string | null;
  fornecedor_documento: string | null;
  nota_numero: string | null;
  nota_chave: string | null;
  nota_data: string | null;
  valor: number;
  forma_pagamento: FormaDePagamento;
  data_pagamento: string;
  chave_pix: string | null;
  tipo_chave_pix: string | null;
}
export interface ConteudoDaDeclaracao { declarado: DeclaradoNaDeclaracao; informativo: { centro: string | null; categoria: string | null } }
export interface IdentificacaoDaVia {
  numero: string; versao: number; /** os 12 primeiros caracteres do código de verificação */ codigo: string;
  /** quando a via foi gerada (`fin_declaracoes.gerada_em`, imutável no banco): é a DATA DA SOLICITAÇÃO do reembolso */
  geradaEm?: string | null;
}

export const IGREJA = { nome: "Quarta Igreja Batista do Rio de Janeiro", cnpj: "27.639.285/0001-61" } as const;

/** O dia (no fuso de Brasília) de um instante guardado em UTC: a data da solicitação. */
const diaDeBrasilia = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
const dataBr = (ymd: string | null) => (ymd ? ymd.slice(0, 10).split("-").reverse().join("/") : "—");
const brl = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** A frase da intenção. UMA só por via; é ela que decide a versão do documento. */
export function fraseDaIntencao(d: Pick<DeclaradoNaDeclaracao, "intencao" | "declarante_nome">): string {
  const eu = `Eu, ${d.declarante_nome ?? "______________________"},`;
  return d.intencao === "reembolso"
    ? `${eu} declaro que realizei o pagamento da(s) despesa(s) abaixo em nome da igreja e SOLICITO O REEMBOLSO do valor pago.`
    : `${eu} declaro que realizei o pagamento da(s) despesa(s) abaixo em nome da igreja e ESTOU OFERTANDO esta despesa, sem solicitar reembolso.`;
}

// ── valor por extenso (o recibo escreve o valor também em palavras) ─────────────────────────────────────────────────────────────────────────────

const UN = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const DZ = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CT = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

function ate999(n: number): string {
  if (n === 100) return "cem";
  const c = Math.floor(n / 100), r = n % 100, partes: string[] = [];
  if (c) partes.push(CT[c]);
  if (r) partes.push(r < 20 ? UN[r] : DZ[Math.floor(r / 10)] + (r % 10 ? ` e ${UN[r % 10]}` : ""));
  return partes.join(" e ");
}
function inteiroPorExtenso(n: number): string {
  if (n === 0) return "zero";
  const m = Math.floor(n / 1_000_000), mil = Math.floor((n % 1_000_000) / 1000), resto = n % 1000, seg: { t: string; v: number }[] = [];
  if (m) seg.push({ t: m === 1 ? "um milhão" : `${ate999(m)} milhões`, v: m * 1_000_000 });
  if (mil) seg.push({ t: mil === 1 ? "mil" : `${ate999(mil)} mil`, v: mil * 1000 });
  if (resto) seg.push({ t: ate999(resto), v: resto });
  return seg.map((s, i) => {
    if (i === 0) return s.t;
    const ultimo = i === seg.length - 1;
    return (ultimo && (s.v < 100 || s.v % 100 === 0) ? " e " : ", ") + s.t;
  }).join("");
}
/** 1500 → "mil e quinhentos reais"; 240,5 → "duzentos e quarenta reais e cinquenta centavos". */
export function valorPorExtenso(valor: number): string {
  const total = Math.round(Math.abs(valor) * 100), reais = Math.floor(total / 100), cent = total % 100;
  const partes: string[] = [];
  if (reais > 0) partes.push(`${inteiroPorExtenso(reais)}${reais >= 1_000_000 && reais % 1_000_000 === 0 ? " de" : ""} ${reais === 1 ? "real" : "reais"}`);
  if (cent > 0) partes.push(`${inteiroPorExtenso(cent)} ${cent === 1 ? "centavo" : "centavos"}`);
  return partes.length ? partes.join(" e ") : "zero real";
}

// ── o conteúdo de cada documento, linha a linha ─────────────────────────────────────────────────────────────────────────────────────────────

export interface TextoDoDocumento {
  titulo: string;
  identificacao: string;
  frase: string;
  campos: [string, string][];
  informativos: [string, string][];
  /** [rótulo, nome ou apoio impresso sob a linha] */
  assinaturas: { rotulo: string; apoio: string }[];
  rodape: string;
  /** o bloco de RECIBO (só na Solicitação e Recibo de Reembolso): o recebedor o preenche e assina NO ATO do pagamento */
  recibo?: { titulo: string; frase: string; linhas: string[] };
}
export type TextoDaDeclaracao = TextoDoDocumento;

/**
 * A Declaração do Terceiro. Oferta: só a declaração. REEMBOLSO (decisão dela, 28/10/2026): vira UM documento de duas funções — "Solicitação e Recibo de Reembolso". Imprime-se na hora do pagamento; o
 * recebedor preenche o bloco do recibo (forma, valor, "Pago em") e assina; a via assinada que sobe é, ao mesmo tempo, a prova formal da intenção e o COMPROVANTE do pagamento em espécie.
 */
export function textoDaDeclaracao(via: IdentificacaoDaVia, c: ConteudoDaDeclaracao): TextoDoDocumento {
  const d = c.declarado;
  const reembolso = d.intencao === "reembolso";
  const campos: [string, string][] = [
    ["Declarante", [d.declarante_nome ?? "—", d.declarante_documento ? `(${d.declarante_documento})` : ""].filter(Boolean).join(" ")],
    ["Fornecedor", [d.fornecedor_nome ?? "—", d.fornecedor_documento ? `(${d.fornecedor_documento})` : ""].filter(Boolean).join(" ")],
    ["Nota fiscal", [d.nota_numero ? `nº ${d.nota_numero}` : "sem número", d.nota_data ? `de ${dataBr(d.nota_data)}` : "", d.nota_chave ? `chave ${d.nota_chave}` : ""].filter(Boolean).join(" · ")],
    ["Valor", brl(d.valor)],
    // no reembolso o recibo também tem "forma" e "data": os da compra ficam claros como os do pagamento AO FORNECEDOR
    [reembolso ? "Pago ao fornecedor por" : "Forma de pagamento", ROTULO_FORMA[d.forma_pagamento] ?? d.forma_pagamento],
    [reembolso ? "Pago ao fornecedor em" : "Data do pagamento", dataBr(d.data_pagamento)],
  ];
  // a chave PIX é "quando aplicável": sem ela, o reembolso se combina com a Tesouraria (espécie com recibo assinado, ou transferência)
  if (reembolso && via.geradaEm) campos.splice(3, 0, ["Data da solicitação", diaDeBrasilia(via.geradaEm)]);
  if (reembolso) campos.push(d.chave_pix ? ["Chave PIX", d.chave_pix] : ["Recebimento do reembolso", "sem chave PIX informada: forma combinada com a Tesouraria (espécie, com recibo assinado, ou transferência)"]);
  return {
    titulo: reembolso ? "SOLICITAÇÃO E RECIBO DE REEMBOLSO" : "DECLARAÇÃO DO TERCEIRO",
    identificacao: `nº ${via.numero} · versão ${via.versao} · código de verificação ${via.codigo}`,
    frase: fraseDaIntencao(d),
    campos,
    informativos: [["Centro de custo", c.informativo.centro ?? "—"], ["Categoria", c.informativo.categoria ?? "—"]],
    // no reembolso a assinatura é a do RECEBEDOR, no ato do pagamento: a data dela é a data em que foi pago
    assinaturas: reembolso
      ? [{ rotulo: "Pago em", apoio: "" }, { rotulo: "Assinatura do recebedor", apoio: d.declarante_nome ?? "" }]
      : [{ rotulo: "Data da assinatura", apoio: "" }, { rotulo: "Assinatura do declarante", apoio: d.declarante_nome ?? "" }],
    ...(reembolso ? { recibo: {
      titulo: "RECIBO DE REEMBOLSO  ·  preencher no ato do pagamento",
      frase: `Declaro que recebi da ${IGREJA.nome} o valor de ${brl(d.valor)} referente ao reembolso das despesas descritas neste documento.`,
      linhas: ["Forma:   (   ) Espécie    (   ) PIX    (   ) Transferência    (   ) Outro: ______________        Valor recebido: R$ ______________"],
    } } : {}),
    rodape: reembolso
      ? "Gerado pelo DiakoniaApp. Assinado no ato do pagamento, este documento é a solicitação e o comprovante do recebimento. Se algum dado mudar depois, uma nova via deve ser gerada e assinada."
      : "Gerado pelo DiakoniaApp. O código de verificação identifica o conteúdo declarado; se algum dado mudar depois, uma nova via deve ser gerada e assinada.",
  };
}

export interface DadosDoRecibo {
  beneficiarioNome: string;
  beneficiarioDocumento: string | null;
  valor: number;
  /** AAAA-MM-DD */
  dataDoPagamento: string;
  /** como a igreja entrega o dinheiro: espécie, PIX, transferência… (texto) */
  formaDeRecebimento: string;
  fornecedor: string | null;
  notaNumero: string | null;
  notaData: string | null;
  /** número da Declaração do Terceiro a que o recibo se refere, quando houver */
  declaracaoNumero: string | null;
  /** quanto já havia sido reembolsado antes e quanto falta depois deste pagamento (reembolso parcial) */
  saldoDepois: number | null;
}

/** O Recibo de Reembolso: o beneficiário declara ter recebido da igreja o valor que pagou. Em espécie é o documento que a Política exige (cláusula 5.5). */
export function textoDoRecibo(r: DadosDoRecibo): TextoDoDocumento {
  const ref = [r.fornecedor ?? "fornecedor", r.notaNumero ? `NF nº ${r.notaNumero}` : "", r.notaData ? `de ${dataBr(r.notaData)}` : ""].filter(Boolean).join(", ");
  const campos: [string, string][] = [
    ["Beneficiário", [r.beneficiarioNome, r.beneficiarioDocumento ? `(${r.beneficiarioDocumento})` : ""].filter(Boolean).join(" ")],
    ["Valor recebido", brl(r.valor)],
    ["Por extenso", valorPorExtenso(r.valor)],
    ["Forma de recebimento", r.formaDeRecebimento],
    ["Data do pagamento", dataBr(r.dataDoPagamento)],
    ["Referente a", ref],
  ];
  if (r.declaracaoNumero) campos.push(["Declaração do Terceiro", r.declaracaoNumero]);
  if (r.saldoDepois !== null && r.saldoDepois > 0.004) campos.push(["Saldo a reembolsar", `${brl(r.saldoDepois)} (reembolso parcial)`]);
  return {
    titulo: "RECIBO DE REEMBOLSO",
    identificacao: r.declaracaoNumero ? `referente à Declaração do Terceiro ${r.declaracaoNumero}` : "reembolso de despesa paga com recurso próprio",
    frase: `Eu, ${r.beneficiarioNome}, declaro que recebi da ${IGREJA.nome} a quantia de ${brl(r.valor)} (${valorPorExtenso(r.valor)}), como reembolso da despesa descrita abaixo, que paguei com recurso próprio em nome da igreja. Dou plena quitação deste valor.`,
    campos,
    informativos: [],
    assinaturas: [{ rotulo: "Data", apoio: "" }, { rotulo: "Assinatura do beneficiário", apoio: r.beneficiarioNome }],
    rodape: "Gerado pelo DiakoniaApp. Em pagamento em espécie, este recibo assinado é o comprovante do reembolso (cláusula 5.5 da Política).",
  };
}

// ── o PDF: uma folha A4 com duas vias A5 ────────────────────────────────────────────────────────────────────────────────────────────────────

/** Quebra um texto em linhas que caibam na largura (em pontos), medindo com a fonte. */
function quebrar(texto: string, medir: (t: string) => number, largura: number): string[] {
  const linhas: string[] = [];
  let atual = "";
  for (const palavra of texto.split(/\s+/)) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    if (medir(tentativa) <= largura || !atual) atual = tentativa; else { linhas.push(atual); atual = palavra; }
  }
  if (atual) linhas.push(atual);
  return linhas;
}

const A4 = { w: 595.28, h: 841.89 };
const AZUL: [number, number, number] = [0.12, 0.23, 0.30];     // o azul-petróleo da Política
const CINZA: [number, number, number] = [0.42, 0.42, 0.42];
const TINTA: [number, number, number] = [0.1, 0.1, 0.1];
const FUNDO: [number, number, number] = [0.955, 0.965, 0.97];

/** Monta a folha A4 (retrato) com o documento desenhado DUAS vezes, uma em cada metade (A5 paisagem): via da igreja em cima, via do declarante embaixo. */
async function montarFolhaDuasVias(t: TextoDoDocumento, titulo: string, vias: [string, string]): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  doc.setTitle(titulo);
  doc.setCreator("DiakoniaApp");
  const pagina = doc.addPage([A4.w, A4.h]);
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold);
  const cor = (c: [number, number, number]) => rgb(c[0], c[1], c[2]);
  const meia = A4.h / 2, margem = 38, largura = A4.w - margem * 2;

  function via(y0: number, rotuloDaVia: string) {
    const topo = y0 + meia;
    let y = topo - 30;
    // faixa da igreja e a etiqueta da via
    pagina.drawRectangle({ x: 0, y: topo - 8, width: A4.w, height: 8, color: cor(AZUL) });
    pagina.drawText(IGREJA.nome.toUpperCase(), { x: margem, y, size: 9, font: negrito, color: cor(AZUL) });
    pagina.drawText(`CNPJ ${IGREJA.cnpj}`, { x: margem, y: y - 11, size: 7.5, font: normal, color: cor(CINZA) });
    const wEt = negrito.widthOfTextAtSize(rotuloDaVia, 7.5) + 16;
    pagina.drawRectangle({ x: A4.w - margem - wEt, y: y - 9, width: wEt, height: 17, borderColor: cor(AZUL), borderWidth: 0.8 });
    pagina.drawText(rotuloDaVia, { x: A4.w - margem - wEt + 8, y: y - 3.5, size: 7.5, font: negrito, color: cor(AZUL) });
    y -= 36;
    // título e identificação
    pagina.drawText(t.titulo, { x: margem, y, size: 15, font: negrito, color: cor(TINTA) });
    y -= 13;
    pagina.drawText(t.identificacao, { x: margem, y, size: 7.5, font: normal, color: cor(CINZA) });
    y -= 16;
    // a frase
    for (const l of quebrar(t.frase, s => normal.widthOfTextAtSize(s, 9.5), largura)) { pagina.drawText(l, { x: margem, y, size: 9.5, font: normal, color: cor(TINTA) }); y -= 13; }
    y -= 4;
    // os campos, num quadro
    const rotuloW = 112, valorW = largura - rotuloW - 16;
    const linhasDosCampos = t.campos.map(([r, v]) => ({ r, linhas: quebrar(v, s => normal.widthOfTextAtSize(s, 9), valorW) }));
    const alturaQuadro = linhasDosCampos.reduce((s, c) => s + Math.max(1, c.linhas.length) * 12 + 3, 0) + 12;
    pagina.drawRectangle({ x: margem, y: y - alturaQuadro + 4, width: largura, height: alturaQuadro, color: cor(FUNDO), borderColor: rgb(0.82, 0.85, 0.87), borderWidth: 0.6 });
    let yc = y - 8;
    for (const c of linhasDosCampos) {
      pagina.drawText(`${c.r}:`, { x: margem + 8, y: yc, size: 8.5, font: negrito, color: cor(AZUL) });
      c.linhas.forEach((l, i) => pagina.drawText(l, { x: margem + 8 + rotuloW, y: yc - i * 12, size: 9, font: normal, color: cor(TINTA) }));
      yc -= Math.max(1, c.linhas.length) * 12 + 3;
    }
    y -= alturaQuadro + 6;
    // a classificação da igreja
    if (t.informativos.length) {
      pagina.drawText(`Classificação da igreja (informativa): ${t.informativos.map(([r, v]) => `${r}: ${v}`).join("  ·  ")}`, { x: margem, y, size: 7, font: normal, color: cor(CINZA) });
      y -= 10;
    }
    // o bloco do RECIBO (só na Solicitação e Recibo de Reembolso): faixa suave logo acima das assinaturas
    const ya = y0 + 66;
    if (t.recibo) {
      const fraseR = quebrar(t.recibo.frase, s => normal.widthOfTextAtSize(s, 8.5), largura - 16);
      const alturaR = 12 + fraseR.length * 11 + 14 + 6;
      const yTopo = ya + 14 + alturaR;   // ancorado logo acima da linha da assinatura
      pagina.drawRectangle({ x: margem, y: yTopo - alturaR, width: largura, height: alturaR, color: rgb(0.93, 0.97, 0.94), borderColor: rgb(0.72, 0.84, 0.76), borderWidth: 0.6 });
      pagina.drawText(t.recibo.titulo, { x: margem + 8, y: yTopo - 11, size: 7.5, font: negrito, color: rgb(0.13, 0.36, 0.22) });
      fraseR.forEach((l, i) => pagina.drawText(l, { x: margem + 8, y: yTopo - 22 - i * 11, size: 8.5, font: normal, color: cor(TINTA) }));
      t.recibo.linhas.forEach((l, i) => pagina.drawText(l, { x: margem + 8, y: yTopo - 22 - fraseR.length * 11 - 3 - i * 12, size: 8, font: normal, color: cor(TINTA) }));
    }
    // assinaturas, no pé da via
    const wData = largura * 0.36, folga = 24, wAss = largura - wData - folga;
    t.assinaturas.forEach((a, i) => {
      const xi = i === 0 ? margem : margem + wData + folga, w = i === 0 ? wData : wAss;
      pagina.drawLine({ start: { x: xi, y: ya }, end: { x: xi + w, y: ya }, thickness: 0.7, color: cor(TINTA) });
      pagina.drawText(i === 0 ? `${a.rotulo}  ____ / ____ / ________` : a.rotulo, { x: xi, y: ya - 10, size: 7.5, font: i === 0 ? normal : negrito, color: cor(CINZA) });
      if (a.apoio) pagina.drawText(a.apoio, { x: xi, y: ya - 20, size: 7.5, font: normal, color: cor(CINZA) });
    });
    // rodapé
    for (const [i, l] of quebrar(t.rodape, s => normal.widthOfTextAtSize(s, 6.5), largura).entries()) pagina.drawText(l, { x: margem, y: y0 + 22 - i * 8, size: 6.5, font: normal, color: cor(CINZA) });
  }

  via(meia, vias[0]);
  via(0, vias[1]);
  // a linha de corte, no meio da folha
  pagina.drawLine({ start: { x: 18, y: meia }, end: { x: A4.w - 18, y: meia }, thickness: 0.6, color: cor(CINZA), dashArray: [5, 4] });
  const corte = "recorte aqui";
  pagina.drawRectangle({ x: A4.w / 2 - 28, y: meia - 4, width: 56, height: 8, color: rgb(1, 1, 1) });
  pagina.drawText(corte, { x: A4.w / 2 - normal.widthOfTextAtSize(corte, 6) / 2, y: meia - 2, size: 6, font: normal, color: cor(CINZA) });
  return doc.save();
}

/** O PDF da Declaração do Terceiro: A4 com duas vias A5 (da igreja e do declarante). `pdf-lib` é carregado sob demanda: só quem gera paga o peso. */
export function montarDeclaracaoPdf(via: IdentificacaoDaVia, c: ConteudoDaDeclaracao): Promise<Uint8Array> {
  return montarFolhaDuasVias(textoDaDeclaracao(via, c), `Declaração do Terceiro ${via.numero}`, ["VIA DA IGREJA", "VIA DO DECLARANTE"]);
}

/** Baixa o PDF de uma via já gerada (Declaração do Terceiro ou, no reembolso, Solicitação e Recibo). */
export async function baixarDaVia(via: IdentificacaoDaVia & { conteudo: ConteudoDaDeclaracao }): Promise<void> {
  const bytes = await montarDeclaracaoPdf({ numero: via.numero, versao: via.versao, codigo: via.codigo, geradaEm: via.geradaEm ?? null }, via.conteudo);
  const { saveAs } = await import("file-saver");
  const nome = via.conteudo.declarado.intencao === "reembolso" ? "Solicitacao_e_Recibo_de_Reembolso" : "Declaracao_do_Terceiro";
  saveAs(new Blob([bytes as BlobPart], { type: "application/pdf" }), `${nome}_${via.numero}_v${via.versao}.pdf`);
}

/** O PDF do Recibo de Reembolso: A4 com duas vias A5 (da igreja e do beneficiário). */
export function montarReciboPdf(r: DadosDoRecibo): Promise<Uint8Array> {
  return montarFolhaDuasVias(textoDoRecibo(r), "Recibo de Reembolso", ["VIA DA IGREJA", "VIA DO BENEFICIÁRIO"]);
}
