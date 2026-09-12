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
// Só lançamentos cuja categoria tem `classificacao_dre` preenchida somam
// nos grupos abaixo (as 59 categorias oficiais da Fase 1). Categorias fora
// do Plano Oficial (Campanhas, Eventos, Vendas, Materiais EBD...) e
// lançamentos sem categoria (inclusive as transferências entre contas
// próprias, que não são receita nem despesa de verdade) ficam de fora e
// contam em `qtdForaDoPlanoOficial` — não somem em silêncio, a tela avisa
// quantos ficaram fora.
//
// ── A NOTA POR LINHA FICA NO ÚLTIMO MÊS DO PERÍODO ───────────────────────
// A planilha real tem UMA célula de comentário por linha (categoria dentro
// de um ministério), cobrindo o período inteiro em texto livre — não uma
// célula por mês. `fin_relatorio_notas` (Fase 4) guarda por mês para ter a
// flexibilidade se um dia for útil, mas o comportamento replicado aqui é o
// do Excel: uma nota por linha, ancorada no último mês do período — seja
// ele de 1 mês ou de 12.
import { daquiAMeses, daquiADias } from "@/lib/data";
import {
  listarLancamentos, listarContas, listarCategorias, listarCentrosCusto,
  type FinClassificacaoDRE,
} from "./finService";
import { listarNotasDoPeriodo } from "./relatorioNotasService";

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

/** Saldo de todas as contas (ativas e inativas — o histórico não some) no instante imediatamente ANTES de `dataLimiteExclusiva`. */
async function saldoAcumuladoAntesDe(dataLimiteExclusiva: string): Promise<number> {
  const contas = await listarContas(true);
  const saldoInicial = contas.reduce((s, c) => s + Number(c.saldo_inicial), 0);

  // `listarLancamentos` tem teto de 300 linhas (mesma proteção documentada
  // em dreService.gerarDRE) — para o volume de hoje não pesa; se a igreja
  // acumular mais de 300 lançamentos históricos antes do período, este
  // saldo passa a truncar e precisa virar uma soma no banco (RPC), não em
  // memória.
  const antes = await listarLancamentos({ dataFim: daquiADias(dataLimiteExclusiva, -1) });
  const movimento = antes
    .filter(l => l.status === "realizado" || l.status === "conciliado")
    .reduce((s, l) => s + (l.tipo === "entrada" ? Number(l.valor) : -Number(l.valor)), 0);

  return saldoInicial + movimento;
}

/**
 * @param ano       ano do primeiro mês do período
 * @param mesInicio 1-12
 * @param qtdMeses  quantos meses o período tem, a partir de `mesInicio` — 1 (padrão/mensal), 3 (o antigo "trimestre", agora só um preset da tela), 6, 12, ou qualquer outro número que a tesouraria escolher
 */
export async function gerarPrestacaoContas(ano: number, mesInicio: number, qtdMeses: number): Promise<PrestacaoContasResultado> {
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
    listarLancamentos({ dataInicio, dataFim }),
    listarCategorias(),
    listarCentrosCusto(),
    listarNotasDoPeriodo(mesAncoraNota.ano, mesAncoraNota.mes),
    Promise.all(mesesChaves.map(chave => saldoAcumuladoAntesDe(`${chave}-01`))),
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
    acumular(mapa, cat.id, cat.nome, idx, Number(l.valor), qtdMeses);
  });
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
    const cat = l.categoria_id ? catMap.get(l.categoria_id) : undefined;
    if (!cat?.classificacao_dre) { qtdForaDoPlanoOficial++; return; }
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
    // receitas_regulares/outras_receitas numa saída: mesma inconsistência de dado do bloco acima, ignorada.
  });

  const gruposDespesaPorCentro: PrestacaoContasGrupo[] = Array.from(porCentro.entries())
    .map(([centroId, mapa]) => {
      const linhas = linhasDoMapa(mapa, new Set(
        Array.from(mapa.keys()).filter(id => temNota(id, centroId === CENTRO_SEM ? null : centroId)),
      ));
      const valores = subtotalPorMes(linhas, qtdMeses);
      const titulo = centroId === CENTRO_SEM ? "Sem centro de custo" : (centroMap.get(centroId)?.nome ?? "Centro removido");
      return { chave: centroId, titulo, linhas, valores, total: somaMeses(valores) };
    })
    .filter(g => g.linhas.length > 0)
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
    qtdForaDoPlanoOficial,
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

  r.gruposDespesaPorCentro.forEach(g => {
    g.linhas.forEach(l => linhas.push(`Despesas;${g.titulo};${l.nome};${l.valores.map(fmt).join(";")}`));
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
