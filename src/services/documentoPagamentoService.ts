// ─── documentoPagamentoService.ts — ler o documento, sugerir e APRENDER ──────────────────────────────────
//
// "Central de Pagamentos inteligente" (pedido dela, 06/10/2026): ao anexar boleto, guia (DARF/GPS/FGTS/ISS…),
// fatura ou Pix, o sistema LÊ o arquivo, sugere fornecedor/categoria/centro e aprende com a correção.
//   · LER      — `lib/documentos/pagamento.ts` (pura). Aqui só se obtém o TEXTO: PDF com camada de texto =
//                exato; escaneado/foto = OCR (aproximado, a tela avisa);
//   · SUGERIR  — `lib/documentos/sugestaoPagamento.ts` (pura), com a base aqui carregada;
//   · APRENDER — `fin_documento_conhecimento` (migration 20261006160000): uma linha por CNPJ/convênio/tipo de
//                guia/beneficiário com o que ela escolheu. A correção vence a sugestão.
// Sem a migration, nada quebra: lê e sugere (fornecedor pelo CNPJ e padrão pelo tipo); só não grava a leitura
// no anexo nem aprende — e devolve `indisponivel` para a tela avisar.

import { supabase } from "@/integrations/supabase/client";
import { conferir } from "@/lib/escritaConferida";
import { anexoSignedUrl, atualizarLancamento } from "@/services/finService";
import { extrairDadosDoComprovante, textoDoPdf } from "@/services/ocrService";
import { dadosParaGuardar, lerDocumentoDePagamento, type DocumentoDePagamento } from "@/lib/documentos/pagamento";
import {
  aprendizadoDaEscolha, sugerirClassificacao,
  type BaseDeSugestao, type ConhecimentoBase, type Escolha, type Sugestao,
} from "@/lib/documentos/sugestaoPagamento";

export const RECADO_MIGRATION_DE_DOCUMENTOS =
  "Falta aplicar a migration 20261006160000 no banco para guardar a leitura e aprender com as suas correções.";

// ── sondagem: o app funciona antes da migration ─────────────────────────────
const sondagem = new Map<string, boolean>();
async function existe(tabela: string, coluna: string): Promise<boolean> {
  const chave = `${tabela}.${coluna}`;
  const guardado = sondagem.get(chave);
  if (guardado !== undefined) return guardado;
  const { error } = await supabase.from(tabela as never).select(coluna).limit(1);
  sondagem.set(chave, !error);
  return !error;
}
/** Esquece a sondagem (depois de ela aplicar a migration, sem recarregar a página). */
export function esquecerSondagemDeDocumentos() { sondagem.clear(); }

// ── ler ─────────────────────────────────────────────────────────────────────

export interface LeituraDoArquivo {
  documento: DocumentoDePagamento;
  /** "pdf_texto" = texto exato do PDF; "ocr" = Tesseract (aproximado: conferir sempre). */
  fonte: "pdf_texto" | "ocr";
  /** Só no OCR: 0–100. */
  confiancaDoOcr: number | null;
}

/** Dá para tratar como documento de pagamento? (evita mostrar painel para uma nota de compra qualquer). */
export function pareceDocumentoDePagamento(d: DocumentoDePagamento): boolean {
  return d.tipo !== "desconhecido" || d.linhaDigitavel !== null || d.pix !== null || (d.valor !== null && d.vencimento !== null);
}

/** `null` para arquivo que não se lê (XML). Erros de leitura sobem para a tela mostrar. */
export async function lerArquivoDePagamento(file: File): Promise<LeituraDoArquivo | null> {
  const nome = file.name.toLowerCase();
  const legivel = file.type === "application/pdf" || file.type.startsWith("image/") || /\.(pdf|png|jpe?g)$/.test(nome);
  if (!legivel) return null;
  const r = await extrairDadosDoComprovante(file); // PDF: texto exato primeiro; só vai a OCR se não houver
  return {
    documento: lerDocumentoDePagamento(r.textoBruto),
    fonte: r.fonte,
    confiancaDoOcr: r.fonte === "ocr" ? r.confianca : null,
  };
}

// ── a base da sugestão ──────────────────────────────────────────────────────

const PAGINA = 1000;
let baseEmCache: { em: number; base: BaseDeSugestao } | null = null;
const VALIDADE_MS = 60_000;

async function paginar<T>(consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const todos: T[] = [];
  for (let p = 0; ; p++) {
    const { data, error } = await consulta(p * PAGINA, p * PAGINA + PAGINA - 1);
    if (error) throw new Error(error.message);
    todos.push(...(data ?? []));
    if (!data || data.length < PAGINA) break;
  }
  return todos;
}

export async function carregarBaseDeSugestao(forcar = false): Promise<BaseDeSugestao> {
  if (!forcar && baseEmCache && Date.now() - baseEmCache.em < VALIDADE_MS) return baseEmCache.base;
  const temMemoria = await existe("fin_documento_conhecimento", "id");
  const [fornecedores, categorias, conhecimento] = await Promise.all([
    paginar(async (de, ate) => supabase.from("fin_fornecedores")
      .select("id, nome, cnpj_cpf, categoria_padrao_id, centro_custo_padrao_id").order("id").range(de, ate)),
    paginar(async (de, ate) => supabase.from("fin_categorias")
      .select("id, nome, tipo, centro_custo_padrao_id").eq("ativo", true).order("id").range(de, ate)),
    temMemoria
      ? paginar(async (de, ate) => supabase.from("fin_documento_conhecimento")
          .select("chave_tipo, chave, fornecedor_id, categoria_id, centro_custo_id, projeto_id, usos").order("id").range(de, ate))
      : Promise.resolve([] as unknown[]),
  ]);
  const base: BaseDeSugestao = {
    fornecedores: fornecedores as BaseDeSugestao["fornecedores"],
    categorias: categorias as BaseDeSugestao["categorias"],
    conhecimento: conhecimento as ConhecimentoBase[],
  };
  baseEmCache = { em: Date.now(), base };
  return base;
}

export async function sugerirParaDocumento(documento: DocumentoDePagamento): Promise<Sugestao> {
  return sugerirClassificacao(documento, await carregarBaseDeSugestao());
}

// ── aprender ────────────────────────────────────────────────────────────────

export interface ResultadoDoAprendizado { gravados: number; indisponivel: boolean }

/**
 * Grava o que ela ESCOLHEU para este documento, uma linha por chave (CNPJ, convênio, guia, beneficiário).
 * Mesma escolha de novo → `usos` + 1; escolha diferente → substitui e recomeça em 1 (a correção vence).
 */
export async function aprenderComEscolha(documento: DocumentoDePagamento, escolha: Escolha): Promise<ResultadoDoAprendizado> {
  const linhas = aprendizadoDaEscolha(documento, escolha);
  if (linhas.length === 0) return { gravados: 0, indisponivel: false };
  if (!(await existe("fin_documento_conhecimento", "id"))) return { gravados: 0, indisponivel: true };

  const { data: atuais, error } = await supabase.from("fin_documento_conhecimento")
    .select("chave_tipo, chave, fornecedor_id, categoria_id, centro_custo_id, projeto_id, usos")
    .in("chave", linhas.map(l => l.chave));
  if (error) throw new Error(error.message);
  const porChave = new Map((atuais ?? []).map(a => [`${a.chave_tipo}|${a.chave}`, a]));
  const { data: { user } } = await supabase.auth.getUser();

  const registros = linhas.map(l => {
    const a = porChave.get(`${l.tipo}|${l.chave}`);
    const igual = !!a && a.fornecedor_id === l.fornecedorId && a.categoria_id === l.categoriaId
      && a.centro_custo_id === l.centroId && a.projeto_id === l.projetoId;
    return {
      chave_tipo: l.tipo, chave: l.chave,
      fornecedor_id: l.fornecedorId, categoria_id: l.categoriaId, centro_custo_id: l.centroId, projeto_id: l.projetoId,
      usos: igual ? a!.usos + 1 : 1,
      atualizado_em: new Date().toISOString(), atualizado_por: user?.id ?? null,
    };
  });
  const r = conferir(
    await supabase.from("fin_documento_conhecimento").upsert(registros, { onConflict: "chave_tipo,chave" }).select("id"),
    "O aprendizado do documento",
  );
  if (!r.ok) throw new Error(r.erro);
  baseEmCache = null; // a próxima sugestão já enxerga o que acabou de ser ensinado
  return { gravados: registros.length, indisponivel: false };
}

// ── o lançamento ao qual o documento está sendo anexado ─────────────────────

export interface LancamentoLido {
  id: string;
  valor: number;
  /** `AAAA-MM-DD` — para uma conta a pagar, o vencimento. */
  data: string;
  status: string;
  fornecedor_id: string | null;
  categoria_id: string | null;
  centro_custo_id: string | null;
  projeto_id: string | null;
}

export async function buscarLancamentoParaLeitura(id: string): Promise<LancamentoLido | null> {
  const { data, error } = await supabase.from("fin_lancamentos")
    .select("id, valor, data, status, fornecedor_id, categoria_id, centro_custo_id, projeto_id").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { ...data, valor: Number(data.valor), status: String(data.status) } : null;
}

/** Lançamento que já saiu do caixa: valor e vencimento não se mexem (a tela só mostra a comparação). */
export const lancamentoJaPago = (l: LancamentoLido) => l.status === "realizado" || l.status === "conciliado";

/** Corrige o valor e/ou o vencimento do lançamento com o que está IMPRESSO no documento. */
export async function corrigirLancamentoPeloDocumento(id: string, patch: { valor?: number; data?: string }): Promise<void> {
  await atualizarLancamento(id, patch);
}

/** Preenche só o que o lançamento ainda não tem — nunca troca o que a tesouraria já escolheu. */
export async function preencherClassificacaoVazia(l: LancamentoLido, s: Sugestao): Promise<number> {
  const patch: { fornecedor_id?: string; categoria_id?: string; centro_custo_id?: string } = {};
  if (!l.fornecedor_id && s.fornecedorId) patch.fornecedor_id = s.fornecedorId;
  if (!l.categoria_id && s.categoriaId) patch.categoria_id = s.categoriaId;
  if (!l.centro_custo_id && s.centroId) patch.centro_custo_id = s.centroId;
  const n = Object.keys(patch).length;
  if (n === 0) return 0;
  await atualizarLancamento(l.id, patch);
  return n;
}

/** O tipo de anexo que o documento lido indica; `null` = não sugere (Pix solto, nota…). */
export function tipoDeAnexoSugerido(d: DocumentoDePagamento): "boleto" | "guia" | "fatura" | null {
  return d.tipo === "boleto" || d.tipo === "guia" || d.tipo === "fatura" ? d.tipo : null;
}

// ── o que PAGAR: dados dos documentos já anexados ao lançamento ─────────────

export interface DadosParaPagar {
  anexoId: string;
  nomeDoArquivo: string | null;
  rotulo: string;
  valor: number | null;
  vencimento: string | null;
  beneficiario: string | null;
  linhaDigitavel: string | null;
  codigoBarras: string | null;
  codigoValido: boolean | null;
  pix: { payload: string; nome: string | null; crcValido: boolean } | null;
  /** "guardado" = veio de `dados_extraidos`; "lido agora" = leu o PDF neste instante (anexo anterior à migration). */
  origem: "guardado" | "lido agora";
}

const TIPOS_QUE_SE_PAGAM = ["boleto", "guia", "fatura", "outro", "documento"];
const MAX_DOCUMENTOS = 3;

function dadosDeDocumento(anexo: { id: string; nome: string | null }, d: DocumentoDePagamento, origem: DadosParaPagar["origem"]): DadosParaPagar {
  return {
    anexoId: anexo.id, nomeDoArquivo: anexo.nome, rotulo: d.rotulo, valor: d.valor, vencimento: d.vencimento,
    beneficiario: d.beneficiario, linhaDigitavel: d.linhaDigitavel, codigoBarras: d.codigoBarras, codigoValido: d.codigoValido,
    pix: d.pix ? { payload: d.pix.payload, nome: d.pix.nomeRecebedor, crcValido: d.pix.crcValido } : null, origem,
  };
}

/** `dados_extraidos` (versão 1) → o que a tela do Pagar mostra. */
function dadosDeGuardado(anexo: { id: string; nome: string | null }, g: Record<string, any>): DadosParaPagar | null {
  if (!g || g.versao !== 1) return null;
  return {
    anexoId: anexo.id, nomeDoArquivo: anexo.nome, rotulo: String(g.rotulo ?? "Documento"), valor: g.valor ?? null,
    vencimento: g.vencimento ?? null, beneficiario: g.beneficiario ?? null, linhaDigitavel: g.linhaDigitavel ?? null,
    codigoBarras: g.codigoBarras ?? null, codigoValido: g.codigoValido ?? null,
    pix: g.pix?.payload ? { payload: g.pix.payload, nome: g.pix.nome ?? null, crcValido: !!g.pix.crcValido } : null, origem: "guardado",
  };
}

/**
 * O que está IMPRESSO nos documentos anexados ao lançamento — para pagar sem abrir o PDF: linha digitável,
 * Pix copia e cola do próprio boleto, valor e vencimento (e conferir com o lançamento ANTES de pagar).
 * Usa a leitura guardada; anexo antigo (sem leitura) é lido agora, SÓ quando o PDF tem texto exato
 * (nunca OCR aqui: demora e erra dígito) — e a leitura é guardada para a próxima vez, se a migration existe.
 */
export async function dadosParaPagarDoLancamento(lancamentoId: string): Promise<DadosParaPagar[]> {
  const temColuna = await existe("fin_lancamento_anexos", "dados_extraidos");
  const { data, error } = await supabase.from("fin_lancamento_anexos")
    .select(temColuna ? "id, tipo, nome, url, dados_extraidos" : "id, tipo, nome, url")
    .eq("lancamento_id", lancamentoId).in("tipo", TIPOS_QUE_SE_PAGAM).order("enviado_em", { ascending: false });
  if (error) throw new Error(error.message);

  const saida: DadosParaPagar[] = [];
  for (const a of ((data ?? []) as unknown as { id: string; tipo: string; nome: string | null; url: string; dados_extraidos?: Record<string, any> | null }[])) {
    if (saida.length >= MAX_DOCUMENTOS) break;
    const guardado = a.dados_extraidos ? dadosDeGuardado(a, a.dados_extraidos) : null;
    if (guardado) { saida.push(guardado); continue; }
    if (!/\.pdf$/i.test(a.nome ?? a.url)) continue;
    try {
      const url = await anexoSignedUrl(a.url);
      if (!url) continue;
      const blob = await (await fetch(url)).blob();
      const texto = await textoDoPdf(new File([blob], a.nome ?? "documento.pdf", { type: "application/pdf" }));
      if (!texto) continue; // escaneado: sem OCR aqui
      const doc = lerDocumentoDePagamento(texto);
      if (!pareceDocumentoDePagamento(doc)) continue;
      saida.push(dadosDeDocumento(a, doc, "lido agora"));
      if (temColuna) void guardarLeituraNoAnexo(a.id, doc).catch(() => { /* melhoria: não atrapalha o pagamento */ });
    } catch { /* um arquivo ilegível não impede os outros nem o pagamento */ }
  }
  return saida;
}

// ── guardar a leitura no anexo ──────────────────────────────────────────────

/** `false` quando a coluna ainda não existe (migration não aplicada) — a tela só avisa. */
export async function guardarLeituraNoAnexo(anexoId: string, documento: DocumentoDePagamento): Promise<boolean> {
  if (!(await existe("fin_lancamento_anexos", "dados_extraidos"))) return false;
  const r = conferir(
    await supabase.from("fin_lancamento_anexos")
      .update({ dados_extraidos: dadosParaGuardar(documento) as never })
      .eq("id", anexoId).select("id"),
    "A leitura do documento",
  );
  if (!r.ok) throw new Error(r.erro);
  return true;
}
