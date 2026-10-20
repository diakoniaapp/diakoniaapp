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
import { documentosHerdados } from "@/services/grupoDaObrigacaoService";
import { toYmd } from "@/lib/data";
import {
  FIN_ANEXO_TIPO_LABEL, enriquecerLancamentos,
  type FinAnexoTipo, type FinLancamento, type FinLancamentoExtenso,
} from "@/services/finService";
import {
  PASTA_AVISOS, PASTA_OFERTADAS, auditarAnexos, indiceCsv, observacaoDeAvisoDeReembolso, observacaoDeOferta, pendenciasCsv, pendenciasDeQuitacaoCsv, planejarPacote,
  type AnexoPacote, type DossiePlanejado, type LinhaAuditoria, type PendenciaDeQuitacao, type PlanoPacote, type QuitacaoParaOPacote, type RotuloDoPacote,
} from "@/lib/pacoteContabil";
import {
  eventosDaQuitacao, listarFilasDeQuitacao, ofertaDisponivel, quitacaoDisponivel, quitacoesDasObrigacoes, type QuitacaoDaObrigacao,
} from "@/services/quitacaoService";
import { hojeLocal } from "@/lib/data";
import { PASTA_DOCUMENTOS_DO_FECHAMENTO, caminhoNoPacote, indiceDosDocumentosCsv } from "@/lib/fechamentoDocumentos";
import { baixarBytesDoDocumento, documentosParaOPacote } from "@/services/fechamentoDocumentosService";
import { ANEXOS_DA_QUITACAO, ROTULO_INTENCAO, ehTerceiro } from "@/lib/quitacao";
import type { ContextoDocumental } from "@/lib/pacoteContabil";

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
 *
 * Fase 1C-b: a obrigação extinta por OFERTA (`quitado_terceiro`) também é despesa da igreja e o escritório precisa da nota. Ela não tem dia de pagamento, então entra
 * pelo dia da NOTA (o fallback de sempre). O status só é pedido ao banco depois que ele existe no enum: um valor de enum inválido em `.in()` derruba a consulta INTEIRA.
 */
export async function saidasDoPeriodo(ini: string, fim: string, contaId?: string): Promise<FinLancamentoExtenso[]> {
  const brutos: FinLancamento[] = [];
  const status = (await ofertaDisponivel()) ? ["realizado", "conciliado", "quitado_terceiro"] : ["realizado", "conciliado"];
  for (let pagina = 0; ; pagina++) {
    let q = supabase.from("fin_lancamentos").select("*")
      .eq("tipo", "saida")
      .neq("origem", "transferencia")
      .in("status", status as never)
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
  // O DOCUMENTO pertence à obrigação: numa obrigação paga em parcelas (várias linhas), cada linha leva no dossiê os documentos das irmãs — senão a parcela
  // aparece "sem documento" no pacote embora o boleto esteja anexado à linha original. O comprovante, não: cada pagamento prova o seu.
  for (const [id, docs] of await documentosHerdados(ids)) {
    for (const d of docs) anexos.push({ lancamento_id: id, tipo: d.tipo, url: d.url, nome: d.nome, enviado_em: d.enviado_em } as AnexoPacote);
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

const paraOPacote = (q: QuitacaoDaObrigacao, aprovadoPor?: string | null, aprovadoEm?: string | null): QuitacaoParaOPacote => ({
  responsavelNome: q.responsavelNome, intencao: q.intencao, grauConjunto: q.grauConjunto, valorDaObrigacao: q.valorDaObrigacao, saldoAReembolsar: q.saldoAReembolsar, aprovadoPor, aprovadoEm,
});

/**
 * Os AVISOS de reembolso do mês: o reembolso aprovado e ainda não pago é dívida da igreja com a pessoa desde a aprovação, mas ainda não houve pagamento — então não é "saída paga" e
 * não está em `saidasDoPeriodo`. Entra só como informação, pelo dia da nota. Quando for pago, entra no mês do pagamento (como saída comum, com o comprovante).
 */
async function avisosDeReembolsoDoMes(ano: number, mes: number, contaId?: string): Promise<{ lancamentos: FinLancamentoExtenso[]; rotulos: Map<string, RotuloDoPacote> }> {
  return avisosDeReembolsoDoPeriodo(`${ano}-${String(mes).padStart(2, "0")}-01`, toYmd(new Date(ano, mes, 0)), contaId, true);
}

/** O mesmo, para qualquer período; `comRotulos = false` pula a leitura das aprovações (a Auditoria só precisa das linhas). */
async function avisosDeReembolsoDoPeriodo(ini: string, fim: string, contaId?: string, comRotulos = false): Promise<{ lancamentos: FinLancamentoExtenso[]; rotulos: Map<string, RotuloDoPacote> }> {
  const vazio = { lancamentos: [] as FinLancamentoExtenso[], rotulos: new Map<string, RotuloDoPacote>() };
  if (!(await quitacaoDisponivel())) return vazio;
  const { data, error } = await supabase.from("vw_fin_quitacao" as never).select("obrigacao_id, quitacao_id")
    .eq("resultado" as never, "divida_com_terceiro" as never).eq("reembolsado" as never, 0 as never)
    .gte("data_despesa" as never, ini as never).lte("data_despesa" as never, fim as never);
  if (error) throw error;
  const linhas = (data ?? []) as unknown as { obrigacao_id: string }[];
  if (linhas.length === 0) return vazio;
  const ids = linhas.map(l => String(l.obrigacao_id));
  let q = supabase.from("fin_lancamentos").select("*").in("id", ids).eq("status", "previsto");
  if (contaId) q = q.eq("conta_id", contaId);
  const { data: lancs, error: e2 } = await q;
  if (e2) throw e2;
  const lancamentos = await enriquecerLancamentos((lancs ?? []) as unknown as FinLancamento[]);
  if (!comRotulos) return { lancamentos, rotulos: new Map<string, RotuloDoPacote>() };
  const quitacoes = await quitacoesDasObrigacoes(lancamentos.map(l => l.id));
  const rotulos = new Map<string, RotuloDoPacote>();
  for (const l of lancamentos) {
    const qt = quitacoes.get(l.id);
    if (!qt) continue;
    const eventos = await eventosDaQuitacao(qt.quitacaoId).catch(() => []);
    const aprov = [...eventos].filter(e => e.evento === "aprovacao_reembolso" && e.decisao === "aprovada").sort((a, b) => (a.em < b.em ? -1 : 1)).pop();
    rotulos.set(l.id, { tipo: "aviso_reembolso", pasta: PASTA_AVISOS, observacao: observacaoDeAvisoDeReembolso(paraOPacote(qt, aprov?.porNome ?? null, aprov?.em ?? null)) });
  }
  return { lancamentos, rotulos };
}

/** O que o escritório precisa ler sobre as quitações ainda sem resposta (todas as filas, de qualquer mês). */
async function quitacoesPendentesDoPacote(): Promise<PendenciaDeQuitacao[]> {
  if (!(await quitacaoDisponivel())) return [];
  const itens = await listarFilasDeQuitacao(hojeLocal());
  return itens.filter(i => i.fila).map(i => ({
    fila: i.fila!, emitente: i.emitente ?? "", descricao: i.descricao ?? "", quem: i.responsavelNome ?? (i.responsavel === "nao_localizado" ? "Não localizado" : ""),
    intencao: i.responsavel === "nao_localizado" ? "" : ROTULO_INTENCAO[i.intencao], valor: i.fila === "reembolso_a_pagar" ? i.saldoAReembolsar ?? i.valorDaObrigacao : i.valorDaObrigacao,
    idadeEmDias: i.idadeEmDias, dataDaNota: i.dataDaDespesa,
  }));
}

/** Monta o plano do mês — só consulta o banco, não baixa arquivo nenhum. É
 *  o que a tela usa pra mostrar a conferência antes de gerar o ZIP. */
export async function prepararPacoteContabil(ano: number, mes: number, contaId?: string): Promise<PlanoPacote> {
  const pagas = await saidasDoMes(ano, mes, contaId);
  const rotulos = new Map<string, RotuloDoPacote>();
  // as ofertas (quitado_terceiro) vêm junto das pagas; o selo do grau de prova sai da quitação delas
  const ofertadas = pagas.filter(l => (l.status as string) === "quitado_terceiro");
  if (ofertadas.length > 0) {
    const quitacoes = await quitacoesDasObrigacoes(ofertadas.map(l => l.obrigacao_id ?? l.id));
    for (const l of ofertadas) {
      const qt = quitacoes.get(l.obrigacao_id ?? l.id);
      rotulos.set(l.id, { tipo: "ofertada", pasta: PASTA_OFERTADAS, observacao: qt ? observacaoDeOferta(paraOPacote(qt)) : "Compra ofertada por terceiro: obrigação extinta sem pagamento da igreja." });
    }
  }
  const avisos = await avisosDeReembolsoDoMes(ano, mes, contaId);
  for (const [id, r] of avisos.rotulos) rotulos.set(id, r);
  const saidas = [...pagas, ...avisos.lancamentos];
  const anexos = saidas.length ? await anexosDe(saidas) : [];
  const plano = planejarPacote(ano, mes, saidas, anexos, rotulos);
  // A MESMA régua da Auditoria (lib/documentacaoExigida.ts): o que o escritório ainda não consegue trabalhar não é só "sem nenhum anexo" — é a documentação incompleta (sem + parcial).
  const incompletas = (await auditarSaidas(saidas, anexos, new Set(avisos.lancamentos.map(l => l.id)))).filter(x => x.situacao === "sem" || x.situacao === "parcial");
  plano.pendencias = incompletas.map(x => x.lancamento);
  plano.faltas = new Map(incompletas.map(x => [x.lancamento.id, { situacao: x.situacao, faltam: x.documentacao.faltam }]));
  plano.quitacoesPendentes = await quitacoesPendentesDoPacote();
  plano.documentosDoFechamento = await documentosParaOPacote(ano, mes, contaId);
  return plano;
}

/**
 * A documentação de QUALQUER período, pela regra ÚNICA (`lib/documentacaoExigida.ts`): cada saída do malote com sua situação (completa / parcial / sem / dispensa), o que falta e as
 * pendências administrativas. Entram as saídas pagas, as compras ofertadas (`quitado_terceiro`) e os AVISOS de reembolso (aprovados, ainda não pagos) — tudo o que faz parte do malote faz
 * parte da medição. Os filtros de conta, centro de custo e fornecedor são aplicados pela tela, em memória: o período (que decide o volume) é o único filtro que vai ao banco.
 */
export async function auditarPeriodo(ini: string, fim: string): Promise<LinhaAuditoria[]> {
  const pagas = await saidasDoPeriodo(ini, fim);
  const avisos = await avisosDeReembolsoDoPeriodo(ini, fim);
  const saidas = [...pagas, ...avisos.lancamentos];
  if (saidas.length === 0) return [];
  return auditarSaidas(saidas, await anexosDe(saidas), new Set(avisos.lancamentos.map(l => l.id)));
}

/** A regra única aplicada a saídas JÁ lidas (com seus anexos): lê só o que falta — o tipo das contas e as Quitações por terceiros. */
async function auditarSaidas(saidas: FinLancamentoExtenso[], anexos: AnexoPacote[], avisos: ReadonlySet<string>): Promise<LinhaAuditoria[]> {
  const [contas, quitacoes] = await Promise.all([
    supabase.from("fin_contas").select("id, tipo"),
    quitacoesDasObrigacoes([...new Set(saidas.map(l => l.obrigacao_id ?? l.id))]),
  ]);
  const contexto: ContextoDocumental = {
    contaTipo: new Map((contas.data ?? []).map(c => [String(c.id), String(c.tipo)])),
    quitacao: new Map([...quitacoes].map(([id, q]) => [id, { intencao: q.intencao, terceiroQuitou: ehTerceiro(q.responsavel) }])),
    avisos,
  };
  // a declaração e as provas da quitação ficam na obrigação-raiz: a linha que foi PAGA (uma irmã) as herda, como herda o documento original
  const extras = await anexosDaQuitacaoDasIrmas(saidas, quitacoes);
  return auditarAnexos(saidas, [...anexos, ...extras], contexto);
}

/** Para as linhas de obrigações com Quitação que não são a própria raiz: as provas da quitação (declaração, pedido de reembolso, prova do terceiro) anexadas à raiz. */
async function anexosDaQuitacaoDasIrmas(saidas: FinLancamentoExtenso[], quitacoes: Map<string, QuitacaoDaObrigacao>): Promise<AnexoPacote[]> {
  const filhas = saidas.filter(l => l.obrigacao_id && l.obrigacao_id !== l.id && quitacoes.has(l.obrigacao_id));
  if (filhas.length === 0) return [];
  const raizes = [...new Set(filhas.map(l => l.obrigacao_id as string))];
  const docs: { lancamento_id: string; tipo: string; url: string; nome: string | null; enviado_em: string | null }[] = [];
  for (let i = 0; i < raizes.length; i += TAMANHO_LOTE) {
    const { data, error } = await supabase.from("fin_lancamento_anexos").select("lancamento_id, tipo, url, nome, enviado_em")
      .in("lancamento_id", raizes.slice(i, i + TAMANHO_LOTE)).in("tipo", [...ANEXOS_DA_QUITACAO]);
    if (error) throw error;
    docs.push(...((data ?? []) as typeof docs));
  }
  return filhas.flatMap(l => docs.filter(d => d.lancamento_id === l.obrigacao_id).map(d => ({ lancamento_id: l.id, tipo: d.tipo, url: d.url, nome: d.nome, enviado_em: d.enviado_em } as AnexoPacote)));
}

export interface ResultadoPacote {
  /** Arquivos do armazenamento que entraram no pacote (partes + XML). */
  baixados: number;
  /** PDFs consolidados gerados (um por lançamento com documento em PDF/imagem). */
  dossies: number;
  falhas: { caminho: string; motivo: string }[];
  pendencias: number;
  /** Quitações por terceiro ainda sem resposta (PENDENCIAS_QUITACAO.csv). */
  pendenciasQuitacao: number;
  /** Documentos do fechamento do mês que entraram no pacote (pasta "Documentos do fechamento"). */
  documentosDoFechamento: number;
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
  if (plano.totalSaidas === 0 && plano.documentosDoFechamento.length === 0) {
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

  // os documentos do FECHAMENTO (extratos, OFX, cartões, adquirentes…): não são de despesa; vão numa pasta própria, com índice, e um que falhar não derruba o pacote
  const nomesUsados = new Set<string>();
  const doFechamento: { doc: (typeof plano.documentosDoFechamento)[number]; caminho: string }[] = [];
  for (const doc of plano.documentosDoFechamento) {
    const caminho = caminhoNoPacote(plano.raiz, doc, nomesUsados);
    try { zip.file(caminho, await baixarBytesDoDocumento(doc.storagePath)); baixados += 1; doFechamento.push({ doc, caminho }); }
    catch (e) { falhar(`${relativo(caminho)} (documento do fechamento)`, doc.storagePath, e); }
    onProgresso?.(++feitos, plano.totalArquivos + plano.documentosDoFechamento.length);
  }
  if (doFechamento.length > 0) {
    zip.file(`${plano.raiz}/${PASTA_DOCUMENTOS_DO_FECHAMENTO}/INDICE_DOCUMENTOS.csv`, indiceDosDocumentosCsv(
      doFechamento.map(x => ({ tipo: x.doc.tipo, arquivoNome: x.doc.arquivoNome, caminho: relativo(x.caminho), descricao: x.doc.descricao, contaNome: x.doc.contaNome, tamanhoBytes: x.doc.tamanhoBytes, incluidoEm: x.doc.incluidoEm, incluidoPorNome: x.doc.incluidoPorNome })),
      iso => { const d = new Date(iso); const p = (n: number) => String(n).padStart(2, "0"); return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`; },
    ));
  }

  zip.file(`${plano.raiz}/INDICE.csv`, indiceCsv(plano, falhouPath, paginas));
  zip.file(`${plano.raiz}/PENDENCIAS.csv`, pendenciasCsv(plano));
  if (plano.quitacoesPendentes.length > 0) zip.file(`${plano.raiz}/PENDENCIAS_QUITACAO.csv`, pendenciasDeQuitacaoCsv(plano.quitacoesPendentes));
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
  return { baixados, dossies: pdfs, falhas, pendencias: plano.pendencias.length, pendenciasQuitacao: plano.quitacoesPendentes.length, documentosDoFechamento: doFechamento.length };
}