// ─── Design System de E-mails do DiakoniaApp (puro: só devolve texto HTML — sem rede, sem Deno) ───────────────────────────────────────────────────────────────────────────────────
//
// Pedido dela (23/10/2026): "Ao receber qualquer e-mail enviado pelo sistema, o usuário deve identificar imediatamente que foi gerado pelo DiakoniaApp." O e-mail de boas-vindas ao visitante virou o
// padrão de referência (cartão branco centralizado sobre fundo creme, nome da igreja em caixa-alta no topo, blocos em cartões creme com título marrom); o resumo diário, o semanal e os alertas
// pareciam "relatórios exportados" e cada um tinha o seu HTML. Aqui mora UMA definição: cabeçalho, largura, tipografia, paleta, cartões e rodapé. Quem monta um e-mail só escolhe os cartões.
//
// REGRAS DE QUEM USA (valem para todo e-mail novo — agenda, aprovações, prestação de contas, eventos…):
//   1. O documento SEMPRE sai de `moldura()`: é ela que põe cabeçalho, largura e rodapé. Nenhum e-mail escreve `<html>` ou o rodapé por conta própria.
//   2. Texto que vem do cadastro (nome, descrição, fornecedor) entra por estas funções, que escapam. Nunca interpolar texto de cadastro direto no HTML.
//   3. Cor só pelos tokens de `COR`. O tom (`atencao` / `aviso` / `ok` / `info`) é semântico — vermelho = precisa de ação, âmbar = conferir, verde = em dia, azul = informação.
//   4. Largura fixa de 600px no máximo, fluida no celular: tabelas de largura 100% (nada de colunas que estourem a tela de 360px) e cartões que empilham.
//   5. Cada e-mail tem também a versão em texto; ela não passa por aqui.
//
// A "prova" de que todos seguem o padrão é `src/lib/emailDesignSystem.test.ts`: o mesmo cabeçalho/rodapé em todos, tudo escapado, nada de cor fora da paleta.

/** A paleta: a do e-mail de boas-vindas + quatro tons semânticos (cada um com texto, fundo suave e traço). */
export const COR = {
  fundo: "#f6f3ec",      // o chão do e-mail e o fundo dos cartões
  cartao: "#ffffff",     // a folha central
  titulo: "#6b4b10",     // marrom dos títulos
  texto: "#2b2b2b",
  suave: "#6f6a5f",      // texto secundário
  link: "#8a5a12",
  linha: "#e7e1d3",      // divisórias
  atencao: { texto: "#8a2f15", fundo: "#f6dcd3", traco: "#b4472b" },
  aviso: { texto: "#6b4b10", fundo: "#f3e6c8", traco: "#a5741f" },
  ok: { texto: "#2f5a22", fundo: "#e3eedb", traco: "#4f7a3f" },
  info: { texto: "#24506f", fundo: "#e1ecf4", traco: "#2f5f8a" },
} as const;
export type Tom = "atencao" | "aviso" | "ok" | "info";

const FONTE = "Arial,Helvetica,sans-serif";
const MONO = "Consolas,'Courier New',monospace";
export const LARGURA = 600;

/** O texto do rodapé: igual em TODOS os e-mails (pedido dela, 23/10/2026). */
export const RODAPE = {
  nome: "DiakoniaApp",
  slogan: "Conectando pessoas, organizando o propósito.",
  descricao: "Sistema desenvolvido para apoiar a gestão administrativa, financeira e ministerial das igrejas.",
  direitos: "© 2026 DiakoniaApp",
  /** a autoria que ela pediu em 20/10/2026 para os documentos gerados pelo sistema; discreta, igual em todos */
  autoria: "Desenvolvimento e parametrização: Telma Souza · CNPJ 34.926.658/0001-40",
} as const;

export const esc = (s: unknown): string => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** Só http(s) vira link; qualquer outra coisa (javascript:, data:) vira `null`. */
export const urlSegura = (u: string | null | undefined): string | null => (u && /^https?:\/\/[^\s<>"']+$/i.test(u.trim()) ? u.trim() : null);
const txt = (s: string) => esc(s).replace(/\n/g, "<br>");

// ── a moldura: cabeçalho + largura + rodapé ────────────────────────────────────────────────────────────────────────────────────────────

export interface OpcoesDaMoldura {
  /** vai no <title> e é o que o leitor de tela anuncia */
  assunto: string;
  /** nome da igreja (da Identidade); sem ele o cabeçalho traz só a marca */
  igreja?: string | null;
  /** faixa no topo da folha (prévia e teste) */
  aviso?: string;
  /** o texto que aparece ao lado do assunto na lista de e-mails */
  preheader?: string;
  /** o miolo, já montado com os cartões abaixo */
  corpo: string;
}

export function moldura(o: OpcoesDaMoldura): string {
  const pre = o.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(o.preheader)}</div>` : "";
  const faixa = o.aviso ? `<div style="margin:0 0 18px;padding:10px 12px;border-radius:8px;background:${COR.aviso.fundo};color:${COR.aviso.texto};font-size:12px;font-weight:bold">${esc(o.aviso)}</div>` : "";
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(o.assunto)}</title></head>`
    + `<body style="margin:0;padding:0;background:${COR.fundo}">${pre}`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COR.fundo}"><tr><td align="center" style="padding:24px 12px;font-family:${FONTE}">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:${LARGURA}px"><tr><td style="background:${COR.cartao};border-radius:12px;padding:28px 26px;color:${COR.texto};font-size:15px;line-height:1.55;font-family:${FONTE}">`
    + faixa + cabecalho(o.igreja) + o.corpo + rodape()
    + `</td></tr></table></td></tr></table></body></html>`;
}

/** Marca do sistema + nome da igreja, igual em todo e-mail. */
function cabecalho(igreja?: string | null): string {
  return `<p style="margin:0 0 4px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${COR.suave};font-weight:bold">DiakoniaApp</p>`
    + (igreja && igreja.trim() ? `<p style="margin:0 0 20px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:${COR.titulo};font-weight:bold">${esc(igreja.trim())}</p>` : `<div style="height:16px"></div>`);
}

/** O rodapé institucional: os mesmos quatro textos, na mesma ordem, em todo e-mail. */
export function rodape(): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;border-top:1px solid ${COR.linha}"><tr><td style="padding-top:16px;font-size:12px;line-height:1.55;color:${COR.suave};font-family:${FONTE}">`
    + `<p style="margin:0;font-weight:bold;color:${COR.titulo}">${esc(RODAPE.nome)}</p>`
    + `<p style="margin:0">${esc(RODAPE.slogan)}</p>`
    + `<p style="margin:8px 0 0">${esc(RODAPE.descricao)}</p>`
    + `<p style="margin:8px 0 0">${esc(RODAPE.direitos)}</p>`
    + `<p style="margin:6px 0 0;font-size:11px;color:#8b8577">${esc(RODAPE.autoria)}</p>`
    + `</td></tr></table>`;
}

// ── texto corrido ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export const saudacao = (texto: string): string => `<p style="margin:0 0 12px;font-size:17px;font-weight:bold;color:${COR.titulo}">${txt(texto)}</p>`;
export const paragrafo = (texto: string): string => `<p style="margin:0 0 14px">${txt(texto)}</p>`;
export const blocoDeObservacao = (texto: string): string => `<p style="margin:14px 0 0;font-size:12px;line-height:1.5;color:${COR.suave}">${txt(texto)}</p>`;

/** Título de uma parte do e-mail ("Para pagar", "Saldo das contas"); `subtitulo` é a regra em uma frase. */
export function secao(titulo: string, subtitulo?: string, tom: Tom | null = null): string {
  const cor = tom ? COR[tom].traco : COR.titulo;
  // o mesmo ponto colorido dos blocos do resumo semanal: a cor diz o tom da seção antes de a pessoa ler o título
  return `<p style="margin:26px 0 ${subtitulo ? "2" : "10"}px;font-size:15px;font-weight:bold;color:${cor}"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${COR[tom ?? "aviso"].traco};margin-right:7px"></span>${esc(titulo)}</p>`
    + (subtitulo ? `<p style="margin:0 0 10px;font-size:12px;line-height:1.5;color:${COR.suave}">${txt(subtitulo)}</p>` : "");
}

export function botao(url: string, rotulo: string): string {
  const u = urlSegura(url);
  if (!u) return "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 0"><tr><td style="border-radius:8px;background:${COR.titulo}"><a href="${esc(u)}" style="display:inline-block;padding:11px 20px;color:#ffffff;font-weight:bold;font-size:14px;text-decoration:none;font-family:${FONTE}">${esc(rotulo)}</a></td></tr></table>`;
}

// ── cartões ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** O cartão básico: fundo creme, cantos arredondados, título marrom e um miolo livre (já escapado por quem o montou). */
export function cartao(titulo: string | null, corpoHtml: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px"><tr><td style="background:${COR.fundo};border-radius:10px;padding:13px 15px;font-family:${FONTE};font-size:14px;line-height:1.5">`
    + (titulo ? `<p style="margin:0 0 6px;font-weight:bold;color:${COR.titulo}">${esc(titulo)}</p>` : "") + corpoHtml
    + `</td></tr></table>`;
}

/** Faixa de aviso com tom semântico: "Atenção", "Extrato desatualizado"… */
export function cartaoDeAlerta(o: { titulo: string; linhas: string[]; tom?: Tom }): string {
  const c = COR[o.tom ?? "aviso"];
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px"><tr><td style="background:${c.fundo};border-radius:10px;padding:13px 15px;color:${c.texto};font-family:${FONTE};font-size:13px;line-height:1.5">`
    + `<p style="margin:0 0 4px;font-weight:bold;font-size:14px">⚠️ ${esc(o.titulo)}</p>${o.linhas.map(l => `<p style="margin:0 0 3px">${txt(l)}</p>`).join("")}`
    + `</td></tr></table>`;
}

/** Os números do dia em cartões lado a lado (duas colunas, também no celular). Valor grande, rótulo pequeno. */
export function indicadores(itens: { icone: string; rotulo: string; valor: string; tom?: Tom }[]): string {
  const celula = (i: { icone: string; rotulo: string; valor: string; tom?: Tom }, direita: boolean) => {
    const c = i.tom ? COR[i.tom] : null;
    return `<td width="50%" valign="top" style="padding:0 ${direita ? "0 12px 6px" : "6px 12px 0"}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:${c ? c.fundo : COR.fundo};border-radius:10px;padding:12px 13px;font-family:${FONTE}">`
      + `<p style="margin:0;font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:${c ? c.texto : COR.suave};font-weight:bold">${esc(i.icone)} ${esc(i.rotulo)}</p>`
      + `<p style="margin:3px 0 0;font-size:19px;font-weight:bold;color:${c ? c.texto : COR.texto}">${esc(i.valor)}</p></td></tr></table></td>`;
  };
  const linhas: string[] = [];
  for (let k = 0; k < itens.length; k += 2) linhas.push(`<tr>${celula(itens[k], false)}${itens[k + 1] ? celula(itens[k + 1], true) : `<td width="50%"></td>`}</tr>`);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 8px">${linhas.join("")}</table>`;
}

export interface LinhaDeFato { icone?: string; rotulo: string; valor: string }
export interface OpcoesDoCartaoDeItem {
  /** o que é o item: "Boleto bancário · Banco do Brasil", "Reembolso" */
  etiqueta?: string;
  /** o nome em destaque: favorecido, pessoa, documento */
  titulo: string;
  /** a linha de apoio abaixo do título (descrição) */
  subtitulo?: string;
  valor?: string;
  /** a situação em uma pílula colorida: "Atrasado há 15 dias", "Vence hoje" */
  status?: { texto: string; tom: Tom };
  fatos?: LinhaDeFato[];
  /** texto longo e técnico (linha digitável, Pix copia e cola) em fonte monoespaçada, com a origem dele */
  codigo?: { rotulo: string; texto: string };
  /** frases de apoio, em cinza ("o documento está em 12/10") */
  notas?: string[];
  /** um aviso que merece cor (já enviado antes, sem chave Pix…) */
  alerta?: { texto: string; tom: Tom };
}

/** Um item que alguém precisa tratar (pagamento, obrigação, reembolso, documento): um cartão por item, legível no celular. */
function cartaoDeItem(o: OpcoesDoCartaoDeItem): string {
  const pilula = o.status ? `<span style="display:inline-block;padding:2px 9px;border-radius:99px;background:${COR[o.status.tom].fundo};color:${COR[o.status.tom].texto};font-size:11px;font-weight:bold">${esc(o.status.texto)}</span>` : "";
  const topo = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>`
    + `<td valign="top" style="font-family:${FONTE}">${o.etiqueta ? `<p style="margin:0 0 2px;font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:${COR.suave};font-weight:bold">${esc(o.etiqueta)}</p>` : ""}`
    + `<p style="margin:0;font-size:15px;font-weight:bold;color:${COR.texto}">${esc(o.titulo)}</p>${o.subtitulo ? `<p style="margin:2px 0 0;font-size:12px;color:${COR.suave}">${esc(o.subtitulo)}</p>` : ""}</td>`
    + (o.valor ? `<td valign="top" align="right" style="padding-left:10px;white-space:nowrap;font-family:${FONTE}"><p style="margin:0;font-size:17px;font-weight:bold;color:${COR.titulo}">${esc(o.valor)}</p></td>` : "")
    + `</tr></table>`;
  const fatos = (o.fatos ?? []).map(f => `<tr><td style="padding:2px 8px 2px 0;font-size:12px;color:${COR.suave};white-space:nowrap;vertical-align:top">${f.icone ? esc(f.icone) + " " : ""}${esc(f.rotulo)}</td><td style="padding:2px 0;font-size:13px;color:${COR.texto};font-weight:bold">${esc(f.valor)}</td></tr>`).join("");
  const codigo = o.codigo
    ? `<p style="margin:10px 0 3px;font-size:11px;color:${COR.suave}">${esc(o.codigo.rotulo)}</p><p style="margin:0;padding:8px 10px;background:${COR.cartao};border:1px solid ${COR.linha};border-radius:6px;font-family:${MONO};font-size:12px;line-height:1.45;word-break:break-all;color:${COR.texto}">${esc(o.codigo.texto)}</p>` : "";
  const alerta = o.alerta ? `<p style="margin:10px 0 0;padding:7px 10px;border-radius:6px;background:${COR[o.alerta.tom].fundo};color:${COR[o.alerta.tom].texto};font-size:12px;font-weight:bold">${esc(o.alerta.texto)}</p>` : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px"><tr><td style="background:${COR.fundo};border-radius:10px;padding:14px 15px;font-family:${FONTE}">`
    + topo + (pilula ? `<p style="margin:8px 0 0">${pilula}</p>` : "")
    + (fatos ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:8px">${fatos}</table>` : "")
    + codigo + alerta + (o.notas ?? []).map(n => `<p style="margin:7px 0 0;font-size:11px;line-height:1.45;color:${COR.suave}">ℹ ${esc(n)}</p>`).join("")
    + `</td></tr></table>`;
}
/** Os três nomes que o enunciado pede: o mesmo cartão, com o rótulo de uso. */
export const cartaoDePagamento = cartaoDeItem;
export const cartaoDeObrigacao = cartaoDeItem;
export const cartaoDeDocumento = cartaoDeItem;

/** Saldo de uma conta com até quando o extrato do banco o sustenta. */
export function cartaoDeSaldo(o: { nome: string; saldo: string; situacao?: string; defasado?: boolean }): string {
  return cartaoDeItem({
    titulo: o.nome, valor: o.saldo,
    ...(o.situacao ? { status: { texto: o.situacao, tom: (o.defasado ? "atencao" : "ok") as Tom } } : {}),
  });
}

/** Pedido de aprovação: o que está sendo pedido e o botão para decidir. */
export function blocoDeAprovacao(o: { titulo: string; descricao: string; fatos?: LinhaDeFato[]; url?: string; rotuloDoBotao?: string }): string {
  return cartaoDeItem({ etiqueta: "Aguardando a sua aprovação", titulo: o.titulo, subtitulo: o.descricao, fatos: o.fatos })
    + (o.url ? botao(o.url, o.rotuloDoBotao ?? "Abrir para decidir") : "");
}

/** Uma lista curta dentro de um cartão (blocos do resumo semanal). */
export function cartaoDeLista(o: { titulo: string; frase: string; itens?: string[]; tom: Tom }): string {
  const c = COR[o.tom];
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px"><tr><td style="background:${COR.fundo};border-radius:10px;padding:13px 15px;font-family:${FONTE};font-size:14px;line-height:1.5">`
    + `<p style="margin:0 0 4px;font-weight:bold;color:${COR.titulo}"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${c.traco};margin-right:7px"></span>${esc(o.titulo)}</p>`
    + `<p style="margin:0;color:${COR.texto}">${esc(o.frase)}</p>`
    + ((o.itens ?? []).length > 0 ? `<ul style="margin:8px 0 0;padding-left:18px;font-size:13px;color:${COR.suave};line-height:1.6">${(o.itens ?? []).map(i => `<li>${esc(i)}</li>`).join("")}</ul>` : "")
    + `</td></tr></table>`;
}
