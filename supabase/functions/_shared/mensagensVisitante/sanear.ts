// ─── mensagensVisitante/sanear — o que a Edge Function aceita de um RASCUNHO vindo da tela (puro) ──────────────────────────────────────────────────────────────────────────────────────────────────────
// O e-mail de teste é montado com o rascunho que a administração está editando (não precisa salvar antes). A chamada vem de fora: nada dela é confiável. Aqui cada campo é reduzido ao tipo e ao tamanho que o
// banco aceitaria; o que não cabe é cortado, o que não é válido vira o padrão. `montarMensagem` ainda escapa o HTML e só deixa passar link http(s).
// A IDENTIDADE da igreja (nome, redes, endereço…) NUNCA vem do rascunho: a função a lê do banco (`visitante_mensagens()`), e `sanearIdentidade` só dá forma ao que o banco devolveu.
import { CANAIS, SITUACOES, TIPOS_DE_REDE, type ConfigDaMensagem, type IdentidadeDaIgreja, type ModeloDaMensagem, type TipoDeRede } from "./montar.ts";
import { CONFIG_PADRAO, IGREJA_PADRAO, modeloPadrao } from "./padroes.ts";

const txt = (v: unknown, max: number, padrao = ""): string => (typeof v === "string" ? v.slice(0, max) : padrao);
const bool = (v: unknown, padrao: boolean): boolean => (typeof v === "boolean" ? v : padrao);
const inteiro = (v: unknown, min: number, max: number, padrao: number): number => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao; };

export function sanearModelo(x: unknown): ModeloDaMensagem | null {
  const m = (x ?? {}) as Record<string, unknown>;
  const situacao = SITUACOES.find(s => s === m.situacao), canal = CANAIS.find(c => c === m.canal);
  if (!situacao || !canal) return null;
  const p = modeloPadrao(situacao, canal);
  return {
    situacao, canal, ativo: bool(m.ativo, true), assunto: txt(m.assunto, 160), abertura: txt(m.abertura, 600), texto_pastoral: txt(m.texto_pastoral, 1200), convite_retorno: txt(m.convite_retorno, 400),
    fechamento: txt(m.fechamento, 300), incluir_eventos: bool(m.incluir_eventos, p.incluir_eventos), incluir_redes: bool(m.incluir_redes, p.incluir_redes), incluir_endereco: bool(m.incluir_endereco, p.incluir_endereco),
    incluir_contato: bool(m.incluir_contato, p.incluir_contato), incluir_whatsapp: bool(m.incluir_whatsapp, p.incluir_whatsapp), incluir_oracao: bool(m.incluir_oracao, p.incluir_oracao),
    incluir_leitura: bool(m.incluir_leitura, p.incluir_leitura),
  };
}

export function sanearConfig(x: unknown): ConfigDaMensagem {
  const c = (x ?? {}) as Record<string, unknown>;
  const ocultas = (Array.isArray(c.redes_ocultas) ? c.redes_ocultas : []).filter((t): t is TipoDeRede => TIPOS_DE_REDE.includes(t as TipoDeRede));
  return {
    assinatura: txt(c.assinatura, 400), link_pedido_oracao: txt(c.link_pedido_oracao, 500), link_plano_leitura: txt(c.link_plano_leitura, 500),
    titulo_eventos: txt(c.titulo_eventos, 80, CONFIG_PADRAO.titulo_eventos) || CONFIG_PADRAO.titulo_eventos, dias_sem_retorno: inteiro(c.dias_sem_retorno, 3, 90, 15), eventos_max: inteiro(c.eventos_max, 1, 10, 4),
    redes_ocultas: [...new Set(ocultas)],
  };
}

/** A Identidade como o banco a devolve (`visitante_mensagens().igreja`). Campo ausente vira vazio; sem nome, o nome padrão. */
export function sanearIdentidade(x: unknown): IdentidadeDaIgreja {
  const i = (x ?? {}) as Record<string, unknown>;
  const redes = (Array.isArray(i.redes) ? (i.redes as Record<string, unknown>[]) : [])
    .filter(r => r && typeof r.plataforma === "string" && typeof r.url === "string").map(r => ({ plataforma: String(r.plataforma).slice(0, 30), url: String(r.url).slice(0, 500) }));
  return {
    nome: txt(i.nome, 120).trim() || IGREJA_PADRAO.nome, site: txt(i.site, 500), redes, endereco: txt(i.endereco, 300), telefone: txt(i.telefone, 40), email: txt(i.email, 160),
    resumo: txt(i.resumo, 600), missao: txt(i.missao, 400),
  };
}
