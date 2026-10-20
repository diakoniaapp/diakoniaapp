// ─── envioDePagamentosService — junta o que o sistema já sabe de cada obrigação (documento lido, Pix do favorecido) para o "Preparar envio" ──────────────────────────────────────────────
// Nada é gravado. Reaproveita `dadosParaPagarDoLancamento` (a leitura que a tela Pagar já mostra: linha digitável e Pix do documento, valor e vencimento impressos) e a chave Pix do favorecido
// (`montarPayloadPix`). Destinatários vêm do Cadastro de Pessoas (e-mail de cada uma); a lista e o texto-modelo ficam no navegador de quem envia.
import { supabase } from "@/integrations/supabase/client";
import { anexoSignedUrl, buscarFornecedor, listarAnexos, nomeExtrato, type FinVencimento } from "@/services/finService";
import { dadosParaPagarDoLancamento } from "@/services/documentoPagamentoService";
import { montarPayloadPix } from "@/lib/pix";
import { bancoDaLinha, montarItemDeEnvio, nomeDeArquivoSeguro, nomeDaPasta, type ItemDeEnvio } from "@/lib/envioDePagamentos";

const TIPOS_DE_DOCUMENTO = ["boleto", "guia", "fatura", "outro", "documento"];
const EM_PARALELO = 4;

/** Roda `fn` sobre a lista, no máximo `n` por vez, avisando o progresso. */
async function emParalelo<T, R>(xs: T[], n: number, fn: (x: T) => Promise<R>, aoAndar?: (feitos: number) => void): Promise<R[]> {
  const saida: R[] = new Array(xs.length);
  let proximo = 0, feitos = 0;
  await Promise.all(Array.from({ length: Math.min(n, xs.length) }, async () => {
    while (proximo < xs.length) {
      const i = proximo++;
      saida[i] = await fn(xs[i]);
      aoAndar?.(++feitos);
    }
  }));
  return saida;
}

/** O melhor meio de pagamento de uma obrigação: linha digitável do documento; senão Pix (do documento ou da chave do favorecido). */
async function lerItem(v: FinVencimento, valor: number, fornecedores: Map<string, Promise<Awaited<ReturnType<typeof buscarFornecedor>>>>): Promise<ItemDeEnvio> {
  const { principal } = nomeExtrato(v);
  const base = {
    id: v.id, fornecedor: v.fornecedor_nome || principal, descricao: v.descricao, categoria: v.categoria_nome, centro: v.centro_custo_nome,
    valor, vencimento: String(v.data).slice(0, 10), diasParaVencer: v.dias_para_vencer,
  };
  let docs: Awaited<ReturnType<typeof dadosParaPagarDoLancamento>> = [];
  try { docs = await dadosParaPagarDoLancamento(v.id); } catch { /* um documento ilegível não derruba o painel: o item vira "sem dado automático" */ }
  const comLinha = docs.find(d => d.linhaDigitavel);
  const comPix = docs.find(d => d.pix);
  const doc = comLinha ?? comPix ?? docs[0] ?? null;

  let pix = comLinha ? null : comPix?.pix?.payload ?? null;
  // sem Pix no documento: a chave Pix do favorecido (com o valor da obrigação), se houver
  if (!comLinha && !pix && v.fornecedor_id) {
    try {
      if (!fornecedores.has(v.fornecedor_id)) fornecedores.set(v.fornecedor_id, buscarFornecedor(v.fornecedor_id));
      const f = await fornecedores.get(v.fornecedor_id)!;
      if (f?.chave_pix) pix = montarPayloadPix({ chave: f.chave_pix, tipoChave: f.tipo_chave_pix, nomeRecebedor: f.nome, valor });
    } catch { /* chave inválida: sem Pix */ }
  }
  return montarItemDeEnvio(base, {
    linha: comLinha?.linhaDigitavel ?? null, pix,
    valorDoDocumento: doc?.valor ?? null, vencimentoDoDocumento: doc?.vencimento ? String(doc.vencimento).slice(0, 10) : null,
    codigoValido: comLinha?.codigoValido ?? null,
  });
}

/** Lê todas as obrigações candidatas (poucas por vez; a leitura guardada é rápida, o PDF antigo lido na hora demora ~1 s). */
export async function carregarItensDeEnvio(
  candidatas: { v: FinVencimento; valor: number }[], aoAndar?: (feitos: number, total: number) => void,
): Promise<ItemDeEnvio[]> {
  const fornecedores = new Map<string, Promise<Awaited<ReturnType<typeof buscarFornecedor>>>>();
  return emParalelo(candidatas, EM_PARALELO, c => lerItem(c.v, c.valor, fornecedores), n => aoAndar?.(n, candidatas.length));
}

// ── destinatários ───────────────────────────────────────────────────────────

export interface Destinatario { nome: string; email: string }

/** Pessoas do cadastro com e-mail, pelo nome. */
export async function buscarPessoasComEmail(termo: string): Promise<Destinatario[]> {
  const t = termo.trim().replace(/[%,()]/g, " ");
  if (t.length < 2) return [];
  const { data, error } = await supabase.from("membros").select("nome_completo, email")
    .ilike("nome_completo", `%${t}%`).not("email", "is", null).neq("email", "").order("nome_completo").limit(8);
  if (error) throw new Error(error.message);
  return (data ?? []).map(m => ({ nome: String(m.nome_completo), email: String(m.email).trim() }));
}

// ── preferências (no navegador de quem envia) ───────────────────────────────

export interface PreferenciasDoEnvio { destinatarios: Destinatario[]; saudacao: string | null; introducao: string | null; incluirResumo: boolean; citarSemLinha: boolean }
const CHAVE = "diakonia:envio-de-pagamentos";

export function lerPreferencias(): PreferenciasDoEnvio {
  try {
    const p = JSON.parse(localStorage.getItem(CHAVE) ?? "null") as Partial<PreferenciasDoEnvio> | null;
    return {
      destinatarios: Array.isArray(p?.destinatarios) ? p!.destinatarios.filter(d => d && typeof d.email === "string") : [],
      saudacao: typeof p?.saudacao === "string" ? p.saudacao : null, introducao: typeof p?.introducao === "string" ? p.introducao : null,
      incluirResumo: p?.incluirResumo ?? true, citarSemLinha: p?.citarSemLinha ?? true,
    };
  } catch { return { destinatarios: [], saudacao: null, introducao: null, incluirResumo: true, citarSemLinha: true }; }
}
export function guardarPreferencias(p: PreferenciasDoEnvio): void {
  try { localStorage.setItem(CHAVE, JSON.stringify(p)); } catch { /* navegador sem armazenamento: só não lembra */ }
}

// ── ZIP dos boletos (para a pasta do Drive) ─────────────────────────────────

const extensao = (nome: string | null, url: string) => (/\.([a-z0-9]{2,4})$/i.exec(nome ?? url)?.[1] ?? "pdf").toLowerCase();

/** Baixa os documentos de pagamento dos itens e entrega um ZIP "13.OUT" com uma pasta de mesmo nome. Devolve quantos arquivos entraram e quais itens ficaram sem documento. */
export async function baixarBoletos(itens: ItemDeEnvio[], hojeYmd: string, aoAndar?: (feitos: number, total: number) => void): Promise<{ arquivos: number; semDocumento: string[] }> {
  const JSZip = (await import("jszip")).default;
  const { saveAs } = await import("file-saver");
  const pasta = nomeDaPasta(hojeYmd);
  const zip = new JSZip();
  const raiz = zip.folder(pasta)!;
  const semDocumento: string[] = [];
  let arquivos = 0;

  await emParalelo(itens.map((i, n) => ({ i, n })), EM_PARALELO, async ({ i, n }) => {
    const anexos = (await listarAnexos(i.id).catch(() => [])).filter(a => TIPOS_DE_DOCUMENTO.includes(a.tipo));
    if (anexos.length === 0) { semDocumento.push(i.fornecedor); return; }
    const prefixo = `${String(n + 1).padStart(2, "0")} ${[bancoDaLinha(i.linha), i.fornecedor, i.valor.toFixed(2).replace(".", ",")].filter(Boolean).join(" - ")}`;
    for (const [k, a] of anexos.entries()) {
      try {
        const url = await anexoSignedUrl(a.url);
        if (!url) continue;
        const blob = await (await fetch(url)).blob();
        raiz.file(`${nomeDeArquivoSeguro(prefixo)}${anexos.length > 1 ? ` (${k + 1})` : ""}.${extensao(a.nome, a.url)}`, blob);
        arquivos++;
      } catch { /* um arquivo que não baixa não impede os outros */ }
    }
  }, f => aoAndar?.(f, itens.length));

  if (arquivos > 0) saveAs(await zip.generateAsync({ type: "blob" }), `${pasta}.zip`);
  return { arquivos, semDocumento };
}
