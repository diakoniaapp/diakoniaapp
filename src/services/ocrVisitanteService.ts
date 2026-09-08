// ─── ocrVisitanteService.ts — OCR do cartão impresso de visitante ────────────
// Mesma base do ocrService.ts (Tesseract.js, 100% no navegador, sem chave
// externa), mas lendo o cartão "Conte-nos mais sobre você" em vez de nota
// fiscal — layout bem diferente, então a extração é outra.
//
// O cartão real (foto enviada em 08/09/2026): campos rotulados em caixa —
// NOME COMPLETO, DATA DE NASCIMENTO, TELEFONE | WHATSAPP, ENDEREÇO — e duas
// seções de caixinha marcada à mão (COMO CONHECEU A IGREJA?, PEDIDOS DE
// ORAÇÃO), cada uma com um campo de texto livre ao lado.
//
// **Limite de propósito**: o Tesseract faz OCR de TEXTO. Ele não sabe dizer
// qual quadradinho tem um X dentro — só lê letras. Por isso esta função
// extrai os 4 campos de texto rotulado (nome, nascimento, telefone,
// endereço) e devolve o texto bruto inteiro pras duas seções de caixinha:
// quem cadastra lê o texto reconhecido e marca a opção certa à mão. Fingir
// que dava pra ler o X seria pior que não tentar — a pessoa confiaria numa
// escolha que ninguém fez.

import { normalizarTelefone } from "@/lib/telefone";

export interface CartaoVisitanteLido {
  textoBruto:      string;
  nome:            string | null;
  telefone:        string | null;   // já normalizado (5521999999999), pronto pro campo
  email:           string | null;
  dataNascimento:  string | null;   // ISO YYYY-MM-DD, pronto pro <input type="date">
  endereco:        string | null;
  duracaoMs:        number;
  confianca:        number;          // 0-100
}

async function getWorker() {
  const { createWorker } = await import("tesseract.js");
  return createWorker("por", 1);
}

const REGEX_EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

// Sequências de 10 a 13 dígitos são candidatas a telefone — DDD+fixo (10),
// DDD+celular (11), ou já com DDI 55 (12-13). `normalizarTelefone` decide se
// o formato bate; aqui só se separam os candidatos plausíveis do resto do
// texto (datas, CEP, número de casa não têm essa faixa de tamanho).
//
// Testado com um cartão real: o Tesseract leu um "7" escrito à mão como "/"
// no meio do número. Cheguei a tentar aceitar "/" aqui pra recuperar esse
// caso — e desisti: com "/" liberado, a mesma consulta gulosa passa a
// alcançar a DATA DE NASCIMENTO na linha ao lado (esta ficha tem os dois
// campos lado a lado) e cola os dígitos dos dois num número que PARECE
// válido — mesma contagem de dígitos de um telefone de verdade — mas está
// simplesmente errado. Um telefone errado que ninguém confere é pior que um
// campo vazio que pede pra ser digitado — por isso a regra fica estrita: um
// separador que a OCR não reconhece quebra a leitura, e a pessoa preenche à
// mão. Ver o texto reconhecido, que sempre aparece do lado.
const REGEX_DIGITOS_TELEFONE = /\d[\d\s().-]{8,17}\d/g;

// DD/MM/AA ou DD/MM/AAAA — o cartão real escreve ano com 2 dígitos ("71").
const REGEX_DATA = /\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})\b/;

/**
 * Segundo problema real, achado testando com o Tesseract de verdade: DATA DE
 * NASCIMENTO e TELEFONE ficam lado a lado neste cartão, e a OCR devolve as
 * duas linhas de valor GRUDADAS numa só — "15/04/1971 21975193855", só um
 * espaço separando. Sem tratamento, a busca gulosa por telefone começa a
 * varrer já em "1971" (a barra da data quebra o início, mas o fim do ano
 * sobra limpo), gruda esses 4 dígitos com os 11 do telefone e o total
 * (15 dígitos) estoura o limite — nenhum telefone é encontrado.
 *
 * Por isso a data já reconhecida é REMOVIDA do texto antes de procurar o
 * telefone: sem o "1971" ali do lado, sobra só o telefone limpo.
 */
function extrairTelefone(texto: string, dataEncontrada: RegExpMatchArray | null): string | null {
  const idx = dataEncontrada?.index;
  const semData = dataEncontrada && idx !== undefined
    ? texto.slice(0, idx) + " " + texto.slice(idx + dataEncontrada[0].length)
    : texto;
  for (const m of semData.matchAll(REGEX_DIGITOS_TELEFONE)) {
    const digitos = m[0].replace(/\D/g, "");
    if (digitos.length < 10 || digitos.length > 13) continue;
    const normalizado = normalizarTelefone(digitos);
    // 55 + DDD (2) + 8 ou 9 dígitos = 12 ou 13 no total
    if (normalizado.length === 12 || normalizado.length === 13) return normalizado;
  }
  return null;
}

function extrairEmail(texto: string): string | null {
  const m = texto.match(REGEX_EMAIL);
  return m ? m[0].toLowerCase() : null;
}

/**
 * Ano de 2 dígitos → ano completo. Sem o século escrito, o palpite é: quem
 * preenche este cartão vai do recém-nascido ao idoso, não só de uma faixa —
 * então "71" quase certo é 1971 (idade plausível), e "18" quase certo é 2018
 * (uma criança). O corte em "5 anos à frente de hoje" cobre bebês que ainda
 * vão nascer neste ano civil sem também engolir alguém de 90+ anos.
 */
function anoCompleto(yy: number): number {
  const anoCurtoAtual = new Date().getFullYear() % 100;
  return yy <= anoCurtoAtual + 5 ? 2000 + yy : 1900 + yy;
}

function extrairDataNascimento(m: RegExpMatchArray | null): string | null {
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return null;
  const ano = m[3].length === 2 ? anoCompleto(Number(m[3])) : Number(m[3]);
  if (ano < 1900 || ano > new Date().getFullYear() + 1) return null;
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Pega o texto que vem depois de um rótulo — na linha dele (após ":") ou,
 *  se o rótulo estiver sozinho (caixa abaixo, como neste cartão), na
 *  primeira linha não-vazia seguinte que não seja outro rótulo conhecido. */
function extrairAposRotulo(linhas: string[], regexRotulo: RegExp, outrosRotulos: RegExp): string | null {
  const idx = linhas.findIndex(l => regexRotulo.test(l));
  if (idx === -1) return null;

  const naMesmaLinha = linhas[idx].replace(regexRotulo, "").replace(/^[:\-\s]+/, "").trim();
  if (naMesmaLinha.length >= 2) return naMesmaLinha;

  for (let i = idx + 1; i < linhas.length && i < idx + 3; i++) {
    const cand = linhas[i].trim();
    if (!cand) continue;
    if (outrosRotulos.test(cand)) break; // caixa vazia — o rótulo seguinte já começou
    return cand;
  }
  return null;
}

// Rótulos impressos do cartão — usados tanto para achar cada campo quanto
// para saber onde a caixa de um campo TERMINA (a linha do próximo rótulo).
const ROTULOS = /nome\s+completo|data\s+de\s+nascimento|telefone|whatsapp|endere[cç]o|como\s+conheceu|pedidos?\s+de\s+ora[cç][aã]o/i;

function extrairNome(linhas: string[]): string | null {
  return extrairAposRotulo(linhas, /nome\s+completo/i, ROTULOS);
}

function extrairEndereco(linhas: string[]): string | null {
  const idx = linhas.findIndex(l => /endere[cç]o/i.test(l));
  if (idx === -1) return null;
  // O endereço deste cartão ocupa 1-2 linhas dentro da caixa — junta as duas
  // se a segunda não for já o próximo rótulo.
  const partes: string[] = [];
  for (let i = idx + 1; i < linhas.length && i < idx + 3; i++) {
    const cand = linhas[i].trim();
    if (!cand) continue;
    if (ROTULOS.test(cand)) break;
    partes.push(cand);
    if (partes.length >= 2) break;
  }
  return partes.length ? partes.join(", ") : null;
}

/** Função principal — roda OCR na foto do cartão e devolve dados estruturados. */
export async function lerCartaoVisitante(file: File): Promise<CartaoVisitanteLido> {
  const t0 = performance.now();

  const worker = await getWorker();
  let texto = "";
  let confianca = 0;
  try {
    const { data } = await worker.recognize(file);
    texto = data.text;
    confianca = data.confidence ?? 0;
  } finally {
    await worker.terminate();
  }

  const linhas = texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  // A data é achada uma vez só e passada adiante: `extrairTelefone` precisa
  // dela pra removê-la antes de procurar dígitos de telefone (ver o
  // comentário lá em cima do porquê).
  const dataMatch       = texto.match(REGEX_DATA);
  const dataNascimento  = extrairDataNascimento(dataMatch);
  const telefone        = extrairTelefone(texto, dataMatch);
  const email           = extrairEmail(texto);
  const nome            = extrairNome(linhas);
  const endereco        = extrairEndereco(linhas);

  return {
    textoBruto: texto,
    nome,
    telefone,
    email,
    dataNascimento,
    endereco,
    duracaoMs: Math.round(performance.now() - t0),
    confianca: Math.round(confianca),
  };
}
