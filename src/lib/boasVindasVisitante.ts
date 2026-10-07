// ─── lib/boasVindasVisitante.ts — a tela de acolhimento depois do AutoCadastro (puro, testado) ────────────────
//
// O que a administração configura em "Boas-vindas ao Visitante" e o que o visitante vê. O banco entrega ao anônimo só o
// que é público (função `visitante_boasvindas()`: itens ativos, endereços http(s), encontros que ainda não passaram);
// `paraPublica` repete essa mesma regra no navegador para a PRÉVIA da tela de configuração mostrar exatamente o que sairá.
// Docs: docs/AUTOCADASTRO_UX_MOBILE.md · migration 20261008120000_visitante_boasvindas.sql.

import { parseLocalDate } from "@/lib/data";

export type TipoCanal = "instagram" | "facebook" | "youtube" | "site" | "whatsapp";

export interface Canal {
  tipo: TipoCanal;
  /** O endereço FINAL (é o que o banco entrega). No WhatsApp é montado de `numero` + `mensagem` ao salvar. */
  url: string;
  ativo: boolean;
  /** só WhatsApp: o que a administração digitou, para reeditar */
  numero?: string;
  mensagem?: string;
}
export interface LinkExtra { rotulo: string; url: string; ativo: boolean }
export interface Encontro { titulo: string; quando: string; data: string; local: string; link: string; ativo: boolean }

export interface ConfigBoasVindas {
  titulo: string;
  mensagem: string;
  banner_url: string | null;
  canais: Canal[];
  links: LinkExtra[];
  eventos_mostrar: boolean;
  eventos_titulo: string;
  eventos_max: number;
  eventos: Encontro[];
}

/** O que o visitante recebe (já filtrado). */
export interface BoasVindasPublica {
  titulo: string;
  mensagem: string;
  banner_url: string | null;
  canais: { tipo: TipoCanal; url: string }[];
  links: { rotulo: string; url: string }[];
  eventos_titulo: string;
  eventos: { titulo: string; quando: string; local: string; link: string | null }[];
}

export const TITULO_PADRAO = "Cadastro realizado com sucesso";
export const MENSAGEM_PADRAO = "Seja muito bem-vindo à Quarta Igreja Batista do Rio de Janeiro.\nFoi uma alegria receber sua visita.";

/** A tela quando o banco não responde (ou ainda não tem configuração): só o acolhimento, sem canais. */
export const BOAS_VINDAS_PADRAO: BoasVindasPublica = {
  titulo: TITULO_PADRAO, mensagem: MENSAGEM_PADRAO, banner_url: null, canais: [], links: [], eventos_titulo: "Venha nos visitar de novo", eventos: [],
};

export const CANAIS: { tipo: TipoCanal; rotulo: string; dica: string }[] = [
  { tipo: "instagram", rotulo: "Instagram", dica: "@qibrj ou o endereço do perfil" },
  { tipo: "facebook", rotulo: "Facebook", dica: "nome da página ou o endereço" },
  { tipo: "youtube", rotulo: "YouTube", dica: "@canal ou o endereço do canal" },
  { tipo: "site", rotulo: "Site", dica: "www.suaigreja.org.br" },
  { tipo: "whatsapp", rotulo: "WhatsApp", dica: "(21) 99999-9999" },
];

const SO_HTTP = /^https?:\/\/[^\s]+\.[^\s]+$/i;
/** Endereço que pode virar botão: http(s), sem espaço. Nada de javascript:, data: etc. */
export const urlValida = (u: string) => SO_HTTP.test(u.trim());

const semArroba = (v: string) => v.replace(/^@+/, "");

/**
 * O que a administração digitou (um @, um nome, um endereço sem https, um telefone) → o endereço final.
 * Vazio ou impossível de entender → "" (o campo fica sem endereço e, ativo, é recusado ao salvar com aviso).
 */
export function normalizarUrl(tipo: TipoCanal, valor: string, mensagem = ""): string {
  const v = valor.trim();
  if (!v) return "";
  if (tipo === "whatsapp") {
    if (/wa\.me|whatsapp\.com/i.test(v)) return urlValida(/^https?:\/\//i.test(v) ? v : `https://${v}`) ? (/^https?:\/\//i.test(v) ? v : `https://${v}`) : "";
    let d = v.replace(/\D/g, "");
    if (d.length === 10 || d.length === 11) d = `55${d}`;
    if (!/^55\d{10,11}$/.test(d)) return "";
    const texto = mensagem.trim();
    return `https://wa.me/${d}${texto ? `?text=${encodeURIComponent(texto)}` : ""}`;
  }
  const comEsquema = (u: string) => (/^[a-z][a-z0-9+.-]*:/i.test(u) ? u : `https://${u}`);
  const soApelido = !/[\s/:.]/.test(semArroba(v)) || (v.startsWith("@") && !/[\s/:]/.test(v));
  let url: string;
  if (soApelido && tipo !== "site") {
    const h = semArroba(v);
    url = tipo === "instagram" ? `https://www.instagram.com/${h}/`
        : tipo === "facebook" ? `https://www.facebook.com/${h}/`
        : `https://www.youtube.com/@${h}`;
  } else {
    url = comEsquema(v);
  }
  return urlValida(url) ? url : "";
}

/** O número de telefone de volta, a partir de um wa.me já salvo (para reeditar canais antigos). */
export function numeroDoWhatsApp(url: string): string {
  const m = url.match(/wa\.me\/(\d{12,13})/i);
  return m ? m[1].slice(2) : "";
}

/** Os cinco canais sempre presentes, na ordem da tela, completando o que faltar. */
export function completarCanais(salvos: Partial<Canal>[]): Canal[] {
  return CANAIS.map(c => {
    const s = salvos.find(x => x?.tipo === c.tipo);
    const canal: Canal = { tipo: c.tipo, url: s?.url ?? "", ativo: !!s?.ativo };
    if (c.tipo === "whatsapp") {
      canal.numero = s?.numero ?? numeroDoWhatsApp(canal.url);
      canal.mensagem = s?.mensagem ?? "";
    }
    return canal;
  });
}

/** O endereço final de cada canal, a partir do que foi digitado (WhatsApp: número + mensagem). */
export function fecharCanal(c: Canal): Canal {
  if (c.tipo === "whatsapp") return { ...c, url: normalizarUrl("whatsapp", c.numero ?? c.url, c.mensagem ?? "") };
  return { ...c, url: normalizarUrl(c.tipo, c.url) };
}

/** Problemas que impedem salvar (vazio = pode salvar): item ligado sem endereço utilizável. */
export function problemasDaConfig(c: ConfigBoasVindas): string[] {
  const p: string[] = [];
  if (c.titulo.trim() === "") p.push("Escreva o título da tela.");
  for (const x of c.canais.map(fecharCanal)) {
    if (x.ativo && !urlValida(x.url)) p.push(`${CANAIS.find(k => k.tipo === x.tipo)?.rotulo}: informe um endereço válido ou desligue o canal.`);
  }
  c.links.forEach((l, i) => {
    if (!l.ativo) return;
    if (l.rotulo.trim() === "") p.push(`Link ${i + 1}: escreva o texto do botão.`);
    if (!urlValida(normalizarUrl("site", l.url))) p.push(`Link ${i + 1}: informe um endereço válido ou desligue o link.`);
  });
  c.eventos.forEach((e, i) => {
    if (!e.ativo) return;
    if (e.titulo.trim() === "") p.push(`Encontro ${i + 1}: escreva o nome do encontro.`);
    if (e.link.trim() !== "" && !urlValida(normalizarUrl("site", e.link))) p.push(`Encontro ${i + 1}: o endereço do link não é válido.`);
  });
  return p;
}

const DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
/** "2026-10-10" + "19:00:00" → "sábado, 10/10 às 19h". */
export function descreverQuando(data: string, hora?: string | null): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return "";
  const d = parseLocalDate(data);
  let s = `${DIAS[d.getDay()]}, ${data.slice(8, 10)}/${data.slice(5, 7)}`;
  const h = hora?.match(/^(\d{2}):(\d{2})/);
  if (h) s += ` às ${Number(h[1])}h${h[2] === "00" ? "" : h[2]}`;
  return s;
}

/** A mesma filtragem que `visitante_boasvindas()` faz no banco — para a prévia da configuração. */
export function paraPublica(c: ConfigBoasVindas, hoje: string): BoasVindasPublica {
  const eventos = !c.eventos_mostrar ? [] : c.eventos
    .filter(e => e.ativo && e.titulo.trim() !== "" && (!/^\d{4}-\d{2}-\d{2}$/.test(e.data) || e.data >= hoje))
    .slice(0, c.eventos_max)
    .map(e => {
      const link = normalizarUrl("site", e.link);
      return { titulo: e.titulo.trim(), quando: e.quando.trim(), local: e.local.trim(), link: urlValida(link) ? link : null };
    });
  return {
    titulo: c.titulo.trim() || TITULO_PADRAO,
    mensagem: c.mensagem,
    banner_url: c.banner_url && /^https?:\/\//i.test(c.banner_url) ? c.banner_url : null,
    canais: c.canais.map(fecharCanal).filter(x => x.ativo && urlValida(x.url)).map(x => ({ tipo: x.tipo, url: x.url })),
    links: c.links.filter(l => l.ativo && l.rotulo.trim() !== "" && urlValida(normalizarUrl("site", l.url)))
      .map(l => ({ rotulo: l.rotulo.trim(), url: normalizarUrl("site", l.url) })),
    eventos_titulo: c.eventos_titulo.trim() || "Venha nos visitar de novo",
    eventos,
  };
}

/** A resposta do banco (jsonb) com cada campo conferido — o que vier fora do formato cai no padrão. */
export function lerRespostaPublica(r: unknown): BoasVindasPublica {
  if (!r || typeof r !== "object") return BOAS_VINDAS_PADRAO;
  const o = r as Record<string, unknown>;
  const lista = <T,>(v: unknown, ok: (x: any) => boolean): T[] => (Array.isArray(v) ? (v.filter(x => x && typeof x === "object" && ok(x)) as T[]) : []);
  return {
    titulo: typeof o.titulo === "string" && o.titulo ? o.titulo : TITULO_PADRAO,
    mensagem: typeof o.mensagem === "string" ? o.mensagem : MENSAGEM_PADRAO,
    banner_url: typeof o.banner_url === "string" && urlValida(o.banner_url) ? o.banner_url : null,
    canais: lista<BoasVindasPublica["canais"][number]>(o.canais, x => CANAIS.some(c => c.tipo === x.tipo) && urlValida(String(x.url))),
    links: lista<BoasVindasPublica["links"][number]>(o.links, x => !!x.rotulo && urlValida(String(x.url))),
    eventos_titulo: typeof o.eventos_titulo === "string" && o.eventos_titulo ? o.eventos_titulo : BOAS_VINDAS_PADRAO.eventos_titulo,
    eventos: lista<BoasVindasPublica["eventos"][number]>(o.eventos, x => !!x.titulo)
      .map(e => ({ titulo: String(e.titulo), quando: String(e.quando ?? ""), local: String(e.local ?? ""), link: e.link && urlValida(String(e.link)) ? String(e.link) : null })),
  };
}
