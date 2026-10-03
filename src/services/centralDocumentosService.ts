// ─── centralDocumentosService.ts — Central de Documentos Contábeis (Fase 1) ───
//
// A camada de E/S da Central. A inteligência (leitura, casamento, grupos) é pura e
// mora em `lib/documentos/*`; aqui ficam só as idas ao banco e ao armazenamento:
//   · `carregarCandidatos` — as saídas que podem receber documento;
//   · `listarOrfaos`       — arquivos no bucket que nenhum lançamento referencia;
//   · `lerArquivo`         — texto do PDF (OCR só se não houver texto);
//   · `gravarLote` / `desfazerLote` — a gravação direta e o "desfazer lote".
//
// SEM TABELA NOVA e SEM FILA PERSISTIDA (decisão dela, 03/10/2026): o que não foi
// confirmado vive só na tela. Nada vai ao armazenamento antes do "Gravar".
//
// Ganchos já previstos para a Fase 2 (NÃO implementados, pedido dela): leitura
// automática de XML de NF-e (`lerArquivo` hoje devolve `nao_lido` para .xml),
// identificação por CNPJ já existe, e a sugestão de fornecedor, categoria e centro
// de custo entra como uma extensão de `ResultadoCasamento`.

import { supabase } from "@/integrations/supabase/client";
import { toYmd } from "@/lib/data";
import { dispensaDocumento } from "@/lib/pacoteContabil";
import type { LancamentoPool } from "@/lib/documentos/casamento";
import { ordemDeGravacao } from "@/lib/documentos/fluxo";
import { extrairDadosDoComprovante, textoDoPdf } from "@/services/ocrService";
import {
  FIN_ANEXO_MIMES, FIN_COMPROVANTE_MAX, removerArquivosSemReferencia, type FinAnexoTipo,
} from "@/services/finService";

const BUCKET = "fin-comprovantes";
const PAGINA = 1000;
const MESES_DE_HISTORICO = 18; // compras parceladas de março ainda têm parcelas em setembro

// ── candidatos ──────────────────────────────────────────────────────────────

export interface Candidatos {
  /** Saídas que podem receber documento (sem tarifas, sem transferências). */
  pool: LancamentoPool[];
  /** Todo caminho do bucket que alguma linha já referencia. */
  urlsReferenciadas: Set<string>;
  /** Anexos existentes por lançamento (pra detectar documento já anexado). */
  anexosPorLancamento: Map<string, string[]>;
}

async function paginar<T>(consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const tudo: T[] = [];
  for (let p = 0; ; p++) {
    const { data, error } = await consulta(p * PAGINA, p * PAGINA + PAGINA - 1);
    if (error) throw error;
    tudo.push(...(data ?? []));
    if ((data ?? []).length < PAGINA) break;
  }
  return tudo;
}

export async function carregarCandidatos(): Promise<Candidatos> {
  const desde = new Date();
  desde.setMonth(desde.getMonth() - MESES_DE_HISTORICO);
  const ini = toYmd(desde);

  const [lancs, forn, contas, cats, anexos] = await Promise.all([
    paginar((de, ate) => supabase.from("fin_lancamentos")
      .select("id, data, data_pagamento, valor, status, conta_id, fornecedor_id, descricao, categoria_id, comprovante_url, documento_numero")
      .eq("tipo", "saida").neq("origem", "transferencia").neq("status", "cancelado")
      .gte("data", ini).order("data").order("id").range(de, ate)),
    paginar((de, ate) => supabase.from("fin_fornecedores").select("id, nome, cnpj_cpf").order("id").range(de, ate)),
    supabase.from("fin_contas").select("id, nome, tipo"),
    supabase.from("fin_categorias").select("id, nome"),
    paginar((de, ate) => supabase.from("fin_lancamento_anexos").select("lancamento_id, url").order("id").range(de, ate)),
  ]);

  const fornPorId = new Map(forn.map(f => [f.id, f]));
  const contaPorId = new Map((contas.data ?? []).map(c => [c.id, c]));
  const catPorId = new Map((cats.data ?? []).map(c => [c.id, c.nome]));

  const anexosPorLancamento = new Map<string, string[]>();
  const urlsReferenciadas = new Set<string>();
  for (const a of anexos) {
    if (!a.url) continue;
    urlsReferenciadas.add(a.url);
    const lista = anexosPorLancamento.get(a.lancamento_id) ?? [];
    lista.push(a.url);
    anexosPorLancamento.set(a.lancamento_id, lista);
  }
  for (const l of lancs) if (l.comprovante_url) urlsReferenciadas.add(l.comprovante_url);

  const pool: LancamentoPool[] = [];
  for (const l of lancs) {
    if (dispensaDocumento({ categoria_nome: catPorId.get(l.categoria_id ?? "") ?? null })) continue; // tarifa não recebe documento
    const f = l.fornecedor_id ? fornPorId.get(l.fornecedor_id) : undefined;
    const c = contaPorId.get(l.conta_id);
    pool.push({
      id: l.id,
      dia: l.data_pagamento || l.data,
      valor: Number(l.valor),
      fornecedorNome: f?.nome ?? l.descricao ?? "",
      fornecedorCnpj: (f?.cnpj_cpf ?? "").replace(/\D/g, "") || null,
      contaNome: c?.nome ?? "",
      contaTipo: c?.tipo ?? "",
      status: l.status,
      temAnexo: anexosPorLancamento.has(l.id),
      descricao: l.descricao,
      documentoNumero: l.documento_numero,
    });
  }
  return { pool, urlsReferenciadas, anexosPorLancamento };
}

// ── arquivos soltos no armazenamento ────────────────────────────────────────

export interface Orfao { path: string; bytes: number; criadoEm: string }

/** Arquivos do bucket que NENHUMA linha referencia. */
export async function listarOrfaos(urlsReferenciadas: Set<string>): Promise<Orfao[]> {
  const raiz = await supabase.storage.from(BUCKET).list("", { limit: 1000 });
  if (raiz.error) throw raiz.error;
  const todos: Orfao[] = [];
  for (const e of raiz.data ?? []) {
    if (e.id === null) { // pasta
      const { data } = await supabase.storage.from(BUCKET).list(e.name, { limit: 1000 });
      for (const o of data ?? []) {
        if (o.id !== null) todos.push({ path: `${e.name}/${o.name}`, bytes: Number(o.metadata?.size ?? 0), criadoEm: o.created_at ?? "" });
      }
    } else {
      todos.push({ path: e.name, bytes: Number(e.metadata?.size ?? 0), criadoEm: e.created_at ?? "" });
    }
  }
  return todos.filter(o => !urlsReferenciadas.has(o.path));
}

export async function baixarArquivo(path: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) throw error ?? new Error("Arquivo não encontrado no armazenamento");
  return data;
}

// ── leitura ─────────────────────────────────────────────────────────────────

export async function hashDoArquivo(blob: Blob): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

export interface Leitura { texto: string | null; fonte: "texto" | "ocr" | "nao_lido" }

/**
 * Texto do documento. PDF: camada de texto (rápida, exata); só se não houver, OCR.
 * Imagem: OCR. XML: `nao_lido` (a leitura automática de NF-e em XML é da Fase 2 — o
 * arquivo ainda pode ser ligado a mão e nunca se perde).
 */
export async function lerArquivo(blob: Blob, nome: string, usarOcr: boolean): Promise<Leitura> {
  const n = nome.toLowerCase();
  if (n.endsWith(".xml")) return { texto: null, fonte: "nao_lido" };
  // O tipo do blob vale tanto quanto a extensão: o nome mostrado na tela nem sempre
  // termina em ".pdf" (os "arquivos soltos" levaram PDF ao Tesseract por isso).
  const ehPdf = n.endsWith(".pdf") || blob.type === "application/pdf";
  const tipo = ehPdf ? "application/pdf" : n.endsWith(".png") ? "image/png" : "image/jpeg";
  const file = new File([blob], ehPdf && !n.endsWith(".pdf") ? `${nome}.pdf` : nome, { type: tipo });
  if (ehPdf) {
    const texto = await textoDoPdf(file);
    if (texto) return { texto, fonte: "texto" };
  }
  if (!usarOcr) return { texto: null, fonte: "nao_lido" };
  const r = await extrairDadosDoComprovante(file);
  return { texto: r.textoBruto || null, fonte: "ocr" };
}

/** Hashes dos arquivos que JÁ estão anexados aos lançamentos informados — baixa só
 *  os de quem aparece como candidato (não o bucket inteiro). hash → lançamento. */
export async function hashesDosAnexos(
  lancamentoIds: string[], anexosPorLancamento: Map<string, string[]>, cache: Map<string, string>,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const id of lancamentoIds) {
    for (const url of anexosPorLancamento.get(id) ?? []) {
      let h = cache.get(url);
      if (!h) {
        try { h = await hashDoArquivo(await baixarArquivo(url)); cache.set(url, h); } catch { continue; }
      }
      out.set(h, id);
    }
  }
  return out;
}

// ── gravação ────────────────────────────────────────────────────────────────

export interface VinculoParaGravar {
  itemId: string;
  origem: "upload" | "orfao";
  arquivo?: File;
  storagePath?: string;
  nome: string;
  tipo: FinAnexoTipo;
  /** Compra parcelada: o MESMO arquivo é ligado a TODOS estes lançamentos. */
  lancamentoIds: string[];
  /** Número do documento (NF, RPA…) a gravar em `documento_numero` — só nos
   *  lançamentos de `semNumero`, que a tela viu VAZIOS. Nunca sobrescreve. */
  documentoNumero?: string | null;
  semNumero?: string[];
}

export interface AnexoCriado { anexoId: string; lancamentoId: string; itemId: string; url: string }

export interface ResultadoLote {
  criados: AnexoCriado[];
  /** Arquivos ENVIADOS neste lote (os órfãos já existiam e não entram aqui). */
  arquivosEnviados: string[];
  erros: { itemId: string; mensagem: string }[];
  /** `documento_numero` preenchidos por este lote (o desfazer os esvazia de volta). */
  numerosGravados: { lancamentoId: string; numero: string }[];
  /** Avisos que não impedem o vínculo (ex.: o número não pôde ser gravado). */
  avisos: string[];
}

const MIME_POR_EXT: Record<string, string> = {
  pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", xml: "application/xml",
};

export async function gravarLote(
  vinculos: VinculoParaGravar[], onProgresso?: (feitos: number, total: number) => void,
): Promise<ResultadoLote> {
  const lote: ResultadoLote = { criados: [], arquivosEnviados: [], erros: [], numerosGravados: [], avisos: [] };
  const { data: { user } } = await supabase.auth.getUser();

  // Ordem das páginas do dossiê = `enviado_em` crescente. Cada vínculo ganha um
  // carimbo próprio, 10 ms depois do anterior, na ORDEM DE GRAVAÇÃO (fiscal antes
  // do comprovante) — independe de qual upload terminar primeiro.
  const ordenados = ordemDeGravacao(vinculos);
  const base = Date.now();
  const carimbo = new Map(ordenados.map((v, i) => [v.itemId + "|" + v.nome, new Date(base + i * 10).toISOString()]));

  let feitos = 0;
  let proximo = 0;
  async function trabalhador() {
    while (proximo < ordenados.length) {
      const v = ordenados[proximo++];
      try { await gravarUm(v, carimbo.get(v.itemId + "|" + v.nome)!, user?.id ?? null, lote); }
      catch (e: any) { lote.erros.push({ itemId: v.itemId, mensagem: e?.message ?? "Erro ao gravar" }); }
      onProgresso?.(++feitos, ordenados.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, ordenados.length) }, trabalhador));
  return lote;
}

async function gravarUm(v: VinculoParaGravar, enviadoEm: string, userId: string | null, lote: ResultadoLote): Promise<void> {
  if (v.lancamentoIds.length === 0) throw new Error("Sem lançamento de destino");
  let path: string;
  let enviado = false;

  if (v.origem === "orfao") {
    if (!v.storagePath) throw new Error("Arquivo solto sem caminho");
    path = v.storagePath;
    // Já foi ligado por outra aba/sessão? Não duplica.
    const { count } = await supabase.from("fin_lancamento_anexos").select("id", { count: "exact", head: true }).eq("url", path);
    if ((count ?? 0) > 0) throw new Error("Este arquivo já está vinculado a um lançamento");
  } else {
    const f = v.arquivo;
    if (!f) throw new Error("Arquivo ausente");
    if (f.size > FIN_COMPROVANTE_MAX) throw new Error("Arquivo maior que 5 MB");
    const ext = (f.name.split(".").pop() ?? "bin").toLowerCase();
    const mime = f.type || MIME_POR_EXT[ext] || "";
    if (!FIN_ANEXO_MIMES.includes(mime)) throw new Error("Formato não aceito (só PDF, JPG, PNG e XML)");
    path = `${v.lancamentoIds[0]}/${Date.now()}${Math.floor(Math.random() * 1000)}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, f, { upsert: false, contentType: mime });
    if (error) throw error;
    enviado = true;
  }

  const linhas = v.lancamentoIds.map(id => ({
    lancamento_id: id, tipo: v.tipo, url: path, nome: v.nome, enviado_por: userId, enviado_em: enviadoEm,
  }));
  const { data, error } = await supabase.from("fin_lancamento_anexos").insert(linhas).select("id, lancamento_id");
  if (error || !data || data.length !== linhas.length) {
    // Upload feito mas a linha não gravou: não deixa arquivo órfão (mesmo cuidado de `adicionarAnexo`).
    if (enviado) await supabase.storage.from(BUCKET).remove([path]);
    const cod = (error as { code?: string } | null)?.code;
    throw new Error(cod === "23514"
      ? "O banco ainda não aceita este tipo de documento — falta aplicar a migration 20261002200000."
      : error?.message ?? "A gravação foi barrada (permissão)");
  }
  if (enviado) lote.arquivosEnviados.push(path);
  for (const r of data) lote.criados.push({ anexoId: r.id, lancamentoId: r.lancamento_id, itemId: v.itemId, url: path });

  // documento_numero (decisão dela, 03/10/2026): preenche só onde está VAZIO — a
  // condição `is null` no UPDATE garante que nunca se sobrescreve um número que
  // alguém digitou entre a leitura da tela e este instante. Se nada foi alterado,
  // ou já foi preenchido por outra pessoa, ou a RLS barrou (UPDATE barrado devolve
  // sucesso com 0 linhas — CLAUDE.md §6.1): vira aviso, nunca falha do vínculo.
  if (v.documentoNumero) {
    for (const id of v.semNumero ?? []) {
      const { data: alt, error: e2 } = await supabase.from("fin_lancamentos")
        .update({ documento_numero: v.documentoNumero }).eq("id", id)
        .or("documento_numero.is.null,documento_numero.eq.").select("id"); // vazio = nulo OU texto vazio
      if (!e2 && alt && alt.length > 0) lote.numerosGravados.push({ lancamentoId: id, numero: v.documentoNumero });
      else lote.avisos.push(`${v.nome}: o nº ${v.documentoNumero} não foi gravado no lançamento (já preenchido ou sem permissão).`);
    }
  }
}

/** Desfaz um lote: apaga as linhas criadas e os arquivos que o lote enviou (só os
 *  que mais ninguém referencia). Os órfãos que foram ligados voltam a ser órfãos. */
export async function desfazerLote(lote: ResultadoLote): Promise<{ removidos: number; erros: string[] }> {
  const erros: string[] = [];
  let removidos = 0;
  const ids = lote.criados.map(c => c.anexoId);
  for (let i = 0; i < ids.length; i += 100) {
    const parte = ids.slice(i, i + 100);
    const { data, error } = await supabase.from("fin_lancamento_anexos").delete().in("id", parte).select("id");
    if (error) { erros.push(error.message); continue; }
    removidos += (data ?? []).length;
    if ((data ?? []).length !== parte.length) erros.push(`${parte.length - (data ?? []).length} vínculo(s) não puderam ser removidos (permissão)`);
  }
  await removerArquivosSemReferencia(lote.arquivosEnviados);
  // Devolve o documento_numero que ESTE lote preencheu — e só se ainda for o mesmo
  // número (se alguém o corrigiu depois, a correção dela vale).
  for (const n of lote.numerosGravados) {
    const { error } = await supabase.from("fin_lancamentos")
      .update({ documento_numero: null }).eq("id", n.lancamentoId).eq("documento_numero", n.numero).select("id");
    if (error) erros.push(`nº ${n.numero}: ${error.message}`);
  }
  return { removidos, erros };
}
