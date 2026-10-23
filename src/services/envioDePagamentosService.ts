// ─── envioDePagamentosService — junta o que o sistema já sabe de cada obrigação (documento lido, Pix do favorecido) para o "Preparar envio" ──────────────────────────────────────────────
// Nada é gravado. Reaproveita `dadosParaPagarDoLancamento` (a leitura que a tela Pagar já mostra: linha digitável e Pix do documento, valor e vencimento impressos) e a chave Pix do favorecido
// (`montarPayloadPix`). Ordem do meio de pagamento (a que ela aprovou em 20/10/2026): 1 linha digitável do documento · 2 Pix do documento · 3 Pix do cadastro do favorecido LIGADO à obrigação
// (vem marcado) · favorecido achado só pelo NOME (Pix do cadastro dele; vem desmarcado, "Confirmar favorecido"). Dados bancários e Pix secundário ficam para quando houver cadastro que justifique.
// Destinatários vêm do Cadastro de Pessoas (e-mail de cada uma); a lista e o texto-modelo ficam no navegador de quem envia.
import { supabase } from "@/integrations/supabase/client";
import { anexoSignedUrl, buscarFornecedor, listarFornecedores, nomeExtrato, type FinFornecedor, type FinLancamentoAnexo, type FinVencimento } from "@/services/finService";
import { dadosParaPagarDoLancamento } from "@/services/documentoPagamentoService";
import { montarPayloadPix } from "@/lib/pix";
import { fornecedorPeloNome } from "@/lib/favorecidoPorNome";
import { leiaMeDoPacote } from "@/lib/assinaturaDoSistema";
import { entraNoZip, montarItemDeEnvio, nomeDaPasta, nomeDoDocumentoNoZip, nomeDoZip, type ItemDeEnvio } from "@/lib/envioDePagamentos";
import { gerarResumoDoLotePdf } from "@/lib/resumoDoLotePdf";

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

// ── os documentos de cada obrigação (o dossiê que acompanha o envio) ─────────

/** Os anexos de várias obrigações numa consulta só (em lotes), já sem o que não acompanha o envio (comprovante, XML, provas de quitação por terceiros). */
export async function anexosDasObrigacoes(ids: string[]): Promise<Map<string, FinLancamentoAnexo[]>> {
  const mapa = new Map<string, FinLancamentoAnexo[]>();
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await supabase.from("fin_lancamento_anexos").select("*").in("lancamento_id", ids.slice(i, i + 150)).order("enviado_em", { ascending: true });
    if (error) throw new Error(error.message);
    for (const a of (data ?? []) as unknown as FinLancamentoAnexo[]) {
      if (!entraNoZip(a.tipo)) continue;
      if (!mapa.has(a.lancamento_id)) mapa.set(a.lancamento_id, []);
      mapa.get(a.lancamento_id)!.push(a);
    }
  }
  return mapa;
}

// ── a leitura de cada obrigação ──────────────────────────────────────────────

interface Contexto {
  fornecedores: Map<string, Promise<FinFornecedor | null>>;
  /** a lista de favorecidos ativos, lida só se alguma obrigação precisar do palpite pelo nome */
  lista: () => Promise<FinFornecedor[]>;
  documentos: Map<string, FinLancamentoAnexo[]>;
}

const temPix = (f: FinFornecedor | null | undefined): f is FinFornecedor & { chave_pix: string } => !!f && !!(f.chave_pix ?? "").trim();

/** O melhor meio de pagamento de uma obrigação, na ordem aprovada. */
async function lerItem(v: FinVencimento, valor: number, ctx: Contexto): Promise<ItemDeEnvio> {
  const { principal } = nomeExtrato(v);
  const base = {
    id: v.id, fornecedor: v.fornecedor_nome || principal, descricao: v.descricao, categoria: v.categoria_nome, centro: v.centro_custo_nome,
    valor, vencimento: String(v.data).slice(0, 10), diasParaVencer: v.dias_para_vencer,
  };
  let docs: Awaited<ReturnType<typeof dadosParaPagarDoLancamento>> = [];
  try { docs = await dadosParaPagarDoLancamento(v.id); } catch { /* um documento ilegível não derruba o painel: o item vira "sem meio automático" */ }
  const comLinha = docs.find(d => d.linhaDigitavel);
  const comPix = docs.find(d => d.pix);
  const doc = comLinha ?? comPix ?? docs[0] ?? null;

  let pix: string | null = comLinha ? null : comPix?.pix?.payload ?? null;
  let origemDoPix: "documento" | "cadastro" | "cadastro_por_nome" | null = pix ? "documento" : null;
  let favorecidoDoPix: string | null = null;

  if (!comLinha && !pix) {
    try {
      if (v.fornecedor_id) {
        // 3 · favorecido LIGADO à obrigação (vínculo direto)
        if (!ctx.fornecedores.has(v.fornecedor_id)) ctx.fornecedores.set(v.fornecedor_id, buscarFornecedor(v.fornecedor_id));
        const f = await ctx.fornecedores.get(v.fornecedor_id)!;
        if (temPix(f)) { pix = montarPayloadPix({ chave: f.chave_pix, tipoChave: f.tipo_chave_pix, nomeRecebedor: f.nome, valor }); origemDoPix = "cadastro"; favorecidoDoPix = f.nome; }
      } else {
        // sem vínculo: SÓ o palpite pelo nome, e só se UM cadastro bate — a pessoa precisa confirmar (nunca marcado, nunca automático)
        const f = fornecedorPeloNome(v.descricao, await ctx.lista());
        if (f && temPix(f as FinFornecedor)) {
          pix = montarPayloadPix({ chave: f.chave_pix!, tipoChave: f.tipo_chave_pix as FinFornecedor["tipo_chave_pix"], nomeRecebedor: f.nome, valor });
          origemDoPix = "cadastro_por_nome"; favorecidoDoPix = f.nome;
        }
      }
    } catch { /* chave inválida: sem Pix */ }
  }
  return montarItemDeEnvio(base, {
    linha: comLinha?.linhaDigitavel ?? null, linhaInformada: comLinha?.origem === "informada", pix, origemDoPix, favorecidoDoPix,
    documentos: ctx.documentos.get(v.id)?.length ?? 0,
    valorDoDocumento: doc?.valor ?? null, vencimentoDoDocumento: doc?.vencimento ? String(doc.vencimento).slice(0, 10) : null,
    codigoValido: comLinha?.codigoValido ?? null,
  });
}

/** Lê todas as obrigações candidatas (poucas por vez; a leitura guardada é rápida, o PDF antigo lido na hora demora ~1 s). */
export async function carregarItensDeEnvio(
  candidatas: { v: FinVencimento; valor: number }[], aoAndar?: (feitos: number, total: number) => void,
): Promise<ItemDeEnvio[]> {
  let lista: Promise<FinFornecedor[]> | null = null;
  const ctx: Contexto = {
    fornecedores: new Map(),
    lista: () => (lista ??= listarFornecedores()),
    documentos: await anexosDasObrigacoes(candidatas.map(c => c.v.id)).catch(() => new Map<string, FinLancamentoAnexo[]>()),
  };
  return emParalelo(candidatas, EM_PARALELO, c => lerItem(c.v, c.valor, ctx), n => aoAndar?.(n, candidatas.length));
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

export interface PreferenciasDoEnvio {
  destinatarios: Destinatario[]; saudacao: string | null; introducao: string | null; incluirResumo: boolean; citarSemLinha: boolean;
  /** "Copiar e abrir e-mail" e "WhatsApp" também baixam o ZIP (documentos + resumo) — uma operação só */
  baixarZipJunto: boolean;
}
const CHAVE = "diakonia:envio-de-pagamentos";
const PADRAO: PreferenciasDoEnvio = { destinatarios: [], saudacao: null, introducao: null, incluirResumo: true, citarSemLinha: true, baixarZipJunto: true };

export function lerPreferencias(): PreferenciasDoEnvio {
  try {
    const p = JSON.parse(localStorage.getItem(CHAVE) ?? "null") as Partial<PreferenciasDoEnvio> | null;
    return {
      destinatarios: Array.isArray(p?.destinatarios) ? p!.destinatarios.filter(d => d && typeof d.email === "string") : [],
      saudacao: typeof p?.saudacao === "string" ? p.saudacao : null, introducao: typeof p?.introducao === "string" ? p.introducao : null,
      incluirResumo: p?.incluirResumo ?? true, citarSemLinha: p?.citarSemLinha ?? true, baixarZipJunto: p?.baixarZipJunto ?? true,
    };
  } catch { return { ...PADRAO }; }
}
export function guardarPreferencias(p: PreferenciasDoEnvio): void {
  try { localStorage.setItem(CHAVE, JSON.stringify(p)); } catch { /* navegador sem armazenamento: só não lembra */ }
}

// ── o pacote: ZIP com o dossiê de cada pagamento + "00 RESUMO.pdf" ───────────

const extensao = (nome: string | null, url: string) => (/\.([a-z0-9]{2,4})$/i.exec(nome ?? url)?.[1] ?? "pdf").toLowerCase();

/** Ordem de leitura dos documentos de uma obrigação: o que se paga primeiro, depois o que se confere. */
const PESO_DO_TIPO: Record<string, number> = { boleto: 0, guia: 1, fatura: 2, nota_fiscal: 3, contrato: 4 };
const peso = (t: string) => PESO_DO_TIPO[t] ?? 9;

export interface PedidoDoPacote {
  /** os pagamentos marcados, na ordem da mensagem */
  itens: ItemDeEnvio[];
  /** os que estão só na pasta: seus documentos também vão (o tesoureiro paga conferindo o papel) */
  semMeio: ItemDeEnvio[];
  hojeYmd: string;
  linhasDeDescricao?: Record<string, string>;
}

interface DocumentoPlanejado { anexo: FinLancamentoAnexo; nome: string }

/** O nome de cada arquivo, decidido de antemão (o ZIP e o PDF resumo falam dos mesmos nomes). */
async function planejarDocumentos(p: PedidoDoPacote): Promise<Map<string, DocumentoPlanejado[]>> {
  const todos = [...p.itens, ...p.semMeio];
  const anexos = await anexosDasObrigacoes(todos.map(i => i.id));
  const plano = new Map<string, DocumentoPlanejado[]>();
  todos.forEach((item, n) => {
    const lista = [...(anexos.get(item.id) ?? [])].sort((a, b) => peso(a.tipo) - peso(b.tipo));
    const vistos = new Map<string, number>();
    plano.set(item.id, lista.map(anexo => {
      const seq = (vistos.get(anexo.tipo) ?? 0) + 1; vistos.set(anexo.tipo, seq);
      return { anexo, nome: nomeDoDocumentoNoZip(n + 1, item, anexo.tipo, seq, extensao(anexo.nome, anexo.url)) };
    }));
  });
  return plano;
}

const arquivosDe = (plano: Map<string, DocumentoPlanejado[]>, ok?: Set<string>) =>
  new Map([...plano].map(([id, docs]) => [id, docs.filter(d => !ok || ok.has(d.nome)).map(d => d.nome)] as const));

/** O PDF resumo avulso (botão "Baixar resumo"). */
export async function baixarResumo(p: PedidoDoPacote): Promise<void> {
  const { saveAs } = await import("file-saver");
  const plano = await planejarDocumentos(p);
  const bytes = await gerarResumoDoLotePdf({ ...p, arquivosPorItem: arquivosDe(plano) });
  saveAs(new Blob([bytes as BlobPart], { type: "application/pdf" }), `RESUMO ${nomeDoZip(p.hojeYmd).replace(/\.zip$/, "")}.pdf`);
}

export interface ResultadoDoPacote { arquivos: number; semDocumento: string[]; falhas: string[] }

/** Monta e baixa o ZIP "20.OUT.2026.zip": pasta "20.OUT" com os documentos renomeados e "00 RESUMO.pdf"; LEIA-ME.txt ao lado da pasta (não vai para o Drive). */
export async function baixarPacote(p: PedidoDoPacote, aoAndar?: (feitos: number, total: number) => void): Promise<ResultadoDoPacote> {
  const JSZip = (await import("jszip")).default;
  const { saveAs } = await import("file-saver");
  const pasta = nomeDaPasta(p.hojeYmd);
  const plano = await planejarDocumentos(p);
  const zip = new JSZip();
  const raiz = zip.folder(pasta)!;
  const baixados = new Set<string>();
  const falhas: string[] = [];

  const tarefas = [...plano.values()].flat();
  await emParalelo(tarefas, EM_PARALELO, async ({ anexo, nome }) => {
    try {
      const url = await anexoSignedUrl(anexo.url);
      if (!url) throw new Error("sem link");
      const blob = await (await fetch(url)).blob();
      raiz.file(nome, blob); baixados.add(nome);
    } catch { falhas.push(nome); /* um arquivo que não baixa não impede os outros */ }
  }, f => aoAndar?.(f, tarefas.length));

  const todos = [...p.itens, ...p.semMeio];
  const semDocumento = todos.filter(i => !(arquivosDe(plano, baixados).get(i.id)?.length)).map(i => i.fornecedor);
  if (baixados.size === 0) return { arquivos: 0, semDocumento, falhas };

  const resumo = await gerarResumoDoLotePdf({ ...p, arquivosPorItem: arquivosDe(plano, baixados) });
  raiz.file("00 RESUMO.pdf", resumo);

  const dataBr = (ymd: string) => ymd.slice(0, 10).split("-").reverse().join("/");
  const arquivosPorItem = arquivosDe(plano, baixados);
  zip.file("LEIA-ME.txt", leiaMeDoPacote(`Pagamentos de ${dataBr(p.hojeYmd)} — pasta ${pasta}`, [
    `A pasta "${pasta}" tem ${baixados.size} ${baixados.size === 1 ? "documento" : "documentos"} dos pagamentos abaixo, numerados na ordem da mensagem, mais "00 RESUMO.pdf" (o índice: o que é cada pagamento, de onde veio o código de pagamento e quais arquivos o acompanham).`,
    "Este arquivo fica fora da pasta, para não ir junto para o Drive.",
    "",
    ...todos.map((i, n) => `${String(n + 1).padStart(2, "0")}. ${i.fornecedor} — R$ ${i.valor.toFixed(2).replace(".", ",")} — vence ${dataBr(i.vencimento)} — ${(arquivosPorItem.get(i.id)?.length ?? 0) > 0 ? `${arquivosPorItem.get(i.id)!.length} arquivo(s)` : "sem documento anexado"}${p.semMeio.some(s => s.id === i.id) ? " (sem meio automático de pagamento)" : ""}`),
    ...(falhas.length ? ["", `Não foi possível baixar: ${falhas.join("; ")}.`] : []),
    "",
    "Confira sempre os valores e vencimentos antes de efetuar os pagamentos.",
  ]));
  saveAs(await zip.generateAsync({ type: "blob" }), nomeDoZip(p.hojeYmd));
  return { arquivos: baixados.size, semDocumento, falhas };
}
