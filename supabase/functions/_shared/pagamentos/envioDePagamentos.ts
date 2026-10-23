// ─── envioDePagamentos — o "Arquivos de pagamento" que a Tesouraria manda aos tesoureiros, montado pelo sistema ──────────────────────────────────────────
// Pedido dela (20/10/2026): hoje ela copia, uma a uma, a linha digitável / Pix de cada obrigação e cola num e-mail (ou WhatsApp) para os tesoureiros, que AINDA não usam o sistema. O formato
// é o do e-mail que ela já manda (assunto "Arquivos de pagamento | Vencimento 13.10.2026"; cada item: "➡️Boleto bancário · Bradesco · R$ 300,00 · vence 13/10/2026", o beneficiário e a linha
// digitável em fonte monoespaçada; os documentos vão numa pasta do Drive). Este módulo é PURO: recebe os itens já lidos e devolve o texto (e-mail formatado, WhatsApp e texto simples).
//
// Regras que ela aprovou: só entra no corpo o que tem linha digitável; Pix é um bloco opcional; prebenda, folha e Sustento são sigilosos e ficam FORA por padrão; o que não tem meio de
// pagamento aparece como "sem dado automático" (nunca some em silêncio) e pode ser citado numa linha final ("na pasta, sem linha digitável").

import { assinaturaEmHtml, assinaturaEmTexto, assinaturaEmWhatsapp } from "./assinaturaDoSistema.ts";

/** A camada de controle do e-mail: quem paga confere antes. */
export const AVISO_DE_CONFERENCIA = "Confira sempre os valores e vencimentos antes de efetuar os pagamentos.";

export type GrupoDoEnvio = "padrao" | "pix" | "sigiloso" | "sem_dado";

/** DE ONDE veio o meio de pagamento — o tesoureiro precisa saber o que veio do documento, o que veio do cadastro e o que exige conferência. */
export type OrigemDoMeio = "linha_documento" | "linha_informada" | "pix_documento" | "pix_cadastro";

export const ROTULO_DA_ORIGEM: Record<OrigemDoMeio, string> = {
  linha_documento: "Linha digitável do documento",
  linha_informada: "Linha digitável informada no lançamento",
  pix_documento: "PIX do documento",
  pix_cadastro: "PIX do cadastro do favorecido",
};
export const ICONE_DA_ORIGEM: Record<OrigemDoMeio, string> = { linha_documento: "🧾", linha_informada: "📝", pix_documento: "💳", pix_cadastro: "👤" };
export const ROTULO_SEM_MEIO = "Sem meio automático";
export const ICONE_SEM_MEIO = "❓";
export const ROTULO_CONFIRMAR_FAVORECIDO = "Confirmar favorecido";
export const ICONE_CONFIRMAR_FAVORECIDO = "⚠";

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
  /** de onde veio o meio (null = sem meio automático) */
  origem: OrigemDoMeio | null;
  /** nome do favorecido do cadastro cujo Pix foi achado PELO NOME da obrigação: a pessoa confirma que é ele (nunca vem marcado, nunca vai sozinho) */
  favorecidoParaConfirmar: string | null;
  /** quantos documentos da obrigação acompanham o envio (ZIP) */
  documentos: number;
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
  /** de onde veio o `pix`: o próprio documento, o cadastro do favorecido ligado à obrigação, ou o cadastro de um favorecido achado só pelo nome */
  origemDoPix?: "documento" | "cadastro" | "cadastro_por_nome" | null;
  /** nome do favorecido do cadastro (para o "Confirmar favorecido") */
  favorecidoDoPix?: string | null;
  /** a `linha` foi digitada/colada no próprio lançamento (23/10/2026), e não lida de um anexo */
  linhaInformada?: boolean;
  /** documentos anexados à obrigação que vão no ZIP */
  documentos?: number;
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
  // Origem do meio (ordem de prioridade: linha digitável > Pix do documento > Pix do cadastro do favorecido). Pix de favorecido achado pelo nome exige confirmação.
  const porNome = !linha && !!l.pix && l.origemDoPix === "cadastro_por_nome";
  const origem: OrigemDoMeio | null = linha ? (l.linhaInformada ? "linha_informada" : "linha_documento") : l.pix ? (l.origemDoPix === "documento" ? "pix_documento" : "pix_cadastro") : null;
  const favorecidoParaConfirmar = porNome ? (l.favorecidoDoPix ?? "favorecido do cadastro") : null;
  // o que decide o dinheiro (valor e código) trava o "marcado por padrão"; a data diferente só informa. Sigiloso e "confirmar favorecido" NUNCA vêm marcados.
  const bloqueia = avisos.some(a => !a.startsWith("o boleto vence"));
  return {
    id: b.id, fornecedor: b.fornecedor, descricao: b.descricao, categoria: b.categoria, centro: b.centro, valor: b.valor,
    vencimento: l.vencimentoDoDocumento ?? b.vencimento, atrasado: b.diasParaVencer < 0, linha, pix: l.pix, origem, favorecidoParaConfirmar,
    documentos: l.documentos ?? 0, grupo, avisos,
    marcadoPorPadrao: (grupo === "padrao" || grupo === "pix") && !favorecidoParaConfirmar && !bloqueia && b.diasParaVencer <= 0,
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

/** A linha que diz DE ONDE veio o código — o tesoureiro vê na hora o que veio do documento e o que veio do cadastro. */
export function rotuloDoCodigo(i: ItemDeEnvio): string {
  if (!i.origem) return "";
  const icone = ICONE_DA_ORIGEM[i.origem];
  if (i.origem === "linha_documento" || i.origem === "linha_informada") return `${icone} ${ROTULO_DA_ORIGEM[i.origem]}:`;
  if (i.origem === "pix_documento") return `${icone} ${ROTULO_DA_ORIGEM.pix_documento} — copia e cola:`;
  return `${icone} ${ROTULO_DA_ORIGEM.pix_cadastro} — copia e cola (confira o titular no aplicativo do banco):`;
}

/** Os blocos de um item: cabeçalho, beneficiário, de onde veio o código e o código. */
function blocoDoItem(i: ItemDeEnvio, o: OpcoesDoEnvio): { cab: string; ben: string; rotuloDoCodigo: string; codigo: string } {
  return { cab: cabecalho(i), ben: beneficiario(i, o), rotuloDoCodigo: rotuloDoCodigo(i), codigo: codigoDo(i) };
}

/** A frase do que está só na pasta (sem meio automático). */
const fraseSemMeio = (semDado: ItemDeEnvio[]) => `${ICONE_SEM_MEIO} ${ROTULO_SEM_MEIO} de pagamento — documentos na pasta do drive: ${semDado.map(i => `${i.fornecedor} (${brl(i.valor)})`).join("; ")}.`;

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
    if (b.rotuloDoCodigo) html += `<br><span style="font-size:11px;color:#777">${esc(b.rotuloDoCodigo)}</span>`;
    html += `<br><span style="${mono}">${esc(b.codigo)}</span></p>`;
  }
  if (o.incluirResumo && itens.length > 0) {
    html += `<table style="border-collapse:collapse;margin-top:16px;font-size:13px"><tr><td colspan="3" style="padding:4px 8px;color:#8a6d3b;font-weight:bold">VENCEM · ${itens.length} · ${esc(brl(total))}</td></tr>`;
    for (const i of itens) {
      html += `<tr><td style="padding:3px 8px;border-top:1px solid #ddd">${esc(i.fornecedor)}</td><td style="padding:3px 8px;border-top:1px solid #ddd;color:#666">${esc([i.categoria, i.centro].filter(Boolean).join(" · "))}</td><td style="padding:3px 8px;border-top:1px solid #ddd;text-align:right"><b>${esc(brl(i.valor))}</b></td></tr>`;
    }
    html += `</table>`;
  }
  if (semDado.length > 0) html += `<p style="margin-top:14px">${esc(fraseSemMeio(semDado))}</p>`;
  html += `<p style="margin-top:16px;font-size:12px;color:#555">${esc(AVISO_DE_CONFERENCIA)}</p>`;
  html += assinaturaEmHtml("mensagem");
  html += `</div>`;

  // ── WhatsApp (*negrito* e ```fonte monoespaçada```, que o aplicativo copia com um toque) ──
  const wa: string[] = [`*${assunto}*`, "", saudacao, "", negrito(o.introducao, "wa")];
  for (const b of blocos) wa.push("", `➡️ *${b.cab}*`, b.ben, ...(b.rotuloDoCodigo ? [b.rotuloDoCodigo] : []), "```" + b.codigo + "```");
  if (itens.length > 0) wa.push("", `*Total: ${itens.length} · ${brl(total)}*`);
  if (semDado.length > 0) wa.push("", fraseSemMeio(semDado));

  // ── texto simples (sem marcas) ──
  const txt: string[] = [saudacao, "", negrito(o.introducao, "txt")];
  for (const b of blocos) txt.push("", `➡️ ${b.cab}`, b.ben, ...(b.rotuloDoCodigo ? [b.rotuloDoCodigo] : []), b.codigo);
  if (itens.length > 0) txt.push("", `Total: ${itens.length} · ${brl(total)}`);
  if (semDado.length > 0) txt.push("", fraseSemMeio(semDado));

  wa.push("", AVISO_DE_CONFERENCIA, "", assinaturaEmWhatsapp("mensagem"));
  txt.push("", AVISO_DE_CONFERENCIA, "", assinaturaEmTexto("mensagem"));

  return { assunto, html, whatsapp: wa.join("\n"), texto: txt.join("\n"), total, quantidade: itens.length };
}

/** `mailto:` com destinatários e assunto (o corpo vai pela área de transferência: o `mailto` não leva texto formatado e corta textos longos). */
export function linkDoEmail(para: string[], assunto: string): string {
  return `mailto:${para.join(",")}?subject=${encodeURIComponent(assunto)}`;
}

/** Nome de arquivo seguro, para o ZIP. */
export function nomeDeArquivoSeguro(s: string, max = 80): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max).trim();
}

/** O que o painel mostra no topo: o lote em números. */
export interface ContadoresDoEnvio { pagamentos: number; boletos: number; pix: number; semMeio: number; documentos: number; aConfirmar: number }
export function contadoresDoEnvio(escolhidos: ItemDeEnvio[], todos: ItemDeEnvio[]): ContadoresDoEnvio {
  return {
    pagamentos: escolhidos.length,
    boletos: escolhidos.filter(i => !!i.linha).length,
    pix: escolhidos.filter(i => !i.linha && !!i.pix).length,
    semMeio: todos.filter(i => i.grupo === "sem_dado").length,
    documentos: escolhidos.reduce((t, i) => t + i.documentos, 0),
    aConfirmar: todos.filter(i => !!i.favorecidoParaConfirmar).length,
  };
}

// ── o ZIP documental (dossiê do pagamento) ──────────────────────────────────

/** Documentos que NÃO acompanham o envio: prova de pagamento/quitação por terceiros e arquivos de máquina. Tudo o mais é documento da obrigação (boleto, guia, fatura, nota fiscal, contrato…). */
export const TIPOS_FORA_DO_ZIP: ReadonlySet<string> = new Set(["comprovante", "xml", "declaracao_terceiro", "pedido_reembolso", "prova_pagamento_terceiro", "prova_cancelamento"]);
export const entraNoZip = (tipo: string): boolean => !TIPOS_FORA_DO_ZIP.has(tipo);

const ROTULO_DO_ARQUIVO: Record<string, string> = {
  boleto: "boleto", guia: "guia", fatura: "fatura", nota_fiscal: "nota fiscal", contrato: "contrato", rpa: "RPA", rsp: "RSP", dps: "DPS", outro: "documento", documento: "documento",
};

/** "03 Bradesco - Junta de Missões - 300,00 - boleto.pdf": o número liga os arquivos da mesma obrigação à ordem da mensagem. `seq` > 1 quando há mais de um documento do mesmo tipo. */
export function nomeDoDocumentoNoZip(ordem: number, i: ItemDeEnvio, tipo: string, seq: number, extensao: string): string {
  const base = nomeDeArquivoSeguro(`${String(ordem).padStart(2, "0")} ${[bancoDaLinha(i.linha), i.fornecedor, i.valor.toFixed(2).replace(".", ",")].filter(Boolean).join(" - ")}`, 70);
  return `${base} - ${ROTULO_DO_ARQUIVO[tipo] ?? "documento"}${seq > 1 ? ` (${seq})` : ""}.${extensao}`;
}

/** "20.OUT.2026.zip" */
export const nomeDoZip = (ymd: string): string => `${nomeDaPasta(ymd)}.${ymd.slice(0, 4)}.zip`;
