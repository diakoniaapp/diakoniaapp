// ─── email — o relatório de contribuições AGREGADO, para o pastor (27/10/2026) ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
//
// Decisão dela: o pastor recebe por e-mail só o relatório AGREGADO — período, dizimistas identificados, total, média mensal, semana de maior adesão, novos, recorrentes — e a lista com NOMES fica só
// dentro do sistema, com registro de quem viu. Por isso ESTE módulo recebe apenas a `AnaliseDoPeriodo` (números) e nunca uma lista de pessoas: não há como um nome entrar no e-mail. Os gráficos são
// barras em tabela HTML (cliente de e-mail não roda JavaScript nem SVG). Mesma moldura, paleta e rodapé de todos os e-mails (`email/desenho.ts`).
import * as D from "../email/desenho.ts";
import { PISO_DE_IDENTIFICACAO, type AnaliseDoPeriodo } from "./analise.ts";

const ddmmaaaa = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;
const ddmm = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const mesCurto = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;
export const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const n = (v: number, casas = 0) => v.toLocaleString("pt-BR", { maximumFractionDigits: casas });
const plural = (q: number, um: string, varios: string) => `${n(q)} ${q === 1 ? um : varios}`;

export interface EmailDeContribuicoes { assunto: string; preheader: string; html: string; texto: string; resumo: string }

/** O parágrafo que o pastor lê primeiro: o período em poucas frases, só com o que o cálculo sustenta. Determinístico (sem IA): testável. */
export function resumoExecutivo(a: AnaliseDoPeriodo): string {
  if (a.arrecadado === 0) return `Entre ${ddmmaaaa(a.periodo.ini)} e ${ddmmaaaa(a.periodo.fim)} não há contribuições registradas.`;
  const partes = [
    `Entre ${ddmmaaaa(a.periodo.ini)} e ${ddmmaaaa(a.periodo.fim)}, ${plural(a.dizimistas, "dizimista identificado deu dízimo", "dizimistas identificados deram dízimo")} e ${plural(a.doadores, "pessoa contribuiu", "pessoas contribuíram")} ao todo, somando ${brl(a.arrecadado)}.`,
    `A média mensal foi de ${brl(a.mediaMensal)}.`,
  ];
  if (a.recorrentes) partes.push(`${n(a.recorrentes.pct ?? 0, 0)}% dos dizimistas (${n(a.recorrentes.pessoas)}) deram dízimo em todos os ${n(a.recorrentes.meses)} meses completos do período.`);
  if (a.novos !== null) partes.push(a.novos === 0 ? "Ninguém contribuiu pela primeira vez no período." : `${plural(a.novos, "pessoa contribuiu", "pessoas contribuíram")} pela primeira vez no período.`);
  const d = a.destaques.maiorAdesao;
  if (d) partes.push(`A semana de maior adesão foi a de ${ddmm(d.inicio)}, com ${plural(d.contribuintes, "pessoa", "pessoas")}.`);
  return partes.join(" ");
}

/** Barras horizontais em tabela: rótulo, barra proporcional ao maior valor e o número. */
function barrasHorizontais(linhas: { rotulo: string; valor: number; texto: string }[]): string {
  const max = Math.max(1, ...linhas.map(l => l.valor));
  const linha = (l: { rotulo: string; valor: number; texto: string }) => {
    const pct = Math.max(l.valor > 0 ? 2 : 0, Math.round((l.valor / max) * 100));
    return `<tr><td width="54" style="padding:3px 8px 3px 0;font-size:12px;color:${D.COR.suave}">${D.esc(l.rotulo)}</td>`
      + `<td style="padding:3px 0"><table role="presentation" width="${pct}%" cellpadding="0" cellspacing="0"><tr><td height="12" bgcolor="${D.COR.titulo}" style="font-size:1px;line-height:1px;border-radius:3px">&nbsp;</td></tr></table></td>`
      + `<td width="96" align="right" style="padding:3px 0 3px 8px;font-size:12px;font-weight:bold;color:${D.COR.texto}">${D.esc(l.texto)}</td></tr>`;
  };
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${linhas.map(linha).join("")}</table>`;
}

/** Colunas verticais lado a lado (uma por semana): a "curva de adesão" sem imagem. Mostra a primeira e a última data embaixo. */
function colunasDeAdesao(semanas: AnaliseDoPeriodo["semanas"]): string {
  if (semanas.length === 0) return "";
  const max = Math.max(1, ...semanas.map(s => s.contribuintes));
  const ALTURA = 64;
  const celulas = semanas.map(s => {
    const h = Math.max(s.contribuintes > 0 ? 3 : 1, Math.round((s.contribuintes / max) * ALTURA));
    return `<td valign="bottom" align="center" height="${ALTURA}" style="padding:0 1px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td height="${h}" bgcolor="${s.contribuintes > 0 ? D.COR.titulo : D.COR.linha}" style="font-size:1px;line-height:1px;border-radius:2px 2px 0 0" title="semana de ${ddmm(s.inicio)}: ${s.contribuintes} pessoas">&nbsp;</td></tr></table></td>`;
  }).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${celulas}</tr></table>`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding-top:4px;font-size:11px;color:${D.COR.suave}">semana de ${ddmm(semanas[0].inicio)}</td>`
    + `<td align="center" style="padding-top:4px;font-size:11px;color:${D.COR.suave}">pico: ${n(max)} ${max === 1 ? "pessoa" : "pessoas"}</td>`
    + `<td align="right" style="padding-top:4px;font-size:11px;color:${D.COR.suave}">semana de ${ddmm(semanas[semanas.length - 1].inicio)}</td></tr></table>`;
}

export function montarEmailDeContribuicoes(a: AnaliseDoPeriodo, o: { igreja?: string | null; aviso?: string } = {}): EmailDeContribuicoes {
  const periodo = `${ddmmaaaa(a.periodo.ini)} a ${ddmmaaaa(a.periodo.fim)}`;
  const assunto = `Relatório de contribuições — ${periodo}`;
  const resumo = resumoExecutivo(a);
  const preheader = a.arrecadado === 0 ? "Sem contribuições no período." : `${plural(a.dizimistas, "dizimista", "dizimistas")} · ${brl(a.arrecadado)} arrecadados`;
  const d = a.destaques;

  let corpo = D.saudacao("Relatório de contribuições") + D.paragrafo(`Período analisado: ${periodo}.`) + D.paragrafo(resumo);

  if (a.arrecadado > 0) {
    corpo += D.secao("Em números", "Só contam pessoas identificadas; o valor sem identificação aparece abaixo.");
    corpo += D.indicadores([
      { icone: "👥", rotulo: "Dizimistas", valor: n(a.dizimistas) },
      { icone: "🤝", rotulo: "Doadores", valor: n(a.doadores) },
      { icone: "💰", rotulo: "Arrecadado", valor: brl(a.arrecadado) },
      { icone: "📅", rotulo: "Média mensal", valor: brl(a.mediaMensal) },
      { icone: "📊", rotulo: "Média por doador", valor: a.mediaPorDoador === null ? "—" : brl(a.mediaPorDoador) },
      { icone: "🔁", rotulo: "Recorrência", valor: a.recorrentes ? `${n(a.recorrentes.pct ?? 0, 1)}%` : "—" },
      { icone: "🌱", rotulo: "Novos", valor: a.novos === null ? "—" : n(a.novos) },
      { icone: "🧾", rotulo: "Frequência média", valor: a.frequenciaMedia === null ? "—" : n(a.frequenciaMedia, 1) },
    ]);

    corpo += D.secao("Por categoria");
    corpo += D.cartao(null, barrasHorizontais([
      { rotulo: "Dízimos", valor: a.porTipo.dizimo, texto: brl(a.porTipo.dizimo) },
      { rotulo: "Ofertas", valor: a.porTipo.oferta, texto: brl(a.porTipo.oferta) },
      { rotulo: "Missões", valor: a.porTipo.missoes, texto: brl(a.porTipo.missoes) },
    ]));

    corpo += D.secao("Curva de adesão", "Pessoas diferentes que contribuíram em cada semana (segunda a domingo).");
    corpo += D.cartao(null, colunasDeAdesao(a.semanas));

    corpo += D.secao("Distribuição mensal", "Valor arrecadado em cada mês; o primeiro e o último podem estar incompletos.");
    corpo += D.cartao(null, barrasHorizontais(a.meses.map(m => ({ rotulo: mesCurto(m.mes), valor: m.valor, texto: brl(m.valor) }))));

    const destaques: string[] = [];
    if (d.maiorAdesao) destaques.push(`Maior adesão: ${plural(d.maiorAdesao.contribuintes, "pessoa", "pessoas")} na semana de ${ddmm(d.maiorAdesao.inicio)}.`);
    if (d.maiorArrecadacao) destaques.push(`Maior arrecadação: ${brl(d.maiorArrecadacao.valor)} na semana de ${ddmm(d.maiorArrecadacao.inicio)}.`);
    if (d.maiorCrescimento) destaques.push(`Maior crescimento: +${n(d.maiorCrescimento.variacao, 0)}% na semana de ${ddmm(d.maiorCrescimento.semana.inicio)}, sobre a semana anterior.`);
    if (destaques.length) corpo += D.secao("Destaques") + D.cartaoDeLista({ titulo: "Semanas de destaque", frase: "O que mais se destacou no período:", itens: destaques, tom: "info" });

    const c = a.cobertura;
    corpo += D.blocoDeObservacao(
      `Identificação: ${c.pctDoValor === null ? "—" : n(c.pctDoValor, 1) + "%"} do valor tem pessoa identificada; ${brl(c.valorNaoIdentificado)} em ${plural(c.entradasSemPessoa, "entrada", "entradas")} ficou sem identificação. `
      + `A análise começa em ${ddmmaaaa(PISO_DE_IDENTIFICACAO)}, quando a identificação das contribuições passou a ser confiável.`,
    );
  }
  corpo += D.blocoDeObservacao("Este relatório traz apenas números agregados. Nomes e valores individuais ficam dentro do sistema, para quem tem acesso autorizado, com registro de quem consulta.");

  const html = D.moldura({ assunto, igreja: o.igreja, aviso: o.aviso, preheader, corpo, versiculo: D.VERSICULO_DOS_RELATORIOS });

  const linhas = [`Relatório de contribuições`, `Período analisado: ${periodo}`, "", resumo];
  if (a.arrecadado > 0) {
    linhas.push("", `Dizimistas: ${n(a.dizimistas)}`, `Doadores: ${n(a.doadores)}`, `Arrecadado: ${brl(a.arrecadado)} (dízimos ${brl(a.porTipo.dizimo)}, ofertas ${brl(a.porTipo.oferta)}, missões ${brl(a.porTipo.missoes)})`,
      `Média mensal: ${brl(a.mediaMensal)}`, `Recorrência: ${a.recorrentes ? n(a.recorrentes.pct ?? 0, 1) + "%" : "—"}`, `Novos: ${a.novos === null ? "—" : n(a.novos)}`);
    linhas.push("", `Identificação: ${a.cobertura.pctDoValor === null ? "—" : n(a.cobertura.pctDoValor, 1) + "%"} do valor tem pessoa identificada.`);
  }
  linhas.push("", "Este relatório traz apenas números agregados. Nomes e valores individuais ficam dentro do sistema.");
  return { assunto, preheader, html, texto: linhas.join("\n"), resumo };
}
