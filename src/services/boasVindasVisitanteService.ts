// ─── boasVindasVisitanteService — a configuração da tela de acolhimento (lado da administração) ──────────────
//
// A tabela `visitante_boasvindas` tem UMA linha (id = true). Só admin/diakonia/secretaria leem e escrevem (RLS). O banner
// mora no bucket público `boasvindas-visitante`. O lado do visitante NÃO passa por aqui: a página pública chama a função
// `visitante_boasvindas()` direto (ver pages/VisitanteAutocadastro.tsx).

import { supabase } from "@/integrations/supabase/client";
import { conferir } from "@/lib/escritaConferida";
import {
  completarCanais, fecharCanal, urlValida, normalizarUrl,
  type ConfigBoasVindas, type Encontro, type ItemAgenda, type LinkExtra,
} from "@/lib/boasVindasVisitante";

const BUCKET = "boasvindas-visitante";
const TAMANHO_MAX = 2 * 1024 * 1024;   // o mesmo limite do bucket

export async function carregarConfig(): Promise<ConfigBoasVindas | null> {
  const { data, error } = await supabase.from("visitante_boasvindas" as never).select("*").eq("id" as never, true as never).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const d = data as unknown as Record<string, any>;
  return {
    titulo: d.titulo ?? "", mensagem: d.mensagem ?? "", banner_url: d.banner_url ?? null,
    canais: completarCanais(Array.isArray(d.canais) ? d.canais : []),
    links: (Array.isArray(d.links) ? d.links : []).map((l: any): LinkExtra => ({ rotulo: l.rotulo ?? "", url: l.url ?? "", ativo: !!l.ativo })),
    eventos_mostrar: !!d.eventos_mostrar, eventos_titulo: d.eventos_titulo ?? "", eventos_max: Number(d.eventos_max) || 4,
    eventos_modo: d.eventos_modo === "manual" ? "manual" : "automatico",
    agenda_incluidos: Array.isArray(d.agenda_incluidos) ? d.agenda_incluidos : [],
    agenda_ocultos: Array.isArray(d.agenda_ocultos) ? d.agenda_ocultos : [],
    eventos: (Array.isArray(d.eventos) ? d.eventos : []).map((e: any): Encontro => ({
      titulo: e.titulo ?? "", quando: e.quando ?? "", data: e.data ?? "", local: e.local ?? "", link: e.link ?? "", ativo: !!e.ativo,
    })),
  };
}

/** Grava a configuração inteira. O endereço de cada canal/link/encontro é fechado (normalizado) aqui, uma vez só. */
export async function salvarConfig(c: ConfigBoasVindas): Promise<void> {
  const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
  const linha = {
    id: true,
    titulo: c.titulo.trim(), mensagem: c.mensagem.trim(), banner_url: c.banner_url,
    canais: c.canais.map(fecharCanal).map(x => ({
      tipo: x.tipo, url: x.url, ativo: x.ativo && urlValida(x.url),
      ...(x.tipo === "whatsapp" ? { numero: x.numero ?? "", mensagem: x.mensagem ?? "" } : {}),
    })),
    links: c.links.map(l => ({ rotulo: l.rotulo.trim(), url: normalizarUrl("site", l.url), ativo: l.ativo })),
    eventos_mostrar: c.eventos_mostrar, eventos_titulo: c.eventos_titulo.trim() || "Venha nos visitar de novo", eventos_max: c.eventos_max,
    eventos_modo: c.eventos_modo, agenda_incluidos: c.agenda_incluidos, agenda_ocultos: c.agenda_ocultos,
    eventos: c.eventos.map(e => ({ titulo: e.titulo.trim(), quando: e.quando.trim(), data: e.data, local: e.local.trim(), link: e.link.trim() ? normalizarUrl("site", e.link) : "", ativo: e.ativo })),
    atualizado_em: new Date().toISOString(), atualizado_por: uid,
  };
  const r = conferir(
    await supabase.from("visitante_boasvindas" as never).upsert(linha as never, { onConflict: "id" } as never).select("id"),
    "As boas-vindas ao visitante",
  );
  if (!r.ok) throw new Error(r.erro);
}

// ── banner ─────────────────────────────────────────────────────────────────────────────────────────────────

/** Reduz a imagem (largura máxima 1600 px) e a regrava em WebP/JPEG até caber no limite do bucket. */
export async function prepararBanner(arquivo: File): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp)$/.test(arquivo.type)) throw new Error("Use uma imagem JPG, PNG ou WebP.");
  const bmp = await createImageBitmap(arquivo);
  const escala = Math.min(1, 1600 / bmp.width);
  const tela = document.createElement("canvas");
  tela.width = Math.round(bmp.width * escala); tela.height = Math.round(bmp.height * escala);
  tela.getContext("2d")!.drawImage(bmp, 0, 0, tela.width, tela.height);
  bmp.close?.();
  for (const [tipo, qualidade] of [["image/webp", 0.85], ["image/webp", 0.7], ["image/jpeg", 0.7], ["image/jpeg", 0.5]] as const) {
    const blob = await new Promise<Blob | null>(res => tela.toBlob(res, tipo, qualidade));
    if (blob && blob.type === tipo && blob.size <= TAMANHO_MAX) return blob;
  }
  throw new Error("A imagem ficou grande demais. Escolha uma menor.");
}

export async function enviarBanner(blob: Blob): Promise<string> {
  const ext = blob.type === "image/webp" ? "webp" : "jpg";
  const caminho = `banner-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(caminho, blob, { contentType: blob.type, cacheControl: "3600", upsert: false });
  if (error) throw new Error(error.message);
  return supabase.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl;
}

/** Apaga um banner que ninguém mais usa (melhor esforço: se falhar, só sobra um arquivo no bucket). */
export async function apagarBanner(url: string | null): Promise<void> {
  const i = url?.indexOf(`/${BUCKET}/`) ?? -1;
  if (!url || i < 0) return;
  await supabase.storage.from(BUCKET).remove([decodeURIComponent(url.slice(i + BUCKET.length + 2).split("?")[0])]).catch(() => undefined);
}

// ── a agenda, para a administração escolher ────────────────────────────────────────────────────────────────

/**
 * Tudo que a Agenda tem de futuro nos próximos 60 dias — cada série recorrente (cultos, EBD, orações, reuniões) vira UM item
 * com a próxima data e o padrão ("Domingo · 09h00"), sem as datas canceladas ou remarcadas. Já vem na ordem do visitante:
 * cultos, programações recorrentes, eventos especiais. Só a administração chama (a função do banco confere o papel).
 */
export async function carregarAgenda(): Promise<ItemAgenda[]> {
  const { data, error } = await supabase.rpc("visitante_agenda_candidatos" as never);
  if (error) throw new Error(error.message);
  return (Array.isArray(data) ? data : []) as unknown as ItemAgenda[];
}
