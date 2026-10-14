// ─── lib/documentos/comprovante.ts — texto de um COMPROVANTE de pagamento → quando o dinheiro saiu ───
//
// Pedido dela (14/10/2026): o "Pagar" gravava a data do REGISTRO (hoje), não a do PIX/TED que já tinha acontecido — um Pix
// de 28/09 registrado em 03/10 ficava com 03/10, e o lançamento não batia com o extrato, o OFX, o fechamento do mês nem o
// malote. Com um comprovante anexado, o sistema SUGERE a data real; quem decide é a pessoa (a tela pede a escolha e,
// se ela mudar, o motivo). PURA: recebe o TEXTO (do PDF por `textoDoPdf`, ou de OCR) — quem lê o arquivo é o serviço.
//
// Ordem de confiança, do exato ao palpite:
//   1. o identificador da transação Pix (E2E, "E" + ISPB + AAAAMMDDHHmm em UTC + 11) — data, hora e banco do PAGADOR
//      embutidos pelo Banco Central; não depende de layout. Convertido para o horário de Brasília (UTC−3, sem horário de verão).
//   2. a data ao lado de um RÓTULO de operação ("Data da transferência", "Data/hora", "Realizado em", "Data do débito"…);
//   3. uma data única sem rótulo. Datas com rótulo de OUTRA coisa (emissão do comprovante, vencimento, agendamento,
//      nascimento, validade) nunca são sugeridas como data do pagamento.
// Quando as fontes discordam, a confiança cai e a tela AVISA. Nunca inventa: sem data aproveitável, devolve `data: null`.
//
// Calibração: os rótulos vêm dos layouts públicos dos comprovantes Pix/TED de Bradesco, Itaú, Banco do Brasil, Caixa,
// Nubank, Santander e Inter (app e internet banking). Ainda NÃO foi conferido com comprovantes reais da tesouraria — o
// primeiro lote real deve virar caso de teste em comprovante.test.ts.

export type Confianca = "alta" | "media" | "baixa";
export type TipoDeOperacao = "pix" | "ted" | "doc" | "boleto" | "transferencia" | "desconhecido";

export interface DataCandidata { data: string; hora: string | null; rotulo: string | null; peso: number; linha: number }

export interface LeituraDoComprovante {
  /** AAAA-MM-DD — a data sugerida para o pagamento; null quando não deu para identificar. */
  data: string | null;
  /** HH:MM, quando o comprovante traz. */
  hora: string | null;
  valor: number | null;
  banco: string | null;
  tipo: TipoDeOperacao;
  confianca: Confianca | null;
  /** por que a confiança é essa (mostrado na tela, em português) */
  motivos: string[];
  /** o que a pessoa deve conferir antes de aceitar */
  avisos: string[];
  /** identificador Pix (E2E), se achado */
  e2e: string | null;
  candidatas: DataCandidata[];
}

export interface OpcoesDaLeitura {
  /** AAAA-MM-DD de hoje — datas depois disso são impossíveis para um pagamento já feito */
  hoje: string;
  /** o valor que saiu do banco segundo a tela, para conferir com o do comprovante */
  valorEsperado?: number | null;
  /** de onde veio o texto: OCR erra dígito, então rebaixa a confiança */
  fonte?: "pdf_texto" | "ocr";
  /** confiança média do OCR (0–100), quando a fonte é OCR */
  confiancaOcr?: number | null;
}

// ISPB (8 dígitos) → banco. Os mais comuns no Brasil; o resto fica sem nome (o E2E continua valendo para a data).
const BANCO_POR_ISPB: Record<string, string> = {
  "60746948": "Bradesco", "60701190": "Itaú", "00000000": "Banco do Brasil", "00360305": "Caixa",
  "18236120": "Nubank", "90400888": "Santander", "00416968": "Inter", "02038232": "Sicoob",
  "01181521": "Sicredi", "31872495": "C6 Bank", "10573521": "Mercado Pago", "22896431": "PicPay",
  "13140088": "PagBank", "08561701": "PagBank", "30306294": "BTG Pactual", "00558456": "BTG Pactual",
};
const BANCO_POR_NOME: [RegExp, string][] = [
  [/\bbradesco\b/i, "Bradesco"], [/\bita[uú](?![a-zà-ú])/i, "Itaú"], [/\bbanco do brasil\b|\bbb\.com\.br\b|\bbb\s+s\.?a\b/i, "Banco do Brasil"],
  [/\bcaixa econ[oô]mica\b|\bcaixa\b/i, "Caixa"], [/\bnubank\b|\bnu pagamentos\b/i, "Nubank"], [/\bsantander\b/i, "Santander"],
  [/\bbanco inter\b|\binter\s*s\.?a\b/i, "Inter"], [/\bsicoob\b/i, "Sicoob"], [/\bsicredi\b/i, "Sicredi"], [/\bc6\s*bank\b/i, "C6 Bank"],
  [/\bmercado pago\b/i, "Mercado Pago"], [/\bpicpay\b/i, "PicPay"], [/\bpagbank\b|\bpagseguro\b/i, "PagBank"],
];

const MESES: Record<string, number> = {
  jan: 1, janeiro: 1, fev: 2, fevereiro: 2, mar: 3, marco: 3, "março": 3, abr: 4, abril: 4, mai: 5, maio: 5, jun: 6, junho: 6,
  jul: 7, julho: 7, ago: 8, agosto: 8, set: 9, setembro: 9, out: 10, outubro: 10, nov: 11, novembro: 11, dez: 12, dezembro: 12,
};

// Rótulos. Peso positivo = rótulo de OPERAÇÃO; negativo = a data é de outra coisa.
const ROTULOS: [RegExp, number, string][] = [
  [/data\s+(d[ao]\s+)?(transfer[eê]ncia|transa[cç][aã]o|opera[cç][aã]o|pagamento|d[eé]bito|efetiva[cç][aã]o|movimenta[cç][aã]o|pix)/i, 3, "data da operação"],
  [/data\s*(\/|e)\s*hora/i, 3, "data/hora"],
  [/\b(realizad[oa]|efetuad[oa]|efetivad[oa]|debitad[oa]|enviad[oa]|pag[oa]|transferid[oa])\s+(em|no dia)\b/i, 3, "realizado em"],
  [/\bdata\s+de\s+pagamento\b/i, 3, "data de pagamento"],
  [/\bpix\s+(enviado|realizado|efetuado)\b|\btransfer[eê]ncia\s+(enviada|realizada|efetuada)\b|\bcomprovante\s+(de|do)\s+(pix|transfer)/i, 2, "comprovante da operação"],
  [/\bquando\b|\bdata\s*:/i, 1, "data"],
  [/\bemiss[aã]o|emitid[oa]\s+em|gerad[oa]\s+em|impress[oa]\s+em|data\s+da\s+impress|consultad[oa]\s+em|\bvia\s+do\s+cliente\s+gerada/i, -5, "emissão do comprovante"],
  [/\bvenciment|\bvence\b/i, -5, "vencimento"],
  [/\bagendad[oa]\s+(em|no dia)\b|data\s+(d[oe]\s+)?agendamento/i, -4, "agendamento"],
  [/\bnasciment|\bvalidade\b|\bcompet[eê]ncia\b|\bper[ií]odo\b|\bdesde\b|\babertura\b/i, -5, "outra data"],
];

const pad = (n: number) => String(n).padStart(2, "0");
function ymd(a: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const t = new Date(Date.UTC(a, m - 1, d));
  if (t.getUTCMonth() !== m - 1) return null;   // 31/02 etc.
  return `${a}-${pad(m)}-${pad(d)}`;
}
const anoCompleto = (a: number) => (a < 100 ? 2000 + a : a);
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Todas as datas de uma linha, com a posição (para casar com o horário e o rótulo mais próximos). */
function datasDaLinha(linhaOriginal: string): { data: string; pos: number }[] {
  const out: { data: string; pos: number }[] = [];
  // OCR troca zero por "O" (28/O9/2O26): só dentro de trechos com cara de data, e sem mudar o tamanho (as posições valem)
  const linha = linhaOriginal.replace(/\b[\dOo]{1,2}\s?[/.-]\s?[\dOo]{1,2}\s?[/.-]\s?[\dOo]{2,4}\b/g, t => t.replace(/[Oo]/g, "0"));
  // 28/09/2026 · 28-09-2026 · 28.09.2026 · 28/09/26
  const numerica = /\b([0-3]?\d)\s?[/.-]\s?([01]?\d)\s?[/.-]\s?((?:19|20)?\d{2})\b/g;
  for (const m of linha.matchAll(numerica)) {
    const n = (x: string) => Number(x);
    const d = ymd(anoCompleto(n(m[3])), n(m[2]), n(m[1]));
    if (d) out.push({ data: d, pos: m.index ?? 0 });
  }
  // 2026-09-28
  for (const m of linha.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)) {
    const d = ymd(Number(m[1]), Number(m[2]), Number(m[3]));
    if (d) out.push({ data: d, pos: m.index ?? 0 });
  }
  // 28 set 2026 · 28 SET. 2026 · 28/set/2026 · 28 de setembro de 2026
  const porExtenso = /\b([0-3]?\d)\s*(?:de\s+|\/|\s)\s*(jan|fev|mar[cç]?o?|abr|mai|jun|jul|ago|set|out|nov|dez)[a-zç]*\.?\s*(?:de\s+|\/|\s)\s*((?:19|20)?\d{2})\b/gi;
  for (const m of linha.matchAll(porExtenso)) {
    const chave = semAcento(m[2].toLowerCase()).slice(0, 3);
    const d = ymd(anoCompleto(Number(m[3])), MESES[chave], Number(m[1]));
    if (d) out.push({ data: d, pos: m.index ?? 0 });
  }
  return out.sort((a, b) => a.pos - b.pos);
}

/** O horário mais perto de uma posição na linha (15:42, 15:42:10, 15h42). */
function horaPerto(linha: string, pos: number): string | null {
  let melhor: { h: string; dist: number } | null = null;
  for (const m of linha.matchAll(/\b([01]?\d|2[0-3])\s?(?::|h)\s?([0-5]\d)(?::[0-5]\d)?\b/gi)) {
    const dist = Math.abs((m.index ?? 0) - pos);
    if (!melhor || dist < melhor.dist) melhor = { h: `${pad(Number(m[1]))}:${m[2]}`, dist };
  }
  return melhor?.h ?? null;
}

/** O rótulo que vale para uma data: o da própria linha antes da data, ou o da linha de cima (layout "rótulo em cima, valor embaixo"). */
function rotuloDe(linhas: string[], i: number, inicio: number, pos: number): { peso: number; rotulo: string | null } {
  const antes = linhas[i].slice(inicio, pos);   // só o trecho desde a data anterior: o rótulo de uma data não vale para a seguinte
  const achar = (t: string) => {
    let m: { peso: number; rotulo: string } | null = null;
    for (const [re, peso, rotulo] of ROTULOS) if (re.test(t) && (!m || Math.abs(peso) > Math.abs(m.peso) || (peso < 0 && m.peso > 0))) m = { peso, rotulo };
    return m;
  };
  const naLinha = achar(antes);
  if (naLinha) return naLinha;
  // linha de cima só vale para a PRIMEIRA data da linha, e se ela for só rótulo (sem data própria)
  if (inicio === 0 && i > 0 && datasDaLinha(linhas[i - 1]).length === 0) {
    const emCima = achar(linhas[i - 1]);
    if (emCima) return emCima;
  }
  return { peso: 0, rotulo: null };
}

/** Pix: E + ISPB(8) + AAAAMMDDHHmm (UTC) + 11 caracteres. Devolve a data/hora em Brasília e o banco do pagador. */
export function lerE2E(texto: string): { e2e: string; data: string; hora: string; banco: string | null } | null {
  const compacto = texto.replace(/[\s-]/g, "");
  const m = compacto.match(/E(\d{8})(20\d{2})(\d{2})(\d{2})(\d{2})(\d{2})([A-Za-z0-9]{11})/);
  if (!m) return null;
  const [, ispb, a, me, d, h, mi] = m;
  const utc = Date.UTC(Number(a), Number(me) - 1, Number(d), Number(h), Number(mi));
  if (Number.isNaN(utc) || Number(me) < 1 || Number(me) > 12 || Number(d) < 1 || Number(d) > 31 || Number(h) > 23 || Number(mi) > 59) return null;
  const br = new Date(utc - 3 * 3600_000);   // Brasília, sem horário de verão desde 2019
  return {
    e2e: m[0], data: `${br.getUTCFullYear()}-${pad(br.getUTCMonth() + 1)}-${pad(br.getUTCDate())}`,
    hora: `${pad(br.getUTCHours())}:${pad(br.getUTCMinutes())}`, banco: BANCO_POR_ISPB[ispb] ?? null,
  };
}

function valorDoTexto(linhas: string[]): number | null {
  const num = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));
  const ruim = /tarifa|saldo|limite|dispon[ií]vel|juros|multa|desconto|iof|cashback|pontos/i;
  // 1) linha com rótulo de valor da operação
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    if (ruim.test(l)) continue;
    if (/\bvalor\b|\btotal\b|\bquantia\b|\bmontante\b/i.test(l)) {
      const m = l.match(/R?\$?\s*(\d{1,3}(?:\.\d{3})*,\d{2})\b/) ?? (linhas[i + 1] && !ruim.test(linhas[i + 1]) ? linhas[i + 1].match(/R?\$?\s*(\d{1,3}(?:\.\d{3})*,\d{2})\b/) : null);
      if (m) return num(m[1]);
    }
  }
  // 2) um único valor em R$ no texto (fora de tarifa/saldo)
  const todos = new Set<number>();
  for (const l of linhas) if (!ruim.test(l)) for (const m of l.matchAll(/R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})\b/g)) todos.add(num(m[1]));
  return todos.size === 1 ? [...todos][0] : null;
}

function tipoDoTexto(t: string, temE2E: boolean): TipoDeOperacao {
  if (temE2E || /\bpix\b/i.test(t)) return "pix";
  if (/\bted\b|transfer[eê]ncia\s+eletr[oô]nica\s+dispon[ií]vel/i.test(t)) return "ted";
  if (/\bdoc\b/i.test(t)) return "doc";
  if (/pagamento\s+de\s+(boleto|t[ií]tulo|conta)|c[oó]digo\s+de\s+barras|linha\s+digit[aá]vel/i.test(t)) return "boleto";
  if (/transfer[eê]ncia/i.test(t)) return "transferencia";
  return "desconhecido";
}

function bancoDoTexto(linhas: string[]): string | null {
  // o banco do PAGADOR costuma estar no cabeçalho; o do recebedor vem rotulado ("Instituição: …", "Recebedor") — essas
  // linhas não contam. Vale a PRIMEIRA linha que nomeia um banco, não a ordem da lista (senão "Bradesco" do recebedor ganhava do "Itaú" do topo).
  for (const l of linhas) {
    if (/destin|recebedor|favorecid|\bpara\b|institui[cç][aã]o|quem recebeu/i.test(l)) continue;
    for (const [re, nome] of BANCO_POR_NOME) if (re.test(l)) return nome;
  }
  return null;
}

const NIVEIS: Confianca[] = ["baixa", "media", "alta"];
const rebaixar = (c: Confianca): Confianca => NIVEIS[Math.max(0, NIVEIS.indexOf(c) - 1)];
const dataBr = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function lerComprovante(texto: string, op: OpcoesDaLeitura): LeituraDoComprovante {
  const linhas = (texto ?? "").split(/\r?\n/).map(l => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const e2e = lerE2E(texto ?? "");
  const tipo = tipoDoTexto(texto ?? "", !!e2e);
  const valor = valorDoTexto(linhas);
  const banco = e2e?.banco ?? bancoDoTexto(linhas);
  const motivos: string[] = []; const avisos: string[] = [];
  const ehAgendamento = /comprovante\s+de\s+agendamento|\bagendamento\s+(efetuado|realizado|confirmado)\b|\bagendad[oa]\s+para\b/i.test(texto ?? "");

  // candidatas (fora as impossíveis: futuro)
  const candidatas: DataCandidata[] = [];
  let futuras = 0;
  linhas.forEach((l, i) => {
    let inicio = 0;
    for (const { data, pos } of datasDaLinha(l)) {
      const { peso, rotulo } = rotuloDe(linhas, i, inicio, pos);
      inicio = pos + 8;
      if (data > op.hoje) { futuras++; continue; }
      candidatas.push({ data, hora: horaPerto(l, pos), rotulo, peso, linha: i });
    }
  });
  const validas = candidatas.filter(c => c.peso >= 0);
  const distintas = [...new Set(validas.map(c => c.data))];

  let data: string | null = null; let hora: string | null = null; let confianca: Confianca | null = null;
  const melhorRotulada = validas.filter(c => c.peso >= 2).sort((a, b) => b.peso - a.peso || a.linha - b.linha)[0] ?? null;

  if (e2e && e2e.data <= op.hoje) {
    data = e2e.data; hora = e2e.hora; confianca = "alta";
    motivos.push("data e horário lidos do identificador da transação Pix (gravado pelo Banco Central)");
    if (melhorRotulada && melhorRotulada.data !== e2e.data) {
      confianca = "baixa";
      avisos.push(`O comprovante mostra ${dataBr(melhorRotulada.data)} (${melhorRotulada.rotulo}), mas o identificador do Pix diz ${dataBr(e2e.data)}. Confira no extrato.`);
    } else if (melhorRotulada) motivos.push(`confere com "${melhorRotulada.rotulo}" impresso no comprovante`);
  } else if (melhorRotulada) {
    data = melhorRotulada.data; hora = melhorRotulada.hora;
    confianca = melhorRotulada.peso >= 3 ? "alta" : "media";
    motivos.push(`data ao lado de "${melhorRotulada.rotulo}"`);
    const outras = [...new Set(validas.filter(c => c.peso >= 2 && c.data !== data).map(c => c.data))];
    if (outras.length) { confianca = "baixa"; avisos.push(`O comprovante tem outra data de operação (${outras.map(dataBr).join(", ")}). Confira qual saiu no extrato.`); }
  } else if (distintas.length === 1) {
    const c = validas.find(x => x.data === distintas[0])!;
    data = c.data; hora = c.hora; confianca = "media";
    motivos.push(c.rotulo ? `única data, ao lado de "${c.rotulo}"` : "única data do comprovante, sem rótulo");
  } else if (distintas.length > 1) {
    // várias datas sem rótulo de operação: a mais recente é o palpite (o comprovante não é de antes da operação), baixa confiança
    const c = validas.filter(x => x.data === distintas.sort().at(-1)).at(0)!;
    data = c.data; hora = c.hora; confianca = "baixa";
    motivos.push("várias datas sem rótulo de operação: sugerida a mais recente");
    avisos.push(`Datas encontradas: ${distintas.map(dataBr).join(", ")}. Confira qual saiu no extrato.`);
  }

  if (!hora && data) hora = candidatas.find(c => c.data === data && c.hora)?.hora ?? null;
  if (data && confianca) {
    if (ehAgendamento) {
      confianca = "baixa";
      avisos.push("Parece um comprovante de AGENDAMENTO: ele prova que o pagamento foi marcado, não que o dinheiro saiu. Confira no extrato a data do débito.");
    }
    if (op.valorEsperado != null && valor != null && Math.abs(valor - op.valorEsperado) > 0.009) {
      confianca = rebaixar(confianca);
      avisos.push(`O comprovante é de ${brl(valor)}, e o pagamento está em ${brl(op.valorEsperado)}. Confira se é o comprovante certo.`);
    }
    if (op.fonte === "ocr" && (op.confiancaOcr ?? 0) < 80 && !e2e) {
      confianca = rebaixar(confianca);
      motivos.push("lido por reconhecimento de imagem (pode trocar dígitos)");
    }
    const dias = (Date.parse(op.hoje) - Date.parse(data)) / 86400_000;
    if (dias > 120) { confianca = rebaixar(confianca); avisos.push(`A data encontrada é de ${Math.round(dias)} dias atrás. Confira se é o comprovante deste pagamento.`); }
  }
  if (!data && futuras > 0) avisos.push("Só havia datas futuras no comprovante: nenhuma pode ser a do pagamento.");

  return { data, hora, valor, banco, tipo, confianca: data ? confianca : null, motivos, avisos, e2e: e2e?.e2e ?? null, candidatas };
}

export const ROTULO_CONFIANCA: Record<Confianca, string> = { alta: "Alta", media: "Média", baixa: "Baixa" };
export const ROTULO_TIPO: Record<TipoDeOperacao, string> = {
  pix: "Pix", ted: "TED", doc: "DOC", boleto: "Pagamento de boleto", transferencia: "Transferência", desconhecido: "Comprovante",
};
