// ─── declaracaoDoTerceiro.ts — o TEXTO e o PDF da Declaração do Terceiro, gerada pelo sistema ───────────────────────────────────────────────────────────────
//
// Fase 1D-a. O usuário não escreve o documento: o sistema o monta com o que já está cadastrado (o conteúdo vem do banco, fin_declaracao_conteudo, e é o mesmo que fica guardado e com código de
// verificação). Cada via traz UMA frase, a da intenção registrada: não há caixas para marcar, então a intenção não pode ser trocada depois da assinatura. Aqui só se decide COMO o conteúdo vira texto e
// PDF; nada é recalculado. Centro e categoria saem como informação da igreja, fora do que o terceiro assina.
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
export interface IdentificacaoDaVia { numero: string; versao: number; /** os 12 primeiros caracteres do código de verificação */ codigo: string }

const dataBr = (ymd: string | null) => (ymd ? ymd.slice(0, 10).split("-").reverse().join("/") : "—");
const brl = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** A frase da intenção. UMA só por via; é ela que decide a versão do documento. */
export function fraseDaIntencao(d: Pick<DeclaradoNaDeclaracao, "intencao" | "declarante_nome">): string {
  const eu = `Eu, ${d.declarante_nome ?? "______________________"},`;
  return d.intencao === "reembolso"
    ? `${eu} declaro que realizei o pagamento da(s) despesa(s) abaixo em nome da igreja e SOLICITO O REEMBOLSO do valor pago.`
    : `${eu} declaro que realizei o pagamento da(s) despesa(s) abaixo em nome da igreja e ESTOU OFERTANDO esta despesa, sem solicitar reembolso.`;
}

export interface TextoDaDeclaracao {
  titulo: string;
  identificacao: string;
  frase: string;
  campos: [string, string][];
  informativos: [string, string][];
  assinatura: [string, string][];
  rodape: string;
}

/** O texto, linha a linha, na ordem do documento. Reembolso leva a chave PIX; oferta não. */
export function textoDaDeclaracao(via: IdentificacaoDaVia, c: ConteudoDaDeclaracao): TextoDaDeclaracao {
  const d = c.declarado;
  const campos: [string, string][] = [
    ["Declarante", [d.declarante_nome ?? "—", d.declarante_documento ? `(${d.declarante_documento})` : ""].filter(Boolean).join(" ")],
    ["Fornecedor", [d.fornecedor_nome ?? "—", d.fornecedor_documento ? `(${d.fornecedor_documento})` : ""].filter(Boolean).join(" ")],
    ["Nota fiscal", [d.nota_numero ? `nº ${d.nota_numero}` : "sem número", d.nota_data ? `de ${dataBr(d.nota_data)}` : "", d.nota_chave ? `chave ${d.nota_chave}` : ""].filter(Boolean).join(" · ")],
    ["Valor", brl(d.valor)],
    ["Forma de pagamento", ROTULO_FORMA[d.forma_pagamento] ?? d.forma_pagamento],
    ["Data do pagamento", dataBr(d.data_pagamento)],
  ];
  if (d.intencao === "reembolso") campos.push(["Chave PIX", d.chave_pix ?? "—"]);
  return {
    titulo: "DECLARAÇÃO DO TERCEIRO",
    identificacao: `nº ${via.numero} · versão ${via.versao} · código de verificação ${via.codigo}`,
    frase: fraseDaIntencao(d),
    campos,
    informativos: [["Centro de custo", c.informativo.centro ?? "—"], ["Categoria", c.informativo.categoria ?? "—"]],
    assinatura: [["Data da assinatura", "____ / ____ / ________"], ["Assinatura", "______________________________________________"]],
    rodape: "Este documento foi gerado pelo DiakoniaApp. O código de verificação identifica o conteúdo declarado; se algum dado mudar depois, uma nova via deve ser gerada e assinada.",
  };
}

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

/** O PDF (uma página A4). `pdf-lib` é carregado sob demanda: só quem gera a Declaração paga o peso. */
export async function montarDeclaracaoPdf(via: IdentificacaoDaVia, c: ConteudoDaDeclaracao): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const t = textoDaDeclaracao(via, c);
  const doc = await PDFDocument.create();
  doc.setTitle(`Declaração do Terceiro ${via.numero}`);
  const pagina = doc.addPage([595.28, 841.89]);
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold);
  const margem = 56, largura = 595.28 - margem * 2;
  let y = 841.89 - 70;
  const escrever = (txt: string, o: { fonte?: typeof normal; tam?: number; cor?: [number, number, number]; depois?: number } = {}) => {
    const fonte = o.fonte ?? normal, tam = o.tam ?? 11;
    for (const linha of quebrar(txt, s => fonte.widthOfTextAtSize(s, tam), largura)) {
      pagina.drawText(linha, { x: margem, y, size: tam, font: fonte, color: rgb(...(o.cor ?? [0.1, 0.1, 0.1])) });
      y -= tam * 1.45;
    }
    y -= o.depois ?? 0;
  };
  escrever(t.titulo, { fonte: negrito, tam: 18, depois: 2 });
  escrever(t.identificacao, { tam: 9, cor: [0.35, 0.35, 0.35], depois: 16 });
  escrever(t.frase, { depois: 14 });
  for (const [rotulo, valor] of t.campos) {
    pagina.drawText(`${rotulo}:`, { x: margem, y, size: 10.5, font: negrito, color: rgb(0.1, 0.1, 0.1) });
    const linhas = quebrar(valor, s => normal.widthOfTextAtSize(s, 10.5), largura - 130);
    linhas.forEach((l, i) => { pagina.drawText(l, { x: margem + 130, y: y - i * 14.5, size: 10.5, font: normal, color: rgb(0.1, 0.1, 0.1) }); });
    y -= Math.max(1, linhas.length) * 14.5 + 4;
  }
  y -= 8;
  escrever("Classificação da igreja (informativa, não faz parte do que o terceiro assina)", { fonte: negrito, tam: 9, cor: [0.35, 0.35, 0.35] });
  for (const [r, v] of t.informativos) escrever(`${r}: ${v}`, { tam: 9, cor: [0.35, 0.35, 0.35] });
  y -= 36;
  for (const [r, v] of t.assinatura) { escrever(`${r}: ${v}`, { tam: 11, depois: 10 }); }
  y = 60;
  for (const linha of quebrar(t.rodape, s => normal.widthOfTextAtSize(s, 8), largura)) { pagina.drawText(linha, { x: margem, y, size: 8, font: normal, color: rgb(0.45, 0.45, 0.45) }); y -= 11; }
  return doc.save();
}
