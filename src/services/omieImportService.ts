// ─── omieImportService.ts — trazer histórico do Omie pro Diakonia ────────
//
// Fase seguinte ao roadmap de Fornecedores (docs/ROADMAP_FINANCEIRO_ERP.md):
// pedido direto da Telma em 13/09/2026, fora do roadmap original. Ao
// contrário da conciliação de OFX (`ofxService.ts`), que só CASA extrato
// com lançamento já existente, aqui não existe lançamento nenhum no
// Diakonia ainda — é histórico puro, então o caminho é CRIAR.
//
// Decisões da Telma (13/09/2026):
//   1. Fornecedor sem CNPJ cadastrado ainda → cria automaticamente.
//   2. CPF de quem deu dízimo/oferta → tenta vincular a um membro já
//      cadastrado (nunca cria membro novo — fora do escopo de uma
//      importação financeira).
//   3. Cada importação carimba um "lote" na observação
//      (`[lote:omie-<timestamp>]`), pra dar pra desfazer o lote inteiro
//      se algo vier errado — sem precisar de tabela nova.
import { supabase } from "@/integrations/supabase/client";
import {
  listarCategoriasTodas, criarFornecedor, criarLancamento,
  type FinCategoria, type FinMovimentoTipo, type FinFornecedor,
} from "./finService";
import {
  parseOmieXlsx, separarCategoriaEPercentuais, ehTransferencia,
  type OmieLinhaBruta,
} from "@/lib/omieImport";

export interface RascunhoOmie {
  data: string;
  tipo: FinMovimentoTipo;
  valor: number;
  categoriaBruta: string;
  categoriaId: string | null;
  categoriaNome: string | null;
  ehTransferencia: boolean;
  descricao: string;
  documentoNumero: string | null;
  observacoes: string | null;
  cpfCnpj: string | null;
  fornecedorId: string | null;
  fornecedorNomeParaCriar: string | null;
  pessoaId: string | null;
  pessoaNome: string | null;
}

export interface ResumoImportacaoOmie {
  totalLinhas: number;
  totalEntradas: number;
  totalSaidas: number;
  categoriasNaoEncontradas: string[];
  fornecedoresACriar: number;
  pessoasVinculadas: number;
  saldoAnterior: number | null;
}

function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export async function lerArquivoOmie(file: File): Promise<{ linhas: OmieLinhaBruta[]; saldoAnterior: number | null }> {
  const buffer = await file.arrayBuffer();
  return parseOmieXlsx(buffer);
}

export async function prepararImportacaoOmie(
  linhasBrutas: OmieLinhaBruta[],
  saldoAnterior: number | null,
): Promise<{ rascunhos: RascunhoOmie[]; resumo: ResumoImportacaoOmie }> {
  const categorias = await listarCategoriasTodas();
  const mapaCategoria = new Map<string, FinCategoria>();
  for (const c of categorias) {
    const chave = normalizar(c.nome);
    // Se houver categoria ativa E inativa com o mesmo nome, a ativa vence.
    if (!mapaCategoria.has(chave) || c.ativo) mapaCategoria.set(chave, c);
  }

  // Explode rateios (categoria com percentual) em itens separados, cada
  // um carregando a linha bruta original de onde veio.
  const itens: { bruta: OmieLinhaBruta; categoria: string; valor: number }[] = [];
  for (const l of linhasBrutas) {
    if (ehTransferencia(l.categoriaBruta)) {
      itens.push({ bruta: l, categoria: l.categoriaBruta, valor: l.valor });
      continue;
    }
    for (const parte of separarCategoriaEPercentuais(l.categoriaBruta, l.valor)) {
      itens.push({ bruta: l, categoria: parte.categoria, valor: parte.valor });
    }
  }

  // Busca em lote — fornecedor por CNPJ/CPF (saídas) e pessoa por CPF (entradas)
  const cnpjsSaida = Array.from(new Set(
    itens.filter(i => i.valor < 0 && i.bruta.cpfCnpj).map(i => i.bruta.cpfCnpj!)));
  const cpfsEntrada = Array.from(new Set(
    itens.filter(i => i.valor >= 0 && i.bruta.cpfCnpj?.length === 11).map(i => i.bruta.cpfCnpj!)));

  const [{ data: fornecedoresExistentes }, { data: pessoasExistentes }] = await Promise.all([
    cnpjsSaida.length
      ? supabase.from("fin_fornecedores").select("id, nome, cnpj_cpf").in("cnpj_cpf", cnpjsSaida)
      : Promise.resolve({ data: [] as any[] }),
    cpfsEntrada.length
      ? supabase.from("membros").select("id, nome_completo, cpf").in("cpf", cpfsEntrada)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const mapaFornecedor = new Map((fornecedoresExistentes ?? []).map((f: any) => [f.cnpj_cpf, f]));
  const mapaPessoa = new Map((pessoasExistentes ?? []).map((p: any) => [p.cpf, p]));

  const categoriasNaoEncontradas = new Set<string>();
  let fornecedoresACriar = 0;
  let pessoasVinculadas = 0;
  let totalEntradas = 0;
  let totalSaidas = 0;

  const rascunhos: RascunhoOmie[] = itens.map(({ bruta, categoria, valor }) => {
    const tipo: FinMovimentoTipo = valor >= 0 ? "entrada" : "saida";
    if (tipo === "entrada") totalEntradas += valor; else totalSaidas += Math.abs(valor);

    const transferencia = ehTransferencia(categoria);
    let categoriaId: string | null = null;
    let categoriaNome: string | null = null;
    if (!transferencia) {
      const cat = mapaCategoria.get(normalizar(categoria));
      if (cat) { categoriaId = cat.id; categoriaNome = cat.nome; }
      else categoriasNaoEncontradas.add(categoria);
    }

    let fornecedorId: string | null = null;
    let fornecedorNomeParaCriar: string | null = null;
    let pessoaId: string | null = null;
    let pessoaNome: string | null = null;

    if (!transferencia && tipo === "saida" && bruta.cpfCnpj) {
      const existente = mapaFornecedor.get(bruta.cpfCnpj);
      if (existente) fornecedorId = existente.id;
      else { fornecedorNomeParaCriar = bruta.clienteFornecedor; fornecedoresACriar++; }
    }
    if (!transferencia && tipo === "entrada" && bruta.cpfCnpj?.length === 11) {
      const existente = mapaPessoa.get(bruta.cpfCnpj);
      if (existente) { pessoaId = existente.id; pessoaNome = existente.nome_completo; pessoasVinculadas++; }
    }

    return {
      data: bruta.data, tipo, valor: Math.abs(valor),
      categoriaBruta: categoria, categoriaId, categoriaNome,
      ehTransferencia: transferencia,
      descricao: bruta.clienteFornecedor,
      documentoNumero: bruta.documento,
      observacoes: bruta.observacoes,
      cpfCnpj: bruta.cpfCnpj,
      fornecedorId, fornecedorNomeParaCriar,
      pessoaId, pessoaNome,
    };
  });

  return {
    rascunhos,
    resumo: {
      totalLinhas: linhasBrutas.length,
      totalEntradas, totalSaidas,
      categoriasNaoEncontradas: Array.from(categoriasNaoEncontradas),
      fornecedoresACriar, pessoasVinculadas,
      saldoAnterior,
    },
  };
}

export interface ResultadoImportacaoOmie {
  criados: number;
  fornecedoresCriados: number;
  loteTag: string;
}

/** Grava de verdade. `contaId` é a mesma para todas as linhas — a tela
 *  de importação é sempre aberta a partir de UMA conta (mesmo padrão do
 *  `ConciliacaoOFXDialog`). */
export async function confirmarImportacaoOmie(
  rascunhos: RascunhoOmie[],
  contaId: string,
): Promise<ResultadoImportacaoOmie> {
  const loteTag = `omie-${new Date().toISOString()}`;
  const userId = (await supabase.auth.getUser()).data.user?.id ?? null;
  const agora = new Date().toISOString();

  // Cria cada fornecedor novo UMA vez só (dedupe por CNPJ/CPF) — "BANCO
  // BRADESCO S.A." se repete dezenas de vezes no mesmo extrato.
  const cacheFornecedor = new Map<string, string>();
  let fornecedoresCriados = 0;
  for (const r of rascunhos) {
    if (r.fornecedorNomeParaCriar && r.cpfCnpj && !cacheFornecedor.has(r.cpfCnpj)) {
      const novo: FinFornecedor = await criarFornecedor({
        nome: r.fornecedorNomeParaCriar,
        cnpj_cpf: r.cpfCnpj,
        tipo: r.cpfCnpj.length === 14 ? "juridica" : "fisica",
        observacao: `Criado automaticamente pela importação do Omie (${loteTag}).`,
      });
      cacheFornecedor.set(r.cpfCnpj, novo.id);
      fornecedoresCriados++;
    }
  }

  const linhas = rascunhos.map(r => {
    const fornecedorId = r.fornecedorId ?? (r.cpfCnpj ? cacheFornecedor.get(r.cpfCnpj) ?? null : null);
    const obsBase = r.observacoes ? ` ${r.observacoes}` : "";
    return {
      data: r.data,
      tipo: r.tipo,
      status: "conciliado" as const,
      conta_id: contaId,
      categoria_id: r.categoriaId,
      fornecedor_id: fornecedorId,
      pessoa_id: r.pessoaId,
      valor: r.valor,
      descricao: r.descricao,
      documento_numero: r.documentoNumero,
      observacoes: `[lote:${loteTag}]${obsBase}`,
      origem: r.ehTransferencia ? "transferencia" : "importado_omie",
      audit_user_id: userId,
      audit_em: agora,
    };
  });

  // Insere em blocos de 200 — não é limite conhecido do PostgREST pra
  // este volume, é só prudência (evitar um payload gigante numa tacada
  // só quando o histórico trazido cobrir vários meses de uma vez).
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

/** Desfaz um lote inteiro pelo carimbo gravado em `observacoes`. Não
 *  apaga fornecedor criado junto — o fornecedor pode já ter sido
 *  reaproveitado por um lançamento manual feito depois da importação. */
export async function desfazerImportacaoOmie(loteTag: string): Promise<number> {
  const { data, error } = await supabase
    .from("fin_lancamentos")
    .delete()
    .ilike("observacoes", `[lote:${loteTag}]%`)
    .select("id");
  if (error) throw error;
  return data?.length ?? 0;
}
