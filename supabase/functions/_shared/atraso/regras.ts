// ─── atraso/regras — o LEITOR das regras de atraso impressas num documento (puro: recebe TEXTO; não lê arquivo, banco nem rede) ──────────────────────────────────────────────────────
//
// Pedido dela (27/10/2026): no primeiro upload do documento, extrair multa, juros, desconto e encargos e guardá-los na obrigação, para calcular o custo do atraso sem novo boleto.
// Proposta e decisões: docs/ANALISE_REGRAS_DE_ATRASO_2026-10-27.md (degrau A: boleto/fatura com a regra ESCRITA; tributos — DARF, GPS, FGTS — ficam de fora da primeira entrega).
//
// REGRA DE OURO (a mesma do leitor de pagamento): **nunca devolve um número no chute.** Só entra o que o texto diz com todas as letras ("multa de 2%", "juros de 1% ao mês", "R$ 0,33 por dia").
// O que não achou fica `null`; o que achou vem com o TRECHO original e uma confiança, para a tela mostrar "por quê" e a pessoa conferir (a conferência é obrigatória no primeiro upload).
//
// O que NÃO é feito aqui: o cálculo do valor atualizado (`calculo.ts`, próxima etapa) e a leitura de tributos.

export type TipoDeMulta = "pct" | "fixo";
export type TipoDeJuros = "pct_mes" | "pct_dia" | "fixo_dia";

export interface MultaLida { tipo: TipoDeMulta; valor: number }
export interface JurosLidos { tipo: TipoDeJuros; valor: number }
export interface DescontoLido { tipo: "pct" | "fixo"; valor: number; ate: string | null }

export interface RegrasDeAtraso {
  multa: MultaLida | null;
  juros: JurosLidos | null;
  /** índice de correção citado (IPCA, IGP-M, INPC, SELIC, TR) — só informado; o cálculo com índice fica para depois */
  correcao: string | null;
  desconto: DescontoLido | null;
  /** `AAAA-MM-DD`: "não receber após …" — o documento NÃO pode ser pago depois desta data (pede-se segunda via) */
  naoReceberApos: string | null;
  /** os pedaços do texto de onde saiu cada regra (para a tela mostrar e a pessoa conferir) */
  trechos: string[];
  /** 0–100: 0 = nada achado; 55 = só multa ou só juros; 90 = os dois */
  confianca: number;
  /** o que merece conferência (percentual fora do comum, "ao ano" convertido…) */
  avisos: string[];
}

/** Os limites do comum: acima disso o sistema ainda lê, mas avisa (leitura suspeita ou regra fora do padrão de consumo). */
export const MULTA_PCT_USUAL_MAXIMA = 20;
export const JUROS_PCT_MES_USUAL_MAXIMO = 5;

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const compacto = (s: string) => s.replace(/\s+/g, " ").trim();
/** "1.234,56" → 1234.56 · "2,5" → 2.5 · "0.033" → 0.033 */
function numero(t: string): number {
  const s = t.trim();
  if (s.includes(",")) return Number(s.replace(/\./g, "").replace(",", "."));
  return Number(s);
}

const NUM = "(\\d{1,3}(?:\\.\\d{3})*(?:,\\d+)?|\\d+(?:[.,]\\d+)?)";
const DATA = "(\\d{2})/(\\d{2})/(\\d{4})";
const ymd = (d: string, m: string, a: string) => `${a}-${m}-${d}`;

interface Achado<T> { valor: T; trecho: string; idx: number }

/** Pega o trecho original (do texto com acento) correspondente às posições achadas no texto "plano" — os dois têm o mesmo comprimento porque a normalização NFD só tira marcas combinantes. */
function trechoDe(original: string, plano: string, ini: number, fim: number): string {
  return compacto(original.slice(ini, fim));
}

export function lerRegrasDeAtraso(textoBruto: string): RegrasDeAtraso {
  const original = (textoBruto ?? "").normalize("NFC");
  // `plano` precisa ter o MESMO comprimento de `original`: NFC já junta letra+acento e o `replace` troca cada letra acentuada por uma letra simples
  const plano = original.replace(/[ÀÁÂÃÄ]/g, "A").replace(/[àáâãä]/g, "a").replace(/[ÈÉÊË]/g, "E").replace(/[èéêë]/g, "e").replace(/[ÌÍÎÏ]/g, "I").replace(/[ìíîï]/g, "i")
    .replace(/[ÒÓÔÕÖ]/g, "O").replace(/[òóôõö]/g, "o").replace(/[ÙÚÛÜ]/g, "U").replace(/[ùúûü]/g, "u").replace(/Ç/g, "C").replace(/ç/g, "c").toLowerCase();
  const trechos: string[] = [];
  const avisos: string[] = [];

  // ── multa ───────────────────────────────────────────────────────────────
  let multa: Achado<MultaLida> | null = null;
  {
    // "multa de 2%", "multa por atraso de 2,00 %", "multa moratória de 2%", "cobrar multa de 2%"
    const pct = new RegExp(`multa(?:\\s+(?:moratoria|por\\s+atraso|de\\s+mora|contratual))?\\s*(?:de|:|=|-)?\\s*${NUM}\\s*%`).exec(plano);
    // "2% de multa", "2,00% (dois por cento) de multa"
    const pctAntes = new RegExp(`${NUM}\\s*%\\s*(?:\\([^)]*\\)\\s*)?(?:de\\s+)?multa`).exec(plano);
    const fixo = new RegExp(`multa(?:\\s+(?:moratoria|por\\s+atraso|de\\s+mora))?\\s*(?:de|:|=|-)?\\s*r\\$\\s*${NUM}`).exec(plano);
    const m = pct ?? pctAntes ?? fixo;
    if (m) {
      const v = numero(m[1]);
      if (Number.isFinite(v) && v > 0) {
        multa = { valor: { tipo: m === fixo ? "fixo" : "pct", valor: v }, trecho: trechoDe(original, plano, m.index, m.index + m[0].length), idx: m.index };
      }
    }
  }

  // ── juros ───────────────────────────────────────────────────────────────
  let juros: Achado<JurosLidos> | null = null;
  {
    const jurosPalavra = "(?:juros(?:\\s+de\\s+mora)?|mora(?:\\s+diaria)?|encargos\\s+moratorios)";
    // "juros de 1% ao mês", "juros de mora de 1,00 % a.m.", "1% ao mês de juros"
    const mes = new RegExp(`${jurosPalavra}\\s*(?:de|:|=|-)?\\s*(?:de\\s*)?${NUM}\\s*%\\s*(?:\\([^)]*\\)\\s*)?(?:ao|a\\.?|por)\\s*m(?:es|\\.?\\s*a\\.?\\b|\\b)`).exec(plano)
      ?? new RegExp(`${NUM}\\s*%\\s*(?:ao|a\\.?|por)\\s*mes\\s*(?:de\\s+)?${jurosPalavra}`).exec(plano);
    // "juros de 0,033% ao dia", "mora diária de 0,03%"
    const dia = new RegExp(`${jurosPalavra}\\s*(?:de|:|=|-)?\\s*(?:de\\s*)?${NUM}\\s*%\\s*(?:ao|por|a)\\s*dia`).exec(plano)
      ?? new RegExp(`mora\\s+diaria\\s*(?:de|:|=|-)?\\s*${NUM}\\s*%`).exec(plano);
    // "juros de R$ 0,33 ao dia", "mora de R$ 0,33 por dia"
    const fixoDia = new RegExp(`${jurosPalavra}\\s*(?:de|:|=|-)?\\s*(?:de\\s*)?r\\$\\s*${NUM}\\s*(?:ao|por|a)\\s*dia`).exec(plano)
      ?? new RegExp(`mora\\s+diaria\\s*(?:de|:|=|-)?\\s*r\\$\\s*${NUM}`).exec(plano);
    // "juros de 12% ao ano" — convertido para ao mês (simples) e AVISADO
    const ano = new RegExp(`${jurosPalavra}\\s*(?:de|:|=|-)?\\s*(?:de\\s*)?${NUM}\\s*%\\s*(?:ao|a\\.?|por)\\s*ano`).exec(plano);
    if (fixoDia) juros = { valor: { tipo: "fixo_dia", valor: numero(fixoDia[1]) }, trecho: trechoDe(original, plano, fixoDia.index, fixoDia.index + fixoDia[0].length), idx: fixoDia.index };
    else if (mes) juros = { valor: { tipo: "pct_mes", valor: numero(mes[1]) }, trecho: trechoDe(original, plano, mes.index, mes.index + mes[0].length), idx: mes.index };
    else if (dia) juros = { valor: { tipo: "pct_dia", valor: numero(dia[1]) }, trecho: trechoDe(original, plano, dia.index, dia.index + dia[0].length), idx: dia.index };
    else if (ano) {
      const aoMes = Math.round((numero(ano[1]) / 12) * 10000) / 10000;
      juros = { valor: { tipo: "pct_mes", valor: aoMes }, trecho: trechoDe(original, plano, ano.index, ano.index + ano[0].length), idx: ano.index };
      avisos.push(`O documento fala em ${numero(ano[1]).toString().replace(".", ",")}% ao ano; convertido para ${aoMes.toString().replace(".", ",")}% ao mês (juros simples). Confira.`);
    }
    if (juros && !(Number.isFinite(juros.valor.valor) && juros.valor.valor > 0)) juros = null;
  }

  // ── desconto ────────────────────────────────────────────────────────────
  let desconto: DescontoLido | null = null;
  {
    const fixoAte = new RegExp(`desconto\\s*(?:de|:)?\\s*r\\$\\s*${NUM}(?:[^.\\n]{0,40}?ate\\s*(?:o\\s*dia\\s*)?${DATA})?`).exec(plano);
    const pctAte = new RegExp(`${NUM}\\s*%\\s*de\\s*desconto(?:[^.\\n]{0,40}?ate\\s*(?:o\\s*dia\\s*)?${DATA})?`).exec(plano)
      ?? new RegExp(`desconto\\s*(?:de|:)?\\s*${NUM}\\s*%(?:[^.\\n]{0,40}?ate\\s*(?:o\\s*dia\\s*)?${DATA})?`).exec(plano);
    const m = fixoAte ?? pctAte;
    if (m) {
      const v = numero(m[1]);
      const a = m[2] && m[3] && m[4] ? ymd(m[2], m[3], m[4]) : null;
      if (Number.isFinite(v) && v > 0) {
        desconto = { tipo: m === fixoAte ? "fixo" : "pct", valor: v, ate: a };
        trechos.push(trechoDe(original, plano, m.index, m.index + m[0].length));
      }
    }
  }

  // ── "não receber após" ───────────────────────────────────────────────────
  let naoReceberApos: string | null = null;
  {
    const m = new RegExp(`(?:nao\\s+(?:receber|aceitar|pagar|sera\\s+recebid[oa])|nao\\s+(?:estao\\s+)?autorizad[oa]s?\\s+a\\s+receber|pagavel\\s+(?:somente\\s+)?ate|vencid[oa]\\s+nao\\s+pagar)[^.\\n]{0,80}?(?:apos|depois\\s+de|ate|em)?\\s*${DATA}`).exec(plano);
    if (m) {
      naoReceberApos = ymd(m[1], m[2], m[3]);
      trechos.push(trechoDe(original, plano, m.index, m.index + m[0].length));
    }
  }

  // ── correção (só citada) ─────────────────────────────────────────────────
  let correcao: string | null = null;
  {
    const m = /(?:atualizacao\s+monetaria|correcao\s+monetaria|corrigid[oa]s?|atualizad[oa]s?)[^.\n]{0,60}?\b(ipca|igp-?m|inpc|selic|tr)\b/.exec(plano);
    if (m) correcao = m[1] === "igpm" ? "IGP-M" : m[1] === "igp-m" ? "IGP-M" : m[1].toUpperCase();
  }

  // ── é a REGRA ou é uma cobrança já feita? ───────────────────────────────────────────────────────────────
  // Fatura costuma trazer "Multa R$ 2,35" como ITEM cobrado do mês anterior. A regra vem com "após o vencimento", "em caso de atraso", "cobrar"…: sem esse contexto o achado perde confiança e é avisado.
  const CONTEXTO = /apos\s+(?:o\s+)?vencimento|em\s+caso\s+de\s+(?:atraso|nao\s+pagamento)|pagamento\s+(?:em\s+)?atraso|pagamento\s+apos|atrasad|cobrar|cobrad|incid|sujeit|acrescid/;
  const comContexto = (a: { idx: number } | null) => !!a && CONTEXTO.test(plano.slice(Math.max(0, a.idx - 160), a.idx + 60));
  const semContexto = (!!multa || !!juros) && !comContexto(multa) && !comContexto(juros);
  if (semContexto) avisos.push("O texto cita multa/juros mas não diz que é a regra para quem paga depois do vencimento — pode ser uma cobrança de fatura anterior. Confira.");

  // ── conferências de sanidade ─────────────────────────────────────────────
  if (multa && multa.valor.tipo === "pct" && multa.valor.valor > MULTA_PCT_USUAL_MAXIMA) avisos.push(`Multa de ${multa.valor.valor.toString().replace(".", ",")}% é maior que o usual — confira o documento.`);
  if (juros && juros.valor.tipo === "pct_mes" && juros.valor.valor > JUROS_PCT_MES_USUAL_MAXIMO) avisos.push(`Juros de ${juros.valor.valor.toString().replace(".", ",")}% ao mês é maior que o usual — confira o documento.`);
  if (multa) trechos.unshift(multa.trecho);
  if (juros) trechos.splice(multa ? 1 : 0, 0, juros.trecho);
  if (correcao) avisos.push(`O documento cita correção pelo ${correcao}: a estimativa ainda não aplica índice — só multa e juros.`);

  const achados = (multa ? 1 : 0) + (juros ? 1 : 0);
  const sanidade = avisos.some(a => /maior que o usual|convertido|não diz que é a regra/.test(a));
  const confianca = achados === 0 ? 0 : Math.max(10, (achados === 2 ? 90 : 55) - (sanidade ? 30 : 0));

  return { multa: multa?.valor ?? null, juros: juros?.valor ?? null, correcao, desconto, naoReceberApos, trechos, confianca, avisos };
}

/** A regra escrita em português, para a tela ("multa de 2% + juros de 1% ao mês"). */
export function descreverRegras(r: Pick<RegrasDeAtraso, "multa" | "juros">): string {
  const p = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
  const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const partes: string[] = [];
  if (r.multa) partes.push(`multa de ${r.multa.tipo === "pct" ? `${p(r.multa.valor)}%` : brl(r.multa.valor)}`);
  if (r.juros) partes.push(`juros de ${r.juros.tipo === "pct_mes" ? `${p(r.juros.valor)}% ao mês` : r.juros.tipo === "pct_dia" ? `${p(r.juros.valor)}% ao dia` : `${brl(r.juros.valor)} ao dia`}`);
  return partes.join(" + ");
}

export const temRegraDeAtraso = (r: Pick<RegrasDeAtraso, "multa" | "juros">): boolean => r.multa !== null || r.juros !== null;
