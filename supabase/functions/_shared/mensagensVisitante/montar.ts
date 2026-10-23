// ─── mensagensVisitante/montar — monta a mensagem ao visitante a partir dos BLOCOS configurados (puro: sem rede, sem Deno; o app e as Edge Functions o dividem) ─────────────────────────────
//
// Pedido dela (22/10/2026): a mensagem ao visitante deixa de ser um texto fixo no código e vira uma ferramenta de acolhimento e relacionamento — editável numa área administrativa, com blocos que se
// ligam e desligam (boas-vindas, texto pastoral, próximos eventos, endereço/contato, WhatsApp, redes, pedido de oração, plano de leitura), variações por momento (primeira visita, segunda visita, não
// retornou, interesse em membresia, infantil, jovem, indicado por ministério) e a MESMA estrutura para WhatsApp, e-mail e (futuro) SMS.
//
// DE ONDE VEM CADA DADO (decisão dela, 22/10/2026: Identidade da Igreja é a fonte única): nome da igreja, site, redes, WhatsApp, endereço, telefone e e-mail vêm da IDENTIDADE (`IdentidadeDaIgreja`);
// a configuração das mensagens (`ConfigDaMensagem`) guarda só o que é DELAS: assinatura, links de oração e leitura, título da lista de eventos, prazo de "não retornou", quantos eventos e quais redes ocultar.
//
// Este módulo só transforma configuração em texto. Quem guarda a configuração é o banco (`visitante_mensagens()`); quem envia é a pessoa (link do WhatsApp) ou a Edge Function (e-mail).
// Nada aqui lê rede. Todo texto vindo da configuração é tratado como não confiável: o HTML escapa tudo e só endereços http(s) viram link.

import { cartao, moldura } from "../email/desenho.ts";

export const SITUACOES = ["primeira_visita", "segunda_visita", "nao_retornou", "interesse_membresia", "infantil", "jovem", "indicado_ministerio"] as const;
export type SituacaoDaMensagem = (typeof SITUACOES)[number];
export const CANAIS = ["whatsapp", "email", "sms"] as const;
export type CanalDaMensagem = (typeof CANAIS)[number];
/** As redes que a mensagem sabe mostrar (o WhatsApp tem bloco próprio; "outro" não tem nome para mostrar). `site` vem do campo "Site oficial" da Identidade. */
export const TIPOS_DE_REDE = ["instagram", "facebook", "youtube", "tiktok", "spotify", "telegram", "site"] as const;
export type TipoDeRede = (typeof TIPOS_DE_REDE)[number];

export const ROTULO_DA_SITUACAO: Record<SituacaoDaMensagem, string> = {
  primeira_visita: "Primeira visita", segunda_visita: "Segunda visita (retornou)", nao_retornou: "Não retornou",
  interesse_membresia: "Interesse em membresia", infantil: "Visitante infantil", jovem: "Visitante jovem", indicado_ministerio: "Indicado por ministério",
};
export const QUANDO_USA_A_SITUACAO: Record<SituacaoDaMensagem, string> = {
  primeira_visita: "Automática: visitante de primeira vez, dentro do prazo de retorno.",
  segunda_visita: "Automática: o visitante voltou (duas visitas ou mais).",
  nao_retornou: "Automática: visitou uma vez e não voltou depois do prazo configurado.",
  interesse_membresia: "Escolhida por quem envia (o sistema não sabe sozinho).",
  infantil: "Automática na primeira visita quando a data de nascimento indica criança (menos de 12 anos).",
  jovem: "Automática na primeira visita quando a data de nascimento indica 12 a 29 anos.",
  indicado_ministerio: "Escolhida por quem envia (o sistema não registra o ministério que indicou).",
};
export const ROTULO_DO_CANAL: Record<CanalDaMensagem, string> = { whatsapp: "WhatsApp", email: "E-mail", sms: "SMS (futuro)" };
export const ROTULO_DA_REDE: Record<TipoDeRede, string> = { instagram: "Instagram", facebook: "Facebook", youtube: "YouTube", tiktok: "TikTok", spotify: "Spotify", telegram: "Telegram", site: "Site" };

export interface ModeloDaMensagem {
  situacao: SituacaoDaMensagem;
  canal: CanalDaMensagem;
  ativo: boolean;
  /** só o e-mail usa */
  assunto: string;
  abertura: string;
  texto_pastoral: string;
  convite_retorno: string;
  fechamento: string;
  incluir_eventos: boolean;
  incluir_redes: boolean;
  incluir_endereco: boolean;
  /** telefone e e-mail de contato */
  incluir_contato: boolean;
  incluir_whatsapp: boolean;
  incluir_oracao: boolean;
  incluir_leitura: boolean;
}
/** O que as mensagens guardam de PRÓPRIO (o resto vem da Identidade da Igreja). */
export interface ConfigDaMensagem {
  assinatura: string;
  link_pedido_oracao: string;
  link_plano_leitura: string;
  titulo_eventos: string;
  /** passados quantos dias sem voltar o visitante cai em "não retornou" */
  dias_sem_retorno: number;
  /** quantos próximos eventos entram na mensagem */
  eventos_max: number;
  /** redes que existem na Identidade mas que a mensagem NÃO mostra */
  redes_ocultas: TipoDeRede[];
}
/** O que a Identidade da Igreja dá às mensagens. `redes` é o que está cadastrado lá, do jeito que foi digitado ("@usuario" ou endereço). */
export interface IdentidadeDaIgreja {
  nome: string;
  site: string;
  redes: { plataforma: string; url: string }[];
  endereco: string;
  telefone: string;
  email: string;
  /** texto institucional curto (marca {{resumo}}) e missão (marca {{missao}}) */
  resumo?: string;
  missao?: string;
}
export interface EventoDaMensagem { titulo: string; quando?: string | null; local?: string | null; link?: string | null }
export interface VisitanteDaMensagem { nome: string; culto?: string | null }
export interface ContextoDaMensagem { config: ConfigDaMensagem; igreja: IdentidadeDaIgreja; eventos: readonly EventoDaMensagem[]; visitante: VisitanteDaMensagem }

export interface MensagemMontada {
  assunto: string;
  /** texto simples: o que o WhatsApp (e o SMS) recebe, e a versão de texto do e-mail */
  texto: string;
  /** só no e-mail */
  html: string | null;
  /** quais blocos entraram, na ordem (para a prévia e os testes) */
  blocos: string[];
}

// ── endereços ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Só http(s): nada de `javascript:` vindo da configuração. */
export const urlSegura = (u: string | null | undefined): string | null => {
  const s = (u ?? "").trim();
  return /^https?:\/\/[^\s<>"']+$/i.test(s) ? s : null;
};
/**
 * "21983991229", "(21) 98399-1229", "5521983991229" ou um link wa.me / api.whatsapp.com (do jeito que a Identidade guarda) → "https://wa.me/5521983991229".
 * Número que não é de celular/fixo brasileiro → null. O texto pré-preenchido do link da Identidade (?text=) não é aproveitado.
 */
export function linkDoWhatsApp(valor: string | null | undefined): string | null {
  const v = (valor ?? "").trim();
  if (!v) return null;
  const doLink = /wa\.me\/(\+?\d+)/i.exec(v) ?? /[?&]phone=(\+?\d+)/i.exec(v);
  const d = (doLink ? doLink[1] : v).replace(/\D/g, "");
  if (/^55\d{10,11}$/.test(d)) return `https://wa.me/${d}`;
  if (/^\d{10,11}$/.test(d)) return `https://wa.me/55${d}`;
  return null;
}
const APELIDO: Partial<Record<TipoDeRede, (h: string) => string>> = {
  instagram: h => `https://www.instagram.com/${h}/`, facebook: h => `https://www.facebook.com/${h}/`, youtube: h => `https://www.youtube.com/@${h}`,
  tiktok: h => `https://www.tiktok.com/@${h}`, telegram: h => `https://t.me/${h}`,
};
/** O endereço de uma rede como a Identidade a guarda: endereço completo (com ou sem https://) ou só o "@usuario". Spotify só aceita endereço. Inválido → null. */
export function urlDaRede(tipo: TipoDeRede, valor: string | null | undefined): string | null {
  const v = (valor ?? "").trim();
  if (!v) return null;
  const apelido = v.replace(/^@/, "");
  const soApelido = !/[\s/:.]/.test(apelido) || (v.startsWith("@") && !/[\s/:]/.test(v));
  if (soApelido) { const f = APELIDO[tipo]; return f ? urlSegura(f(apelido)) : null; }
  if (/^[a-z][a-z0-9+.\-]*:(?!\d)/i.test(v) && !/^https?:\/\//i.test(v)) return null;   // outro esquema (javascript:, ftp:…) nunca vira link
  return urlSegura(/^https?:\/\//i.test(v) ? v : `https://${v.replace(/^\/+/, "")}`);
}
export interface RedeResolvida { tipo: TipoDeRede; url: string }
/** As redes da Identidade que a mensagem PODE mostrar, na ordem de `TIPOS_DE_REDE`: com endereço válido e fora das ocultas. O site oficial entra como "site". */
export function redesDaIdentidade(igreja: IdentidadeDaIgreja, ocultas: readonly TipoDeRede[] = []): RedeResolvida[] {
  const out: RedeResolvida[] = [];
  for (const tipo of TIPOS_DE_REDE) {
    if (ocultas.includes(tipo)) continue;
    const bruto = tipo === "site" ? igreja.site : igreja.redes.find(r => r.plataforma === tipo && urlDaRede(tipo, r.url))?.url;
    const url = urlDaRede(tipo, bruto);
    if (url) out.push({ tipo, url });
  }
  return out;
}
/** O WhatsApp da igreja, como a Identidade o guarda (rede "whatsapp": número ou link) → link wa.me. */
export const whatsappDaIdentidade = (igreja: IdentidadeDaIgreja): string | null => {
  for (const r of igreja.redes) if (r.plataforma === "whatsapp") { const l = linkDoWhatsApp(r.url); if (l) return l; }
  return null;
};

// ── texto ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export const primeiroNome = (nome: string): string => (nome ?? "").trim().split(/\s+/)[0] ?? "";

/** {{nome}} {{nome_completo}} {{igreja}} {{culto}} {{resumo}} {{missao}}; marca desconhecida some (nunca aparece "{{x}}" para o visitante). */
export function substituir(texto: string, v: { nome: string; igreja: string; culto?: string | null; resumo?: string | null; missao?: string | null }): string {
  const mapa: Record<string, string> = {
    nome: primeiroNome(v.nome), nome_completo: (v.nome ?? "").trim(), igreja: v.igreja, culto: (v.culto ?? "").trim(), resumo: (v.resumo ?? "").trim(), missao: (v.missao ?? "").trim(),
  };
  return (texto ?? "").replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_m, k: string) => mapa[k.toLowerCase()] ?? "").replace(/[ \t]+\n/g, "\n").replace(/ {2,}/g, " ").trim();
}
/** Marcas que a tela de edição oferece (e que `substituir` entende). */
export const MARCAS_DISPONIVEIS: { marca: string; descricao: string }[] = [
  { marca: "{{nome}}", descricao: "primeiro nome do visitante" }, { marca: "{{nome_completo}}", descricao: "nome completo" },
  { marca: "{{igreja}}", descricao: "nome da igreja (da Identidade)" }, { marca: "{{culto}}", descricao: "culto ou evento da visita" },
  { marca: "{{resumo}}", descricao: "resumo institucional (da Identidade)" }, { marca: "{{missao}}", descricao: "missão da igreja (da Identidade)" },
];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const paragrafos = (s: string) => esc(s).split(/\n{2,}/).map(p => p.replace(/\n/g, "<br>")).join("</p><p style=\"margin:0 0 14px\">");
const linhaDoEvento = (e: EventoDaMensagem) => `${e.titulo}${e.quando ? ` – ${e.quando}` : ""}`;

interface Bloco { id: string; titulo?: string; linhas: string[]; /** link opcional por linha, na mesma ordem */ links?: (string | null)[]; marcadores?: boolean; paragrafo?: boolean }

/** Os blocos que ENTRAM, na ordem fixa: boas-vindas · texto pastoral · convite · eventos · endereço · contato · WhatsApp · redes · oração · leitura · fechamento · assinatura. */
function blocosDaMensagem(m: ModeloDaMensagem, ctx: ContextoDaMensagem): Bloco[] {
  const { config: c, igreja: ig, visitante: v } = ctx;
  const sub = (t: string) => substituir(t, { nome: v.nome, igreja: ig.nome, culto: v.culto, resumo: ig.resumo, missao: ig.missao });
  const out: Bloco[] = [];
  const texto = (id: string, t: string) => { const s = sub(t); if (s) out.push({ id, linhas: [s], paragrafo: true }); };

  texto("abertura", m.abertura);
  texto("texto_pastoral", m.texto_pastoral);
  // o convite vem ANTES da lista de eventos: "Esperamos ver você de novo. Veja o que vem por aí:" + lista
  const eventos = m.incluir_eventos ? ctx.eventos.filter(e => e.titulo && e.titulo.trim()).slice(0, Math.max(1, Math.min(10, c.eventos_max || 4))) : [];
  texto("convite_retorno", m.convite_retorno);
  if (eventos.length > 0) out.push({ id: "eventos", titulo: sub(c.titulo_eventos) || "Próximos eventos", linhas: eventos.map(linhaDoEvento), links: eventos.map(e => urlSegura(e.link)), marcadores: true });
  if (m.incluir_endereco && ig.endereco.trim()) out.push({ id: "endereco", titulo: "Onde estamos", linhas: [ig.endereco.trim()] });
  const contato = [ig.telefone.trim() && `Telefone: ${ig.telefone.trim()}`, ig.email.trim() && `E-mail: ${ig.email.trim()}`].filter(Boolean) as string[];
  if (m.incluir_contato && contato.length > 0) out.push({ id: "contato", titulo: "Fale com a gente", linhas: contato });
  const zap = whatsappDaIdentidade(ig);
  if (m.incluir_whatsapp && zap) out.push({ id: "whatsapp", titulo: "WhatsApp", linhas: ["Converse com a nossa equipe:"], links: [zap] });
  const redes = m.incluir_redes ? redesDaIdentidade(ig, c.redes_ocultas) : [];
  if (redes.length > 0) out.push({ id: "redes", titulo: "Siga a gente", linhas: redes.map(r => ROTULO_DA_REDE[r.tipo]), links: redes.map(r => r.url), marcadores: true });
  const oracao = urlSegura(c.link_pedido_oracao);
  if (m.incluir_oracao && oracao) out.push({ id: "oracao", titulo: "Pedido de oração", linhas: ["Quer que oremos por você? Envie seu pedido:"], links: [oracao] });
  const leitura = urlSegura(c.link_plano_leitura);
  if (m.incluir_leitura && leitura) out.push({ id: "leitura", titulo: "Plano de leitura bíblica", linhas: ["Leia a Bíblia com a gente:"], links: [leitura] });
  texto("fechamento", m.fechamento);
  if (c.assinatura.trim()) out.push({ id: "assinatura", linhas: [sub(c.assinatura)] });
  return out;
}

const CORES = { fundo: "#f6f3ec", cartao: "#ffffff", titulo: "#6b4b10", texto: "#2b2b2b", suave: "#6f6a5f", link: "#8a5a12" };

/** Monta a mensagem no canal do modelo. */
export function montarMensagem(m: ModeloDaMensagem, ctx: ContextoDaMensagem): MensagemMontada {
  const blocos = blocosDaMensagem(m, ctx);
  const assunto = substituir(m.assunto, { nome: ctx.visitante.nome, igreja: ctx.igreja.nome, culto: ctx.visitante.culto, resumo: ctx.igreja.resumo, missao: ctx.igreja.missao }) || ctx.igreja.nome;
  const ids = blocos.map(b => b.id);

  if (m.canal === "sms") {
    // futuro: curto, sem lista nem redes — a abertura, o convite e UM caminho de volta (WhatsApp, senão o primeiro link)
    const partes = blocos.filter(b => b.id === "abertura" || b.id === "convite_retorno").map(b => b.linhas[0]);
    const caminho = blocos.find(b => b.id === "whatsapp")?.links?.[0] ?? blocos.find(b => b.id === "redes")?.links?.[0];
    const t = [...partes, caminho].filter(Boolean).join(" ");
    return { assunto, texto: t.length > 320 ? `${t.slice(0, 317)}...` : t, html: null, blocos: ids };
  }

  // texto simples (WhatsApp e versão de texto do e-mail)
  const negrito = (s: string) => (m.canal === "whatsapp" ? `*${s}*` : s.toUpperCase());
  const partes: string[] = [];
  for (const b of blocos) {
    if (b.paragrafo || b.id === "assinatura") { partes.push(b.linhas[0]); continue; }
    const linhas = b.linhas.map((l, i) => {
      const link = b.links?.[i];
      const corpo = b.marcadores ? `• ${l}` : l;
      return link ? (b.id === "eventos" ? `${corpo} (${link})` : b.marcadores ? `• ${l}: ${link}` : `${corpo} ${link}`) : corpo;
    });
    partes.push([b.titulo ? `${negrito(b.titulo)}${b.id === "eventos" ? ":" : ""}` : "", ...linhas].filter(Boolean).join("\n"));
  }
  const texto = partes.join("\n\n");
  if (m.canal === "whatsapp") return { assunto, texto, html: null, blocos: ids };

  // e-mail: a moldura do Design System (a MESMA de todos os e-mails do sistema — esta mensagem foi o modelo dela), tudo escapado, só http(s) vira link
  const a = (url: string, rotulo: string) => `<a href="${esc(url)}" style="color:${CORES.link};font-weight:bold;text-decoration:none">${esc(rotulo)}</a>`;
  let corpo = "";
  for (const b of blocos) {
    if (b.paragrafo) { corpo += `<p style="margin:0 0 14px">${paragrafos(b.linhas[0])}</p>`; continue; }
    if (b.id === "assinatura") { corpo += `<p style="margin:22px 0 0;color:${CORES.suave}">${esc(b.linhas[0]).replace(/\n/g, "<br>")}</p>`; continue; }
    let miolo: string;
    if (b.marcadores) {
      miolo = `<ul style="margin:0;padding-left:18px">${b.linhas.map((l, i) => { const link = b.links?.[i]; return `<li style="margin:2px 0">${link ? (b.id === "eventos" ? `${esc(l)} — ${a(link, "saiba mais")}` : a(link, l)) : esc(l)}</li>`; }).join("")}</ul>`;
    } else {
      miolo = b.linhas.map((l, i) => { const link = b.links?.[i]; return `<p style="margin:0">${esc(l)}${link ? ` ${a(link, link.replace(/^https?:\/\//, ""))}` : ""}</p>`; }).join("");
    }
    corpo += cartao(b.titulo ? `${b.titulo}${b.id === "eventos" ? ":" : ""}` : null, miolo);
  }
  const h = moldura({ assunto, igreja: ctx.igreja.nome, corpo });
  return { assunto, texto, html: h, blocos: ids };
}

/** O modelo escolhido para (situação, canal): o ativo; se não houver, `null` (quem chama cai no texto antigo). */
export function escolherModelo(modelos: readonly ModeloDaMensagem[], situacao: SituacaoDaMensagem, canal: CanalDaMensagem): ModeloDaMensagem | null {
  const m = modelos.find(x => x.situacao === situacao && x.canal === canal);
  return m && m.ativo ? m : null;
}

// ── qual situação vale para este visitante ─────────────────────────────────────────────────────────────────────────────────────────

export interface FatosDoVisitante {
  numeroDeVisitas: number;
  /** dias desde a ÚLTIMA visita registrada (0 = hoje) */
  diasDesdeAUltimaVisita: number;
  /** AAAA-MM-DD, se conhecida */
  dataNascimento?: string | null;
  /** AAAA-MM-DD de hoje (o chamador passa o dia de Brasília) */
  hoje: string;
}
export const IDADE_ATE_INFANTIL = 12;   // menos de 12 anos
export const IDADE_ATE_JOVEM = 29;      // 12 a 29 anos

export function idadeEmAnos(nascimento: string | null | undefined, hoje: string): number | null {
  if (!nascimento || !/^\d{4}-\d{2}-\d{2}/.test(nascimento)) return null;
  const n = nascimento.slice(0, 10), h = hoje.slice(0, 10);
  let anos = +h.slice(0, 4) - +n.slice(0, 4);
  if (h.slice(5) < n.slice(5)) anos -= 1;
  return anos >= 0 && anos < 130 ? anos : null;
}

/**
 * A situação AUTOMÁTICA. Regra: duas visitas ou mais = segunda_visita; uma só e já passou do prazo = nao_retornou; uma só, dentro do prazo: pela idade (infantil, jovem) e, sem idade, primeira_visita.
 * A idade só decide na primeira visita (quem voltou ou sumiu recebe a mensagem do momento, não da faixa). Interesse em membresia e indicado por ministério o sistema não sabe: são escolhidos por quem envia.
 */
export function situacaoAutomatica(f: FatosDoVisitante, diasSemRetorno = 15): SituacaoDaMensagem {
  if (f.numeroDeVisitas >= 2) return "segunda_visita";
  if (f.diasDesdeAUltimaVisita > diasSemRetorno) return "nao_retornou";
  const idade = idadeEmAnos(f.dataNascimento, f.hoje);
  if (idade !== null && idade < IDADE_ATE_INFANTIL) return "infantil";
  if (idade !== null && idade <= IDADE_ATE_JOVEM) return "jovem";
  return "primeira_visita";
}
