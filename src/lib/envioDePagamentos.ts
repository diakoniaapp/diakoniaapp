// ─── envioDePagamentos — o "Arquivos de pagamento" que a Tesouraria manda aos tesoureiros, montado pelo sistema ──────────────────────────────────────────
// Pedido dela (20/10/2026): hoje ela copia, uma a uma, a linha digitável / Pix de cada obrigação e cola num e-mail (ou WhatsApp) para os tesoureiros, que AINDA não usam o sistema. O formato
// é o do e-mail que ela já manda (assunto "Arquivos de pagamento | Vencimento 13.10.2026"; cada item: "➡️Boleto bancário · Bradesco · R$ 300,00 · vence 13/10/2026", o beneficiário e a linha
// digitável em fonte monoespaçada; os documentos vão numa pasta do Drive). Este módulo é PURO: recebe os itens já lidos e devolve o texto (e-mail formatado, WhatsApp e texto simples).
//
// Regras que ela aprovou: só entra no corpo o que tem linha digitável; Pix é um bloco opcional; prebenda, folha e Sustento são sigilosos e ficam FORA por padrão; o que não tem meio de
// pagamento aparece como "sem dado automático" (nunca some em silêncio) e pode ser citado numa linha final ("na pasta, sem linha digitável").

import { assinaturaEmHtml, assinaturaEmTexto, assinaturaEmWhatsapp } from "@/lib/assinaturaDoSistema";

/** A camada de controle do e-mail: quem paga confere antes. */
export const AVISO_DE_CONFERENCIA = "Confira sempre os valores e vencimentos antes de efetuar os pagamentos.";

export type GrupoDoEnvio = "padrao" | "pix" | "sigiloso" | "sem_dado";

export interface ItemDeEnvio {
  id: string;
  fornecedor: string;
  /** descrição da obrigação (ex.: "Carteira") — vira a linha do beneficiário quando a pessoa quer algo além do nome do favorecido */
  descricao: string | null;
  categoria: string | null;
  centro: string | null;
  valor: number;
  /** YYYY-MM-DD: o vencimento do BOLETO quando o documento traz, senão o da obrigação */
  vencimento: string;
  atrasado: boolean;
  /** linha digitável só com dígitos (47 = boleto bancário, 48 = conta de consumo/guia) */
  linha: string | null;
  /** Pix copia e cola (do documento ou montado a partir da chave do favorecido) */
  pix: string | null;
  grupo: GrupoDoEnvio;
  avisos: string[];
  /** vem marcado ao abrir o painel (pronto, sem aviso que exija decisão, atrasado ou de hoje) */
  marcadoPorPadrao: boolean;
}

// ── bancos ──────────────────────────────────────────────────────────────────

const BANCOS: Record<string, string> = {
  "001": "Banco do Brasil", "003": "Banco da Amazônia", "004": "Banco do Nordeste", "021": "Banestes", "033": "Santander", "041": "Banrisul", "047": "Banese",
  "070": "BRB", "077": "Inter", "085": "Ailos", "104": "Caixa", "121": "Agibank", "136": "Unicred", "208": "BTG Pactual", "212": "Banco Original", "218": "BS2",
  "237": "Bradesco", "260": "Nubank", "290": "PagBank", "323": "Mercado Pago", "336": "C6 Bank", "341": "Itaú", "380": "PicPay", "403": "Cora", "422": "Safra",
  "623": "Banco Pan", "633": "Rendimento", "655": "Votorantim", "748": "Sicredi", "756": "Sicoob",
};

const soDigitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/** Boleto bancário (47 dígitos): o banco emissor vem nos 3 primeiros. Conta de consumo/guia (48, começa com 8) não tem banco; banco desconhecido → null (a linha some, como no e-mail dela). */
export function bancoDaLinha(linha: string | null | undefined): string | null {
  const d = soDigitos(linha);
  if (d.length !== 47) return null;
  return BANCOS[d.slice(0, 3)] ?? null;
}

/** Como ela cola no e-mail: grupos de 5 dígitos separados por espaço (os aplicativos de banco aceitam). */
export function formatarLinha(linha: string | null | undefined): string {
  const d = soDigitos(linha);
  return d.match(/.{1,5}/g)?.join(" ") ?? "";
}

export const tipoDaLinha = (linha: string | null | undefined): string => (soDigitos(linha).length === 48 ? "Guia / conta de consumo" : "Boleto bancário");

// ── quem é sigiloso ─────────────────────────────────────────────────────────

const SIGILOSO = /prebenda|sustento|sal[aá]rio|folha|\brpa\b|remunera|pr[oó]-?labore|f[eé]rias|rescis|13[º°o]?\s*sal/i;

/** Remuneração (prebenda, salário, folha, RPA, Sustento Pastoral): nunca entra no corpo por padrão — vai por e-mail/WhatsApp, e isso é decisão de quem envia. */
export function ehSigiloso(o: { categoria?: string | null; centro?: string | null; descricao?: string | null; fornecedor?: string | null }): boolean {
  return SIGILOSO.test(`${o.categoria ?? ""} ${o.centro ?? ""} ${o.descricao ?? ""} ${o.fornecedor ?? ""}`);
}

// ── classificação ───────────────────────────────────────────────────────────

export interface BaseDoItem {
  id: string; fornecedor: string; descricao: string | null; categoria: string | null; centro: string | null;
  valor: number; vencimento: string; diasParaVencer: number;
}
export interface LeituraDoItem {
  linha: string | null; pix: string | null;
  /** valor/vencimento que o DOCUMENTO traz, para conferir com a obrigação */
  valorDoDocumento: number | null; vencimentoDoDocumento: string | null; codigoValido: boolean | null;
}

const centavos = (n: number) => Math.round(n * 100);

export function montarItemDeEnvio(b: BaseDoItem, l: LeituraDoItem): ItemDeEnvio {
  const linha = soDigitos(l.linha) || null;
  const avisos: string[] = [];
  if (linha && l.codigoValido === false) avisos.push("o código de barras não confere — confira o boleto antes de enviar");
  if (l.valorDoDocumento != null && centavos(l.valorDoDocumento) !== centavos(b.valor)) avisos.push(`o documento traz ${brl(l.valorDoDocumento)}, a obrigação ${brl(b.valor)}`);
  if (l.vencimentoDoDocumento && l.vencimentoDoDocumento !== b.vencimento) avisos.push(`o boleto vence em ${dataBr(l.vencimentoDoDocumento)}, a obrigação em ${dataBr(b.vencimento)}`);
  const sigiloso = ehSigiloso(b);
  const grupo: GrupoDoEnvio = sigiloso ? "sigiloso" : linha ? "padrao" : l.pix ? "pix" : "sem_dado";
  // o que decide o dinheiro (valor e código) trava o "marcado por padrão"; a data diferente só informa
  const bloqueia = avisos.some(a => !a.startsWith("o boleto vence"));
  return {
    id: b.id, fornecedor: b.fornecedor, descricao: b.descricao, categoria: b.categoria, centro: b.centro, valor: b.valor,
    vencimento: l.vencimentoDoDocumento ?? b.vencimento, atrasado: b.diasParaVencer < 0, linha, pix: l.pix, grupo, avisos,
    marcadoPorPadrao: grupo === "padrao" && !bloqueia && b.diasParaVencer <= 0,
  };
}

// ── texto ───────────────────────────────────────────────────────────────────

/** "R$ 1.473,10" com espaço comum (o do Intl é inseparável e vira lixo em alguns e-mails). */
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/[  ]/g, " ");
const dataBr = (ymd: string) => ymd.slice(0, 10).split("-").reverse().join("/");
const dataComPontos = (ymd: string) => ymd.slice(0, 10).split("-").reverse().join(".");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const MESES = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

/** "13.OUT" — o nome da pasta do Drive e da pasta dentro do ZIP. */
export const nomeDaPasta = (ymd: string): string => `${ymd.slice(8, 10)}.${MESES[Number(ymd.slice(5, 7)) - 1]}`;

export const assuntoDoEmail = (hojeYmd: string): string => `Arquivos de pagamento | Vencimento ${dataComPontos(hojeYmd)}`;

export const SAUDACAO_PADRAO = "Olá irmãos, {periodo}!\nGraça e paz!";
export const INTRODUCAO_PADRAO = "Estamos enviando abaixo, os arquivos de pagamento com vencimento na data de hoje, listados abaixo com **linha digitável disponível** e os documentos disponíveis na pasta anexa do drive.";

/** "bom dia" / "boa tarde" / "boa noite" pela hora de quem envia. */
export const periodoDoDia = (hora: number): string => (hora < 12 ? "bom dia" : hora < 18 ? "boa tarde" : "boa noite");

export interface OpcoesDoEnvio {
  hojeYmd: string;
  hora: number;
  saudacao: string;
  introducao: string;
  /** o texto que o item mostra na linha do beneficiário (padrão: o favorecido em maiúsculas); chave = id do item */
  linhasDeDescricao?: Record<string, string>;
  incluirResumo: boolean;
  /** cita, no fim, o que está só na pasta (sem linha digitável) */
  citarSemLinha: boolean;
  /** itens "sem dado automático" selecionados para serem citados */
  semDado?: ItemDeEnvio[];
}

export interface EnvioMontado { assunto: string; html: string; whatsapp: string; texto: string; total: number; quantidade: number }

const cabecalho = (i: ItemDeEnvio): string => {
  const partes = i.linha
    ? [tipoDaLinha(i.linha), bancoDaLinha(i.linha), brl(i.valor), `vence ${dataBr(i.vencimento)}`]
    : ["Pix", brl(i.valor), `vence ${dataBr(i.vencimento)}`];
  return partes.filter(Boolean).join(" · ");
};
const beneficiario = (i: ItemDeEnvio, o: OpcoesDoEnvio) => (o.linhasDeDescricao?.[i.id]?.trim() || i.fornecedor).toLocaleUpperCase("pt-BR");
const codigoDo = (i: ItemDeEnvio) => (i.linha ? formatarLinha(i.linha) : i.pix ?? "");

/** Os dois blocos de um item: cabeçalho e código. */
function blocoDoItem(i: ItemDeEnvio, o: OpcoesDoEnvio): { cab: string; ben: string; rotuloDoCodigo: string | null; codigo: string } {
  return { cab: cabecalho(i), ben: beneficiario(i, o), rotuloDoCodigo: i.linha ? null : "Pix copia e cola:", codigo: codigoDo(i) };
}

/** Negrito `**…**` do texto-modelo → <b> (e-mail) / *…* (WhatsApp) / sem marca (texto). */
const negrito = (s: string, como: "html" | "wa" | "txt") =>
  s.split(/\*\*(.+?)\*\*/g).map((p, n) => (n % 2 === 1 ? (como === "html" ? `<b>${esc(p)}</b>` : como === "wa" ? `*${p}*` : p) : como === "html" ? esc(p) : p)).join("");

export function montarEnvio(itens: ItemDeEnvio[], o: OpcoesDoEnvio): EnvioMontado {
  const assunto = assuntoDoEmail(o.hojeYmd);
  const saudacao = o.saudacao.replace("{periodo}", periodoDoDia(o.hora));
  const total = itens.reduce((t, i) => t + i.valor, 0);
  const blocos = itens.map(i => ({ i, ...blocoDoItem(i, o) }));
  const semDado = o.citarSemLinha ? (o.semDado ?? []) : [];

  // ── e-mail (HTML: o que o Gmail aceita colado — negrito, emoji, fonte monoespaçada, tabela) ──
  const mono = `font-family:Consolas,'Courier New',monospace;font-size:12px`;
  let html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222">`;
  html += `<p>${esc(saudacao).replace(/\n/g, "<br>")}</p>`;
  html += `<p>${negrito(o.introducao, "html").replace(/\n/g, "<br>")}</p>`;
  for (const b of blocos) {
    html += `<p style="margin:14px 0 0"><b>➡️ ${esc(b.cab)}</b><br>${esc(b.ben)}`;
    if (b.rotuloDoCodigo) html += `<br>${esc(b.rotuloDoCodigo)}`;
    html += `<br><span style="${mono}">${esc(b.codigo)}</span></p>`;
  }
  if (o.incluirResumo && itens.length > 0) {
    html += `<table style="border-collapse:collapse;margin-top:16px;font-size:13px"><tr><td colspan="3" style="padding:4px 8px;color:#8a6d3b;font-weight:bold">VENCEM · ${itens.length} · ${esc(brl(total))}</td></tr>`;
    for (const i of itens) {
      html += `<tr><td style="padding:3px 8px;border-top:1px solid #ddd">${esc(i.fornecedor)}</td><td style="padding:3px 8px;border-top:1px solid #ddd;color:#666">${esc([i.categoria, i.centro].filter(Boolean).join(" · "))}</td><td style="padding:3px 8px;border-top:1px solid #ddd;text-align:right"><b>${esc(brl(i.valor))}</b></td></tr>`;
    }
    html += `</table>`;
  }
  if (semDado.length > 0) html += `<p style="margin-top:14px">Na pasta do drive, sem linha digitável: ${esc(semDado.map(i => `${i.fornecedor} (${brl(i.valor)})`).join("; "))}.</p>`;
  html += `<p style="margin-top:16px;font-size:12px;color:#555">${esc(AVISO_DE_CONFERENCIA)}</p>`;
  html += assinaturaEmHtml("mensagem");
  html += `</div>`;

  // ── WhatsApp (*negrito* e ```fonte monoespaçada```, que o aplicativo copia com um toque) ──
  const wa: string[] = [`*${assunto}*`, "", saudacao, "", negrito(o.introducao, "wa")];
  for (const b of blocos) wa.push("", `➡️ *${b.cab}*`, b.ben, ...(b.rotuloDoCodigo ? [b.rotuloDoCodigo] : []), "```" + b.codigo + "```");
  if (itens.length > 0) wa.push("", `*Total: ${itens.length} · ${brl(total)}*`);
  if (semDado.length > 0) wa.push("", `Na pasta do drive, sem linha digitável: ${semDado.map(i => `${i.fornecedor} (${brl(i.valor)})`).join("; ")}.`);

  // ── texto simples (sem marcas) ──
  const txt: string[] = [saudacao, "", negrito(o.introducao, "txt")];
  for (const b of blocos) txt.push("", `➡️ ${b.cab}`, b.ben, ...(b.rotuloDoCodigo ? [b.rotuloDoCodigo] : []), b.codigo);
  if (itens.length > 0) txt.push("", `Total: ${itens.length} · ${brl(total)}`);
  if (semDado.length > 0) txt.push("", `Na pasta do drive, sem linha digitável: ${semDado.map(i => `${i.fornecedor} (${brl(i.valor)})`).join("; ")}.`);

  wa.push("", AVISO_DE_CONFERENCIA, "", assinaturaEmWhatsapp("mensagem"));
  txt.push("", AVISO_DE_CONFERENCIA, "", assinaturaEmTexto("mensagem"));

  return { assunto, html, whatsapp: wa.join("\n"), texto: txt.join("\n"), total, quantidade: itens.length };
}

/** `mailto:` com destinatários e assunto (o corpo vai pela área de transferência: o `mailto` não leva texto formatado e corta textos longos). */
export function linkDoEmail(para: string[], assunto: string): string {
  return `mailto:${para.join(",")}?subject=${encodeURIComponent(assunto)}`;
}

/** Nome de arquivo seguro, para o ZIP dos boletos. */
export function nomeDeArquivoSeguro(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}
