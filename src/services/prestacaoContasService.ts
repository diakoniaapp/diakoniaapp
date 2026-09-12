// ─── prestacaoContasService.ts ───────────────────────────────────────────
//
// Fase 5 do projeto Tesouraria (docs/PROJETO_TESOURARIA_PRESTACAO_CONTAS.md
// §8.3 e §9) — gera ao vivo, de `fin_lancamentos`, a mesma grade que a
// tesouraria hoje monta à mão no Excel todo trimestre: Saldo Anterior →
// Receitas (por classificação) → Despesas (por ministério/centro de
// custo) → Despesas Financeiras → Outras Despesas → Resultado → Saldo
// Final, três colunas de mês.
//
// ── POR QUE SÓ CATEGORIAS DO PLANO OFICIAL ENTRAM ────────────────────────
// Só lançamentos cuja categoria tem `classificacao_dre` preenchida somam
// nos grupos abaixo (as 59 categorias oficiais da Fase 1). Categorias fora
// do Plano Oficial (Campanhas, Eventos, Vendas, Materiais EBD...) e
// lançamentos sem categoria (inclusive as transferências entre contas
// próprias, que não são receita nem despesa de verdade) ficam de fora e
// contam em `qtdForaDoPlanoOficial` — não somem em silêncio, a tela avisa
// quantos ficaram fora.
//
// ── TRIMESTRE = CALENDÁRIO, NÃO O RECORTE AD-HOC DE 2025 ─────────────────
// As 4 planilhas de 2025 tinham recortes irregulares (1T e 2T normais,
// mas "3T" cobria JUL-OUT e "4T" só NOV-DEZ — a igreja emendou meses
// enquanto punha o relatório em dia). Daqui pra frente, trimestre é
// calendário fixo (Jan-Mar/Abr-Jun/Jul-Set/Out-Dez) — previsível, e é o
// que "trimestral" normalmente quer dizer.
//
// ── A NOTA POR LINHA FICA NO ÚLTIMO MÊS DO TRIMESTRE ──────────────────────
// A planilha real tem UMA célula de comentário por linha (categoria dentro
// de um ministério), cobrindo o trimestre inteiro em texto livre — não uma
// célula por mês. `fin_relatorio_notas` (Fase 4) guarda por mês para ter a
// flexibilidade se um dia for útil, mas o comportamento replicado aqui é o
// do Excel: uma nota por linha, ancorada no último mês do trimestre.
import { daquiAMeses, daquiADias } from "@/lib/data";
import {
  listarLancamentos, listarContas, listarCategorias, listarCentrosCusto,
  type FinClassificacaoDRE,
} from "./finService";
import { listarNotasDoPeriodo } from "./relatorioNotasService";

export interface PrestacaoContasLinha {
  categoriaId: string;
  nome: string;
  valores: number[]; // 3 posições, uma por mês do trimestre
  total: number;
  temNota: boolean;
}
export interface PrestacaoContasGrupo {
  chave: string;
  titulo: string;
  linhas: PrestacaoContasLinha[];
  valores: number[];
  total: number;
}
export interface PrestacaoContasMes { numero: number; nome: string; }

export interface PrestacaoContasResultado {
  ano: number;
  trimestre: number;
  meses: [PrestacaoContasMes, PrestacaoContasMes, PrestacaoContasMes];
  mesAncoraNota: number; // último mês do trimestre — onde a nota de cada linha vive
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
  qtdForaDoPlanoOficial: number;
}

const NOME_MES = [
  "", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const TITULO_CLASSIFICACAO_RECEITA: Record<string, string> = {
  receitas_regulares: "Receitas Regulares",
  outras_receitas: "Outras Receitas",
};

function primeiroMesDoTrimestre(trimestre: number): number {
  return (trimestre - 1) * 3 + 1;
}

type MapaValores = Map<string, { nome: string; valores: number[] }>;

function acumular(mapa: MapaValores, id: string, nome: string, idx: number, valor: number) {
  if (!mapa.has(id)) mapa.set(id, { nome, valores: [0, 0, 0] });
  mapa.get(id)!.valores[idx] += valor;
}

function somaMeses(valores: number[]): number {
  return valores[0] + valores[1] + valores[2];
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

function subtotalPorMes(linhas: PrestacaoContasLinha[]): number[] {
  return [0, 1, 2].map(i => linhas.reduce((s, l) => s + l.valores[i], 0));
}

function somaGrupos(grupos: PrestacaoContasGrupo[]): number[] {
  return [0, 1, 2].map(i => grupos.reduce((s, g) => s + g.valores[i], 0));
}

/** Saldo de todas as contas (ativas e inativas — o histórico não some) no instante imediatamente ANTES de `dataLimiteExclusiva`. */
async function saldoAcumuladoAntesDe(dataLimiteExclusiva: string): Promise<number> {
  const contas = await listarContas(true);
  const saldoInicial = contas.reduce((s, c) => s + Number(c.saldo_inicial), 0);

  // `listarLancamentos` tem teto de 300 linhas (mesma proteção documentada
  // em dreService.gerarDRE) — para o volume de hoje não pesa; se a igreja
  // acumular mais de 300 lançamentos históricos antes de um trimestre, este
  // saldo passa a truncar e precisa virar uma soma no banco (RPC), não em
  // memória.
  const antes = await listarLancamentos({ dataFim: daquiADias(dataLimiteExclusiva, -1) });
  const movimento = antes
    .filter(l => l.status === "realizado" || l.status === "conciliado")
    .reduce((s, l) => s + (l.tipo === "entrada" ? Number(l.valor) : -Number(l.valor)), 0);

  return saldoInicial + movimento;
}

export async function gerarPrestacaoContas(ano: number, trimestre: number): Promise<PrestacaoContasResultado> {
  const mesIni = primeiroMesDoTrimestre(trimestre);
  const dataInicio = `${ano}-${String(mesIni).padStart(2, "0")}-01`;
  const dataFimExclusiva = daquiAMeses(dataInicio, 3);
  const dataFim = daquiADias(dataFimExclusiva, -1);
  const mesAncoraNota = mesIni + 2;

  const [lancsBrutos, categorias, centros, notasDoMesAncora, saldoAnterior] = await Promise.all([
    listarLancamentos({ dataInicio, dataFim }),
    listarCategorias(),
    listarCentrosCusto(),
    listarNotasDoPeriodo(ano, mesAncoraNota),
    Promise.all([0, 1, 2].map(i => saldoAcumuladoAntesDe(daquiAMeses(dataInicio, i)))),
  ]);

  const lancs = lancsBrutos.filter(l => l.status === "realizado" || l.status === "conciliado");
  const catMap = new Map(categorias.map(c => [c.id, c]));
  const centroMap = new Map(centros.map(c => [c.id, c]));
  const notas = new Set(notasDoMesAncora.map(n => `${n.categoria_id ?? ""}|${n.centro_custo_id ?? ""}`));
  const temNota = (categoriaId: string, centroCustoId: string | null) =>
    notas.has(`${categoriaId}|${centroCustoId ?? ""}`);

  function indiceDoMes(dataYmd: string): number {
    return Number(dataYmd.slice(5, 7)) - mesIni;
  }

  let qtdForaDoPlanoOficial = 0;

  // ── Receitas: agrupadas por classificação, nunca por centro ────────────
  const porClassificacaoReceita = new Map<FinClassificacaoDRE, MapaValores>([
    ["receitas_regulares", new Map()],
    ["outras_receitas", new Map()],
  ]);
  lancs.filter(l => l.tipo === "entrada").forEach(l => {
    const cat = l.categoria_id ? catMap.get(l.categoria_id) : undefined;
    if (!cat?.classificacao_dre) { qtdForaDoPlanoOficial++; return; }
    const idx = indiceDoMes(l.data);
    const mapa = porClassificacaoReceita.get(cat.classificacao_dre);
    if (!mapa) return; // classificação de despesa numa entrada — inconsistência de dado, ignora sem quebrar a tela
    acumular(mapa, cat.id, cat.nome, idx, Number(l.valor));
  });
  const gruposReceita: PrestacaoContasGrupo[] = (["receitas_regulares", "outras_receitas"] as const)
    .map(chave => {
      const linhas = linhasDoMapa(porClassificacaoReceita.get(chave)!, new Set(
        Array.from(porClassificacaoReceita.get(chave)!.keys()).filter(id => temNota(id, null)),
      ));
      const valores = subtotalPorMes(linhas);
      return { chave, titulo: TITULO_CLASSIFICACAO_RECEITA[chave], linhas, valores, total: somaMeses(valores) };
    })
    .filter(g => g.linhas.length > 0);

  // ── Despesas: "despesas" por centro de custo; financeiras/outras, flat ─
  const CENTRO_SEM = "__sem_centro__";
  const porCentro = new Map<string, MapaValores>();
  const mapaDespFin: MapaValores = new Map();
  const mapaOutrasDesp: MapaValores = new Map();

  lancs.filter(l => l.tipo === "saida").forEach(l => {
    const cat = l.categoria_id ? catMap.get(l.categoria_id) : undefined;
    if (!cat?.classificacao_dre) { qtdForaDoPlanoOficial++; return; }
    const idx = indiceDoMes(l.data);
    const valor = Number(l.valor);

    if (cat.classificacao_dre === "despesas_financeiras") {
      acumular(mapaDespFin, cat.id, cat.nome, idx, valor);
    } else if (cat.classificacao_dre === "outras_despesas") {
      acumular(mapaOutrasDesp, cat.id, cat.nome, idx, valor);
    } else if (cat.classificacao_dre === "despesas") {
      const centroId = l.centro_custo_id ?? CENTRO_SEM;
      if (!porCentro.has(centroId)) porCentro.set(centroId, new Map());
      acumular(porCentro.get(centroId)!, cat.id, cat.nome, idx, valor);
    }
    // receitas_regulares/outras_receitas numa saída: mesma inconsistência de dado do bloco acima, ignorada.
  });

  const gruposDespesaPorCentro: PrestacaoContasGrupo[] = Array.from(porCentro.entries())
    .map(([centroId, mapa]) => {
      const linhas = linhasDoMapa(mapa, new Set(
        Array.from(mapa.keys()).filter(id => temNota(id, centroId === CENTRO_SEM ? null : centroId)),
      ));
      const valores = subtotalPorMes(linhas);
      const titulo = centroId === CENTRO_SEM ? "Sem centro de custo" : (centroMap.get(centroId)?.nome ?? "Centro removido");
      return { chave: centroId, titulo, linhas, valores, total: somaMeses(valores) };
    })
    .filter(g => g.linhas.length > 0)
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));

  function grupoFlat(mapa: MapaValores, chave: string, titulo: string): PrestacaoContasGrupo | null {
    const linhas = linhasDoMapa(mapa, new Set(Array.from(mapa.keys()).filter(id => temNota(id, null))));
    if (linhas.length === 0) return null;
    const valores = subtotalPorMes(linhas);
    return { chave, titulo, linhas, valores, total: somaMeses(valores) };
  }
  const grupoDespesasFinanceiras = grupoFlat(mapaDespFin, "despesas_financeiras", "Despesas Financeiras");
  const grupoOutrasDespesas = grupoFlat(mapaOutrasDesp, "outras_despesas", "Outras Despesas");

  const totalReceitas = somaGrupos(gruposReceita);
  const totalDespesas = somaGrupos(gruposDespesaPorCentro);
  const totalDespFin = grupoDespesasFinanceiras?.valores ?? [0, 0, 0];
  const totalOutrasDesp = grupoOutrasDespesas?.valores ?? [0, 0, 0];
  const resultado = [0, 1, 2].map(i => totalReceitas[i] - totalDespesas[i] - totalDespFin[i] - totalOutrasDesp[i]);
  const saldoFinal = [0, 1, 2].map(i => saldoAnterior[i] + resultado[i]);

  return {
    ano, trimestre,
    meses: [0, 1, 2].map(i => ({ numero: mesIni + i, nome: NOME_MES[mesIni + i] })) as PrestacaoContasResultado["meses"],
    mesAncoraNota,
    saldoAnterior,
    gruposReceita, totalReceitas,
    gruposDespesaPorCentro, totalDespesas,
    grupoDespesasFinanceiras, grupoOutrasDespesas,
    resultado, saldoFinal,
    qtdLancamentos: lancs.length,
    qtdForaDoPlanoOficial,
  };
}
