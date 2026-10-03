// ─── pacoteContabilService.ts — Pacote Contábil mensal (ZIP) ─────────────
//
// Junta o que já existia: lançamentos (`finService`), anexos N por
// lançamento (`fin_lancamento_anexos`, bucket `fin-comprovantes`) e o molde
// de ZIP do Malote Fiscal (`fiscalService.exportarMaloteFiscalZip`). As
// regras de pasta/índice/pendência estão em `lib/pacoteContabil.ts`.
//
// DUAS COISAS DO ZIP FISCAL QUE NÃO FORAM COPIADAS (achadas em 02/10/2026):
//   1. `if (error || !blob) continue` pula o arquivo SEM AVISO — o `catch`
//      que cria `ERRO-*.txt` só pega exceção, e `storage.download()` devolve
//      `{ error }` em vez de lançar. A contabilidade receberia um pacote
//      incompleto sem saber. Aqui toda falha vai pra ERROS.txt, pra coluna
//      "Situação" do INDICE.csv e pro retorno (a tela avisa).
//   2. Dois arquivos com o mesmo nome na mesma pasta: o JSZip sobrescreve em
//      silêncio. O plano já garante nomes únicos (data, valor, documento,
//      fornecedor e, só se tudo isso coincidir, o ID do lançamento — ver
//      `planejarPacote` na lib).
//
// DOSSIÊ (03/10/2026): um PDF consolidado por lançamento; a montagem é
// `lib/documentos/dossiePdf.ts` e as regras de ordem/nome, `dossie.ts`.

import { supabase } from "@/integrations/supabase/client";
import { toYmd } from "@/lib/data";
import {
  FIN_ANEXO_TIPO_LABEL, enriquecerLancamentos,
  type FinAnexoTipo, type FinLancamento, type FinLancamentoExtenso,
} from "@/services/finService";
import {
  auditarAnexos, indiceCsv, pendenciasCsv, planejarPacote,
  type AnexoPacote, type DossiePlanejado, type LinhaAuditoria, type PlanoPacote,
} from "@/lib/pacoteContabil";

const BUCKET = "fin-comprovantes";
// Mesmo motivo de `emLotes` em finService: `.in()` vira query string, e
// 150 UUIDs já pesam ~5,5 KB. 100 também deixa o teto de 1.000 linhas do
// PostgREST longe, mesmo com vários anexos por lançamento.
const TAMANHO_LOTE = 100;
const PAGINA = 1000;
// Dossiês montados ao mesmo tempo: cada um baixa seus arquivos e mescla em memória;
// 3 mantém o navegador responsivo sem segurar dezenas de PDFs abertos de uma vez.
const DOSSIES_EM_PARALELO = 3;

/**
 * As saídas do mês pelo dia do PAGAMENTO (`data_pagamento`, ou `data` quando
 * vazia — ver o cabeçalho de `lib/pacoteContabil.ts`), sem transferência e só
 * realizadas/conciliadas: a mesma regra do Malote Contábil.
 */
export async function saidasDoPeriodo(ini: string, fim: string, contaId?: string): Promise<FinLancamentoExtenso[]> {
  const brutos: FinLancamento[] = [];
  for (let pagina = 0; ; pagina++) {
    let q = supabase.from("fin_lancamentos").select("*")
      .eq("tipo", "saida")
      .neq("origem", "transferencia")
      .in("status", ["realizado", "conciliado"])
      .or(
        `and(data_pagamento.gte.${ini},data_pagamento.lte.${fim}),` +
        `and(data_pagamento.is.null,data.gte.${ini},data.lte.${fim})`,
      )
      // `id` por último: paginação com `.range()` precisa de ordem total, ou
      // uma linha empatada some e outra repete entre páginas (mesmo motivo de
      // `construirQueryLancamentos`).
      .order("data", { ascending: true })
      .order("id", { ascending: true });
    if (contaId) q = q.eq("conta_id", contaId);
    const { data, error } = await q.range(pagina * PAGINA, pagina * PAGINA + PAGINA - 1);
    if (error) throw error;
    const bloco = (data ?? []) as unknown as FinLancamento[];
    brutos.push(...bloco);
    if (bloco.length < PAGINA) break;
  }
  return enriquecerLancamentos(brutos);
}

function saidasDoMes(ano: number, mes: number, contaId?: string): Promise<FinLancamentoExtenso[]> {
  return saidasDoPeriodo(`${ano}-${String(mes).padStart(2, "0")}-01`, toYmd(new Date(ano, mes, 0)), contaId);
}

async function anexosDe(lancamentos: FinLancamentoExtenso[]): Promise<AnexoPacote[]> {
  const ids = lancamentos.map(l => l.id);
  const anexos: AnexoPacote[] = [];
  for (let i = 0; i < ids.length; i += TAMANHO_LOTE) {
    const { data, error } = await supabase.from("fin_lancamento_anexos")
      .select("lancamento_id, tipo, url, nome, enviado_em")
      .in("lancamento_id", ids.slice(i, i + TAMANHO_LOTE));
    if (error) throw error;
    anexos.push(...((data ?? []) as AnexoPacote[]));
  }
  // `comprovante_url`: o campo de 1 arquivo, anterior aos anexos N. Hoje 0 de
  // 13.378 lançamentos o usam, mas a tela ainda mostra o clipe pra quem o
  // tiver — se alguém preencher, o arquivo não pode ficar fora do pacote.
  for (const l of lancamentos) {
    if (l.comprovante_url) {
      anexos.push({ lancamento_id: l.id, tipo: "comprovante", url: l.comprovante_url, nome: null });
    }
  }
  return anexos;
}

/** Monta o plano do mês — só consulta o banco, não baixa arquivo nenhum. É
 *  o que a tela usa pra mostrar a conferência antes de gerar o ZIP. */
export async function prepararPacoteContabil(ano: number, mes: number, contaId?: string): Promise<PlanoPacote> {
  const saidas = await saidasDoMes(ano, mes, contaId);
  const anexos = saidas.length ? await anexosDe(saidas) : [];
  return planejarPacote(ano, mes, saidas, anexos);
}

/** Auditoria de anexos de QUALQUER período: cada saída paga com sua situação
 *  (com documento / sem / dispensa) e os tipos que tem. Os filtros de conta,
 *  centro de custo e fornecedor são aplicados pela tela, em memória — o
 *  período (que decide o volume) é o único filtro que vai ao banco. */
export async function auditarPeriodo(ini: string, fim: string): Promise<LinhaAuditoria[]> {
  const saidas = await saidasDoPeriodo(ini, fim);
  const anexos = saidas.length ? await anexosDe(saidas) : [];
  return auditarAnexos(saidas, anexos);
}

export interface ResultadoPacote {
  /** Arquivos do armazenamento que entraram no pacote (partes + XML). */
  baixados: number;
  /** PDFs consolidados gerados (um por lançamento com documento em PDF/imagem). */
  dossies: number;
  falhas: { caminho: string; motivo: string }[];
  pendencias: number;
}

const rotuloDaParte = (tipo: FinAnexoTipo) => FIN_ANEXO_TIPO_LABEL[tipo] ?? tipo;

async function baixarBytes(path: string): Promise<Uint8Array> {
  const { data: blob, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !blob) throw new Error(error?.message ?? "arquivo vazio");
  return new Uint8Array(await blob.arrayBuffer());
}

const extDoCaminho = (p: string) => /\.([A-Za-z0-9]{1,5})$/.exec(p)?.[1].toLowerCase() ?? "bin";

/**
 * Gera o Dossiê Contábil: para cada lançamento, baixa os documentos, mescla num
 * ÚNICO PDF (ordem documental, comprovante por último) e põe o XML ao lado. O ZIP
 * SAI MESMO COM PENDÊNCIAS OU FALHAS (decisão dela, 02/10/2026) — o que faltou fica
 * em PENDENCIAS.csv / ERROS.txt e no retorno, pra tela avisar.
 *
 * Nada do que está guardado no sistema é alterado: o merge acontece em memória, e
 * as fotos só são reduzidas na cópia que vai para o PDF.
 *
 * Um documento que não puder ser mesclado (PDF corrompido, protegido por senha)
 * NÃO se perde: vai ao lado como `…_ORIGINAL_n.ext` e entra em ERROS.txt.
 */
export async function baixarPacoteContabil(
  plano: PlanoPacote,
  onProgresso?: (feitos: number, total: number) => void,
): Promise<ResultadoPacote> {
  if (plano.totalSaidas === 0) {
    throw new Error(`Nenhuma saída paga em ${String(plano.mes).padStart(2, "0")}/${plano.ano}.`);
  }

  // Carregados só aqui: o ZIP é uma ação rara, e `jszip`/`pdf-lib` não precisam
  // pesar no pacote de quem só abre a tela do Malote.
  const [{ default: JSZip }, { saveAs }, { montarDossiePdf, textoDePaginas }, { reduzirImagemNoNavegador }] = await Promise.all([
    import("jszip"), import("file-saver"),
    import("@/lib/documentos/dossiePdf"), import("@/lib/documentos/reduzirImagem"),
  ]);
  const zip = new JSZip();
  const falhas: ResultadoPacote["falhas"] = [];
  const falhouPath = new Set<string>();
  const paginas = new Map<string, string>();
  const relativo = (caminhoZip: string) => caminhoZip.slice(plano.raiz.length + 1);
  let baixados = 0;
  let pdfs = 0;
  let feitos = 0;
  const falhar = (caminho: string, path: string, e: unknown) => {
    falhas.push({ caminho, motivo: e instanceof Error ? e.message : String(e ?? "erro desconhecido") });
    falhouPath.add(path);
  };

  async function fazerDossie(d: DossiePlanejado) {
    // 1. os documentos que viram páginas
    const obtidas: { parte: DossiePlanejado["partes"][number]; bytes: Uint8Array }[] = [];
    for (const parte of d.partes) {
      try { obtidas.push({ parte, bytes: await baixarBytes(parte.storagePath) }); baixados += 1; }
      catch (e) { falhar(`${relativo(d.caminhoBase)} (${rotuloDaParte(parte.tipo)})`, parte.storagePath, e); }
      onProgresso?.(++feitos, plano.totalArquivos);
    }
    // 2. os arquivos ao lado (XML), intactos e fora do merge
    for (const x of d.aoLado) {
      try { zip.file(x.caminhoZip, await baixarBytes(x.storagePath)); baixados += 1; }
      catch (e) { falhar(relativo(x.caminhoZip), x.storagePath, e); }
      onProgresso?.(++feitos, plano.totalArquivos);
    }
    if (obtidas.length === 0 || !d.caminhoZip) return;

    // 3. o merge
    const r = await montarDossiePdf(
      obtidas.map(o => ({ bytes: o.bytes, formato: o.parte.formato, rotulo: rotuloDaParte(o.parte.tipo) })),
      { reduzirImagem: reduzirImagemNoNavegador },
    );
    if (r.bytes) { zip.file(d.caminhoZip, r.bytes); pdfs += 1; }
    paginas.set(d.lancamentoId, textoDePaginas(r.paginas));
    // 4. o que não pôde ser mesclado vai ao lado, original, e fica registrado
    r.falhas.forEach((f, n) => {
      const o = obtidas[f.indice];
      const nome = `${d.caminhoBase}_ORIGINAL_${n + 1}.${extDoCaminho(o.parte.storagePath)}`;
      zip.file(nome, o.bytes);
      falhar(`${relativo(d.caminhoBase)} (${f.rotulo}) — entregue sem mesclar em ${relativo(nome)}`, o.parte.storagePath, f.motivo);
    });
  }

  let proximo = 0;
  async function trabalhador() {
    while (proximo < plano.dossies.length) {
      const d = plano.dossies[proximo++];
      try { await fazerDossie(d); }
      catch (e) { falhar(relativo(d.caminhoBase), d.partes[0]?.storagePath ?? d.lancamentoId, e); }
    }
  }
  await Promise.all(Array.from({ length: Math.min(DOSSIES_EM_PARALELO, plano.dossies.length) }, trabalhador));

  zip.file(`${plano.raiz}/INDICE.csv`, indiceCsv(plano, falhouPath, paginas));
  zip.file(`${plano.raiz}/PENDENCIAS.csv`, pendenciasCsv(plano));
  if (falhas.length) {
    zip.file(
      `${plano.raiz}/ERROS.txt`,
      [
        "Estes arquivos estão registrados no sistema mas NÃO puderam ser baixados ou",
        "mesclados no dossiê, e por isso não entraram como deveriam neste pacote:",
        "",
        ...falhas.map(f => `- ${f.caminho}  (${f.motivo})`),
        "",
      ].join("\r\n"),
    );
  }

  const blob = await zip.generateAsync({ type: "blob" });
  saveAs(blob, `${plano.raiz}.zip`);
  return { baixados, dossies: pdfs, falhas, pendencias: plano.pendencias.length };
}