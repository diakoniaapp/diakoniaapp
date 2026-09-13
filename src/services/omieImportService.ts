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
import { conferir } from "@/lib/escritaConferida";
import {
  listarCategoriasTodas, atualizarConta,
  type FinCategoria, type FinMovimentoTipo,
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
  // Dedupe por CNPJ/CPF dentro do próprio lote — "BANCO BRADESCO S.A."
  // repete dezenas de vezes (uma tarifa por dia) com o mesmo CNPJ, e sem
  // isto o resumo contava "76 fornecedores novos" quando o commit (que já
  // dedupe corretamente) ia criar uma fração disso. Achado ao vivo pela
  // Telma comparando o card do resumo com o botão de confirmar.
  const cnpjsNovosNoLote = new Set<string>();
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
      else { fornecedorNomeParaCriar = bruta.clienteFornecedor; cnpjsNovosNoLote.add(bruta.cpfCnpj); }
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
      fornecedoresACriar: cnpjsNovosNoLote.size, pessoasVinculadas,
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
 *  `ConciliacaoOFXDialog`).
 *
 *  `saldoInicial`, quando informado, é gravado ANTES de qualquer
 *  lançamento — de propósito, e AQUI dentro (não na tela chamadora), pra
 *  quem chamar isto não poder reproduzir o bug achado numa revisão em
 *  13/09/2026: o gatilho `fin_recalc_saldo_conta()` (em `fin_lancamentos`)
 *  recalcula `saldo_atual = saldo_inicial + movimento` a cada lançamento
 *  gravado, lendo o `saldo_inicial` que a conta tiver NAQUELE INSTANTE.
 *  Gravar os lançamentos antes do saldo inicial deixa `saldo_atual`
 *  travado em "0 + movimento" em vez de "saldo_inicial + movimento" — bug
 *  real, achado ao vivo pela Telma (Caixa de Envelopes mostrou -R$928 em
 *  vez de R$0) e corrigido direto no banco naquela conta. */
export async function confirmarImportacaoOmie(
  rascunhos: RascunhoOmie[],
  contaId: string,
  saldoInicial?: number | null,
): Promise<ResultadoImportacaoOmie> {
  if (saldoInicial != null) {
    await atualizarConta(contaId, { saldo_inicial: saldoInicial });
  }

  const loteTag = `omie-${new Date().toISOString()}`;
  const userId = (await supabase.auth.getUser()).data.user?.id ?? null;
  const agora = new Date().toISOString();

  // Cria todo fornecedor novo NUMA TACADA SÓ (dedupe por CNPJ/CPF antes de
  // montar o array) — "BANCO BRADESCO S.A." se repete dezenas de vezes no
  // mesmo extrato. Até 13/09/2026 isto era um loop com `await
  // criarFornecedor` sequencial, um round-trip por fornecedor novo (achado
  // numa revisão: um extrato com 76 fornecedores novos levava 76
  // round-trips em série). `criarFornecedor` insere um de cada vez porque
  // devolve `.single()`; aqui insere-se direto (sem passar por ela) porque
  // o volume pede um único INSERT com vários valores.
  const cacheFornecedor = new Map<string, string>();
  const novosPorCnpj = new Map<string, string>(); // cnpjCpf → nome
  for (const r of rascunhos) {
    if (r.fornecedorNomeParaCriar && r.cpfCnpj && !novosPorCnpj.has(r.cpfCnpj)) {
      novosPorCnpj.set(r.cpfCnpj, r.fornecedorNomeParaCriar);
    }
  }
  let fornecedoresCriados = 0;
  if (novosPorCnpj.size > 0) {
    const payload = Array.from(novosPorCnpj, ([cnpjCpf, nome]) => ({
      nome,
      cnpj_cpf: cnpjCpf,
      tipo: cnpjCpf.length === 14 ? "juridica" as const : "fisica" as const,
      observacao: `Criado automaticamente pela importação do Omie (${loteTag}).`,
    }));
    const { data, error } = await supabase.from("fin_fornecedores").insert(payload).select("id, cnpj_cpf");
    if (error) throw error;
    for (const f of (data ?? []) as { id: string; cnpj_cpf: string }[]) {
      cacheFornecedor.set(f.cnpj_cpf, f.id);
    }
    fornecedoresCriados = data?.length ?? 0;
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
 *  reaproveitado por um lançamento manual feito depois da importação.
 *
 *  Usa `conferir()` (achado numa revisão em 13/09/2026: antes só checava
 *  `error`, e um DELETE barrado pela RLS devolve sucesso com zero linhas
 *  — indistinguível de "não achou nada pra apagar". O botão "Desfazer"
 *  só existe na tela logo após uma importação bem-sucedida e some depois
 *  do primeiro uso, então zero linhas apagadas aqui só pode significar
 *  bloqueio, nunca "já tinha sido desfeito". */
export async function desfazerImportacaoOmie(loteTag: string): Promise<number> {
  const resultado = await supabase
    .from("fin_lancamentos")
    .delete()
    .ilike("observacoes", `[lote:${loteTag}]%`)
    .select("id");
  const r = conferir(resultado, "A importação");
  if (!r.ok) throw new Error(r.erro);
  return resultado.data?.length ?? 0;
}
