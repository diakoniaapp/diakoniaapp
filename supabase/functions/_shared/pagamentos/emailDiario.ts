// ─── emailDiario — o e-mail do Resumo Diário da Tesouraria (puro: recebe os itens já prontos e devolve assunto, HTML e texto) ───────────────────────────
//
// Pedido dela (22/10/2026): o tesoureiro recebe, todo dia, tudo o que precisa para pagar sem abrir o sistema. Fase 1: SEM anexos (PDF resumo e ZIP vêm na Fase 2).
// O formato é o do "Arquivos de pagamento" que ela já manda (➡️ "Boleto bancário · Banco · R$ · vence dd/mm", beneficiário em maiúsculas, linha em fonte monoespaçada), mais:
//   · DE ONDE veio cada código — 🧾 Linha digitável do documento · 💳 PIX do documento · 👤 PIX do cadastro do favorecido;
//   · quanto está ATRASADO e o que vence hoje;
//   · "já enviado em dd/mm — confira se já foi pago": o e-mail se repete enquanto a obrigação estiver em aberto, e quem pagou ontem pode ainda não ter dado baixa no sistema;
//   · quatro seções (ver `secaoDoItem`): Para pagar · Conferir antes de pagar (sem o código) · Sem linha nem Pix · e a nota dos sigilosos, que não aparecem.
import { AVISO_DE_CONFERENCIA, bancoDaLinha, formatarLinha, ICONE_SEM_MEIO, periodoDoDia, rotuloDoCodigo, tipoDaLinha } from "./envioDePagamentos.ts";
import { assinaturaEmHtml, assinaturaEmTexto } from "./assinaturaDoSistema.ts";
import { secaoDoItem, type ItemDoDia } from "./itensDoDia.ts";

export const LIMITE_POR_SECAO = 40;
const LINK_DO_SISTEMA = "https://portal.diakoniaapp.com.br";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");
const dataBr = (ymd: string) => ymd.slice(0, 10).split("-").reverse().join("/");
const dataComPontos = (ymd: string) => ymd.slice(0, 10).split("-").reverse().join(".");
const dataCurta = (iso: string) => dataBr(iso.slice(0, 10)).slice(0, 5);
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export interface OpcoesDoDiario {
  /** AAAA-MM-DD, a data de Brasília */
  hojeYmd: string;
  /** a hora do envio (escolhe "bom dia"/"boa tarde") */
  hora: number;
  /** linhas no topo do e-mail (prévia e teste) */
  aviso?: string;
}

export interface EmailDoDiario {
  assunto: string; html: string; texto: string;
  /** quantos itens foram para cada seção */
  contagem: { pagar: number; conferir: number; semMeio: number; sigilosos: number };
  /** o que entrou no total em dinheiro: só a seção "pagar" */
  total: { quantidade: number; valor: number; atrasados: { quantidade: number; valor: number }; hoje: { quantidade: number; valor: number } };
  /** os itens LISTADOS (entram no registro de "já enviado") — sem os sigilosos */
  listados: ItemDoDia[];
}

/** O texto do "já enviado": só quando o último envio foi antes de hoje. */
const jaEnviado = (i: ItemDoDia, hojeYmd: string): string | null =>
  i.ultimoEnvio && i.ultimoEnvio.slice(0, 10) < hojeYmd ? `já enviado em ${dataCurta(i.ultimoEnvio)} — confira se já foi pago` : null;

/** O atraso vem da OBRIGAÇÃO (a data que a Tesouraria cadastrou), não da data lida no documento: a leitura do PDF às vezes pega a emissão no lugar do vencimento. A data do documento aparece no cabeçalho e, se diferir, numa nota. */
const situacaoPorDias = (d: number): string => (d < 0 ? `ATRASADO há ${Math.abs(d)}d` : d === 0 ? "vence hoje" : `vence em ${d}d`);

const cabecalho = (i: ItemDoDia): string => {
  const partes = i.linha
    ? [tipoDaLinha(i.linha), bancoDaLinha(i.linha), brl(i.valor), `vence ${dataBr(i.vencimento)}`]
    : ["Pix", brl(i.valor), `vence ${dataBr(i.vencimento)}`];
  return partes.filter(Boolean).join(" · ");
};
const codigoDo = (i: ItemDoDia) => (i.linha ? formatarLinha(i.linha) : i.pix ?? "");
const beneficiario = (i: ItemDoDia) => i.fornecedor.toLocaleUpperCase("pt-BR");

export function montarEmailDiario(itens: readonly ItemDoDia[], o: OpcoesDoDiario): EmailDoDiario {
  const porSecao = { pagar: [] as ItemDoDia[], conferir: [] as ItemDoDia[], sem_meio: [] as ItemDoDia[], sigiloso: [] as ItemDoDia[] };
  for (const i of itens) porSecao[secaoDoItem(i)].push(i);
  const soma = (xs: ItemDoDia[]) => xs.reduce((t, i) => t + i.valor, 0);
  const dias = (i: ItemDoDia) => i.diasParaVencer;
  const situacao = (i: ItemDoDia) => situacaoPorDias(dias(i));
  const atrasados = porSecao.pagar.filter(i => dias(i) < 0);
  const hoje = porSecao.pagar.filter(i => dias(i) === 0);
  const total = { quantidade: porSecao.pagar.length, valor: soma(porSecao.pagar), atrasados: { quantidade: atrasados.length, valor: soma(atrasados) }, hoje: { quantidade: hoje.length, valor: soma(hoje) } };
  const listados = [...porSecao.pagar, ...porSecao.conferir, ...porSecao.sem_meio];

  const assunto = `Resumo diário da Tesouraria | ${dataComPontos(o.hojeYmd)}${total.quantidade > 0 ? ` · ${plural(total.quantidade, "pagamento", "pagamentos")}` : ""}`;
  const saudacao = `Olá irmãos, ${periodoDoDia(o.hora)}!\nGraça e paz!`;
  const intro = listados.length === 0
    ? "Não há pagamentos em aberto para hoje."
    : `Segue o que há para pagar: o que vence hoje e o que está em atraso. A origem de cada código está indicada (🧾 documento · 💳 Pix do documento · 👤 Pix do cadastro). Os documentos ainda não vão anexados a este e-mail — para os itens abaixo sem linha ou Pix, consulte o documento no DiakoniaApp.`;
  const resumo = total.quantidade > 0
    ? `${plural(total.quantidade, "pagamento", "pagamentos")} · ${brl(total.valor)}` + (total.atrasados.quantidade > 0 ? ` — ${total.atrasados.quantidade} em atraso (${brl(total.atrasados.valor)})` : "") + (total.hoje.quantidade > 0 ? ` — ${total.hoje.quantidade} vencem hoje (${brl(total.hoje.valor)})` : "")
    : "";

  // ── HTML ──
  const mono = `font-family:Consolas,'Courier New',monospace;font-size:12px`;
  const corDe = (i: ItemDoDia) => (dias(i) < 0 ? "#b4472b" : "#8a6d3b");
  const limitar = (xs: ItemDoDia[]) => ({ vistos: xs.slice(0, LIMITE_POR_SECAO), resto: Math.max(0, xs.length - LIMITE_POR_SECAO) });
  let html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:640px">`;
  if (o.aviso) html += `<p style="margin:0 0 12px;padding:8px 10px;border-radius:6px;background:#f3e6c8;font-size:12px;font-weight:bold;color:#6b4b10">${esc(o.aviso)}</p>`;
  html += `<p>${esc(saudacao).replace(/\n/g, "<br>")}</p><p>${esc(intro)}</p>`;
  if (resumo) html += `<p style="margin:12px 0;padding:8px 10px;background:#faf9f5;border-left:3px solid #a5741f"><b>${esc(resumo)}</b></p>`;

  const blocoPagar = (i: ItemDoDia) => {
    const repetido = jaEnviado(i, o.hojeYmd);
    return `<p style="margin:14px 0 0"><b>➡️ ${esc(cabecalho(i))}</b> <span style="color:${corDe(i)};font-size:12px;font-weight:bold">· ${esc(situacao(i))}</span><br>${esc(beneficiario(i))}`
      + (i.descricao && i.descricao.trim().toLocaleUpperCase("pt-BR") !== beneficiario(i) ? `<br><span style="font-size:12px;color:#777">${esc(i.descricao)}</span>` : "")
      + (rotuloDoCodigo(i) ? `<br><span style="font-size:11px;color:#777">${esc(rotuloDoCodigo(i))}</span>` : "")
      + `<br><span style="${mono}">${esc(codigoDo(i))}</span>`
      + i.avisos.map(a => `<br><span style="font-size:11px;color:#777">ℹ ${esc(a)}</span>`).join("")
      + (repetido ? `<br><span style="font-size:12px;color:#b4472b">↻ ${esc(repetido)}</span>` : "") + `</p>`;
  };
  if (porSecao.pagar.length > 0) {
    const { vistos, resto } = limitar(porSecao.pagar);
    html += `<h3 style="margin:20px 0 0;font-size:14px;color:#6b4b10">Para pagar</h3>${vistos.map(blocoPagar).join("")}`;
    if (resto > 0) html += `<p style="margin-top:10px;color:#777">+ ${plural(resto, "outro pagamento", "outros pagamentos")} — abra o DiakoniaApp.</p>`;
  }
  if (porSecao.conferir.length > 0) {
    html += `<h3 style="margin:22px 0 0;font-size:14px;color:#b4472b">⚠ Conferir antes de pagar</h3><p style="margin:4px 0 0;font-size:12px;color:#777">O documento não bate com a obrigação: o código não vem neste e-mail. Não pague antes de conferir no DiakoniaApp.</p>`;
    for (const i of limitar(porSecao.conferir).vistos) {
      html += `<p style="margin:12px 0 0"><b>⚠ ${esc(beneficiario(i))}</b> · ${esc(brl(i.valor))} · vence ${esc(dataBr(i.vencimento))} <span style="color:${corDe(i)};font-size:12px;font-weight:bold">· ${esc(situacao(i))}</span>${i.avisos.map(a => `<br><span style="font-size:12px;color:#b4472b">• ${esc(a)}</span>`).join("")}</p>`;
    }
  }
  if (porSecao.sem_meio.length > 0) {
    html += `<h3 style="margin:22px 0 0;font-size:14px;color:#6b4b10">${ICONE_SEM_MEIO} Sem linha digitável nem Pix</h3><p style="margin:4px 0 0;font-size:12px;color:#777">Pague pelo documento (no DiakoniaApp).</p>`;
    for (const i of limitar(porSecao.sem_meio).vistos) {
      html += `<p style="margin:10px 0 0">${esc(beneficiario(i))} · ${esc(brl(i.valor))} · vence ${esc(dataBr(i.vencimento))} <span style="color:${corDe(i)};font-size:12px;font-weight:bold">· ${esc(situacao(i))}</span>`
        + (i.documentos > 0 ? ` <span style="font-size:12px;color:#777">(${plural(i.documentos, "documento", "documentos")} no sistema)</span>` : "")
        + (jaEnviado(i, o.hojeYmd) ? `<br><span style="font-size:12px;color:#b4472b">↻ ${esc(jaEnviado(i, o.hojeYmd)!)}</span>` : "") + `</p>`;
    }
  }
  if (porSecao.sigiloso.length > 0) html += `<p style="margin-top:18px;font-size:12px;color:#777">🔒 ${esc(plural(porSecao.sigiloso.length, "pagamento sigiloso (remuneração) não aparece", "pagamentos sigilosos (remuneração) não aparecem"))} neste e-mail.</p>`;
  html += `<p style="margin-top:20px;font-size:12px;color:#555">${esc(AVISO_DE_CONFERENCIA)}</p>`;
  html += `<p style="font-size:13px"><a href="${LINK_DO_SISTEMA}" style="color:#a5741f;font-weight:bold;text-decoration:none">Abrir o DiakoniaApp →</a></p>`;
  html += assinaturaEmHtml("mensagem") + `</div>`;

  // ── texto simples ──
  const t: string[] = [];
  if (o.aviso) t.push(o.aviso, "");
  t.push(saudacao, "", intro);
  if (resumo) t.push("", resumo);
  if (porSecao.pagar.length > 0) {
    t.push("", "PARA PAGAR");
    for (const i of limitar(porSecao.pagar).vistos) {
      t.push("", `➡️ ${cabecalho(i)} · ${situacao(i)}`, beneficiario(i), ...(rotuloDoCodigo(i) ? [rotuloDoCodigo(i)] : []), codigoDo(i), ...i.avisos.map(a => `ℹ ${a}`), ...(jaEnviado(i, o.hojeYmd) ? [`↻ ${jaEnviado(i, o.hojeYmd)}`] : []));
    }
  }
  if (porSecao.conferir.length > 0) {
    t.push("", "⚠ CONFERIR ANTES DE PAGAR (o código não vem neste e-mail)");
    for (const i of limitar(porSecao.conferir).vistos) t.push("", `⚠ ${beneficiario(i)} · ${brl(i.valor)} · vence ${dataBr(i.vencimento)} · ${situacao(i)}`, ...i.avisos.map(a => `  • ${a}`));
  }
  if (porSecao.sem_meio.length > 0) {
    t.push("", `${ICONE_SEM_MEIO} SEM LINHA DIGITÁVEL NEM PIX (pague pelo documento, no DiakoniaApp)`);
    for (const i of limitar(porSecao.sem_meio).vistos) t.push(`${beneficiario(i)} · ${brl(i.valor)} · vence ${dataBr(i.vencimento)} · ${situacao(i)}`);
  }
  if (porSecao.sigiloso.length > 0) t.push("", `🔒 ${plural(porSecao.sigiloso.length, "pagamento sigiloso não aparece", "pagamentos sigilosos não aparecem")} neste e-mail.`);
  t.push("", AVISO_DE_CONFERENCIA, "", `Abrir o DiakoniaApp: ${LINK_DO_SISTEMA}`, "", assinaturaEmTexto("mensagem"));

  return { assunto, html, texto: t.join("\n"), contagem: { pagar: porSecao.pagar.length, conferir: porSecao.conferir.length, semMeio: porSecao.sem_meio.length, sigilosos: porSecao.sigiloso.length }, total, listados };
}
