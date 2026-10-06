// ─── lib/documentos/pagamento.ts — texto de um boleto / guia / fatura / Pix → o que pagar ───
//
// A "Central de Pagamentos inteligente" (pedido dela, 06/10/2026): ao anexar um boleto, fatura,
// guia (DARF, GPS/INSS, FGTS, ISS, IRRF, DAS, taxa) ou um Pix, o sistema LÊ o documento e extrai o
// que a tesouraria digitaria: valor, vencimento, beneficiário (e CNPJ), código de barras, linha
// digitável, Pix copia e cola, tipo e competência. PURA: recebe o TEXTO (do PDF, por
// `ocrService.textoDoPdf`, ou de OCR) — quem lê o arquivo é o serviço.
//
// Ordem de confiança, do exato ao palpite:
//   1. a linha digitável / código de barras (dígitos verificadores conferidos) — valor, banco e,
//      no boleto de cobrança, o VENCIMENTO saem dela, sem ambiguidade;
//   2. o Pix copia e cola (CRC16 conferido) — chave, recebedor, valor;
//   3. os rótulos do texto ("Vencimento", "Beneficiário"…) — heurística, validada contra o 1.
// Quando 1 e 3 discordam (o valor impresso difere do da linha), o código vence e o sistema AVISA.
// Nunca devolve um número "no chute": o que não achou fica `null` e o formulário pede.

import { decodificarBoleto, type BoletoDecodificado } from "../boleto";
import { acharPixNoTexto, type PixLido } from "../pixBrCode";
import { decodificarArrecadacao, ehArrecadacao, ROTULO_DO_SEGMENTO, type ArrecadacaoDecodificada } from "./arrecadacao";
import { beneficiarioPadraoDaGuia, codigoDaReceita, identificarGuia, ROTULO_DA_GUIA, type SubtipoDeGuia } from "./guia";

export const CNPJ_DA_IGREJA = "27639285000161";

export type TipoDePagamento = "boleto" | "guia" | "fatura" | "pix" | "desconhecido";
export type SubtipoDeFatura = "energia" | "agua" | "gas" | "telefonia" | "internet" | "condominio" | "outra";

export interface DocumentoDePagamento {
  tipo: TipoDePagamento;
  subtipoGuia: SubtipoDeGuia | null;
  subtipoFatura: SubtipoDeFatura | null;
  /** "DARF", "Boleto bancário", "Fatura de energia"… — o nome que a tela mostra. */
  rotulo: string;
  valor: number | null;
  /** `AAAA-MM-DD`. */
  vencimento: string | null;
  beneficiario: string | null;
  /** Só dígitos; nunca o da igreja. */
  cnpjBeneficiario: string | null;
  /** Código do banco (3 dígitos) do boleto de cobrança. */
  banco: { codigo: string; nome: string | null } | null;
  numeroDocumento: string | null;
  /** `AAAA-MM`. */
  competencia: string | null;
  /** Código da receita da DARF (4 dígitos): distingue IRRF (1708), IRPJ… — chave de aprendizado da guia. */
  codigoReceita: string | null;
  /** Só dígitos: 47 (cobrança) ou 48 (arrecadação). */
  linhaDigitavel: string | null;
  /** Só dígitos: 44. */
  codigoBarras: string | null;
  /** Os dígitos verificadores conferem (quando há linha/código). */
  codigoValido: boolean | null;
  pix: PixLido | null;
  /** Chave do CONVÊNIO de arrecadação (segmento + empresa): identifica a empresa mesmo sem CNPJ. */
  convenio: string | null;
  /** 0–100. */
  confianca: number;
  /** Em português, para a tela mostrar "por quê". */
  motivos: string[];
  /** O que merece conferência (DV que não bate, valor do texto ≠ valor do código…). */
  avisos: string[];
}

// ── utilidades ──────────────────────────────────────────────────────────────

const NFC = (s: string) => s.normalize("NFC");
/** Sem acento e minúsculo, com o MESMO comprimento (o texto entra em NFC): posições servem nos dois. */
const plano = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const soDigitos = (s: string) => s.replace(/\D/g, "");
const arredonda = (n: number) => Math.round(n * 100) / 100;

const REAL = String.raw`(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})(?!\d)`;
function paraNumero(inteiro: string, centavos: string): number {
  return arredonda(Number(`${inteiro.replace(/\./g, "")}.${centavos}`));
}

function iso(dd: string, mm: string, aaaa: string): string | null {
  const d = new Date(Number(aaaa), Number(mm) - 1, Number(dd));
  return !isNaN(d.getTime()) && d.getMonth() === Number(mm) - 1 && Number(aaaa) >= 2000 ? `${aaaa}-${mm}-${dd}` : null;
}

const BANCOS: Record<string, string> = {
  "001": "Banco do Brasil", "033": "Santander", "041": "Banrisul", "070": "BRB", "077": "Inter", "104": "Caixa",
  "212": "Original", "237": "Bradesco", "260": "Nubank", "290": "PagBank", "323": "Mercado Pago", "336": "C6 Bank",
  "341": "Itaú", "380": "PicPay", "389": "Mercantil", "422": "Safra", "623": "Pan", "655": "Votorantim",
  "748": "Sicredi", "756": "Sicoob",
};

// ── os códigos numéricos ────────────────────────────────────────────────────

/**
 * Sequências de 44, 47 ou 48 dígitos no texto — mesmo com pontos, espaços e hífens no meio, e
 * mesmo coladas a outros números na linha ("341-7  34191.79001 …": o código do banco vem antes).
 * Um bloco maior que o código é fatiado em janelas que PASSAM na conferência dos dígitos.
 */
export function acharCodigosNumericos(texto: string): string[] {
  const achados: string[] = [];
  const guardar = (d: string) => { if (!achados.includes(d)) achados.push(d); };
  const tratar = (bloco: string) => {
    const d = soDigitos(bloco);
    if ([44, 47, 48].includes(d.length)) { guardar(d); return; }
    if (d.length > 44 && d.length <= 80) {
      for (const tam of [48, 47, 44]) {
        for (let i = 0; i + tam <= d.length; i++) {
          const janela = d.slice(i, i + tam);
          const c = lerCodigo(janela);
          if (c?.valido) { guardar(janela); return; }
        }
      }
    }
  };
  const varrer = (trecho: string) => {
    for (const m of trecho.matchAll(/\d[\d .\-]{38,80}\d/g)) {
      // dois espaços (ou mais) separam campos diferentes na linha: tenta o bloco e cada pedaço
      tratar(m[0]);
      for (const parte of m[0].split(/\s{2,}/)) if (parte.length >= 40) tratar(parte);
    }
  };
  for (const linha of texto.split(/\r?\n/)) varrer(linha);
  varrer(texto); // texto sem quebra confiável (OCR)
  return achados;
}
interface CodigoLido {
  linhaDigitavel: string | null;
  codigoBarras: string | null;
  valido: boolean;
  cobranca: BoletoDecodificado | null;
  arrecadacao: ArrecadacaoDecodificada | null;
}

function lerCodigo(d: string): CodigoLido | null {
  if (ehArrecadacao(d)) {
    try {
      const a = decodificarArrecadacao(d);
      return { linhaDigitavel: a.linhaDigitavel, codigoBarras: a.codigoBarras, valido: a.dvConfere, cobranca: null, arrecadacao: a };
    } catch { return null; }
  }
  if (d.length === 47 || (d.length === 44 && d[3] === "9")) {
    try {
      const b = decodificarBoleto(d);
      return {
        linhaDigitavel: b.linhaDigitavel, codigoBarras: d.length === 44 ? d : null, valido: true, cobranca: b, arrecadacao: null,
      };
    } catch {
      // 47 dígitos que não passam nos DVs: guarda mesmo assim (a tela avisa), sem valor nem data
      return d.length === 47 ? { linhaDigitavel: d, codigoBarras: null, valido: false, cobranca: null, arrecadacao: null } : null;
    }
  }
  return null;
}

// ── campos do texto ─────────────────────────────────────────────────────────

/** O primeiro valor em reais depois de um rótulo, dentro de uma janela. */
function valorAposRotulo(original: string, p: string, rotulos: RegExp[], janela = 140): number | null {
  for (const r of rotulos) {
    const m = p.match(new RegExp(`(?:${r.source})[^\\d]{0,40}(?:r\\$\\s*)?${REAL}`, "i"));
    if (m && m.index !== undefined) {
      // vale só se o número não for percentual ("1.084,08%")
      const depois = original.slice(m.index + m[0].length, m.index + m[0].length + 3);
      if (/^\s*%/.test(depois)) continue;
      const v = paraNumero(m[m.length - 2], m[m.length - 1]);
      if (v <= 0) continue; // "VALOR TOTAL DA NOTA 0,00" (DANFE) não é o valor a pagar: tenta o próximo rótulo
      return v;
    }
    void janela;
  }
  return null;
}

/**
 * Valor em TABELA: o rótulo é um cabeçalho de coluna ("… EMISSÃO TOTAL A PAGAR") e o valor vem na linha de baixo,
 * depois de outros números ("07/2026 09/09/2026 R$ 1.135,07"). Só vale com "R$" na frente (senão pegaria um
 * número qualquer da linha), e ignora R$ 0,00 e percentuais.
 */
function valorEmTabela(original: string, p: string, rotulos: RegExp[], janela = 240): number | null {
  for (const r of rotulos) {
    const achou = p.match(new RegExp(`(?:${r.source})`, "i"));
    if (!achou || achou.index === undefined) continue;
    const trecho = p.slice(achou.index, achou.index + achou[0].length + janela);
    for (const m of trecho.matchAll(new RegExp(`r\\$\\s*${REAL}`, "gi"))) {
      const depois = original.slice(achou.index + (m.index ?? 0) + m[0].length, achou.index + (m.index ?? 0) + m[0].length + 3);
      if (/^\s*%/.test(depois)) continue;
      const v = paraNumero(m[m.length - 2], m[m.length - 1]);
      if (v > 0) return v;
    }
  }
  return null;
}

function dataAposRotulo(p: string, rotulos: RegExp[], janela = 90): string | null {
  for (const r of rotulos) {
    const m = p.match(new RegExp(`(?:${r.source})[\\s\\S]{0,${janela}}?(\\d{2})/(\\d{2})/(\\d{4})`, "i"));
    if (m) { const d = iso(m[1], m[2], m[3]); if (d) return d; }
  }
  return null;
}

const ROTULOS_DE_BENEFICIARIO = [
  "benefici[aá]rio", "cedente", "favorecido", "raz[aã]o social", "nome empresarial", "empregador", "[oó]rg[aã]o arrecadador",
  "prestador", "contribuinte",
];
const PARECE_ROTULO = /^(cnpj|cpf|ag[eê]ncia|vencimento|valor|data|nosso|n[uú]mero|c[oó]digo|endere[cç]o|local|esp[eé]cie|pagador|sacado|compet[eê]ncia)/i;

function limparNome(s: string): string {
  return s.replace(/\bC\.?N\.?P\.?J\.?(?:\s*\/\s*C\.?P\.?F\.?)?[:\s]*[\d./-]+/gi, "").replace(/\bCPF[:\s]*[\d.\-]+/gi, "")
    .replace(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g, "").replace(/\s{2,}/g, " ").replace(/^[\s:;,.\-–]+|[\s:;,.\-–]+$/g, "").trim();
}

/** O nome da própria igreja nunca é o beneficiário (aparece como pagador/destinatário em todo documento). */
const NOME_DA_IGREJA = /quarta igreja batista/i;
/** Texto que NÃO é um nome: sobra de rótulo ("Agência/Código Beneficiário"), "final" (o campo "Beneficiário final"), autenticação. */
const NAO_E_NOME = /^(ag[eê]ncia|c[oó]digo|final\b|autentica|recibo|pagador|sacado|escaneie|aponte|pague)|qr code/i;

function nomeAproveitavel(n: string): boolean {
  return n.length >= 4 && !/^[\d\s./-]+$/.test(n) && !PARECE_ROTULO.test(n) && !NAO_E_NOME.test(n) && !NOME_DA_IGREJA.test(n);
}

function beneficiarioDoTexto(texto: string): string | null {
  // DANFE: "RECEBEMOS DE <EMITENTE> OS PRODUTOS…" — o emitente é exato; os rótulos "Nome/Razão social" da nota
  // listam primeiro o DESTINATÁRIO (a igreja).
  const danfe = texto.replace(/\s+/g, " ").match(/RECEBEMOS DE (.{4,80}?) OS (?:PRODUTOS|SERVI[CÇ]OS)/i);
  if (danfe && nomeAproveitavel(limparNome(danfe[1]))) return limparNome(danfe[1]).slice(0, 80);

  const linhas = texto.split(/\r?\n/).map(l => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  for (const rot of ROTULOS_DE_BENEFICIARIO) {
    const re = new RegExp(`^(?:${rot})\\b[\\s:.\\-]*(.*)$`, "i");
    for (let i = 0; i < linhas.length; i++) {
      const m = linhas[i].match(re);
      if (!m) continue;
      if (/^final\b/i.test(m[1].trim())) continue; // "Beneficiário final: CPF…" é OUTRO campo
      let nome = limparNome(m[1]);
      // rótulo de coluna ("Beneficiário Agência/Código Beneficiário"): o nome vem na linha de baixo
      if (!nomeAproveitavel(nome) && linhas[i + 1] && !PARECE_ROTULO.test(linhas[i + 1])) nome = limparNome(linhas[i + 1]);
      if (nomeAproveitavel(nome)) return nome.slice(0, 80);
    }
  }
  return null;
}

function cnpjDoBeneficiario(texto: string, nome: string | null): string | null {
  const todos: { cnpj: string; pos: number }[] = [];
  for (const m of texto.matchAll(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g)) todos.push({ cnpj: soDigitos(m[0]), pos: m.index ?? 0 });
  for (const m of texto.matchAll(/CNPJ[^\d\n]{0,6}(\d{14})(?!\d)/gi)) todos.push({ cnpj: m[1], pos: m.index ?? 0 });
  const outros = todos.filter(c => c.cnpj !== CNPJ_DA_IGREJA);
  if (outros.length === 0) return null;
  if (nome) {
    const i = texto.toLowerCase().indexOf(nome.toLowerCase().slice(0, 12));
    if (i >= 0) {
      const perto = outros.filter(c => c.pos >= i - 40 && c.pos <= i + 260).sort((a, b) => Math.abs(a.pos - i) - Math.abs(b.pos - i))[0];
      if (perto) return perto.cnpj;
    }
  }
  return outros[0].cnpj;
}

function numeroDoDocumento(p: string, original: string): string | null {
  const m = p.match(/(?:numero do documento|n[o°º]\.? ?do documento|nosso numero|numero de referencia|n[o°º]\.? ?documento)[\s:.\-]*([a-z0-9][a-z0-9./-]{2,24})/i);
  if (!m || m.index === undefined) return null;
  const valor = original.slice(m.index + m[0].length - m[1].length, m.index + m[0].length).trim();
  // boleto em tabela: "Data do documento │ Núm. do documento" e a linha de baixo começa pela DATA — não é o número
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(valor)) return null;
  return /\d/.test(valor) ? valor : null;
}

const MESES: Record<string, string> = {
  janeiro: "01", fevereiro: "02", marco: "03", abril: "04", maio: "05", junho: "06",
  julho: "07", agosto: "08", setembro: "09", outubro: "10", novembro: "11", dezembro: "12",
};

function competenciaDoTexto(p: string): string | null {
  const m = p.match(/(?:competencia|periodo de apuracao|periodo de referencia|mes ?\/ ?ano|referencia)[\s:.\-]*(?:(\d{2})\/(\d{2})\/(\d{4})|(\d{2})\/(\d{4})|([a-z]+)[\s/.\-]+(\d{4}))/i);
  if (!m) return null;
  if (m[3]) return `${m[3]}-${m[2]}`;
  if (m[4]) return Number(m[4]) >= 1 && Number(m[4]) <= 12 ? `${m[5]}-${m[4]}` : null;
  if (m[6] && MESES[m[6]]) return `${m[7]}-${MESES[m[6]]}`;
  return null;
}

// ── fatura ──────────────────────────────────────────────────────────────────

function subtipoDeFatura(p: string, seg: ArrecadacaoDecodificada | null): SubtipoDeFatura | null {
  if (seg?.segmento === "energia_gas" && /\bgas\b|comgas|naturgy|ceg\b/.test(p) && !/energia|luz|eletric/.test(p)) return "gas";
  if (seg?.segmento === "energia_gas") return "energia";
  if (seg?.segmento === "saneamento") return "agua";
  if (seg?.segmento === "telecomunicacoes") return /internet|banda larga|fibra/.test(p) ? "internet" : "telefonia";
  if (/energia el[eé]trica|\bluz\b|light|enel|eletropaulo|cemig|energisa|kwh|consumo de energia/.test(p)) return "energia";
  if (/[aá]guas do rio|cedae|sabesp|saneamento|abastecimento de [aá]gua|esgoto|conta de [aá]gua/.test(p)) return "agua";
  if (/g[aá]s natural|naturgy|comg[aá]s|conta de g[aá]s|\bceg\b/.test(p)) return "gas";
  // "internet" e "telefone" SOZINHOS não valem: o texto padrão de todo boleto de banco diz "pague pelo
  // aplicativo, internet ou em agências" e "SAC … telefones" (medido: boleto de impressora lido como fatura de internet).
  if (/banda larga|fibra [oó]ptica|provedor|plano de internet|conta de internet|fatura de internet/.test(p)) return "internet";
  if (/telefonia|conta de telefone|telefone m[oó]vel|celular|\bvivo\b|\bclaro\b|\btim\b|\boi\b|telecom/.test(p)) return "telefonia";
  if (/condom[ií]nio|taxa condominial/.test(p)) return "condominio";
  return null;
}

const ROTULO_FATURA: Record<SubtipoDeFatura, string> = {
  energia: "Fatura de energia", agua: "Fatura de água", gas: "Fatura de gás", telefonia: "Fatura de telefonia",
  internet: "Fatura de internet", condominio: "Condomínio", outra: "Fatura",
};

// ── o leitor ────────────────────────────────────────────────────────────────

export function lerDocumentoDePagamento(textoBruto: string): DocumentoDePagamento {
  const texto = NFC(textoBruto ?? "");
  const p = plano(texto);
  const motivos: string[] = [];
  const avisos: string[] = [];

  // 1. os códigos
  let codigo: CodigoLido | null = null;
  for (const d of acharCodigosNumericos(texto)) {
    const c = lerCodigo(d);
    if (c && (!codigo || (c.valido && !codigo.valido))) codigo = c;
    if (codigo?.valido) break;
  }
  const pix = acharPixNoTexto(texto);
  if (pix && !pix.crcValido) avisos.push("O Pix copia e cola não passou na conferência (CRC) — confira antes de pagar por ele.");
  if (codigo && !codigo.valido) avisos.push("Os dígitos verificadores da linha digitável não conferem — confira os números com o documento.");

  // 2. tipo
  // Um boleto de COBRANÇA com a linha digitável válida é boleto — mesmo que a 2ª página cite "documento de
  // arrecadação do Simples" numa declaração (medido: boleto de impressora lido como guia). Só vira guia se o
  // TÍTULO do documento (os primeiros 300 caracteres) disser que é uma guia (ex.: DAE emitido como boleto).
  const cobrancaValida = !!(codigo?.cobranca && codigo.valido);
  const subtipoGuia = cobrancaValida ? identificarGuia(texto.slice(0, 300)) : identificarGuia(texto);
  const arrec = codigo?.arrecadacao ?? null;
  const segmentoDeGuia = arrec && ["prefeitura", "orgao_governamental", "transito"].includes(arrec.segmento);
  const segmentoDeFatura = arrec && ["saneamento", "energia_gas", "telecomunicacoes", "carne"].includes(arrec.segmento);
  const subFatura = subtipoDeFatura(p, arrec);
  // "consumo" SOZINHO não vale (medido: boleto de impressora com "relatório de consumo" lido como fatura).
  const textoDeFatura = /\bfatura\b|conta de (agua|luz|energia|gas|telefone|internet)|consumo de (agua|energia|gas)|leitura anterior|unidade consumidora/.test(p);

  let tipo: TipoDePagamento = "desconhecido";
  let sub: SubtipoDeGuia | null = null;
  if (subtipoGuia || (segmentoDeGuia && !textoDeFatura)) { tipo = "guia"; sub = subtipoGuia ?? "outra"; }
  else if (segmentoDeFatura || textoDeFatura) tipo = "fatura";
  else if (codigo?.cobranca || /boleto|beneficiario|cedente|nosso numero|ficha de compensacao/.test(p)) tipo = "boleto";
  else if (pix) tipo = "pix";
  else if (codigo) tipo = arrec ? "fatura" : "boleto";

  // 3. valor
  const rotulosDeValor = tipo === "guia"
    ? [/total da guia/, /valor a recolher/, /valor total do documento/, /valor total/, /total a pagar/, /valor do documento/, /valor principal/, /valor a pagar/]
    : [/valor do documento/, /valor cobrado/, /valor a pagar/, /total a pagar/, /fatura a pagar/, /valor total/, /\(=\)\s*valor/, /total da fatura/];
  const valorTexto = valorAposRotulo(texto, p, rotulosDeValor)
    ?? valorEmTabela(texto, p, [/total a pagar/, /valor a pagar/, /fatura a pagar/, /total da fatura/, /valor total a pagar/]);
  const valorCodigo = codigo?.cobranca?.valor ?? codigo?.arrecadacao?.valor ?? null;
  let valor = codigo?.valido && valorCodigo ? valorCodigo : valorTexto ?? pix?.valor ?? valorCodigo;
  if (codigo?.valido && valorCodigo) motivos.push(`valor ${valorCodigo.toFixed(2).replace(".", ",")} lido do código`);
  else if (valorTexto != null) motivos.push(`valor ${valorTexto.toFixed(2).replace(".", ",")} lido do texto`);
  else if (pix?.valor) motivos.push("valor lido do Pix");
  if (valorCodigo && valorTexto && Math.abs(valorCodigo - valorTexto) > 0.009) {
    avisos.push(`O valor impresso (R$ ${valorTexto.toFixed(2).replace(".", ",")}) difere do do código (R$ ${valorCodigo.toFixed(2).replace(".", ",")}) — vale o do código; pode haver multa/juros ou desconto.`);
  }
  if (valor != null && valor <= 0) valor = null;

  // 4. vencimento
  const vencDoCodigo = codigo?.cobranca?.vencimento ?? null;
  const vencDoTexto = dataAposRotulo(p, [/pagar este documento ate/, /data de vencimento/, /vencimento/, /pagar ate/, /pagavel ate/, /vence em/]);
  const vencimento = vencDoCodigo ?? vencDoTexto;
  if (vencDoCodigo) motivos.push("vencimento lido da linha digitável");
  else if (vencDoTexto) motivos.push("vencimento lido do texto");
  if (vencDoCodigo && vencDoTexto && vencDoCodigo !== vencDoTexto) avisos.push("O vencimento impresso difere do da linha digitável — vale o da linha.");

  // 5. beneficiário
  let beneficiario = beneficiarioDoTexto(texto);
  if (!beneficiario && sub) beneficiario = beneficiarioPadraoDaGuia(sub);
  if (!beneficiario && pix?.nomeRecebedor) beneficiario = pix.nomeRecebedor;
  if (!beneficiario && (sub === "iss" || sub === "iptu")) {
    const m = texto.match(/prefeitura\s+(?:municipal\s+)?(?:da cidade\s+)?(?:de|do|da)\s+([A-Za-zÀ-ú ]{3,40})/i);
    if (m) beneficiario = `Prefeitura do ${m[1].trim()}`.replace(/\s{2,}/g, " ");
  }
  const cnpj = cnpjDoBeneficiario(texto, beneficiario);

  const bancoCodigo = codigo?.cobranca?.banco ?? null;
  const banco = bancoCodigo ? { codigo: bancoCodigo, nome: BANCOS[bancoCodigo] ?? null } : null;

  // 6. rótulo
  let rotulo = "Documento de pagamento";
  if (tipo === "guia" && sub) {
    rotulo = ROTULO_DA_GUIA[sub];
    if (sub === "darf") { const r = codigoDaReceita(texto); if (r) rotulo += ` · receita ${r}`; }
  } else if (tipo === "fatura") rotulo = ROTULO_FATURA[subFatura ?? "outra"];
  else if (tipo === "boleto") rotulo = banco?.nome ? `Boleto bancário · ${banco.nome}` : "Boleto bancário";
  else if (tipo === "pix") rotulo = "Pix";
  if (arrec) motivos.push(`código de arrecadação (${ROTULO_DO_SEGMENTO[arrec.segmento]})`);
  else if (codigo?.cobranca) motivos.push(`linha digitável de boleto${banco?.nome ? ` (${banco.nome})` : ""}`);
  if (pix) motivos.push(`Pix copia e cola${pix.crcValido ? " (conferido)" : ""}`);
  if (tipo === "guia" && sub) motivos.push(`guia ${ROTULO_DA_GUIA[sub]} reconhecida pelo texto`);

  // 7. confiança: o que é EXATO pesa mais que o que é rótulo
  let confianca = 20;
  if (codigo?.valido) confianca += 35; else if (codigo) confianca += 8;
  if (pix?.crcValido) confianca += 15;
  if (tipo !== "desconhecido") confianca += 10;
  if (valor != null) confianca += 10;
  if (vencimento) confianca += 8;
  if (beneficiario) confianca += 8;
  if (cnpj) confianca += 4;
  confianca -= avisos.length * 6;
  confianca = Math.max(5, Math.min(99, confianca));

  const convenio = arrec ? `${arrec.codigoBarras[1]}-${arrec.empresa}` : null;

  return {
    tipo, subtipoGuia: sub, subtipoFatura: tipo === "fatura" ? subFatura ?? "outra" : null, rotulo, valor, vencimento,
    beneficiario, cnpjBeneficiario: cnpj, banco, numeroDocumento: numeroDoDocumento(p, texto),
    // competência só existe em guia e fatura; em boleto/Pix a regex pegava datas soltas (medido: "07/2026" de uma data de emissão)
    competencia: tipo === "guia" || tipo === "fatura" ? competenciaDoTexto(p) : null, codigoReceita: sub === "darf" || sub === "irrf" ? codigoDaReceita(texto) : null, linhaDigitavel: codigo?.linhaDigitavel ?? null, codigoBarras: codigo?.codigoBarras ?? null,
    codigoValido: codigo ? codigo.valido : null, pix, convenio, confianca, motivos, avisos,
  };
}

/** O que gravar no anexo (`dados_extraidos`): só o que serve para PAGAR depois, sem o texto inteiro. */
export function dadosParaGuardar(d: DocumentoDePagamento) {
  return {
    versao: 1, tipo: d.tipo, subtipoGuia: d.subtipoGuia, subtipoFatura: d.subtipoFatura, rotulo: d.rotulo,
    valor: d.valor, vencimento: d.vencimento, beneficiario: d.beneficiario, cnpj: d.cnpjBeneficiario,
    banco: d.banco?.codigo ?? null, numero: d.numeroDocumento, competencia: d.competencia,
    linhaDigitavel: d.linhaDigitavel, codigoBarras: d.codigoBarras, codigoValido: d.codigoValido,
    pix: d.pix ? { payload: d.pix.payload, chave: d.pix.chave, valor: d.pix.valor, nome: d.pix.nomeRecebedor, crcValido: d.pix.crcValido } : null,
    convenio: d.convenio, confianca: d.confianca,
  };
}

export type DadosGuardadosDoDocumento = ReturnType<typeof dadosParaGuardar>;
