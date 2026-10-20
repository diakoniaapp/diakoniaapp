// ─── resumoDoLotePdf — "00 RESUMO.pdf": o índice do lote de pagamentos que segue no ZIP (e o botão "Baixar resumo") ──────────────────────────────────────
// Pedido dela (20/10/2026): o tesoureiro precisa trabalhar SEM acessar o sistema — o PDF diz, página a página, o que é cada pagamento, DE ONDE veio o meio de pagamento (documento ou cadastro), o
// código para copiar e quais arquivos do ZIP o acompanham. A parte de conteúdo (`blocosDoResumo`) é pura e testada; o desenho usa pdf-lib (já no projeto, dossiê do malote) com as fontes padrão.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { linhasDaAssinatura } from "@/lib/assinaturaDoSistema";
import {
  AVISO_DE_CONFERENCIA, ROTULO_DA_ORIGEM, ROTULO_SEM_MEIO, assuntoDoEmail, bancoDaLinha, contadoresDoEnvio, formatarLinha, tipoDaLinha, type ItemDeEnvio,
} from "@/lib/envioDePagamentos";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/[  ]/g, " ");
const dataBr = (ymd: string) => ymd.slice(0, 10).split("-").reverse().join("/");

/** As fontes padrão do PDF só conhecem Latin-1 e alguns sinais: emoji e afins saem, em vez de derrubar a geração. */
export const seguroParaPdf = (s: string): string => s.replace(/[^ -~ -ÿ–—‘’“”•…]/g, "");

export interface ItemDoResumo {
  numero: number;
  cabecalho: string;
  beneficiario: string;
  /** "Linha digitável do documento" / "PIX do documento" / "PIX do cadastro do favorecido" */
  origem: string;
  codigo: string;
  avisos: string[];
  /** nomes dos arquivos do ZIP que acompanham este pagamento */
  arquivos: string[];
}
export interface BlocosDoResumo {
  titulo: string;
  linhaDoLote: string;
  itens: ItemDoResumo[];
  semMeio: { numero: number; texto: string; arquivos: string[] }[];
  aviso: string;
  assinatura: string[];
}

export interface DadosDoResumo {
  hojeYmd: string;
  /** os pagamentos marcados, na ordem da mensagem */
  itens: ItemDeEnvio[];
  /** os que estão só na pasta (sem meio automático) */
  semMeio: ItemDeEnvio[];
  /** id da obrigação → nomes dos arquivos dela no ZIP */
  arquivosPorItem: Map<string, string[]>;
  /** linha do beneficiário editada à mão no painel */
  linhasDeDescricao?: Record<string, string>;
}

export function blocosDoResumo(d: DadosDoResumo): BlocosDoResumo {
  const c = contadoresDoEnvio(d.itens, [...d.itens, ...d.semMeio]);
  const total = d.itens.reduce((t, i) => t + i.valor, 0);
  const partes = [`${c.pagamentos} ${c.pagamentos === 1 ? "pagamento" : "pagamentos"}`, brl(total), `${c.boletos} ${c.boletos === 1 ? "boleto" : "boletos"}`, `${c.pix} Pix`,
    `${c.semMeio} sem meio automático`, `${c.documentos} ${c.documentos === 1 ? "documento" : "documentos"}`];
  return {
    titulo: assuntoDoEmail(d.hojeYmd),
    linhaDoLote: partes.join(" · "),
    itens: d.itens.map((i, n) => ({
      numero: n + 1,
      cabecalho: i.linha
        ? [tipoDaLinha(i.linha), bancoDaLinha(i.linha), brl(i.valor), `vence ${dataBr(i.vencimento)}`].filter(Boolean).join(" · ")
        : ["Pix", brl(i.valor), `vence ${dataBr(i.vencimento)}`].join(" · "),
      beneficiario: (d.linhasDeDescricao?.[i.id]?.trim() || i.fornecedor).toLocaleUpperCase("pt-BR"),
      origem: i.origem ? ROTULO_DA_ORIGEM[i.origem] : ROTULO_SEM_MEIO,
      codigo: i.linha ? formatarLinha(i.linha) : i.pix ?? "",
      avisos: i.avisos,
      arquivos: d.arquivosPorItem.get(i.id) ?? [],
    })),
    semMeio: d.semMeio.map((i, n) => ({ numero: d.itens.length + n + 1, texto: `${i.fornecedor} · ${brl(i.valor)} · vence ${dataBr(i.vencimento)}`, arquivos: d.arquivosPorItem.get(i.id) ?? [] })),
    aviso: AVISO_DE_CONFERENCIA,
    assinatura: linhasDaAssinatura("documento"),
  };
}

// ── desenho ────────────────────────────────────────────────────────────────────

const LARGURA = 595.28, ALTURA = 841.89, MARGEM = 42;
const CINZA = rgb(0.4, 0.4, 0.4), ESCURO = rgb(0.12, 0.12, 0.12), OURO = rgb(0.54, 0.43, 0.23), VERMELHO = rgb(0.7, 0.2, 0.15);

export async function gerarResumoDoLotePdf(d: DadosDoResumo): Promise<Uint8Array> {
  const b = blocosDoResumo(d);
  const pdf = await PDFDocument.create();
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);
  pdf.setTitle(seguroParaPdf(b.titulo)); pdf.setCreator("DiakoniaApp"); pdf.setProducer("DiakoniaApp");

  let pagina: PDFPage = pdf.addPage([LARGURA, ALTURA]);
  let y = ALTURA - MARGEM;
  const util = LARGURA - 2 * MARGEM;
  const RESERVA_RODAPE = 56;

  const novaPagina = () => { pagina = pdf.addPage([LARGURA, ALTURA]); y = ALTURA - MARGEM; };
  const garantir = (altura: number) => { if (y - altura < MARGEM + RESERVA_RODAPE) novaPagina(); };

  /** quebra o texto em linhas que caibam na largura */
  const quebrar = (texto: string, fonte: PDFFont, tam: number, largura: number): string[] => {
    const linhas: string[] = []; let atual = "";
    for (const palavra of seguroParaPdf(texto).split(/\s+/).filter(Boolean)) {
      const tenta = atual ? `${atual} ${palavra}` : palavra;
      if (fonte.widthOfTextAtSize(tenta, tam) <= largura) { atual = tenta; continue; }
      if (atual) linhas.push(atual);
      // palavra maior que a linha (código comprido): corta onde der
      let resto = palavra;
      while (fonte.widthOfTextAtSize(resto, tam) > largura) {
        let n = resto.length; while (n > 1 && fonte.widthOfTextAtSize(resto.slice(0, n), tam) > largura) n--;
        linhas.push(resto.slice(0, n)); resto = resto.slice(n);
      }
      atual = resto;
    }
    if (atual) linhas.push(atual);
    return linhas;
  };
  const escrever = (texto: string, fonte: PDFFont, tam: number, cor = ESCURO, recuo = 0) => {
    for (const linha of quebrar(texto, fonte, tam, util - recuo)) {
      garantir(tam + 3); y -= tam + 3;
      pagina.drawText(linha, { x: MARGEM + recuo, y, size: tam, font: fonte, color: cor });
    }
  };

  // cabeçalho
  escrever("Quarta Igreja Batista do Rio de Janeiro", negrito, 13);
  escrever(b.titulo, negrito, 11, OURO);
  escrever(b.linhaDoLote, normal, 9, CINZA);
  y -= 6;
  pagina.drawLine({ start: { x: MARGEM, y }, end: { x: LARGURA - MARGEM, y }, thickness: 0.6, color: rgb(0.8, 0.72, 0.5) });
  y -= 4;

  for (const it of b.itens) {
    garantir(70);
    y -= 8;
    escrever(`${String(it.numero).padStart(2, "0")}  ${it.cabecalho}`, negrito, 10);
    escrever(it.beneficiario, normal, 10, ESCURO, 16);
    escrever(`Origem: ${it.origem}`, normal, 8, CINZA, 16);
    if (it.codigo) escrever(it.codigo, mono, 8.5, ESCURO, 16);
    for (const a of it.avisos) escrever(`Atenção: ${a}`, normal, 8, VERMELHO, 16);
    if (it.arquivos.length > 0) escrever(`Arquivos: ${it.arquivos.join("; ")}`, normal, 8, CINZA, 16);
    else escrever("Sem documento anexado a esta obrigação.", normal, 8, VERMELHO, 16);
  }

  if (b.semMeio.length > 0) {
    garantir(60); y -= 14;
    escrever("SEM MEIO AUTOMÁTICO DE PAGAMENTO — conferir o documento", negrito, 10, OURO);
    for (const s of b.semMeio) {
      y -= 4;
      escrever(`${String(s.numero).padStart(2, "0")}  ${s.texto}`, normal, 10);
      escrever(s.arquivos.length > 0 ? `Arquivos: ${s.arquivos.join("; ")}` : "Sem documento anexado a esta obrigação.", normal, 8, s.arquivos.length > 0 ? CINZA : VERMELHO, 16);
    }
  }

  garantir(30); y -= 12;
  escrever(b.aviso, normal, 9, CINZA);

  // rodapé em todas as páginas: assinatura + página x de y
  const paginas = pdf.getPages();
  paginas.forEach((p, n) => {
    const [, , descricao, autoria] = b.assinatura;
    const linhas = [`DiakoniaApp · ${b.assinatura[1]}`, seguroParaPdf(`${b.assinatura[0]} ${descricao}`), seguroParaPdf(autoria)];
    linhas.forEach((l, k) => p.drawText(seguroParaPdf(l), { x: MARGEM, y: MARGEM + 26 - k * 10, size: 7, font: normal, color: CINZA }));
    const marca = `página ${n + 1} de ${paginas.length}`;
    p.drawText(marca, { x: LARGURA - MARGEM - normal.widthOfTextAtSize(marca, 7), y: MARGEM + 6, size: 7, font: normal, color: CINZA });
  });

  return pdf.save();
}
