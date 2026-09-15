// ─── faturaImportService.ts — trazer fatura de cartão de crédito pro Diakonia
//
// Pedido da Telma (15/09/2026): pagamentos de 2024 do cartão Visa, que não
// passaram pelo Omie (só os anos seguintes passaram) — ela só tem os PDFs
// de fatura, um por titular de cartão (a conta tem vários: Maria Regina,
// Sidney...), e "alguns meses estão com duas faturas cada". Confirmado por
// ela: não precisa vincular titular a pessoa; cada linha ("histórico") é
// um fornecedor, com o mesmo aprendizado de categoria/centro de custo que
// já existe (`categoria_padrao_id`/`centro_custo_padrao_id`).
//
// Mesmo padrão de segurança do `omieImportService.ts` — reaproveitado
// direto, não reinventado: `calcularHashArquivo` + `fin_import_arquivos`
// (trava contra reimportar o MESMO arquivo), `verificarSobreposicaoPeriodo`
// (aviso, não bloqueio, se a conta já tem lançamento no período), lote
// carimbado em `observacoes` pra dar pra desfazer o lote inteiro.
//
// Diferença de escopo: a fatura não tem CNPJ nem categoria/departamento
// no arquivo (ao contrário do Omie) — o fornecedor vem só do texto do
// "Histórico" (ex.: "MERCADOLIVRE*ROCHAMATERIA"), então o casamento é por
// NOME normalizado (maiúsculo/minúsculo e espaço não contam — achado real:
// o mesmo extrato tinha "abastec*abastece ai" E "ABASTEC*abastece ai"
// pro mesmo comerciante), não por CNPJ. Categoria/centro de custo vêm só
// do `categoria_padrao_id`/`centro_custo_padrao_id` do fornecedor
// (existente ou recém-criado) — sem heurística de texto tentando adivinhar.
import { supabase } from "@/integrations/supabase/client";
import { conferir } from "@/lib/escritaConferida";
import { calcularHashArquivo } from "@/lib/omieImport";
import { lerFaturaCartaoDeArquivo, type FaturaCartaoLida, type TransacaoFatura } from "@/lib/faturaCartao";
import { verificarArquivoJaImportado, verificarSobreposicaoPeriodo } from "./omieImportService";

function normalizarNomeFornecedor(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim().replace(/\s+/g, " ");
}

export interface ArquivoFaturaLido {
  nomeArquivo: string;
  hash: string;
  lida: FaturaCartaoLida | null; // null = formato não reconhecido
  jaImportado: boolean;
}

export interface TransacaoFaturaRascunho extends TransacaoFatura {
  arquivoNome: string;
  titular: string;
  fornecedorId: string | null;
  /** Chave normalizada do histórico — usada só pra ligar esta transação à
      resolução (criar/vincular) escolhida na tela; nunca gravada. */
  fornecedorChave: string | null;
}

export interface FornecedorNovoDaFatura {
  chave: string;       // normalizado — identifica o grupo na tela
  nomeOriginal: string; // como apareceu primeiro no histórico (pra exibir e criar)
  qtdTransacoes: number;
}

export interface ResumoImportacaoFatura {
  arquivosLidos: ArquivoFaturaLido[];
  transacoes: TransacaoFaturaRascunho[];
  totalEntradas: number;
  totalSaidas: number;
  fornecedoresNovos: FornecedorNovoDaFatura[];
  periodoMin: string | null;
  periodoMax: string | null;
  sobreposicaoNaConta: number;
}

/** Lê e prepara vários arquivos de fatura de uma vez (um mês pode ter mais
    de um titular). Arquivos já importados (mesmo hash nesta conta) ficam
    marcados em `jaImportado` — a tela decide se avisa e segue com o
    restante ou cancela tudo; esta função não bloqueia sozinha, só informa
    (mesma divisão de responsabilidade do `omieImportService`). */
export async function prepararImportacaoFatura(
  arquivos: File[], contaId: string,
): Promise<ResumoImportacaoFatura> {
  const arquivosLidos: ArquivoFaturaLido[] = await Promise.all(arquivos.map(async (file) => {
    const buffer = await file.arrayBuffer();
    const [hash, lida] = await Promise.all([
      calcularHashArquivo(buffer),
      lerFaturaCartaoDeArquivo(file),
    ]);
    const jaImportadoRegistro = await verificarArquivoJaImportado(contaId, hash);
    return { nomeArquivo: file.name, hash, lida, jaImportado: !!jaImportadoRegistro };
  }));

  // Fornecedor existente — busca todos de uma vez (poucos fornecedores no
  // total, cabe numa consulta só) e casa por nome normalizado.
  const { data: fornecedoresExistentes, error } = await supabase
    .from("fin_fornecedores").select("id, nome").eq("ativo", true);
  if (error) throw error;
  const mapaFornecedor = new Map(
    (fornecedoresExistentes ?? []).map(f => [normalizarNomeFornecedor(f.nome), f.id]));

  const fornecedoresNovos = new Map<string, FornecedorNovoDaFatura>();
  const transacoes: TransacaoFaturaRascunho[] = [];
  let totalEntradas = 0, totalSaidas = 0;

  for (const arq of arquivosLidos) {
    if (!arq.lida || arq.jaImportado) continue;
    for (const t of arq.lida.transacoes) {
      const chave = normalizarNomeFornecedor(t.historico);
      const fornecedorId = mapaFornecedor.get(chave) ?? null;
      if (!fornecedorId) {
        const existente = fornecedoresNovos.get(chave);
        if (existente) existente.qtdTransacoes++;
        else fornecedoresNovos.set(chave, { chave, nomeOriginal: t.historico, qtdTransacoes: 1 });
      }
      if (t.tipo === "entrada") totalEntradas += t.valor; else totalSaidas += t.valor;
      transacoes.push({
        ...t,
        arquivoNome: arq.nomeArquivo,
        titular: arq.lida.titular,
        fornecedorId,
        fornecedorChave: fornecedorId ? null : chave,
      });
    }
  }

  const datas = transacoes.map(t => t.data).sort();
  const periodoMin = datas[0] ?? null;
  const periodoMax = datas[datas.length - 1] ?? null;
  const sobreposicaoNaConta = periodoMin && periodoMax
    ? await verificarSobreposicaoPeriodo(contaId, periodoMin, periodoMax)
    : 0;

  return {
    arquivosLidos, transacoes, totalEntradas, totalSaidas,
    fornecedoresNovos: Array.from(fornecedoresNovos.values()),
    periodoMin, periodoMax, sobreposicaoNaConta,
  };
}

/** O que fazer com cada fornecedor não reconhecido (mesma ideia de
    `ResolucaoPessoa` no import do Omie, mas mais simples — fornecedor não
    precisa de vínculo formal, só nome + categoria/centro opcionais). */
export type ResolucaoFornecedorFatura =
  | { chave: string; acao: "criar"; nome: string; categoriaId: string | null; centroCustoId: string | null }
  | { chave: string; acao: "vincular"; fornecedorExistenteId: string }
  | { chave: string; acao: "ignorar" };

export interface ResultadoImportacaoFatura {
  criados: number;
  fornecedoresCriados: number;
  loteTag: string;
}

const MSG_ARQUIVO_DUPLICADO =
  "Um dos arquivos já foi importado nesta conta antes — para evitar duplicar lançamentos, a importação foi cancelada.";

/** Grava de verdade. `transacoes` já vem filtrado pela tela (só arquivos
    que ela decidiu manter). Registra o hash de CADA arquivo em
    `fin_import_arquivos` antes de gravar qualquer lançamento — se um
    deles já tiver sido importado por outro caminho entre a hora de abrir
    a tela e confirmar (corrida rara), desfaz os hashes já gravados desta
    mesma chamada e para, sem tocar em lançamento nenhum. */
export async function confirmarImportacaoFatura(
  transacoes: TransacaoFaturaRascunho[],
  contaId: string,
  arquivos: { nomeArquivo: string; hash: string }[],
  resolucoesFornecedor: ResolucaoFornecedorFatura[],
): Promise<ResultadoImportacaoFatura> {
  const loteTag = `fatura-${new Date().toISOString()}`;
  const userId = (await supabase.auth.getUser()).data.user?.id ?? null;
  const agora = new Date().toISOString();

  const hashesRegistrados: string[] = [];
  for (const arq of arquivos) {
    const datasDoArquivo = transacoes.filter(t => t.arquivoNome === arq.nomeArquivo).map(t => t.data).sort();
    const { error } = await supabase.from("fin_import_arquivos").insert({
      conta_id: contaId,
      arquivo_hash: arq.hash,
      arquivo_nome: arq.nomeArquivo,
      qtd_linhas: datasDoArquivo.length,
      data_min: datasDoArquivo[0] ?? null,
      data_max: datasDoArquivo[datasDoArquivo.length - 1] ?? null,
      lote_tag: loteTag,
      importado_por: userId,
    });
    if (error) {
      if (hashesRegistrados.length > 0) {
        await supabase.from("fin_import_arquivos").delete()
          .eq("conta_id", contaId).in("arquivo_hash", hashesRegistrados);
      }
      if (error.code === "23505") throw new Error(MSG_ARQUIVO_DUPLICADO);
      throw error;
    }
    hashesRegistrados.push(arq.hash);
  }

  // Cria fornecedor novo numa tacada só — mesmo padrão do Omie: um INSERT
  // com todos de uma vez, não um round-trip por fornecedor.
  const mapaChaveParaId = new Map<string, string>();
  const paraCriar = resolucoesFornecedor.filter(
    (r): r is ResolucaoFornecedorFatura & { acao: "criar" } => r.acao === "criar");
  let fornecedoresCriados = 0;
  if (paraCriar.length > 0) {
    const payload = paraCriar.map(r => ({
      nome: r.nome,
      tipo: "juridica" as const,
      categoria_padrao_id: r.categoriaId,
      centro_custo_padrao_id: r.centroCustoId,
      observacao: `Criado automaticamente pela importação de fatura de cartão (${loteTag}).`,
    }));
    const { data, error } = await supabase.from("fin_fornecedores").insert(payload).select("id, nome");
    if (error) throw error;
    (data ?? []).forEach((f: { id: string; nome: string }, i: number) => {
      mapaChaveParaId.set(paraCriar[i].chave, f.id);
    });
    fornecedoresCriados = data?.length ?? 0;
  }
  for (const r of resolucoesFornecedor) {
    if (r.acao === "vincular") mapaChaveParaId.set(r.chave, r.fornecedorExistenteId);
  }

  const linhas = transacoes.map(t => {
    const fornecedorId = t.fornecedorId ?? (t.fornecedorChave ? mapaChaveParaId.get(t.fornecedorChave) ?? null : null);
    return {
      data: t.data,
      tipo: t.tipo,
      // Fatura já fechada e paga — sempre passado, nunca previsto (ao
      // contrário do Omie, que importa também contas a pagar futuras).
      status: "conciliado" as const,
      conta_id: contaId,
      categoria_id: null,
      centro_custo_id: null,
      fornecedor_id: fornecedorId,
      valor: t.valor,
      descricao: t.historico,
      documento_numero: null,
      observacoes: `[lote:${loteTag}] Titular: ${t.titular}`,
      origem: "importado_fatura_cartao",
      audit_user_id: userId,
      audit_em: agora,
    };
  });

  const TAMANHO_BLOCO = 200;
  let criados = 0;
  for (let i = 0; i < linhas.length; i += TAMANHO_BLOCO) {
    const bloco = linhas.slice(i, i + TAMANHO_BLOCO);
    const { data, error } = await supabase.from("fin_lancamentos").insert(bloco as any).select("id");
    if (error) throw error;
    criados += data?.length ?? 0;
  }

  return { criados, fornecedoresCriados, loteTag };
}

/** Desfaz o lote inteiro (todos os arquivos importados juntos) — mesmo
    padrão exato do `desfazerImportacaoOmie`. */
export async function desfazerImportacaoFatura(loteTag: string): Promise<number> {
  const resultado = await supabase
    .from("fin_lancamentos")
    .delete()
    .ilike("observacoes", `[lote:${loteTag}]%`)
    .select("id");
  const r = conferir(resultado, "A importação");
  if (!r.ok) throw new Error(r.erro);

  await supabase.from("fin_import_arquivos").delete().eq("lote_tag", loteTag);

  return resultado.data?.length ?? 0;
}
