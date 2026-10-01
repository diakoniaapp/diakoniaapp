// ─── prestacaoContasService.ts ───────────────────────────────────────────
//
// Projeto Tesouraria (docs/PROJETO_TESOURARIA_PRESTACAO_CONTAS.md §8.3 e
// §9) — gera ao vivo, de `fin_lancamentos`, a mesma grade que a tesouraria
// hoje monta à mão no Excel: Saldo Anterior → Receitas (por classificação)
// → Despesas (por ministério/centro de custo) → Despesas Financeiras →
// Outras Despesas → Resultado → Saldo Final, uma coluna por mês.
//
// ── PERÍODO É UM NÚMERO DE MESES, NÃO "TRIMESTRE" ────────────────────────
// Revisado em 12/09/2026, por pedido explícito: "não deixar o fechamento
// por trimestre amarrado, e sim como opção". O relatório é MENSAL por
// padrão (`qtdMeses = 1`) — quem olha escolhe acrescentar mais meses (2, 3,
// 6, 12...) a partir de um mês/ano inicial. Trimestre continua existindo,
// só que como um preset de `qtdMeses = 3` na tela, igual a "semestral" ou
// "anual" seriam — não como o formato do dado. `gerarPrestacaoContas`
// nunca soube o que é "trimestre"; a versão anterior só computava errado
// o mês inicial a partir de um número 1-4. Esta versão recebe o mês
// inicial direto.
//
// ── POR QUE SÓ CATEGORIAS DO PLANO OFICIAL ENTRAM ────────────────────────
// Só lançamentos cuja categoria tem `classificacao_dre` preenchida (as 59
// categorias oficiais da Fase 1) e bate com o tipo (entrada/saída) somam
// nos grupos abaixo. O resto não some em silêncio — entra em
// `excluidos`, classificado por MOTIVO (transferência entre contas
// próprias, sem categoria, categoria inválida/desativada, fora do Plano
// Oficial, ou classificação incompatível com o tipo — revisão de
// 29/09/2026, ver o comentário grande de `MotivoExclusao` abaixo).
//
// ── A NOTA POR LINHA FICA NO ÚLTIMO MÊS DO PERÍODO ───────────────────────
// A planilha real tem UMA célula de comentário por linha (categoria dentro
// de um ministério), cobrindo o período inteiro em texto livre — não uma
// célula por mês. `fin_relatorio_notas` (Fase 4) guarda por mês para ter a
// flexibilidade se um dia for útil, mas o comportamento replicado aqui é o
// do Excel: uma nota por linha, ancorada no último mês do período — seja
// ele de 1 mês ou de 12.
//
// ── FILTRO POR CONTA (12/09/2026) ────────────────────────────────────────
// "Relatório por caixa" — pedido explícito: a mesma demonstração, mas só
// com o que se moveu numa conta específica (Caixinha, Bradesco...), não
// todas juntas. `contaId` é opcional em toda a cadeia; sem ele, o
// comportamento é exatamente o de antes (todas as contas somadas). Notas
// (`fin_relatorio_notas`) continuam por categoria/centro, não por conta —
// uma nota sobre "Sustento Pastoral" vale pra qualquer conta que tenha
// pago, então não teria sentido fragmentar por conta também.
import { supabase } from "@/integrations/supabase/client";
import { daquiAMeses, daquiADias } from "@/lib/data";
import {
  listarLancamentosSemTeto, listarContas, listarCategoriasTodas, listarCentrosCusto, nomeExtrato,
  type FinClassificacaoDRE, type FinCentroCusto, type FinLancamentoExtenso,
} from "./finService";
import { listarNotasDoPeriodo } from "./relatorioNotasService";
import { normalizarNome } from "@/lib/fuzzyNome";

// ── Auditoria dos lançamentos excluídos da demonstração (29/09/2026) ───────
//
// Pedido dela: a nota de rodapé ("237 lançamentos... sem categoria do Plano
// de Contas Oficial, ou é transferência") misturava três coisas de natureza
// bem diferente debaixo de um "ou" só — e uma das três nem é problema.
//
// Motivo, em ordem de prioridade (cada lançamento cai no PRIMEIRO que bater):
//
//   transferencia     origem==="transferencia" — as duas pernas de uma
//                     transferência entre contas próprias. Não é receita nem
//                     despesa de verdade — comportamento NORMAL, não erro.
//   sem_categoria     categoria_id nulo. Precisa de categorização.
//   categoria_invalida categoria_id aponta pra uma categoria que não existe
//                     mais, ou foi desativada (`listarCategoriasTodas`, não
//                     `listarCategorias` — a versão anterior só carregava
//                     categoria ATIVA, então uma categoria desativada caía
//                     aqui como se fosse "sem categoria", o que é outra
//                     coisa: o lançamento TEM uma categoria, só que ela não
//                     resolve mais).
//   fora_do_plano     categoria existe e está ativa, mas não é uma das 59
//                     categorias do Plano Oficial (`classificacao_dre`
//                     nulo) — Campanhas, Eventos, Vendas, Materiais EBD...
//                     Categoria legítima, só fora do escopo DESTA
//                     demonstração — normal, não erro.
//   inconsistencia_classificacao  categoria tem `classificacao_dre`
//                     preenchido, mas da POLARIDADE ERRADA pro tipo do
//                     lançamento (categoria de despesa numa entrada, ou de
//                     receita numa saída). Achado auditando a pedido dela
//                     ("pode existir um problema de classificação fazendo
//                     receitas ou despesas válidas ficarem fora"): a versão
//                     anterior do código tinha `if (!mapa) return` — o
//                     lançamento SUMIA sem entrar nem na demonstração nem
//                     na contagem de excluídos. Bug real, silencioso, sem
//                     nenhum aviso na tela. Agora conta e aparece.
//
// "Vinculados a conta inativa" (o 4º motivo que ela pediu pra auditar) NÃO
// é um motivo de exclusão aqui — investigado e descartado: esta função
// nunca consultou `listarContas()`, então o status da conta nunca decidiu
// se um lançamento entra ou não. E é o comportamento CERTO: uma conta
// desativada HOJE não apaga retroativamente o dinheiro que se moveu nela
// dentro do período — só reflete que a igreja parou de usá-la depois.
export type MotivoExclusao =
  | "transferencia" | "sem_categoria" | "categoria_invalida"
  | "fora_do_plano" | "inconsistencia_classificacao";

export const MOTIVO_EXCLUSAO_LABEL: Record<MotivoExclusao, string> = {
  transferencia: "Transferências entre contas próprias",
  sem_categoria: "Lançamentos sem categoria",
  categoria_invalida: "Categoria inválida ou desativada",
  fora_do_plano: "Fora do Plano de Contas Oficial",
  inconsistencia_classificacao: "Categoria incompatível com o tipo",
};

export const MOTIVO_EXCLUSAO_EXPLICACAO: Record<MotivoExclusao, string> = {
  transferencia: "Não compõem receitas nem despesas — dinheiro só mudou de conta dentro da própria igreja.",
  sem_categoria: "Precisam de uma categoria do Plano de Contas Oficial para entrar na demonstração.",
  categoria_invalida: "A categoria vinculada foi desativada ou não existe mais — reclassifique o lançamento.",
  fora_do_plano: "A categoria existe e está ativa, mas não é uma das categorias do Plano de Contas Oficial (ex.: Campanhas, Eventos, Vendas).",
  inconsistencia_classificacao: "A categoria vinculada é de despesa numa entrada, ou de receita numa saída — corrija a categoria do lançamento.",
};

// Só os dois primeiros são normais — o resto pede alguma correção. Ver o
// comentário grande acima.
export const MOTIVOS_NORMAIS: MotivoExclusao[] = ["transferencia", "fora_do_plano"];

export interface LancamentoExcluido {
  id: string;
  data: string;
  contaNome: string;
  favorecido: string;
  valor: number;
  tipo: "entrada" | "saida";
  motivo: MotivoExclusao;
  // Centro de Pendências (01/10/2026, pedido dela) — categoria/centro
  // ATUAIS do lançamento (podem ser nulos, ou apontar pra algo inválido —
  // é exatamente isso que `motivo` está denunciando), e o lançamento
  // inteiro, pra abrir direto no `LancamentoForm` sem precisar buscar de
  // novo no banco. `gerarPrestacaoContas` já tem o objeto completo em
  // mãos no momento em que classifica o motivo — reaproveitado, não
  // refeito.
  categoriaNome: string | null;
  centroNome: string | null;
  lancamento: FinLancamentoExtenso;
}

export interface GrupoExclusao { qtd: number; valor: number }

export interface PrestacaoContasExcluidos {
  porMotivo: Record<MotivoExclusao, GrupoExclusao>;
  itens: LancamentoExcluido[];
}

function motivoDoExcluido(
  l: FinLancamentoExtenso,
  catMap: Map<string, { ativo: boolean; classificacao_dre: FinClassificacaoDRE | null }>,
): MotivoExclusao | null {
  if (l.origem === "transferencia") return "transferencia";
  if (!l.categoria_id) return "sem_categoria";
  const cat = catMap.get(l.categoria_id);
  if (!cat || !cat.ativo) return "categoria_invalida";
  if (!cat.classificacao_dre) return "fora_do_plano";
  const receita = cat.classificacao_dre === "receitas_regulares" || cat.classificacao_dre === "outras_receitas";
  const despesa = !receita; // despesas | despesas_financeiras | outras_despesas
  if (l.tipo === "entrada" && despesa) return "inconsistencia_classificacao";
  if (l.tipo === "saida" && receita) return "inconsistencia_classificacao";
  return null; // classificação bate — entra na demonstração normalmente
}

export interface PrestacaoContasLinha {
  categoriaId: string;
  nome: string;
  valores: number[]; // 1 posição por mês do período, na ordem de `meses`
  total: number;
  temNota: boolean;
}
export interface PrestacaoContasGrupo {
  chave: string;
  titulo: string;
  linhas: PrestacaoContasLinha[];
  valores: number[];
  total: number;
  // Preenchido em QUALQUER centro principal que tiver subgrupo contábil
  // — não só Administração (era assim até 17/09/2026, ver comentário de
  // `agruparAdministracao`). Quando presente, a tela renderiza estes
  // sub-blocos em vez de `linhas`.
  subgrupos?: PrestacaoContasGrupo[];
}
export interface PrestacaoContasMes { ano: number; numero: number; nome: string; }

export interface PrestacaoContasResultado {
  meses: PrestacaoContasMes[]; // comprimento = qtdMeses pedido
  mesAncoraNota: { ano: number; mes: number }; // último mês do período — onde a nota de cada linha vive
  saldoAnterior: number[];
  gruposReceita: PrestacaoContasGrupo[];
  totalReceitas: number[];
  gruposDespesaPorCentro: PrestacaoContasGrupo[];
  totalDespesas: number[];
  grupoDespesasFinanceiras: PrestacaoContasGrupo | null;
  grupoOutrasDespesas: PrestacaoContasGrupo | null;
  resultado: number[];
  saldoFinal: number[];
  qtdLancamentos: number;
  excluidos: PrestacaoContasExcluidos;
  // Pedido da Telma (16/09/2026): quantos dizimistas por mês, contados por
  // NOME ÚNICO — não por `pessoa_id`. A maioria dos lançamentos de Dízimo
  // importados do Omie não tem `pessoa_id` vinculado (só o nome cru do
  // extrato bancário em `descricao`); exigir o vínculo faria a contagem
  // real cair quase a zero. Nomes são normalizados (sem acento/maiúscula,
  // `normalizarNome` de fuzzyNome.ts — mesma função já usada para não
  // duplicar a mesma pessoa grafada diferente em outra tela) antes de
  // entrar no Set de cada mês, e "OFERTAS NÃO IDENTIFICADAS" (o placeholder
  // do Omie pra depósito sem identificação) é excluído — não é uma pessoa.
  dizimistasPorMes: number[];
}

// Exportado — painelTesourariaService.ts reaproveita pro rótulo do "período
// não fechado", em vez de duplicar os 12 nomes.
export const NOME_MES = [
  "", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const TITULO_CLASSIFICACAO_RECEITA: Record<string, string> = {
  receitas_regulares: "Receitas Regulares",
  outras_receitas: "Outras Receitas",
};

type MapaValores = Map<string, { nome: string; valores: number[] }>;

function novaLinha(qtdMeses: number): number[] {
  return new Array(qtdMeses).fill(0);
}

function acumular(mapa: MapaValores, id: string, nome: string, idx: number, valor: number, qtdMeses: number) {
  if (!mapa.has(id)) mapa.set(id, { nome, valores: novaLinha(qtdMeses) });
  mapa.get(id)!.valores[idx] += valor;
}

function somaMeses(valores: number[]): number {
  return valores.reduce((s, v) => s + v, 0);
}

function linhasDoMapa(mapa: MapaValores, notas: Set<string>): PrestacaoContasLinha[] {
  return Array.from(mapa.entries())
    .filter(([, v]) => v.valores.some(x => x !== 0))
    .map(([id, v]) => ({
      categoriaId: id, nome: v.nome, valores: v.valores, total: somaMeses(v.valores),
      temNota: notas.has(id),
    }))
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
}

function subtotalPorMes(linhas: PrestacaoContasLinha[], qtdMeses: number): number[] {
  return Array.from({ length: qtdMeses }, (_, i) => linhas.reduce((s, l) => s + l.valores[i], 0));
}

function somaGrupos(grupos: PrestacaoContasGrupo[], qtdMeses: number): number[] {
  return Array.from({ length: qtdMeses }, (_, i) => grupos.reduce((s, g) => s + g.valores[i], 0));
}

/**
 * Junta os grupos de despesa cujo centro de custo é subgrupo contábil de
 * ALGUM centro principal num único grupo composto — um bloco por PAI que
 * tiver pelo menos um subgrupo, replicando o jeito que a planilha real
 * já quebrava "MINISTÉRIO DE ADMINISTRAÇÃO" (docs/PROJETO_TESOURARIA_
 * PRESTACAO_CONTAS.md §1.6) em Pessoal/Serviços/Ornamentação/Consumo/
 * Patrimônio, só que agora generalizado.
 *
 * Até 17/09/2026 esta função só sabia de UM ministério — pegava o
 * primeiro subgrupo encontrado, assumia que TODOS os subgrupos do banco
 * eram filhos DELE, e rotulava o composto sempre "Ministério de
 * Administração" fixo no código. Isso quebrou de verdade assim que a
 * Telma passou a poder criar subgrupo em qualquer ministério
 * (`CentroCustoForm.tsx`, mesma sessão) — Diaconia, Educação Cristã e
 * Evangelismo e Missões ganharam subgrupos próprios, e a Prestação de
 * Contas OFICIAL (a que vai pro Conselho Fiscal) ia empilhar o gasto de
 * todos eles dentro de "Ministério de Administração", só porque essa
 * função lia `centro_pai_id` de qualquer subgrupo que encontrasse
 * primeiro. Agora agrupa por PAI de verdade — `Map<centro_pai_id,
 * subgrupos[]>` — e nomeia cada composto pelo nome real do centro pai,
 * não mais um título fixo.
 */
function agruparAdministracao(
  grupos: PrestacaoContasGrupo[], centros: FinCentroCusto[], qtdMeses: number,
): PrestacaoContasGrupo[] {
  const subgruposPorPai = new Map<string, FinCentroCusto[]>();
  centros.forEach(c => {
    if (c.vinculo_tipo === "subgrupo_administracao" && c.centro_pai_id) {
      const lista = subgruposPorPai.get(c.centro_pai_id) ?? [];
      lista.push(c);
      subgruposPorPai.set(c.centro_pai_id, lista);
    }
  });
  if (subgruposPorPai.size === 0) return grupos; // nenhum centro tem subgrupo nesta base — nada a fazer

  const centroMap = new Map(centros.map(c => [c.id, c]));
  const grupoPorChave = new Map(grupos.map(g => [g.chave, g]));
  const chavesConsumidas = new Set<string>();
  const compostos: PrestacaoContasGrupo[] = [];

  subgruposPorPai.forEach((filhosCentro, paiId) => {
    const paiNome = centroMap.get(paiId)?.nome ?? "Centro removido";

    const gruposFilhos: PrestacaoContasGrupo[] = [];
    filhosCentro.forEach(sg => {
      const g = grupoPorChave.get(sg.id);
      if (g) { gruposFilhos.push(g); chavesConsumidas.add(sg.id); }
    });
    // Lançamento direto no centro pai, sem subgrupo escolhido — entra
    // como uma linha a mais dentro do composto, não some.
    const grupoPai = grupoPorChave.get(paiId);
    if (grupoPai) {
      gruposFilhos.push({ ...grupoPai, titulo: `${paiNome} · Sem subgrupo` });
      chavesConsumidas.add(paiId);
    }
    if (gruposFilhos.length === 0) return; // pai sem nenhum gasto no período — nem nele nem nos filhos

    gruposFilhos.sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
    const valores = somaGrupos(gruposFilhos, qtdMeses);
    compostos.push({
      chave: paiId,
      titulo: paiNome,
      linhas: [],
      subgrupos: gruposFilhos,
      valores,
      total: somaMeses(valores),
    });
  });

  const resto = grupos.filter(g => !chavesConsumidas.has(g.chave));
  return [...resto, ...compostos];
}

/**
 * Saldo no instante imediatamente ANTES de `dataLimiteExclusiva`. Sem
 * `contaId`: todas as contas somadas (ativas e inativas — o histórico não
 * some). Com `contaId`: só o saldo inicial e o movimento daquela conta.
 *
 * Achado em 15/09/2026 (pergunta da Telma sobre um valor estranho na coluna
 * "Saldo" do extrato): esta função somava o movimento chamando
 * `listarLancamentos`, que tem teto de 300 linhas — assim que uma conta
 * passa de 300 lançamentos ANTES da data pedida, a soma em memória passava
 * a truncar (descartando os mais antigos) e o saldo "antes do período"
 * saía errado, mesmo a conta tendo `saldo_atual` certo (o gatilho
 * `fin_recalc_saldo_conta` nunca passa por este teto). Agora a soma é feita
 * no banco, pela função `fin_movimento_antes_de` (migration
 * 20260915180000) — sem buscar linha nenhuma pro cliente, sem teto.
 */
export async function saldoAcumuladoAntesDe(dataLimiteExclusiva: string, contaId?: string): Promise<number> {
  const contas = await listarContas(true);
  const contasRelevantes = contaId ? contas.filter(c => c.id === contaId) : contas;
  const saldoInicial = contasRelevantes.reduce((s, c) => s + Number(c.saldo_inicial), 0);

  if (contaId) {
    const { data, error } = await supabase.rpc("fin_movimento_antes_de", {
      p_data_limite_exclusiva: dataLimiteExclusiva,
      p_conta_id: contaId,
    });
    if (error) throw error;
    return saldoInicial + Number(data ?? 0);
  }

  // Sem contaId: uma chamada por conta (a função não aceita lista) — o
  // volume é 5 contas hoje, não pesa somar em paralelo.
  const movimentos = await Promise.all(contasRelevantes.map(async (c) => {
    const { data, error } = await supabase.rpc("fin_movimento_antes_de", {
      p_data_limite_exclusiva: dataLimiteExclusiva,
      p_conta_id: c.id,
    });
    if (error) throw error;
    return Number(data ?? 0);
  }));

  return saldoInicial + movimentos.reduce((s, m) => s + m, 0);
}

/**
 * @param ano       ano do primeiro mês do período
 * @param mesInicio 1-12
 * @param qtdMeses  quantos meses o período tem, a partir de `mesInicio` — 1 (padrão/mensal), 3 (o antigo "trimestre", agora só um preset da tela), 6, 12, ou qualquer outro número que a tesouraria escolher
 * @param contaId   opcional — restringe a demonstração a uma única conta ("relatório por caixa"). Sem ele, soma todas as contas, igual sempre foi.
 */
export async function gerarPrestacaoContas(ano: number, mesInicio: number, qtdMeses: number, contaId?: string): Promise<PrestacaoContasResultado> {
  const dataInicio = `${ano}-${String(mesInicio).padStart(2, "0")}-01`;
  const dataFimExclusiva = daquiAMeses(dataInicio, qtdMeses);
  const dataFim = daquiADias(dataFimExclusiva, -1);

  // Chave "YYYY-MM" por posição — não `mesInicio + i`, porque um período de
  // vários meses pode atravessar virada de ano (ex.: Nov/2026 + 6 meses
  // chega em Abr/2027).
  const mesesChaves = Array.from({ length: qtdMeses }, (_, i) => daquiAMeses(dataInicio, i).slice(0, 7));
  const meses: PrestacaoContasMes[] = mesesChaves.map(chave => {
    const [a, m] = chave.split("-").map(Number);
    return { ano: a, numero: m, nome: NOME_MES[m] };
  });
  const ultimoMes = meses[meses.length - 1];
  const mesAncoraNota = { ano: ultimoMes.ano, mes: ultimoMes.numero };

  const [lancsBrutos, categorias, centros, notasDoMesAncora, saldoAnterior] = await Promise.all([
    listarLancamentosSemTeto({ dataInicio, dataFim, contaId }),
    // Todas, não só ativas (`listarCategorias()`) — precisa saber se uma
    // categoria referenciada foi desativada, pra distinguir "sem
    // categoria" de "categoria inválida". Ver `motivoDoExcluido`.
    listarCategoriasTodas(),
    listarCentrosCusto(),
    listarNotasDoPeriodo(mesAncoraNota.ano, mesAncoraNota.mes),
    Promise.all(mesesChaves.map(chave => saldoAcumuladoAntesDe(`${chave}-01`, contaId))),
  ]);

  const lancs = lancsBrutos.filter(l => l.status === "realizado" || l.status === "conciliado");
  const catMap = new Map(categorias.map(c => [c.id, c]));
  const centroMap = new Map(centros.map(c => [c.id, c]));
  const notas = new Set(notasDoMesAncora.map(n => `${n.categoria_id ?? ""}|${n.centro_custo_id ?? ""}`));
  const temNota = (categoriaId: string, centroCustoId: string | null) =>
    notas.has(`${categoriaId}|${centroCustoId ?? ""}`);

  function indiceDoMes(dataYmd: string): number {
    return mesesChaves.indexOf(dataYmd.slice(0, 7));
  }

  const excluidosPorMotivo: Record<MotivoExclusao, GrupoExclusao> = {
    transferencia: { qtd: 0, valor: 0 },
    sem_categoria: { qtd: 0, valor: 0 },
    categoria_invalida: { qtd: 0, valor: 0 },
    fora_do_plano: { qtd: 0, valor: 0 },
    inconsistencia_classificacao: { qtd: 0, valor: 0 },
  };
  const itensExcluidos: LancamentoExcluido[] = [];
  function registrarExcluido(l: FinLancamentoExtenso, motivo: MotivoExclusao) {
    const valor = Number(l.valor);
    excluidosPorMotivo[motivo].qtd++;
    excluidosPorMotivo[motivo].valor += valor;
    itensExcluidos.push({
      id: l.id, data: l.data, contaNome: l.conta_nome ?? "—",
      favorecido: nomeExtrato(l).principal, valor, tipo: l.tipo, motivo,
      categoriaNome: l.categoria_nome ?? null, centroNome: l.centro_nome ?? null,
      lancamento: l,
    });
  }

  // ── Receitas: agrupadas por classificação, nunca por centro ────────────
  const porClassificacaoReceita = new Map<FinClassificacaoDRE, MapaValores>([
    ["receitas_regulares", new Map()],
    ["outras_receitas", new Map()],
  ]);
  // Um Set de nomes normalizados por mês — só para a categoria "Dízimos"
  // (mesmo padrão de regex de `classificarIndicadorEclesiastico` em
  // finService.ts, invertido de propósito aqui também não importa porque
  // não há "missão"/"oferta" em jogo, só dízimo).
  const nomesDizimistasPorMes: Set<string>[] = Array.from({ length: qtdMeses }, () => new Set<string>());
  const PLACEHOLDER_SEM_IDENTIFICACAO = normalizarNome("OFERTAS NÃO IDENTIFICADAS");

  lancs.filter(l => l.tipo === "entrada").forEach(l => {
    const motivo = motivoDoExcluido(l, catMap);
    if (motivo) { registrarExcluido(l, motivo); return; }
    const cat = catMap.get(l.categoria_id!)!;
    const idx = indiceDoMes(l.data);
    // `motivoDoExcluido` já garantiu que `classificacao_dre` é de receita
    // (senão teria devolvido "inconsistencia_classificacao") — o mapa
    // sempre existe aqui.
    const mapa = porClassificacaoReceita.get(cat.classificacao_dre!)!;
    acumular(mapa, cat.id, cat.nome, idx, Number(l.valor), qtdMeses);

    if (/d[ií]zimo/i.test(cat.nome)) {
      const nomeBruto = l.pessoa_nome ?? l.descricao ?? "";
      const nome = normalizarNome(nomeBruto);
      if (nome && nome !== PLACEHOLDER_SEM_IDENTIFICACAO) nomesDizimistasPorMes[idx].add(nome);
    }
  });
  const dizimistasPorMes = nomesDizimistasPorMes.map(s => s.size);
  const gruposReceita: PrestacaoContasGrupo[] = (["receitas_regulares", "outras_receitas"] as const)
    .map(chave => {
      const linhas = linhasDoMapa(porClassificacaoReceita.get(chave)!, new Set(
        Array.from(porClassificacaoReceita.get(chave)!.keys()).filter(id => temNota(id, null)),
      ));
      const valores = subtotalPorMes(linhas, qtdMeses);
      return { chave, titulo: TITULO_CLASSIFICACAO_RECEITA[chave], linhas, valores, total: somaMeses(valores) };
    })
    .filter(g => g.linhas.length > 0);

  // ── Despesas: "despesas" por centro de custo; financeiras/outras, flat ─
  const CENTRO_SEM = "__sem_centro__";
  const porCentro = new Map<string, MapaValores>();
  const mapaDespFin: MapaValores = new Map();
  const mapaOutrasDesp: MapaValores = new Map();

  lancs.filter(l => l.tipo === "saida").forEach(l => {
    const motivo = motivoDoExcluido(l, catMap);
    if (motivo) { registrarExcluido(l, motivo); return; }
    const cat = catMap.get(l.categoria_id!)!;
    const idx = indiceDoMes(l.data);
    const valor = Number(l.valor);

    if (cat.classificacao_dre === "despesas_financeiras") {
      acumular(mapaDespFin, cat.id, cat.nome, idx, valor, qtdMeses);
    } else if (cat.classificacao_dre === "outras_despesas") {
      acumular(mapaOutrasDesp, cat.id, cat.nome, idx, valor, qtdMeses);
    } else if (cat.classificacao_dre === "despesas") {
      const centroId = l.centro_custo_id ?? CENTRO_SEM;
      if (!porCentro.has(centroId)) porCentro.set(centroId, new Map());
      acumular(porCentro.get(centroId)!, cat.id, cat.nome, idx, valor, qtdMeses);
    }
    // receitas_regulares/outras_receitas numa saída já virou
    // "inconsistencia_classificacao" em `motivoDoExcluido`, acima.
  });

  const gruposDespesaPorCentroFlat: PrestacaoContasGrupo[] = Array.from(porCentro.entries())
    .map(([centroId, mapa]) => {
      const linhas = linhasDoMapa(mapa, new Set(
        Array.from(mapa.keys()).filter(id => temNota(id, centroId === CENTRO_SEM ? null : centroId)),
      ));
      const valores = subtotalPorMes(linhas, qtdMeses);
      const titulo = centroId === CENTRO_SEM ? "Sem centro de custo" : (centroMap.get(centroId)?.nome ?? "Centro removido");
      return { chave: centroId, titulo, linhas, valores, total: somaMeses(valores) };
    })
    .filter(g => g.linhas.length > 0);

  const gruposDespesaPorCentro: PrestacaoContasGrupo[] =
    agruparAdministracao(gruposDespesaPorCentroFlat, centros, qtdMeses)
      .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));

  function grupoFlat(mapa: MapaValores, chave: string, titulo: string): PrestacaoContasGrupo | null {
    const linhas = linhasDoMapa(mapa, new Set(Array.from(mapa.keys()).filter(id => temNota(id, null))));
    if (linhas.length === 0) return null;
    const valores = subtotalPorMes(linhas, qtdMeses);
    return { chave, titulo, linhas, valores, total: somaMeses(valores) };
  }
  const grupoDespesasFinanceiras = grupoFlat(mapaDespFin, "despesas_financeiras", "Despesas Financeiras");
  const grupoOutrasDespesas = grupoFlat(mapaOutrasDesp, "outras_despesas", "Outras Despesas");

  const totalReceitas = somaGrupos(gruposReceita, qtdMeses);
  const totalDespesas = somaGrupos(gruposDespesaPorCentro, qtdMeses);
  const totalDespFin = grupoDespesasFinanceiras?.valores ?? novaLinha(qtdMeses);
  const totalOutrasDesp = grupoOutrasDespesas?.valores ?? novaLinha(qtdMeses);
  const resultado = Array.from({ length: qtdMeses }, (_, i) => totalReceitas[i] - totalDespesas[i] - totalDespFin[i] - totalOutrasDesp[i]);
  const saldoFinal = Array.from({ length: qtdMeses }, (_, i) => saldoAnterior[i] + resultado[i]);

  return {
    meses,
    mesAncoraNota,
    saldoAnterior,
    gruposReceita, totalReceitas,
    gruposDespesaPorCentro, totalDespesas,
    grupoDespesasFinanceiras, grupoOutrasDespesas,
    resultado, saldoFinal,
    qtdLancamentos: lancs.length,
    excluidos: { porMotivo: excluidosPorMotivo, itens: itensExcluidos },
    dizimistasPorMes,
  };
}

// ─── Fase 7: exportação — mesmo formato de linha do gerarCSVDRE ─────────
export function gerarCSVPrestacaoContas(r: PrestacaoContasResultado): string {
  const colunasMes = r.meses.map(m => `${m.nome}${m.ano !== r.meses[0].ano ? `/${m.ano}` : ""}`);
  const linhas: string[] = [`Secao;Grupo;Categoria;${colunasMes.join(";")}`];

  const fmt = (n: number) => n.toFixed(2);
  linhas.push(`;;Saldo Anterior;${r.saldoAnterior.map(fmt).join(";")}`);

  r.gruposReceita.forEach(g => {
    g.linhas.forEach(l => linhas.push(`Receitas;${g.titulo};${l.nome};${l.valores.map(fmt).join(";")}`));
    linhas.push(`Receitas;${g.titulo};TOTAL DO GRUPO;${g.valores.map(fmt).join(";")}`);
  });
  linhas.push(`Receitas;;TOTAL RECEITAS;${r.totalReceitas.map(fmt).join(";")}`);
  linhas.push(`Receitas;;DIZIMISTAS NO PERIODO (nomes unicos);${r.dizimistasPorMes.join(";")}`);

  r.gruposDespesaPorCentro.forEach(g => {
    if (g.subgrupos) {
      g.subgrupos.forEach(sg => {
        sg.linhas.forEach(l => linhas.push(`Despesas;${g.titulo} · ${sg.titulo};${l.nome};${l.valores.map(fmt).join(";")}`));
        linhas.push(`Despesas;${g.titulo} · ${sg.titulo};TOTAL DO SUBGRUPO;${sg.valores.map(fmt).join(";")}`);
      });
    } else {
      g.linhas.forEach(l => linhas.push(`Despesas;${g.titulo};${l.nome};${l.valores.map(fmt).join(";")}`));
    }
    linhas.push(`Despesas;${g.titulo};TOTAL DO GRUPO;${g.valores.map(fmt).join(";")}`);
  });
  linhas.push(`Despesas;;TOTAL DESPESAS;${r.totalDespesas.map(fmt).join(";")}`);

  if (r.grupoDespesasFinanceiras) {
    r.grupoDespesasFinanceiras.linhas.forEach(l =>
      linhas.push(`Despesas Financeiras;;${l.nome};${l.valores.map(fmt).join(";")}`));
  }
  if (r.grupoOutrasDespesas) {
    r.grupoOutrasDespesas.linhas.forEach(l =>
      linhas.push(`Outras Despesas;;${l.nome};${l.valores.map(fmt).join(";")}`));
  }

  linhas.push(`;;RESULTADO DO PERIODO;${r.resultado.map(fmt).join(";")}`);
  linhas.push(`;;SALDO FINAL;${r.saldoFinal.map(fmt).join(";")}`);
  return linhas.join("\n");
}
