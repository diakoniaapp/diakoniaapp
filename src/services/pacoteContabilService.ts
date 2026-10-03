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
//      silêncio. O plano já garante nomes únicos (`unico()` na lib).

import { supabase } from "@/integrations/supabase/client";
import { toYmd } from "@/lib/data";
import {
  enriquecerLancamentos, type FinLancamento, type FinLancamentoExtenso,
} from "@/services/finService";
import {
  indiceCsv, pendenciasCsv, planejarPacote,
  type AnexoPacote, type PlanoPacote,
} from "@/lib/pacoteContabil";

const BUCKET = "fin-comprovantes";
// Mesmo motivo de `emLotes` em finService: `.in()` vira query string, e
// 150 UUIDs já pesam ~5,5 KB. 100 também deixa o teto de 1.000 linhas do
// PostgREST longe, mesmo com vários anexos por lançamento.
const TAMANHO_LOTE = 100;
const PAGINA = 1000;
const DOWNLOADS_EM_PARALELO = 4;

/**
 * As saídas do mês pelo dia do PAGAMENTO (`data_pagamento`, ou `data` quando
 * vazia — ver o cabeçalho de `lib/pacoteContabil.ts`), sem transferência e só
 * realizadas/conciliadas: a mesma regra do Malote Contábil.
 */
async function saidasDoMes(ano: number, mes: number, contaId?: string): Promise<FinLancamentoExtenso[]> {
  const ini = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const fim = toYmd(new Date(ano, mes, 0));
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

export interface ResultadoPacote {
  baixados: number;
  falhas: { caminho: string; motivo: string }[];
  pendencias: number;
}

/**
 * Baixa os arquivos do plano e entrega o ZIP. O ZIP SAI MESMO COM
 * PENDÊNCIAS OU FALHAS (decisão dela, 02/10/2026) — o que faltou fica em
 * PENDENCIAS.csv / ERROS.txt e no retorno, pra tela avisar.
 */
export async function baixarPacoteContabil(
  plano: PlanoPacote,
  onProgresso?: (feitos: number, total: number) => void,
): Promise<ResultadoPacote> {
  if (plano.totalSaidas === 0) {
    throw new Error(`Nenhuma saída paga em ${String(plano.mes).padStart(2, "0")}/${plano.ano}.`);
  }

  // Carregados só aqui: o ZIP é uma ação rara, e `jszip` não precisa pesar
  // no pacote de quem só abre a tela do Malote.
  const [{ default: JSZip }, { saveAs }] = await Promise.all([import("jszip"), import("file-saver")]);
  const zip = new JSZip();
  const falhas: ResultadoPacote["falhas"] = [];
  const falhouPath = new Set<string>();

  let proximo = 0;
  let feitos = 0;
  async function trabalhador() {
    while (proximo < plano.arquivos.length) {
      const a = plano.arquivos[proximo++];
      let motivo: string | null = null;
      try {
        const { data: blob, error } = await supabase.storage.from(BUCKET).download(a.storagePath);
        if (error || !blob) motivo = error?.message ?? "arquivo vazio";
        else zip.file(a.caminhoZip, blob);
      } catch (e: any) {
        motivo = e?.message ?? "erro desconhecido";
      }
      if (motivo) {
        falhas.push({ caminho: a.caminhoZip.slice(plano.raiz.length + 1), motivo });
        falhouPath.add(a.storagePath);
      }
      onProgresso?.(++feitos, plano.arquivos.length);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(DOWNLOADS_EM_PARALELO, plano.arquivos.length) }, trabalhador),
  );

  zip.file(`${plano.raiz}/INDICE.csv`, indiceCsv(plano, falhouPath));
  zip.file(`${plano.raiz}/PENDENCIAS.csv`, pendenciasCsv(plano));
  if (falhas.length) {
    zip.file(
      `${plano.raiz}/ERROS.txt`,
      [
        "Estes arquivos estão registrados no sistema mas NÃO puderam ser baixados",
        "e por isso não entraram neste pacote:",
        "",
        ...falhas.map(f => `- ${f.caminho}  (${f.motivo})`),
        "",
      ].join("\r\n"),
    );
  }

  const blob = await zip.generateAsync({ type: "blob" });
  saveAs(blob, `${plano.raiz}.zip`);
  return { baixados: plano.arquivos.length - falhas.length, falhas, pendencias: plano.pendencias.length };
}
