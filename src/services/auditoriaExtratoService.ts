// ─── auditoriaExtratoService.ts — carrega o que a auditoria do extrato precisa (SÓ LEITURA) ──────────────────────────────────
//
// Lê, sem gravar nada: (1) o texto do PDF do extrato consolidado (pdf.js, no navegador); (2) os lançamentos realizados/conciliados da
// conta no período — com o saldo anterior calculado do histórico inteiro, paginado; (3) o que a Mesa de Conciliação faz hoje com cada
// linha do OFX (`analisar`, que também só lê). O cálculo em si mora em `lib/auditoriaExtrato.ts`.
//
// DATA DO SISTEMA = `data_pagamento` quando existe, senão `data`. Um lançamento baixado depois (a obrigação de vencimento 06/09 paga em
// 30/09) fica com `data` = vencimento; o dinheiro saiu do banco no dia do pagamento, e é esse dia que o extrato mostra.
import { supabase } from "@/integrations/supabase/client";
import { parseOFX, encodingDoOFX, type OFXTransacao } from "@/services/ofxService";
import { analisar, carregarContexto } from "@/services/importacaoOfxService";
import { lerExtratoConsolidado, pareceExtratoConsolidado, type ExtratoLido } from "@/lib/extratoConsolidadoPdf";
import { daquiADias } from "@/lib/data";
import type { LinhaBanco, LinhaSistema } from "@/lib/auditoriaExtrato";

/** O texto do PDF, uma linha por linha visual (agrupa os pedaços por altura e ordena por posição). */
export async function textoDoPdf(arquivo: File): Promise<string> {
  const pdfjs: any = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  const pdf = await pdfjs.getDocument({ data: await arquivo.arrayBuffer() }).promise;
  let out = "";
  for (let p = 1; p <= pdf.numPages; p++) {
    const tc = await (await pdf.getPage(p)).getTextContent();
    const linhas = new Map<number, { x: number; s: string }[]>();
    for (const it of tc.items as { transform: number[]; str: string }[]) {
      const y = Math.round(it.transform[5] / 2) * 2;
      (linhas.get(y) ?? linhas.set(y, []).get(y)!).push({ x: it.transform[4], s: it.str });
    }
    out += `\n===== PAGINA ${p} =====\n`;
    for (const y of [...linhas.keys()].sort((a, b) => b - a)) out += linhas.get(y)!.sort((a, b) => a.x - b.x).map(i => i.s).join(" ").replace(/\s+/g, " ").trim() + "\n";
  }
  return out;
}

export async function lerPdfDoExtrato(arquivo: File): Promise<ExtratoLido> {
  const texto = await textoDoPdf(arquivo);
  if (!pareceExtratoConsolidado(texto)) throw new Error("Este PDF não parece o 'Extrato Consolidado / Por Período' do Bradesco.");
  return lerExtratoConsolidado(texto);
}

export async function lerOfx(arquivo: File): Promise<OFXTransacao[]> {
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  return parseOFX(new TextDecoder(encodingDoOFX(bytes)).decode(bytes));
}

const PAGINA = 1000;
const c2 = (n: number) => Math.round(n * 100) / 100;
const assinado = (l: { tipo: string; valor: number | string }) => (l.tipo === "entrada" ? 1 : -1) * Number(l.valor);

export interface DadosDoSistema {
  contaId: string; contaNome: string;
  saldoInicialConta: number;
  /** saldo do sistema no fim do dia anterior a `de` (saldo inicial da conta + tudo que veio antes) */
  saldoAntes: number;
  /** o `saldo_atual` que o banco de dados guarda (tudo, de qualquer data) */
  saldoAtualGuardado: number;
  /** saldo anterior + lançamentos lidos + o que é posterior ao período − `saldo_atual` guardado: TEM de ser 0,00 (prova de que nada ficou de fora da leitura) */
  conferenciaDaLeitura: number;
  lancamentos: LinhaSistema[];
}

export async function carregarSistema(contaId: string, de: string, ate: string): Promise<DadosDoSistema> {
  const conta = await supabase.from("fin_contas").select("id, nome, saldo_inicial, saldo_atual").eq("id", contaId).maybeSingle();
  if (conta.error || !conta.data) throw new Error(conta.error?.message ?? "Conta não encontrada.");
  let antes = 0;
  const lancamentos: LinhaSistema[] = [];
  const limite = daquiADias(ate, 7);   // alguns lançamentos do sistema são datados dias depois do banco: entram para o pareamento
  for (let p = 0; ; p++) {
    const r = await supabase.from("fin_lancamentos")
      .select("id, data, data_pagamento, valor, tipo, status, origem, descricao, observacoes")
      .eq("conta_id", contaId).in("status", ["realizado", "conciliado"]).lte("data", limite)
      .order("data").order("id").range(p * PAGINA, p * PAGINA + PAGINA - 1);
    if (r.error) throw new Error(r.error.message);
    for (const l of r.data ?? []) {
      const quando = String(l.data_pagamento ?? l.data).slice(0, 10);
      if (quando < de) { antes += assinado(l); continue; }
      lancamentos.push({ id: l.id, data: quando, valor: c2(assinado(l)), origem: l.origem ?? "", status: l.status, descricao: l.descricao ?? "", fitids: [...String(l.observacoes ?? "").matchAll(/\[ofx:([^\]]+)\]/g)].map(m => m[1]) });
    }
    if ((r.data ?? []).length < PAGINA) break;
  }
  // o que é posterior ao período lido (mais de 7 dias depois do fim): só para a prova de que a leitura está completa
  let depois = 0;
  for (let p = 0; ; p++) {
    const r = await supabase.from("fin_lancamentos").select("valor, tipo").eq("conta_id", contaId).in("status", ["realizado", "conciliado"]).gt("data", limite)
      .order("id").range(p * PAGINA, p * PAGINA + PAGINA - 1);
    if (r.error) throw new Error(r.error.message);
    for (const l of r.data ?? []) depois += assinado(l);
    if ((r.data ?? []).length < PAGINA) break;
  }
  const saldoAntes = c2(Number(conta.data.saldo_inicial) + antes);
  const lidos = c2(lancamentos.reduce((t, l) => t + l.valor, 0));
  return {
    contaId, contaNome: conta.data.nome, saldoInicialConta: Number(conta.data.saldo_inicial), saldoAntes, saldoAtualGuardado: Number(conta.data.saldo_atual),
    conferenciaDaLeitura: c2(saldoAntes + lidos + depois - Number(conta.data.saldo_atual)), lancamentos,
  };
}

/** Linhas do banco a partir do PDF (completo) — ou, na falta dele, do OFX (sem aplicação/resgate: a tela avisa). */
export function linhasDoBanco(extrato: ExtratoLido | null, ofx: OFXTransacao[]): LinhaBanco[] {
  if (extrato) return extrato.lancamentos.map(l => ({ data: l.data, valor: l.valor, historico: l.historico, documento: l.documento }));
  return ofx.map(t => ({ data: t.data, valor: (t.tipo === "entrada" ? 1 : -1) * t.valor, historico: t.memo }));
}

/**
 * Liga cada linha do banco (PDF) à MESMA linha do OFX — pela data, o valor e o texto — e lhe dá o FITID. Linhas iguais no mesmo dia (vários PIX
 * de R$ 20) são distinguidas pelo nome de quem pagou; cada linha do OFX serve uma vez só. Sem OFX correspondente, a linha fica sem FITID
 * (o banco tem e o OFX não trouxe: falta de importação de verdade).
 */
export function atribuirFitids(banco: LinhaBanco[], ofx: OFXTransacao[]): LinhaBanco[] {
  const livres = new Map<string, { fitid: string; memo: Set<string> }[]>();
  for (const t of ofx) {
    const k = `${t.data}|${((t.tipo === "entrada" ? 1 : -1) * t.valor).toFixed(2)}`;
    (livres.get(k) ?? livres.set(k, []).get(k)!).push({ fitid: t.fitid, memo: palavras(t.memo) });
  }
  return banco.map(b => {
    const fila = livres.get(`${b.data}|${b.valor.toFixed(2)}`);
    if (!fila?.length) return b;
    const meu = palavras(b.historico);
    let melhor = 0, pontos = -1;
    fila.forEach((x, i) => { const n = [...x.memo].filter(w => meu.has(w)).length; if (n > pontos) { pontos = n; melhor = i; } });
    return { ...b, fitid: fila.splice(melhor, 1)[0].fitid };
  });
}

/** As palavras do texto que identificam a linha (sem acento, 4+ letras). */
const palavras = (t: string) => new Set(t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().match(/[a-z]{4,}/g) ?? []);

/** O que a Mesa de Conciliação faz hoje com cada linha do OFX (a mesma `analisar`, que só lê): FITID → situação. */
export async function situacaoDasLinhasDoOfx(contaId: string, ofx: OFXTransacao[]): Promise<Map<string, string>> {
  const linhas = await analisar(contaId, ofx, await carregarContexto());
  return new Map(linhas.map(l => [l.tx.fitid, l.situacao === "ja_registrada" ? `ja_registrada: ${l.motivoJaRegistrada ?? ""}` : l.situacao]));
}

// ── a auditoria completa ─────────────────────────────────────────────────────────

import { auditar, decompor, relatorioMarkdown, type Auditoria, type Decomposicao } from "@/lib/auditoriaExtrato";

export interface SaldoDiarioDaAplicacao { data: string; banco: number; sistema: number; diferenca: number }

export interface ResultadoDaAuditoria {
  conta: string; de: string; ate: string;
  auditoria: Auditoria;
  cortes: string[];
  decomposicoes: Decomposicao[];
  avisos: string[];
  /** a leitura do sistema fecha com o `saldo_atual` guardado? (0,00 = sim) */
  conferenciaDaLeitura: number;
  /** Invest Fácil: saldo do banco × saldo da conta de aplicação do sistema, dia a dia (só com o PDF) */
  aplicacao: SaldoDiarioDaAplicacao[] | null;
  markdown: string;
}

function fimDeMes(d: string): string {
  const [a, m] = d.split("-").map(Number);
  return daquiADias(m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, "0")}-01`, -1);
}

/**
 * Entre dois blocos do PDF o saldo pode "pular" (o PDF de 05/10 abre o bloco de outubro com o saldo de 01/10 JÁ somando os movimentos
 * daquele dia, sem listá-los). Esses movimentos existem — estão no OFX. Preenche a lacuna com as linhas do OFX daquela data que o PDF
 * não traz e, se ainda sobrar diferença, com UMA linha sintética que diz isso, para a cadeia de saldos fechar.
 */
function preencherLacunas(extrato: ExtratoLido, ofx: OFXTransacao[], linhas: LinhaBanco[], avisos: string[]): LinhaBanco[] {
  const out = [...linhas];
  for (let i = 1; i < extrato.blocos.length; i++) {
    const anterior = extrato.blocos[i - 1], atual = extrato.blocos[i];
    const saldoFinal = anterior.total?.saldo ?? extrato.lancamentos.filter(l => l.bloco === i - 1).at(-1)?.saldo ?? anterior.saldoAnterior;
    const lacuna = c2(atual.saldoAnterior - saldoFinal);
    if (Math.abs(lacuna) < 0.005) continue;
    const dataDaLacuna = atual.dataSaldoAnterior;
    const jaNoPdf = extrato.lancamentos.filter(l => l.data === dataDaLacuna).map(l => `${l.valor.toFixed(2)}`);
    const doOfx = ofx.filter(t => t.data === dataDaLacuna && !/RENTAB\.INVEST/i.test(t.memo))
      .map(t => ({ data: t.data, valor: c2((t.tipo === "entrada" ? 1 : -1) * t.valor), historico: `${t.memo} (do OFX: o PDF não detalha este dia)` }))
      .filter(l => { const k = jaNoPdf.indexOf(l.valor.toFixed(2)); if (k >= 0) { jaNoPdf.splice(k, 1); return false; } return true; });
    out.push(...doOfx);
    const resto = c2(lacuna - doOfx.reduce((t, l) => t + l.valor, 0));
    avisos.push(`O PDF abre o bloco de ${dataDaLacuna.split("-").reverse().join("/")} com saldo ${saldoFinal === anterior.saldoAnterior ? "" : "já "}somando movimentos do dia que ele não lista (diferença de ${lacuna.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}); ${doOfx.length} linha(s) do OFX completaram a lacuna.`);
    if (Math.abs(resto) >= 0.005) {
      out.push({ data: dataDaLacuna, valor: resto, historico: "(movimentos do dia que o PDF não lista e o OFX não explica)" });
      avisos.push(`Sobraram ${resto.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} da lacuna sem linha correspondente no OFX.`);
    }
  }
  return out;
}

export async function executarAuditoria(p: {
  contaId: string; contaNome: string; contaAplicacaoId: string | null; arquivoOfx: File; arquivoPdf: File | null;
}): Promise<ResultadoDaAuditoria> {
  const avisos: string[] = [];
  const ofx = await lerOfx(p.arquivoOfx);
  if (ofx.length === 0) throw new Error("O OFX não tem nenhuma transação.");
  const extrato = p.arquivoPdf ? await lerPdfDoExtrato(p.arquivoPdf) : null;
  if (extrato) {
    if (extrato.quebras.length) avisos.push(`${extrato.quebras.length} linha(s) do PDF não fecham a cadeia de saldos — a leitura pode estar errada (primeira: ${extrato.quebras[0].data} ${extrato.quebras[0].historico.slice(0, 40)}).`);
    for (const t of extrato.totaisDivergentes) avisos.push(`O ${t.campo === "creditos" ? "total de créditos" : "total de débitos"} lido (${t.lido.toLocaleString("pt-BR")}) difere do impresso no PDF (${t.impresso.toLocaleString("pt-BR")}).`);
  } else {
    avisos.push("Sem o PDF do extrato: o OFX do Bradesco NÃO traz aplicação nem resgate do Invest Fácil, então o saldo do banco aqui só considera o que o OFX traz. Anexe o PDF para a auditoria ficar completa.");
  }

  let banco = linhasDoBanco(extrato, ofx);
  if (extrato) banco = preencherLacunas(extrato, ofx, banco, avisos);
  banco = atribuirFitids(banco, ofx);
  const datas = banco.map(l => l.data).sort();
  const de = datas[0], ate = datas[datas.length - 1];
  const sis = await carregarSistema(p.contaId, de, ate);
  if (Math.abs(sis.conferenciaDaLeitura) >= 0.005) avisos.push(`A leitura dos lançamentos do sistema não fecha com o saldo guardado da conta (diferença de ${sis.conferenciaDaLeitura.toLocaleString("pt-BR")}). Avise o suporte.`);

  const saldoInicialBanco = extrato ? extrato.blocos[0].saldoAnterior : sis.saldoAntes;
  if (!extrato) avisos.push("Sem o PDF não há saldo anterior do banco: foi tomado igual ao do sistema, então a diferença mostrada é só a do período.");
  const mesaPorFitid = await situacaoDasLinhasDoOfx(p.contaId, ofx);
  const anotar = (b: LinhaBanco) => (b.fitid ? { noOfx: true, mesa: mesaPorFitid.get(b.fitid) } : { noOfx: false });
  const auditoria = auditar({ banco, sistema: sis.lancamentos, saldoInicialBanco, saldoInicialSistema: sis.saldoAntes, anotar });

  const cortes: string[] = [];
  for (let d = fimDeMes(de); d < ate; d = fimDeMes(daquiADias(d, 1))) cortes.push(d);
  cortes.push(ate);
  const decomposicoes = cortes.map(c => decompor(auditoria, c));

  // Invest Fácil: saldo do banco (PDF) × saldo da conta de aplicação no sistema
  let aplicacao: SaldoDiarioDaAplicacao[] | null = null;
  if (extrato && extrato.saldosInvest.length && p.contaAplicacaoId) {
    const conta = await carregarSistema(p.contaAplicacaoId, de, ate);
    aplicacao = extrato.saldosInvest.map(s => {
      const sistema = c2(conta.saldoAntes + conta.lancamentos.filter(l => l.data <= s.data).reduce((t, l) => t + l.valor, 0));
      return { data: s.data, banco: s.saldo, sistema, diferenca: c2(sistema - s.saldo) };
    });
  }

  const meta = { conta: p.contaNome, de, ate, arquivos: [p.arquivoOfx.name, ...(p.arquivoPdf ? [p.arquivoPdf.name] : [])], avisos };
  const reais = (n: number) => `${n < 0 ? "−" : ""}R$ ${Math.abs(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const dataBr = (d: string) => d.split("-").reverse().join("/");
  let extra = "";
  if (aplicacao) {
    extra += "\n\n## 5. Invest Fácil: saldo do banco × conta de aplicação do sistema\n\n| Dia | Banco | Sistema | Diferença |\n|---|---:|---:|---:|\n" +
      aplicacao.map(d => `| ${dataBr(d.data)} | ${reais(d.banco)} | ${reais(d.sistema)} | ${reais(d.diferenca)} |`).join("\n");
  }
  extra += "\n\n## 6. Convergência\n\n" + decomposicoes.map(d =>
    `- Em ${dataBr(d.corte)}: o banco tem ${reais(d.saldoBanco)} e o sistema ${reais(d.saldoSistema)}. Registradas/corrigidas as linhas da seção 2, o sistema passa a ter ${reais(d.saldoSistema - d.diferenca)} — o do banco.`).join("\n");
  return { conta: p.contaNome, de, ate, auditoria, cortes, decomposicoes, avisos, conferenciaDaLeitura: sis.conferenciaDaLeitura, aplicacao, markdown: relatorioMarkdown(auditoria, cortes, meta) + extra };
}
