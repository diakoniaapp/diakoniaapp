// ─── lib/extratoConsolidadoPdf.ts — o "Extrato Consolidado / Por Período" do Bradesco, de texto para lançamentos ───────────
//
// O OFX do Bradesco NÃO traz aplicação nem resgate do Invest Fácil (só o rendimento): o que o banco de fato fez com o dinheiro da
// conta corrente só está no PDF do extrato. Esta lib lê o TEXTO desse PDF (uma linha por linha visual — ver `textoDoPdf` no serviço
// da auditoria) e devolve os lançamentos estruturados: data, histórico, documento, valor (crédito +, débito −) e saldo corrente.
//
// O PDF quebra um lançamento em várias linhas ("PIX RECEBIDO" / "221265 500,00 13.314,47" / "REM: FULANO 01/09"). O que ancora cada
// lançamento é a linha de FECHAMENTO: <documento> <valor> <saldo> (débito com sinal "-"). O texto solto antes dela é o início do
// histórico; o que vem logo depois ("REM:", "DES:", "INTERNET…", um nome em maiúsculas) é a continuação.
//
// A conferência que torna isto confiável: cada saldo corrente tem de ser igual ao anterior + o valor, e o total de créditos/débitos
// tem de bater com o "Total" impresso no PDF. Se uma linha foi lida errada a cadeia quebra e `quebras` diz onde — nunca se segue em
// silêncio com um extrato que não fecha.

export interface LancamentoDoExtrato {
  data: string;            // AAAA-MM-DD
  historico: string;
  documento: string;
  valor: number;           // crédito +, débito −
  saldo: number;           // saldo corrente depois deste lançamento
  bloco: number;           // 0 = "Extrato de … Entre …"; 1 = "Últimos Lançamentos"
}

export interface BlocoDoExtrato {
  dataSaldoAnterior: string;
  saldoAnterior: number;
  n: number;
  /** o "Total" impresso no PDF: créditos, débitos e saldo final */
  total: { creditos: number; debitos: number; saldo: number } | null;
}

export interface ExtratoLido {
  lancamentos: LancamentoDoExtrato[];
  blocos: BlocoDoExtrato[];
  saldosInvest: { data: string; saldo: number }[];
  quebras: { data: string; historico: string; valor: number; saldoLido: number; saldoEsperado: number }[];
  /** totais que NÃO batem com o "Total" impresso (créditos ou débitos) */
  totaisDivergentes: { bloco: number; campo: "creditos" | "debitos"; lido: number; impresso: number }[];
}

const MONEY = String.raw`-?\d{1,3}(?:\.\d{3})*,\d{2}`;
const FECHA = new RegExp(String.raw`^(?:(\d{2}/\d{2}/\d{4})\s+)?(.*?)\s*(\d{1,12})\s+(${MONEY})\s+(${MONEY})$`);
const SALDO_ANTERIOR = new RegExp(String.raw`^(\d{2}/\d{2}/\d{4})\s+SALDO ANTERIOR\s+(${MONEY})$`);
const TOTAL = new RegExp(String.raw`^Total\s+(${MONEY})\s+(${MONEY})\s+(${MONEY})$`);
const SALDO_INVEST = new RegExp(String.raw`^(\d{2}/\d{2}/\d{4})\s+SALDO INVEST F[ÁA]CIL\s+(${MONEY})$`);
const CABECALHO = /^(Extrato Consolidado|QUARTA IGREJA|Nome do usu|Data da opera|Folha \d|Ag[êe]ncia \||\d{5} \| \d|Extrato de:|Data Lan[çc]amento|Os dados acima|Últimos Lan|Saldos Invest|Data Hist[óo]rico|===== PAGINA)/i;
const CONTINUACAO = /^(REM:|DES:|INTERNET|CONTA\b|[A-ZÀ-Ú][A-ZÀ-Ú .'-]{4,}$)/;
const INICIO_DE_HISTORICO = /^(PIX (RECEBIDO|ENVIADO)|TARIFA|TRANSF|LIQUIDACAO|APLIC|RESGATE|RESG|RENTAB|DEPOSIT|PAGTO|REMET)/;

const num = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));
const iso = (d: string) => `${d.slice(6, 10)}-${d.slice(3, 5)}-${d.slice(0, 2)}`;
const c2 = (n: number) => Math.round(n * 100) / 100;

/** Esta é a cara de um extrato consolidado do Bradesco? (para a tela avisar cedo, antes de uma leitura que não faria sentido) */
export function pareceExtratoConsolidado(texto: string): boolean {
  return /Extrato Consolidado/i.test(texto) && /SALDO ANTERIOR/i.test(texto);
}

export function lerExtratoConsolidado(texto: string): ExtratoLido {
  const linhas = texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const lancamentos: LancamentoDoExtrato[] = [];
  const blocos: (BlocoDoExtrato & { itens: LancamentoDoExtrato[] })[] = [];
  const saldosInvest: { data: string; saldo: number }[] = [];
  let bloco: (typeof blocos)[number] | null = null;
  let data = "";
  let pendente: string[] = [];
  let ultimo: LancamentoDoExtrato | null = null;

  for (const l of linhas) {
    if (CABECALHO.test(l)) { if (/^Últimos Lan/i.test(l)) bloco = null; continue; }
    let m: RegExpExecArray | null;
    if ((m = SALDO_ANTERIOR.exec(l))) {
      bloco = { dataSaldoAnterior: iso(m[1]), saldoAnterior: num(m[2]), n: 0, total: null, itens: [] };
      blocos.push(bloco); data = iso(m[1]); pendente = []; ultimo = null; continue;
    }
    if ((m = TOTAL.exec(l))) { if (bloco) bloco.total = { creditos: num(m[1]), debitos: num(m[2]), saldo: num(m[3]) }; pendente = []; ultimo = null; continue; }
    if ((m = SALDO_INVEST.exec(l))) { saldosInvest.push({ data: iso(m[1]), saldo: num(m[2]) }); continue; }
    if ((m = FECHA.exec(l))) {
      if (m[1]) data = iso(m[1]);
      const historico = [...pendente, m[2]].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
      ultimo = { data, historico, documento: m[3], valor: num(m[4]), saldo: num(m[5]), bloco: blocos.length - 1 };
      lancamentos.push(ultimo); bloco?.itens.push(ultimo); pendente = []; continue;
    }
    if (ultimo && CONTINUACAO.test(l) && !INICIO_DE_HISTORICO.test(l)) { ultimo.historico = `${ultimo.historico} ${l}`.replace(/\s+/g, " ").trim(); continue; }
    pendente.push(l);
  }

  const quebras: ExtratoLido["quebras"] = [];
  const totaisDivergentes: ExtratoLido["totaisDivergentes"] = [];
  blocos.forEach((b, i) => {
    let saldo = b.saldoAnterior;
    for (const x of b.itens) {
      const esperado = c2(saldo + x.valor);
      if (Math.abs(esperado - x.saldo) > 0.005) quebras.push({ data: x.data, historico: x.historico, valor: x.valor, saldoLido: x.saldo, saldoEsperado: esperado });
      saldo = x.saldo;
    }
    if (b.total) {
      const cred = c2(b.itens.filter(x => x.valor > 0).reduce((s, x) => s + x.valor, 0));
      const deb = c2(b.itens.filter(x => x.valor < 0).reduce((s, x) => s + x.valor, 0));
      if (Math.abs(cred - b.total.creditos) > 0.005) totaisDivergentes.push({ bloco: i, campo: "creditos", lido: cred, impresso: b.total.creditos });
      if (Math.abs(deb - b.total.debitos) > 0.005) totaisDivergentes.push({ bloco: i, campo: "debitos", lido: deb, impresso: b.total.debitos });
    }
  });
  return {
    lancamentos, saldosInvest, quebras, totaisDivergentes,
    blocos: blocos.map(({ itens, ...b }) => ({ ...b, n: itens.length })),
  };
}
