// ─── ocrService.ts — leitura de comprovante/NF client-side ───────────────────
// Roda 100% no browser. Sem chave externa. Custo zero.
//
// Pedido da Telma (15/09/2026): "leitura mais precisa". Até aqui, TODO PDF
// anexado era rasterizado (`pdfParaImagem`) e lido por OCR (Tesseract) —
// mesmo quando o PDF já tinha uma camada de texto exata embutida (o caso
// comum de um DANFE/recibo gerado por sistema, não escaneado). Isso jogava
// fora a fonte mais precisa disponível pra usar a mais sujeita a erro.
//
// Agora, pra PDF, tenta primeiro `textoDoPdf` (extração exata via
// `pdfjs-dist`, já dependência do projeto — sem OCR nenhum). Só cai pro
// caminho antigo (rasterizar + Tesseract) quando o PDF não tem texto
// aproveitável (documento escaneado/fotografado como PDF). `fonte` no
// resultado diz qual caminho foi usado — a tela usa isso pra decidir o que
// pode travar (não-editável) e o que continua exigindo conferência.
// Fase 3 (15/09/2026) — itens da nota. Calibrado em cima de notas REAIS da
// tesouraria (baixadas do Drive dela pra este trabalho — SENDAS
// DISTRIBUIDORA, PRODESC BENFICA EMBALAGENS): o formato dominante não é o
// DANFE clássico, é a "Consulta da NF-e" que a Sefaz gera
// (portal.nfe.fazenda.gov.br) — mais verboso, mas com rótulos e uma tabela
// de itens ("Dados dos Produtos e Serviços") bem mais fáceis de reconhecer
// que o DANFE compacto. `extrairItensDaNota` mira nesse formato; fora dele,
// devolve lista vazia — melhor não ter itens do que inventar item errado
// num formato que não foi calibrado (ver comentário de `ItemNota`).
export interface ItemNota {
  descricao: string;
  quantidade: number;
  unidade: string;
  valorTotal: number;
}

export interface OcrResultado {
  textoBruto: string;
  valor: number | null;
  data: string | null;            // ISO YYYY-MM-DD
  cnpj: string | null;            // só dígitos
  cnpjFormatado: string | null;   // XX.XXX.XXX/XXXX-XX
  razaoSocial: string | null;     // melhor candidato
  numeroDoc: string | null;       // nº NF se identificado
  /** Itens de "Dados dos Produtos e Serviços" — só no formato "Consulta da
      NF-e" reconhecido; lista vazia nos demais (DANFE compacto, cupom,
      foto). Nunca uma lista adivinhada — ou lê os itens de verdade, ou não
      lê nenhum. */
  itens: ItemNota[];
  duracaoMs: number;
  confianca: number;              // 0-100
  /** De onde veio o texto lido — "pdf_texto" é extração exata (sem OCR),
      "ocr" é Tesseract (aproximado, sempre precisa de conferência). */
  fonte: "pdf_texto" | "ocr";
}

// Tesseract carrega só quando precisar (lazy load, evita inflar bundle inicial)
async function getWorker() {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("por", 1);
  return worker;
}

// Reformata string com /, -, ., espaços
function limparDigitos(s: string): string {
  return s.replace(/\D/g, "");
}

// Regex pra valor monetário brasileiro
//   R$ 1.234,56 / 1234,56 / 1.234,56
const REGEX_VALOR = /(?:R\$\s*)?(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}/g;

// Data DD/MM/YYYY ou DD-MM-YYYY ou DD.MM.YYYY
const REGEX_DATA = /(\d{2})[/\-.](\d{2})[/\-.](20\d{2})/g;

// CNPJ XX.XXX.XXX/XXXX-XX (com ou sem máscara)
const REGEX_CNPJ = /(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/;
const REGEX_CNPJ_DIGITOS = /\b(\d{14})\b/;

// Número da nota
const REGEX_NF = /(?:n[°º]?\s*|nota\s+fiscal\s+n?[°º]?\s*|nf-?e?\s*n?[°º]?\s*)(\d{4,9})/i;

/** Encontra o maior valor — tipicamente o "TOTAL" da NF */
function extrairMaiorValor(texto: string): number | null {
  const ms = Array.from(texto.matchAll(REGEX_VALOR));
  if (ms.length === 0) return null;
  const valores = ms.map(m => {
    const raw = m[0].replace(/R\$\s*/, "").replace(/\./g, "").replace(",", ".");
    return parseFloat(raw);
  }).filter(v => !isNaN(v) && v > 0);
  if (valores.length === 0) return null;
  return Math.max(...valores);
}

/** "Data de Emissão" — achado numa nota real (PRODESC): o heurístico
    antigo ("a data mais recente e válida em TODO o texto") pegava a data
    de "Ciência da Operação pelo Destinatário" (um evento posterior,
    registrado no mesmo documento) em vez da emissão de verdade — 07/08 em
    vez de 06/08. A primeira data que aparece logo depois do rótulo "Data
    de Emissão" é a de verdade; olhar o texto inteiro não é preciso o
    bastante quando o documento lista várias datas de eventos diferentes. */
function extrairDataEmissaoRotulada(texto: string): string | null {
  const idx = texto.search(/Data de Emissão/i);
  if (idx === -1) return null;
  const janela = texto.slice(idx, idx + 250);
  // `REGEX_DATA` tem a flag `g` — `.match()` nesse modo devolve só as
  // strings inteiras batidas, SEM os grupos de captura (dd/mm/yyyy viriam
  // `undefined`). `matchAll` preserva os grupos mesmo com `g`.
  const [m] = Array.from(janela.matchAll(REGEX_DATA));
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  if (isNaN(d.getTime())) return null;
  return `${yyyy}-${mm}-${dd}`;
}

/** Pega a data mais recente válida (não pode ser no futuro) — usado só
    quando o rótulo "Data de Emissão" não existe no texto (DANFE compacto,
    cupom, OCR de foto). */
function extrairMelhorData(texto: string): string | null {
  const hoje = new Date();
  const candidatas: Date[] = [];
  for (const m of texto.matchAll(REGEX_DATA)) {
    const [_, dd, mm, yyyy] = m;
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    if (isNaN(d.getTime())) continue;
    if (d > hoje) continue; // futuro não vale
    // razoável: nos últimos 5 anos
    const cincoAnos = new Date(hoje.getFullYear() - 5, 0, 1);
    if (d < cincoAnos) continue;
    candidatas.push(d);
  }
  if (candidatas.length === 0) return null;
  // Pega a mais recente
  candidatas.sort((a, b) => b.getTime() - a.getTime());
  return candidatas[0].toISOString().slice(0, 10);
}

function extrairCnpj(texto: string): { digitos: string | null; formatado: string | null } {
  const mFmt = texto.match(REGEX_CNPJ);
  if (mFmt) {
    const dig = limparDigitos(mFmt[1]);
    if (dig.length === 14) {
      return { digitos: dig, formatado: formatarCnpj(dig) };
    }
  }
  const mDig = texto.match(REGEX_CNPJ_DIGITOS);
  if (mDig) {
    return { digitos: mDig[1], formatado: formatarCnpj(mDig[1]) };
  }
  return { digitos: null, formatado: null };
}

function formatarCnpj(digitos: string): string {
  if (digitos.length !== 14) return digitos;
  return `${digitos.slice(0, 2)}.${digitos.slice(2, 5)}.${digitos.slice(5, 8)}/${digitos.slice(8, 12)}-${digitos.slice(12, 14)}`;
}

/** Heurística: a razão social fica perto do CNPJ, geralmente 1-3 linhas acima */
function extrairRazaoSocial(texto: string, cnpjBruto: string | null): string | null {
  if (!cnpjBruto) return null;
  const linhas = texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  // Encontra a linha que contém o CNPJ
  const idx = linhas.findIndex(l => limparDigitos(l).includes(cnpjBruto));
  if (idx === -1) return null;
  // Pega até 3 linhas acima — escolhe a mais longa que parece nome de empresa
  const candidatas = linhas.slice(Math.max(0, idx - 3), idx);
  // Heurística: linha com 2+ palavras, em maiúsculo ou misto, sem só números
  let melhor: string | null = null;
  for (const l of candidatas) {
    if (l.length < 4) continue;
    if (/^\d+$/.test(l)) continue;
    const palavras = l.split(/\s+/).filter(Boolean);
    if (palavras.length < 2) continue;
    if (!melhor || l.length > melhor.length) melhor = l;
  }
  return melhor;
}

function extrairNumeroNf(texto: string): string | null {
  const m = texto.match(REGEX_NF);
  return m ? m[1] : null;
}

// "Chave de Acesso Número NF-e Versão" (topo do formato Consulta da NF-e)
// — outra linha de rótulos seguida de linha de valores, mas aqui o valor
// certo é fácil de isolar: logo depois do bloco longo de dígitos/pontos/
// traços da própria chave de acesso, vem o número da nota "solto" (sem
// pontuação), seguido da versão do XML (sempre um dígito.dois dígitos,
// tipo "4.00"). Achado real, ao vivo: sem isto, `extrairNumeroNf`
// (heurístico genérico de sempre) pegava um número de protocolo por
// engano — a nota real da SENDAS é 107015, não 891258017 (um protocolo
// que aparece bem mais abaixo no documento).
const REGEX_NUMERO_NOTA_ROTULADO = /[\d.\-/]{20,}\s+(\d{4,9})\s+\d\.\d{2}\b/;

function extrairNumeroNfRotulado(texto: string): string | null {
  const m = texto.match(REGEX_NUMERO_NOTA_ROTULADO);
  return m ? m[1] : null;
}

// ── Valor total: três âncoras, da mais confiável pra menos ────────────────
//
// Conferido contra as notas REAIS (não só o texto sintético do primeiro
// teste) — rodando `textoDoPdf` de verdade num PDF baixado do Drive da
// Telma, achei que o texto reconstruído do pdf.js não é "rótulo, valor"
// simples: é uma LINHA DE RÓTULOS seguida de uma LINHA DE VALORES (o
// jeito como colunas de uma tabela viram texto quando reconstruídas por
// posição Y) — ex.: "Valor da COFINS Outras Despesas Acessórias Valor
// Total da NFe Valor Aproximado dos Tributos" numa linha, "13,00 0,00
// 2.282,96" na linha seguinte (4 rótulos, só 3 valores — o último rótulo
// não tinha valor, então a posição do valor de "Valor Total da NFe" NÃO
// é fixa por contagem). Um regex simples de "rótulo seguido do valor"
// (a primeira tentativa desta função) casava direto com esse formato só
// por sorte no teste sintético — rodando no arquivo de verdade, não achava
// nada e caía pro heurístico de "maior valor", reproduzindo o mesmo bug
// que essa função existe pra evitar.
//
// Duas âncoras appareceram confiáveis nas notas reais:
//   1. "Valor Líquido" (seção "Dados de Cobrança") — rótulo e valor
//      ficam sozinhos na própria linha, sem mais nada — o mais confiável,
//      mas só existe quando a nota tem cobrança/duplicata (nem toda).
//   2. "Valor Total da Nota Fiscal" (bem no topo, em "Dados da NF-e") —
//      É sempre o ÚLTIMO rótulo daquela linha de cabeçalho, então seu
//      valor é sempre o ÚLTIMO valor monetário da linha de valores
//      correspondente — confirmado nas duas notas reais testadas.
const REGEX_VALOR_LIQUIDO = /Valor Líquido\s*\n?\s*(?:R\$\s*)?((?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})/i;

function paraValorBr(s: string): number | null {
  const n = parseFloat(s.replace(/R\$\s*/, "").replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? null : n;
}

function extrairValorLiquido(texto: string): number | null {
  const m = texto.match(REGEX_VALOR_LIQUIDO);
  return m ? paraValorBr(m[1]) : null;
}

function extrairValorTotalDaNotaFiscal(texto: string): number | null {
  const idx = texto.search(/Valor Total da Nota Fiscal/i);
  if (idx === -1) return null;
  const restante = texto.slice(idx);
  const fimEmitente = restante.search(/\nEmitente\n/i);
  const janela = fimEmitente === -1 ? restante.slice(0, 300) : restante.slice(0, fimEmitente);
  const ms = Array.from(janela.matchAll(REGEX_VALOR));
  if (ms.length === 0) return null;
  return paraValorBr(ms[ms.length - 1][0]);
}

function extrairValorRotulado(texto: string): number | null {
  return extrairValorLiquido(texto) ?? extrairValorTotalDaNotaFiscal(texto);
}

/** "Dados do Emitente" — achado nas notas reais: o bloco tem "Nome / Razão
    Social" e "CNPJ" próprios do EMISSOR (o fornecedor), distintos do bloco
    "Dados do Destinatário" (sempre a própria igreja — pegar o nome/CNPJ
    "mais perto de um CNPJ qualquer" no texto inteiro, como fazia
    `extrairRazaoSocial`, arrisca pegar o da igreja por engano, já que o
    CNPJ do destinatário também aparece no documento). Corta uma janela a
    partir do rótulo, até "Dados do Destinatário" (se aparecer dentro
    dela) ou até 500 caracteres.
    O CNPJ é buscado com o rótulo "CNPJ" ancorado, NÃO com `extrairCnpj`
    genérico — achado numa nota real (PRODESC BENFICA): o bloco lista
    "Nome / Razão Social", depois "Protocolo" (um número de 15 dígitos),
    e só depois "CNPJ". `extrairCnpj` pega o primeiro trecho com formato
    de CNPJ no texto sem exigir o rótulo do lado — e o REGEX_CNPJ (com
    pontuação opcional) não tem fronteira de palavra no fim, então casa os
    14 primeiros dígitos de um número de 15 dígitos vizinho (o protocolo)
    como se fossem um CNPJ. Ancorar no rótulo evita isso. */
function extrairEmitente(texto: string): { nome: string | null; cnpj: string | null; cnpjFormatado: string | null } {
  const idx = texto.search(/Dados do Emitente/i);
  if (idx === -1) return { nome: null, cnpj: null, cnpjFormatado: null };
  let janela = texto.slice(idx, idx + 500);
  const fimDestinatario = janela.search(/Dados do Destinatário/i);
  if (fimDestinatario !== -1) janela = janela.slice(0, fimDestinatario);

  // Achado rodando contra um PDF real (PRODESC): o rótulo às vezes vem
  // "Nome / Razão Social Nome Fantasia" NA MESMA linha (duas colunas de
  // cabeçalho lado a lado) — a PRIMEIRA versão deste regex capturava
  // `[^\n]+` logo depois do rótulo, sem forçar passar da linha de
  // cabeçalho, e pegava literalmente " Nome Fantasia" (o segundo rótulo
  // da mesma linha) em vez do valor de verdade, que só vem na linha
  // seguinte. `[^\n]*\n` depois do rótulo força consumir o resto da linha
  // de CABEÇALHO inteira antes de capturar — cai certo na linha de valor.
  //
  // Mesmo corrigido, ainda pode vir com o nome fantasia colado no fim
  // ("Prodesc Benfica Embalagens Ltda Me PJ Rio Embalagens") — sem a
  // posição X de cada palavra (só linha, não coluna), não dá pra separar
  // os dois com certeza. Por isso NUNCA travar este campo como "exato" na
  // tela; é só sugestão pra busca de fornecedor, igual sempre foi. O CNPJ
  // (extraído à parte, com rótulo próprio) é que é confiável pra vincular
  // o fornecedor certo.
  const mNome = janela.match(/Nome\s*\/\s*Razão Social[^\n]*\n([^\n]+)/i);
  const nome = mNome ? mNome[1].trim() : null;

  const mCnpj = janela.match(/\bCNPJ\s*\n?\s*(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})\b/i);
  const cnpj = mCnpj ? limparDigitos(mCnpj[1]) : null;
  const cnpjFormatado = cnpj && cnpj.length === 14 ? formatarCnpj(cnpj) : null;
  return { nome, cnpj, cnpjFormatado };
}

// Linha de item no formato "Consulta da NF-e": "1 ACUCAR REF GUARANI 1KG
// 40,0000 PC1 159,60" — número do item, descrição, quantidade (SEMPRE 4
// casas decimais nesse formato — é o que distingue de um número qualquer
// dentro da própria descrição, tipo "2,5 KG" com 1 casa), unidade, valor
// total do item (2 casas). Ancorado no fim da linha (`$`) pra não confundir
// um número dentro da descrição com o valor de verdade.
const REGEX_ITEM_NOTA = /^(\d{1,3})\s+(.+?)\s+(\d+(?:\.\d{3})*,\d{4})\s+([A-Za-zÀ-ÿ0-9]{1,6})\s+(\d+(?:\.\d{3})*,\d{2})$/;

function paraNumeroBr(s: string): number {
  return parseFloat(s.replace(/\./g, "").replace(",", "."));
}

/** Itens de "Dados dos Produtos e Serviços" — só reconhece o formato
    "Consulta da NF-e" (ver comentário de `ItemNota`). Corta a janela entre
    esse rótulo e "Totais" (onde a tabela de itens sempre termina nesse
    formato) pra não testar a linha-regex contra o documento inteiro —
    fora dessa janela é só ruído (dados de imposto, cabeçalho, endereço)
    que por acaso poderia casar com o formato "algo número número". */
function extrairItensDaNota(texto: string): ItemNota[] {
  const inicio = texto.search(/Dados dos Produtos e Serviços/i);
  if (inicio === -1) return [];
  const fimRel = texto.slice(inicio).search(/\nTotais\n/i);
  const janela = fimRel === -1 ? texto.slice(inicio) : texto.slice(inicio, inicio + fimRel);

  const itens: ItemNota[] = [];
  for (const linhaBruta of janela.split("\n")) {
    const linha = linhaBruta.trim();
    const m = linha.match(REGEX_ITEM_NOTA);
    if (!m) continue;
    const [, , descricao, qtd, unidade, valor] = m;
    itens.push({
      descricao: descricao.trim(),
      quantidade: paraNumeroBr(qtd),
      unidade,
      valorTotal: paraNumeroBr(valor),
    });
  }
  return itens;
}

/** As mesmas heurísticas de campo, aplicadas a QUALQUER texto de origem —
    exato (camada de texto do PDF) ou aproximado (OCR). O texto em si que
    muda de precisão; a extração de campo é a mesma nos dois casos.
    Exportada (não só usada internamente) pra dar pra testar as heurísticas
    de regex direto, sem precisar simular um PDF ou rodar Tesseract. */
export function extrairCamposDoTexto(texto: string) {
  const valor = extrairValorRotulado(texto) ?? extrairMaiorValor(texto);
  const data = extrairDataEmissaoRotulada(texto) ?? extrairMelhorData(texto);

  // "Dados do Emitente" (formato Consulta da NF-e) é mais confiável que a
  // heurística genérica "nome perto de um CNPJ qualquer" — só cai pra ela
  // quando o rótulo não existe (DANFE compacto e outros formatos).
  const emitente = extrairEmitente(texto);
  const { digitos: cnpjGenerico, formatado: cnpjFormatadoGenerico } = extrairCnpj(texto);
  const cnpj = emitente.cnpj ?? cnpjGenerico;
  const cnpjFormatado = emitente.cnpjFormatado ?? cnpjFormatadoGenerico;
  const razaoSocial = emitente.nome ?? extrairRazaoSocial(texto, cnpj);

  const numeroDoc = extrairNumeroNfRotulado(texto) ?? extrairNumeroNf(texto);
  const itens = extrairItensDaNota(texto);
  return { valor, data, cnpj, cnpjFormatado, razaoSocial, numeroDoc, itens };
}

/** Roda o OCR (Tesseract) sobre uma imagem/PDF rasterizado — o caminho
    antigo, agora só usado quando não há texto aproveitável no PDF, ou o
    arquivo já é imagem (foto). */
async function ocrPorImagem(file: File): Promise<{ texto: string; confianca: number }> {
  let arquivoParaOcr: File = file;
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    arquivoParaOcr = await pdfParaImagem(file);
  }
  const worker = await getWorker();
  try {
    const { data } = await worker.recognize(arquivoParaOcr);
    return { texto: data.text, confianca: data.confidence ?? 0 };
  } finally {
    await worker.terminate();
  }
}

/** Função principal — lê o comprovante/NF e devolve dados estruturados.
    PDF tenta texto exato primeiro (`textoDoPdf`); só recorre a OCR quando
    não há camada de texto aproveitável, ou o arquivo é imagem. */
export async function extrairDadosDoComprovante(file: File): Promise<OcrResultado> {
  const t0 = performance.now();
  const ehPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

  let texto: string;
  let confianca: number;
  let fonte: OcrResultado["fonte"];

  const textoExato = ehPdf ? await textoDoPdf(file) : null;
  if (textoExato) {
    texto = textoExato;
    confianca = 100; // extração exata — não é probabilidade, é o texto real do arquivo
    fonte = "pdf_texto";
  } else {
    const r = await ocrPorImagem(file);
    texto = r.texto;
    confianca = Math.round(r.confianca);
    fonte = "ocr";
  }

  return {
    textoBruto: texto,
    ...extrairCamposDoTexto(texto),
    duracaoMs: Math.round(performance.now() - t0),
    confianca,
    fonte,
  };
}

// ─── PDF → texto exato (todas as páginas) ────────────────────────────────
// `pdfjs-dist` já lazy-carregado (mesma lib de `pdfParaImagem`, abaixo).
// Devolve `null` quando o PDF não tem camada de texto aproveitável — um
// PDF gerado a partir de escaneamento/foto tem zero (ou quase zero) itens
// de texto reais, só a imagem da página; nesse caso o único caminho
// possível continua sendo OCR (`ocrPorImagem`).
const TEXTO_MINIMO_UTIL = 30;
const TOLERANCIA_Y = 2; // px de variação ainda considerados "a mesma linha"

/** Agrupa fragmentos de texto posicionados (x, y — do `item.transform` do
    pdf.js) em linhas visuais, topo→baixo e esquerda→direita dentro de cada
    linha. Extraída à parte de `textoDoPdf` pra poder testar a lógica de
    agrupamento sem precisar simular um PDF de verdade. */
export function agruparEmLinhas(itens: { texto: string; x: number; y: number }[]): string[] {
  const ordenados = [...itens].sort((a, b) => (b.y - a.y) || (a.x - b.x));
  const linhas: string[] = [];
  let buffer: string[] = [];
  let refY: number | null = null;
  for (const it of ordenados) {
    if (refY === null || Math.abs(it.y - refY) <= TOLERANCIA_Y) {
      buffer.push(it.texto);
      refY = refY === null ? it.y : refY;
    } else {
      linhas.push(buffer.join(" "));
      buffer = [it.texto];
      refY = it.y;
    }
  }
  if (buffer.length > 0) linhas.push(buffer.join(" "));
  return linhas;
}

export async function textoDoPdf(file: File): Promise<string | null> {
  const pdfjs: any = await import("pdfjs-dist");
  const v = pdfjs.version;
  pdfjs.GlobalWorkerOptions.workerSrc =
    `https://cdn.jsdelivr.net/npm/pdfjs-dist@${v}/build/pdf.worker.min.mjs`;

  const arrayBuf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuf }).promise;

  const paginas: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const conteudo = await page.getTextContent();
    // `item.str` sozinho não basta — vem em ORDEM DE DESENHO no PDF, não em
    // ordem de leitura, e sem quebra de linha nenhuma (juntar tudo com
    // espaço vira UMA linha gigante por página). Isso quebrava
    // `extrairRazaoSocial`, que procura texto "1-3 linhas acima do CNPJ" —
    // sem linha nenhuma pra contar, a heurística comparava página com
    // página, não linha com linha. `item.transform` traz a posição (x, y)
    // de cada fragmento; `agruparEmLinhas` reconstrói a linha visual.
    const itens = (conteudo.items as any[])
      .filter(it => typeof it.str === "string" && it.str.length > 0)
      .map(it => ({ texto: it.str as string, x: it.transform[4] as number, y: it.transform[5] as number }));

    paginas.push(agruparEmLinhas(itens).join("\n"));
  }

  const textoCompleto = paginas.join("\n\n").replace(/[ \t]+/g, " ").trim();
  return textoCompleto.length >= TEXTO_MINIMO_UTIL ? textoCompleto : null;
}

// ─── PDF → imagem (primeira página) ──────────────────────────────────────
// Carrega pdfjs lazy. Renderiza a página 1 em um canvas e devolve blob/file.
export async function pdfParaImagem(file: File, escala = 2): Promise<File> {
  const pdfjs: any = await import("pdfjs-dist");
  // Configura worker via CDN (não precisa bundlar)
  const v = pdfjs.version;
  pdfjs.GlobalWorkerOptions.workerSrc =
    `https://cdn.jsdelivr.net/npm/pdfjs-dist@${v}/build/pdf.worker.min.mjs`;

  const arrayBuf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuf }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: escala });

  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas não suportado");

  await page.render({ canvasContext: ctx, viewport }).promise;

  // Canvas → blob PNG
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(b => b ? resolve(b) : reject(new Error("Falha no toBlob")), "image/png", 0.92);
  });

  // Wrap como File pra Tesseract aceitar
  const nome = file.name.replace(/\.pdf$/i, ".png");
  return new File([blob], nome, { type: "image/png" });
}
