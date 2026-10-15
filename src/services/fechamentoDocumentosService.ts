// ─── fechamentoDocumentosService.ts — os documentos do fechamento: anexar, listar, excluir, histórico, dispensas ───────────────────────────────────────────────────────────────
//
// O banco é a trilha (migration 20261016150000): quem incluiu e quando vêm do BANCO (não da tela); excluir marca o arquivo como removido, com motivo (nunca apaga a linha); o mesmo arquivo
// (mesmo hash) não entra duas vezes no mês. Aqui fica o que o navegador faz: calcular o hash, mandar o arquivo ao bucket privado `fin-fechamento-docs` e gravar a linha — nessa ordem, e
// desfazendo o arquivo se a linha falhar, para não sobrar arquivo órfão. Sem a migration, `documentosDoFechamentoDisponivel()` devolve false e a seção da tela não aparece.
import { supabase } from "@/integrations/supabase/client";
import { conferir } from "@/lib/escritaConferida";
import { calcularHashArquivo } from "@/lib/importacaoArquivos";
import {
  BUCKET_DOCUMENTOS_DO_FECHAMENTO, caminhoNoStorage, problemaDoArquivo,
  type DocumentoDoPacote, type GrupoDoChecklist, type TipoDeDocumento,
} from "@/lib/fechamentoDocumentos";

type Linha = Record<string, unknown>;
const txt = (v: unknown): string | null => (v == null ? null : String(v));

export interface DocumentoDoFechamento {
  id: string;
  ano: number;
  mes: number;
  tipo: TipoDeDocumento;
  contaId: string | null;
  descricao: string | null;
  arquivoNome: string;
  storagePath: string;
  mimeType: string | null;
  tamanhoBytes: number;
  hash: string;
  incluidoEm: string;
  incluidoPorNome: string | null;
  removidoEm: string | null;
  removidoPorNome: string | null;
  removidoMotivo: string | null;
}

export interface DispensaDoFechamento {
  id: string;
  ano: number;
  mes: number;
  grupo: GrupoDoChecklist;
  motivo: string;
  criadoEm: string;
  criadoPorNome: string | null;
  desfeitaEm: string | null;
  desfeitaPorNome: string | null;
}

const paraDocumento = (r: Linha): DocumentoDoFechamento => ({
  id: String(r.id), ano: Number(r.ano), mes: Number(r.mes), tipo: String(r.tipo) as TipoDeDocumento, contaId: txt(r.conta_id), descricao: txt(r.descricao),
  arquivoNome: String(r.arquivo_nome), storagePath: String(r.storage_path), mimeType: txt(r.mime_type), tamanhoBytes: Number(r.tamanho_bytes), hash: String(r.arquivo_hash),
  incluidoEm: String(r.incluido_em), incluidoPorNome: txt(r.incluido_por_nome), removidoEm: txt(r.removido_em), removidoPorNome: txt(r.removido_por_nome), removidoMotivo: txt(r.removido_motivo),
});
const paraDispensa = (r: Linha): DispensaDoFechamento => ({
  id: String(r.id), ano: Number(r.ano), mes: Number(r.mes), grupo: String(r.grupo) as GrupoDoChecklist, motivo: String(r.motivo), criadoEm: String(r.criado_em),
  criadoPorNome: txt(r.criado_por_nome), desfeitaEm: txt(r.desfeita_em), desfeitaPorNome: txt(r.desfeita_por_nome),
});

let sondagem: { em: number; ok: boolean } | null = null;
/** `true` quando a migration 20261016150000 está no banco. Sondagem guardada por 30 s; a sonda é só uma leitura de uma linha. */
export async function documentosDoFechamentoDisponivel(): Promise<boolean> {
  if (sondagem && Date.now() - sondagem.em < 30_000) return sondagem.ok;
  const { error } = await supabase.from("fin_fechamento_documentos" as never).select("id").limit(1);
  sondagem = { em: Date.now(), ok: !error };
  return sondagem.ok;
}

/** Os documentos do mês, do mais recente ao mais antigo. Por padrão só os ativos; com `incluirRemovidos`, o histórico inteiro (quem tirou, quando e por quê). */
export async function listarDocumentosDoFechamento(ano: number, mes: number, incluirRemovidos = false): Promise<DocumentoDoFechamento[]> {
  let q = supabase.from("fin_fechamento_documentos" as never).select("*").eq("ano" as never, ano as never).eq("mes" as never, mes as never).order("incluido_em" as never, { ascending: false } as never);
  if (!incluirRemovidos) q = q.is("removido_em" as never, null as never);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Linha[]).map(paraDocumento);
}

export interface PedidoDeAnexo { ano: number; mes: number; tipo: TipoDeDocumento; contaId: string | null; descricao: string | null; arquivo: File }

/** Anexa o arquivo ao mês. Recusa (em português) formato/tamanho inválido e o mesmo arquivo repetido no mês. Devolve o id do documento. */
export async function anexarDocumentoDoFechamento(p: PedidoDeAnexo): Promise<string> {
  const problema = problemaDoArquivo(p.arquivo);
  if (problema) throw new Error(problema);
  const buffer = await p.arquivo.arrayBuffer();
  const hash = await calcularHashArquivo(buffer);
  // checagem antecipada (o banco é quem garante, pelo índice único): avisa antes de subir o arquivo
  const repetido = (await supabase.from("fin_fechamento_documentos" as never).select("arquivo_nome, tipo").eq("ano" as never, p.ano as never).eq("mes" as never, p.mes as never)
    .eq("arquivo_hash" as never, hash as never).is("removido_em" as never, null as never).maybeSingle()) as unknown as { data: Linha | null };
  if (repetido.data) throw new Error(`Este mesmo arquivo já está anexado em ${String(p.mes).padStart(2, "0")}/${p.ano} (${String(repetido.data.arquivo_nome)}).`);

  const id = crypto.randomUUID();
  const caminho = caminhoNoStorage(p.ano, p.mes, id, p.arquivo.name);
  const subiu = await supabase.storage.from(BUCKET_DOCUMENTOS_DO_FECHAMENTO).upload(caminho, p.arquivo, { upsert: false, contentType: p.arquivo.type || "application/octet-stream" });
  if (subiu.error) throw new Error(`Não consegui enviar o arquivo: ${subiu.error.message}`);
  const gravou = await supabase.from("fin_fechamento_documentos" as never).insert({
    id, ano: p.ano, mes: p.mes, tipo: p.tipo, conta_id: p.contaId, descricao: p.descricao?.trim() || null, arquivo_nome: p.arquivo.name, storage_path: caminho,
    mime_type: p.arquivo.type || null, tamanho_bytes: p.arquivo.size, arquivo_hash: hash,
  } as never).select("id").single();
  if (gravou.error) {
    await supabase.storage.from(BUCKET_DOCUMENTOS_DO_FECHAMENTO).remove([caminho]);   // não deixa arquivo órfão
    if (/duplicate|unique/i.test(gravou.error.message)) throw new Error("Este mesmo arquivo já está anexado neste mês.");
    throw new Error(gravou.error.message);
  }
  return id;
}

/** Exclui o documento: fica no histórico como removido (motivo, quem e quando) e o arquivo sai do armazenamento. */
export async function removerDocumentoDoFechamento(doc: Pick<DocumentoDoFechamento, "id" | "storagePath">, motivo: string): Promise<void> {
  if (motivo.trim().length < 5) throw new Error("Informe o motivo da exclusão (pelo menos 5 caracteres).");
  const r = conferir(
    await supabase.from("fin_fechamento_documentos" as never).update({ removido_em: new Date().toISOString(), removido_motivo: motivo.trim() } as never).eq("id" as never, doc.id as never).is("removido_em" as never, null as never).select("id" as never),
    "A exclusão do documento",
  );
  if (!r.ok) throw new Error(r.erro);
  // o histórico já está salvo; se o arquivo não sair do armazenamento, não é motivo para desfazer a exclusão
  await supabase.storage.from(BUCKET_DOCUMENTOS_DO_FECHAMENTO).remove([doc.storagePath]).catch(() => undefined);
}

/** Um link temporário (10 min) para abrir o arquivo. */
export async function urlDoDocumentoDoFechamento(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET_DOCUMENTOS_DO_FECHAMENTO).createSignedUrl(storagePath, 600);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? "Não consegui abrir o arquivo.");
  return data.signedUrl;
}

/** Os bytes do arquivo (para o pacote contábil). */
export async function baixarBytesDoDocumento(storagePath: string): Promise<Uint8Array> {
  const { data, error } = await supabase.storage.from(BUCKET_DOCUMENTOS_DO_FECHAMENTO).download(storagePath);
  if (error || !data) throw new Error(error?.message ?? "arquivo vazio");
  return new Uint8Array(await data.arrayBuffer());
}

// ── "não se aplica neste mês" ──────────────────────────────────────────────────────────────────────

export async function listarDispensasDoFechamento(ano: number, mes: number): Promise<DispensaDoFechamento[]> {
  const { data, error } = await supabase.from("fin_fechamento_docs_dispensas" as never).select("*").eq("ano" as never, ano as never).eq("mes" as never, mes as never).order("criado_em" as never, { ascending: false } as never);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Linha[]).map(paraDispensa);
}

export async function dispensarItemDoChecklist(ano: number, mes: number, grupo: GrupoDoChecklist, motivo: string): Promise<void> {
  if (motivo.trim().length < 5) throw new Error("Diga por que não se aplica (pelo menos 5 caracteres).");
  const { error } = await supabase.from("fin_fechamento_docs_dispensas" as never).insert({ ano, mes, grupo, motivo: motivo.trim() } as never);
  if (error) throw new Error(/duplicate|unique/i.test(error.message) ? "Este item já está dispensado neste mês." : error.message);
}

export async function desfazerDispensa(id: string): Promise<void> {
  const r = conferir(
    await supabase.from("fin_fechamento_docs_dispensas" as never).update({ desfeita_em: new Date().toISOString() } as never).eq("id" as never, id as never).is("desfeita_em" as never, null as never).select("id" as never),
    "A dispensa",
  );
  if (!r.ok) throw new Error(r.erro);
}

/**
 * Os documentos do mês no formato do pacote contábil, com o nome da conta resolvido. Com `contaId` (pacote de uma conta só) entram os dessa conta e os que não são de conta nenhuma.
 * Sem a migration, ou se a leitura falhar, devolve vazio: o malote de despesas nunca deixa de sair por causa disto.
 */
export async function documentosParaOPacote(ano: number, mes: number, contaId?: string): Promise<DocumentoDoPacote[]> {
  try {
    if (!(await documentosDoFechamentoDisponivel())) return [];
    const docs = (await listarDocumentosDoFechamento(ano, mes)).filter(d => !contaId || !d.contaId || d.contaId === contaId);
    const ids = [...new Set(docs.map(d => d.contaId).filter((x): x is string => !!x))];
    const nomes = new Map<string, string>();
    if (ids.length) {
      const { data } = await supabase.from("fin_contas").select("id, nome").in("id", ids);
      for (const c of (data ?? []) as { id: string; nome: string }[]) nomes.set(c.id, c.nome);
    }
    return docs.slice().sort((a, b) => a.incluidoEm.localeCompare(b.incluidoEm)).map(d => ({
      id: d.id, tipo: d.tipo, arquivoNome: d.arquivoNome, storagePath: d.storagePath, descricao: d.descricao, contaNome: d.contaId ? nomes.get(d.contaId) ?? null : null,
      tamanhoBytes: d.tamanhoBytes, incluidoEm: d.incluidoEm, incluidoPorNome: d.incluidoPorNome,
    }));
  } catch { return []; }
}

/** Tudo o que o checklist e o pacote precisam do mês, numa chamada (documentos ativos + dispensas). Sem a migration: `null`. */
export async function documentosEDispensasDoMes(ano: number, mes: number): Promise<{ documentos: DocumentoDoFechamento[]; dispensas: DispensaDoFechamento[] } | null> {
  if (!(await documentosDoFechamentoDisponivel())) return null;
  const [documentos, dispensas] = await Promise.all([listarDocumentosDoFechamento(ano, mes), listarDispensasDoFechamento(ano, mes)]);
  return { documentos, dispensas };
}
