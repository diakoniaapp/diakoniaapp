// ─── email — o relatório de contribuições AGREGADO, para o pastor (27/10/2026) ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
//
// Decisão dela: o pastor recebe por e-mail o relatório AGREGADO — período, dizimistas identificados, total, média mensal, semana de maior adesão, novos, recorrentes — e, no modelo Pastor (decisão de
// 27/10/2026), também NOMES, sem valores: só quando um dos dois blocos nominais é pedido, e a lista chega pronta em `ListasNominais`, cujo tipo NÃO tem campo de valor. Sem esses blocos este módulo só recebe
// números (`AnaliseDoPeriodo` e `ResumoDaBase`): não há como um nome entrar no e-mail. Os gráficos são barras em tabela
// HTML (cliente de e-mail não roda JavaScript nem SVG). Mesma moldura, paleta e rodapé de todos os e-mails (`email/desenho.ts`). O que aparece é escolhido por BLOCOS (`blocos.ts`).
import * as D from "../email/desenho.ts";
import { PISO_DE_IDENTIFICACAO, ROTULO_DA_BASE, mesesCompletos, type AnaliseDoPeriodo, type BaseAnalisada, type ResumoDaBase, type TendenciaDoPeriodo } from "./analise.ts";
import { IDS_AGREGADOS, ORDENACAO_PADRAO, ORDENACOES_DAS_LISTAS, temBlocoNominal, type IdDoBloco, type OrdenacaoDasListas } from "./blocos.ts";
import type { LinhaNominal, ListasNominais } from "./nominal.ts";

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

/** O bloco "Saúde da base contribuinte": adesão da base, novos, recorrentes e quem não contribuiu — só QUANTIDADES, nunca nomes. */
function blocoSaudeDaBase(a: AnaliseDoPeriodo, b: ResumoDaBase | null): string {
  let h = D.secao("Saúde da base contribuinte", "Membros e congregados ativos; menores de 18 anos ficam fora.");
  if (!b) return h + D.blocoDeObservacao("A adesão da base não pôde ser calculada neste envio.");
  h += D.indicadores([
    { icone: "🏛️", rotulo: "Membros ativos", valor: n(b.base) },
    { icone: "✅", rotulo: "Contribuíram", valor: n(b.contribuiram) },
    { icone: "🕊️", rotulo: "Sem contribuição registrada", valor: n(b.naoContribuiram) },
    { icone: "📈", rotulo: "Adesão da base", valor: b.adesaoPct === null ? "—" : `${n(b.adesaoPct, 1)}%` },
    { icone: "🌱", rotulo: "Novos dizimistas", valor: a.novos === null ? "—" : n(a.novos) },
    { icone: "🔁", rotulo: "Recorrentes", valor: a.recorrentes ? n(a.recorrentes.pessoas) : "—" },
  ]);
  return h;
}

/** O bloco "Não contribuíram no período": só quantidades, nunca nomes. */
function blocoNaoContribuiram(b: ResumoDaBase | null): string {
  let h = D.secao("Não contribuíram no período", "Quantidades para acompanhamento pastoral.");
  if (!b) return h + D.blocoDeObservacao("Esta informação não pôde ser calculada neste envio.");
  const linhas = [
    `Nenhuma contribuição registrada desde ${ddmmaaaa(PISO_DE_IDENTIFICACAO)}: ${n(b.nuncaDesdeOPiso)}`,
    `Contribuíram anteriormente, mas não no período: ${n(b.jaContribuiuAntes)}`,
    `Sem contribuição há mais de 30 dias: ${n(b.haMaisDe.dias30)} · 60 dias: ${n(b.haMaisDe.dias60)} · 90 dias: ${n(b.haMaisDe.dias90)} · 180 dias: ${n(b.haMaisDe.dias180)}`,
  ];
  return h + D.cartaoDeLista({ titulo: "Quem ainda não contribuiu", frase: "Quem contribui por outra pessoa da família, em espécie ou sem identificação pode estar aqui sem ter deixado de contribuir.", itens: linhas, tom: "info" });
}

const sinal = (v: number | null) => (v === null ? "—" : `${v > 0 ? "+" : ""}${n(v, 1)}%`);

/** O bloco "Tendências": comparação com o período anterior (quando cabe depois do piso) ou a direção da série. */
function blocoTendencias(t: TendenciaDoPeriodo | null | undefined): string {
  let h = D.secao("Tendências");
  if (!t) return h + D.blocoDeObservacao("Não há dados suficientes neste período para indicar uma tendência.");
  if (t.modo === "periodo_anterior" && t.arrecadado && t.contribuintes && t.dizimistas && t.anterior) {
    h += D.paragrafo(`Comparação com o período anterior de mesma duração (${ddmmaaaa(t.anterior.ini)} a ${ddmmaaaa(t.anterior.fim)}).`);
    return h + D.cartaoDeLista({ titulo: "Variação", frase: "", tom: "info", itens: [
      `Arrecadado: ${brl(t.arrecadado.atual)} (antes ${brl(t.arrecadado.anterior)}) · ${sinal(t.arrecadado.variacaoPct)}`,
      `Contribuintes: ${n(t.contribuintes.atual)} (antes ${n(t.contribuintes.anterior)}) · ${sinal(t.contribuintes.variacaoPct)}`,
      `Dizimistas: ${n(t.dizimistas.atual)} (antes ${n(t.dizimistas.anterior)}) · ${sinal(t.dizimistas.variacaoPct)}`,
    ] });
  }
  const direcao = t.direcao === "alta" ? "em alta" : t.direcao === "queda" ? "em queda" : "estável";
  return h + D.cartaoDeLista({ titulo: `Arrecadação ${direcao}`, frase: "", tom: "info", itens: [
    `A média semanal da segunda metade do período em relação à primeira: ${sinal(t.variacaoPct ?? null)}.`,
    `O período anterior equivalente começaria antes de ${ddmmaaaa(PISO_DE_IDENTIFICACAO)}, quando a identificação ainda não era confiável; por isso a tendência é a da própria série.`,
  ] });
}

/** O bloco "Critérios da análise": as definições usadas, em frases. */
function blocoCriterios(): string {
  return D.secao("Critérios da análise", "Como cada número é calculado.") + D.cartaoDeLista({ titulo: "Definições", frase: "", tom: "info", itens: [
    `A análise começa em ${ddmmaaaa(PISO_DE_IDENTIFICACAO)}: antes disso só cerca de um terço das contribuições tem pessoa identificada.`,
    "Contribuição: dízimo, oferta ou oferta para missões, realizada ou conciliada; transferências e rendimentos ficam de fora.",
    "Dizimista: pessoa da base com dízimo identificado no período. Doador: qualquer das contribuições escolhidas.",
    "Recorrente: dizimista que deu dízimo em todos os meses completos do período. Novo: primeira contribuição identificada dentro do período.",
    "Base: pessoas ativas do vínculo escolhido; quem contribuiu e está fora da base aparece à parte e não entra nos indicadores.",
    "Sem contribuição \"nunca\" significa nenhuma contribuição registrada desde o início da análise, não na vida.",
  ] });
}

/** O cabeçalho de rastreabilidade: período, base, contribuições, pessoas consideradas, quando e por quem foi gerado, versão dos critérios. */
function cartaoDoCabecalho(linhas: { rotulo: string; valor: string }[]): string {
  const l = (x: { rotulo: string; valor: string }) => `<tr><td style="padding:2px 10px 2px 0;font-size:12px;color:${D.COR.suave};white-space:nowrap" valign="top">${D.esc(x.rotulo)}</td><td style="padding:2px 0;font-size:12px;color:${D.COR.texto}">${D.esc(x.valor)}</td></tr>`;
  return D.cartao("Este relatório", `<table role="presentation" cellpadding="0" cellspacing="0" width="100%">${linhas.map(l).join("")}</table>`);
}

const MESES_POR_EXTENSO = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const mesPorExtenso = (m: string) => `${MESES_POR_EXTENSO[Number(m.slice(5, 7)) - 1]} de ${m.slice(0, 4)}`;

/**
 * O texto de "Como interpretar este relatório": as definições dos perfis, GERADAS conforme o período analisado — quantos meses completos tem, quais são, e se há histórico para dizer quem é novo.
 * Determinístico (sem IA): os mesmos números dão sempre o mesmo texto. As frases batem com o que o cálculo faz (`analisarContribuicoes`/`resumirPessoas`).
 */
export function textosParaInterpretar(a: AnaliseDoPeriodo, base: BaseAnalisada): { titulo: string; texto: string }[] {
  const { ini, fim } = a.periodo;
  const p = `${ddmmaaaa(ini)} a ${ddmmaaaa(fim)}`;
  const completos = mesesCompletos(ini, fim);
  const meses = completos.length === 0 ? "" : completos.length === 1 ? mesPorExtenso(completos[0]) : `${mesPorExtenso(completos[0])} a ${mesPorExtenso(completos[completos.length - 1])}`;
  const recorrente = completos.length === 0
    ? `Pessoa que contribuiu em todos os meses do período analisado. O período de ${p} não tem nenhum mês completo; por isso ninguém é classificado como recorrente.`
    : `Pessoa que contribuiu em todos os meses do período analisado: ${completos.length === 1 ? "o único mês completo" : `os ${completos.length} meses completos`} entre ${p} (${meses}). O primeiro e o último mês, quando incompletos, não entram nessa conta.`;
  const novo = ini <= PISO_DE_IDENTIFICACAO
    ? `Pessoa cuja primeira contribuição identificada ocorreu dentro do período analisado. Como o período começa em ${ddmmaaaa(PISO_DE_IDENTIFICACAO)}, ainda não há histórico anterior confiável; por isso ninguém é classificado como novo dizimista neste relatório.`
    : `Pessoa cuja primeira contribuição identificada ocorreu dentro do período analisado (${p}), sem nenhuma contribuição identificada desde ${ddmmaaaa(PISO_DE_IDENTIFICACAO)} até a véspera do período.`;
  return [
    { titulo: "Recorrente", texto: recorrente },
    { titulo: "Contribuiu no período", texto: `Pessoa que realizou uma ou mais contribuições entre ${p}, mas não em todos os meses.` },
    { titulo: "Novo dizimista", texto: novo },
    { titulo: "Sem contribuição registrada", texto: `Pessoa da base analisada (${ROTULO_DA_BASE[base].toLowerCase()}, ativos) sem contribuições entre ${p}. O complemento diz há quanto tempo: nenhuma desde ${ddmmaaaa(PISO_DE_IDENTIFICACAO)} (início da análise), ou mais de 90 ou de 180 dias desde a última contribuição.` },
  ];
}

function blocoComoInterpretar(a: AnaliseDoPeriodo, base: BaseAnalisada): string {
  const itens = textosParaInterpretar(a, base);
  const linha = (i: { titulo: string; texto: string }) => `<p style="margin:0 0 7px;font-size:12px;line-height:1.5;color:${D.COR.texto}"><strong>${D.esc(i.titulo)}:</strong> ${D.esc(i.texto)}</p>`;
  return D.secao("Como interpretar este relatório", "Definições dos perfis usados nas listas com nomes, para o período analisado.") + D.cartao(null, itens.map(linha).join(""));
}

/** Uma lista com nomes: nome, última contribuição, quantidade (só de quem contribuiu) e situação. Nenhum valor. */
function tabelaNominal(titulo: string, subtitulo: string, linhas: LinhaNominal[], comQuantidade: boolean, ordenacao: OrdenacaoDasListas): string {
  const ordem = ORDENACOES_DAS_LISTAS.find(x => x.id === ordenacao)!;
  let h = D.secao(titulo, `${subtitulo} Ordem: ${ordem.rotulo.toLowerCase()}. ${ordem.descricao}.`);
  if (linhas.length === 0) return h + D.blocoDeObservacao("Ninguém nesta situação no período.");
  const cel = (t: string, extra = "") => `<td style="padding:5px 6px;font-size:12px;border-bottom:1px solid ${D.COR.linha};${extra}">${t}</td>`;
  const cab = `<tr>${["#", "Nome", ...(comQuantidade ? ["Contribuições"] : []), "Perfil de contribuição"].map(t => `<td style="padding:5px 6px;font-size:11px;font-weight:bold;color:${D.COR.suave};border-bottom:2px solid ${D.COR.linha}">${D.esc(t)}</td>`).join("")}</tr>`;
  const corpo = linhas.map(l => `<tr>${cel(n(l.posicao), `color:${D.COR.suave};text-align:right;width:28px`)}${cel(`<strong>${D.esc(l.nome)}</strong>`)}${comQuantidade ? cel(l.contribuicoes === null ? "—" : n(l.contribuicoes), "text-align:center") : ""}${cel(D.esc(l.perfil), `color:${D.COR.suave}`)}</tr>`).join("");
  return h + D.cartao(null, `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${cab}${corpo}</table>`);
}

export interface OpcoesDoEmailDeContribuicoes {
  igreja?: string | null;
  aviso?: string;
  /** os blocos escolhidos; ausente = todos os AGREGADOS (nomes só entram se o bloco nominal for pedido) */
  blocos?: IdDoBloco[];
  /** o resumo da base (SÓ números), necessário ao bloco "Saúde da base contribuinte" */
  base?: ResumoDaBase | null;
  /** as listas com nomes (sem valores), necessárias aos blocos nominais; só vão se o bloco foi escolhido */
  nominal?: ListasNominais | null;
  /** o cabeçalho de rastreabilidade (obrigatório em todo relatório gerado pela função) */
  cabecalho?: { rotulo: string; valor: string }[];
  /** a base analisada (para o texto de "Como interpretar este relatório"); ausente = membros e congregados */
  baseAnalisada?: BaseAnalisada;
  /** a ordenação das listas com nomes (a mesma com que as listas foram montadas); ausente = quantidade de contribuições */
  ordenacao?: OrdenacaoDasListas;
  /** a tendência do período, para o bloco "Tendências" */
  tendencia?: TendenciaDoPeriodo | null;
}

export function montarEmailDeContribuicoes(a: AnaliseDoPeriodo, o: OpcoesDoEmailDeContribuicoes = {}): EmailDeContribuicoes {
  const escolhidos = new Set<IdDoBloco>(o.blocos ?? IDS_AGREGADOS);   // sem escolha explícita, só os agregados: nomes nunca entram por omissão
  const tem = (id: IdDoBloco) => escolhidos.has(id);
  const periodo = `${ddmmaaaa(a.periodo.ini)} a ${ddmmaaaa(a.periodo.fim)}`;
  const assunto = `Relatório de contribuições — ${periodo}`;
  const resumo = resumoExecutivo(a);
  const preheader = a.arrecadado === 0 ? "Sem contribuições no período." : `${plural(a.dizimistas, "dizimista", "dizimistas")} · ${brl(a.arrecadado)} arrecadados`;
  const d = a.destaques;

  const comNomes = temBlocoNominal([...escolhidos]);
  let corpo = D.saudacao("Relatório de contribuições") + (o.cabecalho ? cartaoDoCabecalho(o.cabecalho) : D.paragrafo(`Período analisado: ${periodo}.`));
  if (comNomes) corpo += D.cartaoDeAlerta({ titulo: "Contém dados individuais", linhas: ["Este relatório traz nomes de pessoas e a data da última contribuição, sem valores. Não encaminhe nem imprima sem necessidade."], tom: "aviso" });
  if (tem("resumo")) corpo += D.paragrafo(resumo);

  if (a.arrecadado > 0) {
    if (tem("indicadores")) {
      corpo += D.secao("Em números", "Só contam pessoas identificadas; o valor sem identificação aparece no fim.");
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
    }
    if (tem("categorias")) {
      corpo += D.secao("Por categoria");
      corpo += D.cartao(null, barrasHorizontais([
        { rotulo: "Dízimos", valor: a.porTipo.dizimo, texto: brl(a.porTipo.dizimo) },
        { rotulo: "Ofertas", valor: a.porTipo.oferta, texto: brl(a.porTipo.oferta) },
        { rotulo: "Missões", valor: a.porTipo.missoes, texto: brl(a.porTipo.missoes) },
      ]));
    }
    if (tem("curva_adesao")) {
      corpo += D.secao("Curva de adesão", "Pessoas diferentes que contribuíram em cada semana (segunda a domingo).");
      corpo += D.cartao(null, colunasDeAdesao(a.semanas));
    }
    if (tem("distribuicao_mensal")) {
      corpo += D.secao("Distribuição mensal", "Valor arrecadado em cada mês; o primeiro e o último podem estar incompletos.");
      corpo += D.cartao(null, barrasHorizontais(a.meses.map(m => ({ rotulo: mesCurto(m.mes), valor: m.valor, texto: brl(m.valor) }))));
    }
    if (tem("destaques")) {
      const destaques: string[] = [];
      if (d.maiorAdesao) destaques.push(`Maior adesão: ${plural(d.maiorAdesao.contribuintes, "pessoa", "pessoas")} na semana de ${ddmm(d.maiorAdesao.inicio)}.`);
      if (d.maiorArrecadacao) destaques.push(`Maior arrecadação: ${brl(d.maiorArrecadacao.valor)} na semana de ${ddmm(d.maiorArrecadacao.inicio)}.`);
      if (d.maiorCrescimento) destaques.push(`Maior crescimento: +${n(d.maiorCrescimento.variacao, 0)}% na semana de ${ddmm(d.maiorCrescimento.semana.inicio)}, sobre a semana anterior.`);
      if (destaques.length) corpo += D.secao("Destaques") + D.cartaoDeLista({ titulo: "Semanas de destaque", frase: "O que mais se destacou no período:", itens: destaques, tom: "info" });
    }
  }
  // a saúde da base independe de haver arrecadação no período: "ninguém contribuiu" também é informação
  if (tem("saude_da_base")) corpo += blocoSaudeDaBase(a, o.base ?? null);
  if (tem("nao_contribuiram")) corpo += blocoNaoContribuiram(o.base ?? null);
  if (tem("tendencias")) corpo += blocoTendencias(o.tendencia);
  if (tem("criterios")) corpo += blocoCriterios();
  if (comNomes) corpo += blocoComoInterpretar(a, o.baseAnalisada ?? "membros_congregados");   // as definições vêm ANTES da primeira lista com nomes
  if (tem("contribuintes_nominal")) corpo += tabelaNominal("Quem contribuiu", "Nome, quantidade de contribuições e perfil de contribuição. Sem valores.", o.nominal?.contribuiram ?? [], true, o.ordenacao ?? ORDENACAO_PADRAO);
  if (tem("sem_contribuicao_nominal")) corpo += tabelaNominal("Quem não contribuiu", "Pessoas da base analisada sem contribuição registrada no período, para acompanhamento pastoral.", o.nominal?.semContribuicao ?? [], false, o.ordenacao ?? ORDENACAO_PADRAO);
  if (tem("cobertura") && a.arrecadado > 0) {
    const c = a.cobertura;
    corpo += D.blocoDeObservacao(
      `Identificação: ${c.pctDoValor === null ? "—" : n(c.pctDoValor, 1) + "%"} do valor tem pessoa identificada; ${brl(c.valorNaoIdentificado)} em ${plural(c.entradasSemPessoa, "entrada", "entradas")} ficou sem identificação. `
      + `A análise começa em ${ddmmaaaa(PISO_DE_IDENTIFICACAO)}, quando a identificação das contribuições passou a ser confiável.`,
    );
  }
  corpo += D.blocoDeObservacao(comNomes
    ? "Este relatório traz nomes, mas nenhum valor individual. Cada visualização e cada envio ficam registrados no sistema."
    : "Este relatório traz apenas números agregados. Nomes e valores individuais ficam dentro do sistema, para quem tem acesso autorizado, com registro de quem consulta.");

  const html = D.moldura({ assunto, igreja: o.igreja, aviso: o.aviso, preheader, corpo, versiculo: D.VERSICULO_DOS_RELATORIOS });

  const linhas = ["Relatório de contribuições", ...(o.cabecalho ? o.cabecalho.map(c => `${c.rotulo}: ${c.valor}`) : [`Período analisado: ${periodo}`])];
  if (tem("resumo")) linhas.push("", resumo);
  if (a.arrecadado > 0) {
    if (tem("indicadores")) linhas.push("", `Dizimistas: ${n(a.dizimistas)}`, `Doadores: ${n(a.doadores)}`, `Arrecadado: ${brl(a.arrecadado)}`, `Média mensal: ${brl(a.mediaMensal)}`,
      `Recorrência: ${a.recorrentes ? n(a.recorrentes.pct ?? 0, 1) + "%" : "—"}`, `Novos: ${a.novos === null ? "—" : n(a.novos)}`);
    if (tem("categorias")) linhas.push("", `Dízimos ${brl(a.porTipo.dizimo)} · Ofertas ${brl(a.porTipo.oferta)} · Missões ${brl(a.porTipo.missoes)}`);
  }
  if (tem("saude_da_base") && o.base) {
    const b = o.base;
    linhas.push("", "Saúde da base contribuinte", `Membros ativos: ${n(b.base)}`, `Contribuíram: ${n(b.contribuiram)}`, `Sem contribuição registrada: ${n(b.naoContribuiram)}`,
      `Adesão da base: ${b.adesaoPct === null ? "—" : n(b.adesaoPct, 1) + "%"}`);
  }
  if (tem("nao_contribuiram") && o.base) {
    const b = o.base;
    linhas.push("", "Não contribuíram no período", `Nenhuma contribuição registrada desde ${ddmmaaaa(PISO_DE_IDENTIFICACAO)}: ${n(b.nuncaDesdeOPiso)}`, `Contribuíram anteriormente, mas não no período: ${n(b.jaContribuiuAntes)}`,
      `Sem contribuição há mais de 30 / 60 / 90 / 180 dias: ${n(b.haMaisDe.dias30)} / ${n(b.haMaisDe.dias60)} / ${n(b.haMaisDe.dias90)} / ${n(b.haMaisDe.dias180)}`);
  }
  const linhaNominal = (l: LinhaNominal) => `${l.posicao}. ${l.nome}${l.contribuicoes === null ? "" : ` — ${n(l.contribuicoes)} contribuições`} — ${l.perfil}`;
  if (tem("contribuintes_nominal")) linhas.push("", "Quem contribuiu (sem valores)", ...(o.nominal?.contribuiram ?? []).map(linhaNominal));
  if (tem("sem_contribuicao_nominal")) linhas.push("", "Quem não contribuiu", ...(o.nominal?.semContribuicao ?? []).map(linhaNominal));
  if (tem("cobertura") && a.arrecadado > 0) linhas.push("", `Identificação: ${a.cobertura.pctDoValor === null ? "—" : n(a.cobertura.pctDoValor, 1) + "%"} do valor tem pessoa identificada.`);
  linhas.push("", comNomes ? "Este relatório traz nomes, mas nenhum valor individual. Não encaminhe." : "Este relatório traz apenas números agregados. Nomes e valores individuais ficam dentro do sistema.");
  return { assunto, preheader, html, texto: linhas.join("\n"), resumo };
}
