// ─── mensagensVisitante/sanear — o que a Edge Function aceita de um RASCUNHO vindo da tela (puro) ──────────────────────────────────────────────────────────────────────────────────────────────────────
// O e-mail de teste é montado com o rascunho que a administração está editando (não precisa salvar antes). A chamada vem de fora: nada dela é confiável. Aqui cada campo é reduzido ao tipo e ao tamanho que o
// banco aceitaria; o que não cabe é cortado, o que não é válido vira o padrão. `montarMensagem` ainda escapa o HTML e só deixa passar link http(s).
import { CANAIS, SITUACOES, TIPOS_DE_REDE, type ConfigDaMensagem, type ModeloDaMensagem } from "./montar.ts";
import { CONFIG_PADRAO, modeloPadrao } from "./padroes.ts";

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
  const lista = Array.isArray(c.redes) ? (c.redes as Record<string, unknown>[]) : [];
  return {
    igreja_nome: txt(c.igreja_nome, 120, CONFIG_PADRAO.igreja_nome) || CONFIG_PADRAO.igreja_nome, assinatura: txt(c.assinatura, 400), endereco: txt(c.endereco, 300), telefone: txt(c.telefone, 40),
    whatsapp: txt(c.whatsapp, 30), email_contato: txt(c.email_contato, 160), link_pedido_oracao: txt(c.link_pedido_oracao, 500), link_plano_leitura: txt(c.link_plano_leitura, 500),
    titulo_eventos: txt(c.titulo_eventos, 80, CONFIG_PADRAO.titulo_eventos) || CONFIG_PADRAO.titulo_eventos, dias_sem_retorno: inteiro(c.dias_sem_retorno, 3, 90, 15), eventos_max: inteiro(c.eventos_max, 1, 10, 4),
    redes: TIPOS_DE_REDE.map(tipo => { const r = lista.find(y => y && y.tipo === tipo); return { tipo, url: txt(r?.url, 500), ativo: bool(r?.ativo, false) }; }),
  };
}
