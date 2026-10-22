// ─── lib/mensagensVisitante — a mensagem ao visitante configurável, do lado do aplicativo ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// A regra de MONTAR a mensagem (blocos, canais, situação) mora em `supabase/functions/_shared/mensagensVisitante/`, porque o aplicativo (WhatsApp, prévia) e a Edge Function (e-mail de teste, e no futuro o
// envio automático) precisam montar a mesma coisa. Aqui só se reexporta e se acrescenta o que é do aplicativo: ler o que o banco devolve e validar o que a administração digita.
export * from "../../supabase/functions/_shared/mensagensVisitante/montar";
export * from "../../supabase/functions/_shared/mensagensVisitante/padroes";

import {
  CANAIS, SITUACOES, TIPOS_DE_REDE, urlSegura, type CanalDaMensagem, type ConfigDaMensagem, type EventoDaMensagem, type ModeloDaMensagem, type RedeDaMensagem, type SituacaoDaMensagem,
} from "../../supabase/functions/_shared/mensagensVisitante/montar";
import { CONFIG_PADRAO, modeloPadrao } from "../../supabase/functions/_shared/mensagensVisitante/padroes";

export interface PacoteDeMensagens { config: ConfigDaMensagem; modelos: ModeloDaMensagem[]; eventos: EventoDaMensagem[] }

const txt = (v: unknown, padrao = ""): string => (typeof v === "string" ? v : padrao);
const bool = (v: unknown, padrao: boolean): boolean => (typeof v === "boolean" ? v : padrao);

/** As cinco redes, SEMPRE na mesma ordem (a tela mostra todas, ligadas ou não); o que o banco não trouxe nasce vazio e desligado. */
export function completarRedes(lista: unknown): RedeDaMensagem[] {
  const arr = Array.isArray(lista) ? (lista as Record<string, unknown>[]) : [];
  return TIPOS_DE_REDE.map(tipo => {
    const x = arr.find(r => r && r.tipo === tipo);
    return { tipo, url: txt(x?.url), ativo: bool(x?.ativo, false) };
  });
}

/** Transforma o jsonb de `visitante_mensagens()` em algo que o resto do código pode confiar (campo ausente → padrão). */
export function lerPacote(bruto: unknown): PacoteDeMensagens {
  const b = (bruto ?? {}) as Record<string, any>;
  const c = (b.config ?? {}) as Record<string, unknown>;
  const config: ConfigDaMensagem = {
    igreja_nome: txt(c.igreja_nome, CONFIG_PADRAO.igreja_nome), assinatura: txt(c.assinatura, CONFIG_PADRAO.assinatura), endereco: txt(c.endereco), telefone: txt(c.telefone),
    whatsapp: txt(c.whatsapp), email_contato: txt(c.email_contato), link_pedido_oracao: txt(c.link_pedido_oracao), link_plano_leitura: txt(c.link_plano_leitura),
    titulo_eventos: txt(c.titulo_eventos, CONFIG_PADRAO.titulo_eventos), dias_sem_retorno: Number(c.dias_sem_retorno) || CONFIG_PADRAO.dias_sem_retorno,
    eventos_max: Number(c.eventos_max) || CONFIG_PADRAO.eventos_max, redes: completarRedes(c.redes),
  };
  const modelos: ModeloDaMensagem[] = (Array.isArray(b.modelos) ? b.modelos : [])
    .filter((m: any) => SITUACOES.includes(m?.situacao) && CANAIS.includes(m?.canal))
    .map((m: any): ModeloDaMensagem => {
      const p = modeloPadrao(m.situacao, m.canal);
      return {
        situacao: m.situacao, canal: m.canal, ativo: bool(m.ativo, true), assunto: txt(m.assunto), abertura: txt(m.abertura), texto_pastoral: txt(m.texto_pastoral),
        convite_retorno: txt(m.convite_retorno), fechamento: txt(m.fechamento), incluir_eventos: bool(m.incluir_eventos, p.incluir_eventos), incluir_redes: bool(m.incluir_redes, p.incluir_redes),
        incluir_endereco: bool(m.incluir_endereco, p.incluir_endereco), incluir_contato: bool(m.incluir_contato, p.incluir_contato), incluir_whatsapp: bool(m.incluir_whatsapp, p.incluir_whatsapp),
        incluir_oracao: bool(m.incluir_oracao, p.incluir_oracao), incluir_leitura: bool(m.incluir_leitura, p.incluir_leitura),
      };
    });
  const eventos: EventoDaMensagem[] = (Array.isArray(b.eventos) ? b.eventos : [])
    .filter((e: any) => e && typeof e.titulo === "string" && e.titulo.trim())
    .map((e: any) => ({ titulo: e.titulo, quando: txt(e.quando) || null, local: txt(e.local) || null, link: txt(e.link) || null }));
  return { config, modelos, eventos };
}

/** O modelo da (situação, canal), ou o PADRÃO se a linha não existir no banco — para a tela nunca ficar sem o que editar. */
export function modeloOuPadrao(modelos: readonly ModeloDaMensagem[], situacao: SituacaoDaMensagem, canal: CanalDaMensagem): ModeloDaMensagem {
  return modelos.find(m => m.situacao === situacao && m.canal === canal) ?? modeloPadrao(situacao, canal);
}

// ── validação do que a administração digita (a CHECK do banco recusa de novo) ───────────────────────────────────────────────────────────────────────────────────────────────

export const LIMITES = { abertura: 600, texto_pastoral: 1200, convite_retorno: 400, fechamento: 300, assunto: 160, assinatura: 400, endereco: 300, telefone: 40, email_contato: 160, igreja_nome: 120, titulo_eventos: 80 } as const;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** "https://…": acrescenta https:// quando a pessoa digitou só "instagram.com/qibrj"; vazio continua vazio. */
export function fecharUrl(u: string): string {
  const s = u.trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  // outro esquema (javascript:, ftp:, mailto:…) NÃO ganha https:// na frente — ficaria parecendo válido; deixa como está e a validação recusa. "localhost:8080/x" (porta) continua sendo endereço sem esquema.
  if (/^[a-z][a-z0-9+.\-]*:(?!\d)/i.test(s)) return s;
  return `https://${s.replace(/^\/+/, "")}`;
}

export function problemasDoModelo(m: ModeloDaMensagem): string[] {
  const p: string[] = [];
  const cmp = (rotulo: string, valor: string, max: number) => { if (valor.length > max) p.push(`${rotulo} passa de ${max} caracteres (${valor.length}).`); };
  cmp("A abertura", m.abertura, LIMITES.abertura); cmp("O texto pastoral", m.texto_pastoral, LIMITES.texto_pastoral); cmp("O convite para retorno", m.convite_retorno, LIMITES.convite_retorno);
  cmp("O fechamento", m.fechamento, LIMITES.fechamento); cmp("O assunto", m.assunto, LIMITES.assunto);
  if (m.ativo && !m.abertura.trim() && !m.texto_pastoral.trim()) p.push("Um modelo ativo precisa de ao menos a abertura ou o texto pastoral.");
  if (m.ativo && m.canal === "email" && !m.assunto.trim()) p.push("O e-mail precisa de um assunto.");
  return p;
}

export function problemasDaConfig(c: ConfigDaMensagem): string[] {
  const p: string[] = [];
  const cmp = (rotulo: string, valor: string, max: number) => { if (valor.length > max) p.push(`${rotulo} passa de ${max} caracteres.`); };
  if (!c.igreja_nome.trim()) p.push("Informe o nome da igreja.");
  cmp("O nome da igreja", c.igreja_nome, LIMITES.igreja_nome); cmp("A assinatura", c.assinatura, LIMITES.assinatura); cmp("O endereço", c.endereco, LIMITES.endereco);
  cmp("O telefone", c.telefone, LIMITES.telefone); cmp("O e-mail", c.email_contato, LIMITES.email_contato); cmp("O título dos eventos", c.titulo_eventos, LIMITES.titulo_eventos);
  if (c.email_contato.trim() && !EMAIL.test(c.email_contato.trim())) p.push("O e-mail de contato parece incompleto.");
  if (c.whatsapp.trim() && !/^(55)?\d{10,11}$/.test(c.whatsapp.replace(/\D/g, ""))) p.push("O WhatsApp precisa de DDD + número (ex.: 21 98399-1229).");
  for (const [rotulo, url] of [["O link do pedido de oração", c.link_pedido_oracao], ["O link do plano de leitura", c.link_plano_leitura]] as const) {
    if (url.trim() && !urlSegura(fecharUrl(url))) p.push(`${rotulo} não parece um endereço válido.`);
  }
  for (const r of c.redes) if (r.ativo && !urlSegura(fecharUrl(r.url))) p.push(`Informe o endereço de ${r.tipo[0].toUpperCase()}${r.tipo.slice(1)} ou desligue a rede.`);
  if (!(c.dias_sem_retorno >= 3 && c.dias_sem_retorno <= 90)) p.push("O prazo de \"não retornou\" vai de 3 a 90 dias.");
  if (!(c.eventos_max >= 1 && c.eventos_max <= 10)) p.push("A lista de eventos mostra de 1 a 10 itens.");
  return p;
}
