// ─── exportacoes — as planilhas e o CSV das contribuições (27/10/2026) ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Puro (monta as abas e o texto); quem baixa é a tela, DEPOIS de gravar o registro de acesso. O Resumo e as Semanas são agregados; as listas de pessoas são nominais (e por isso só saem com o registro).
import type { Aba, Celula } from "@/lib/xlsxSimples";
import { serialDoExcel } from "@/lib/xlsxSimples";
import { AVISO_SO_IDENTIFICADAS, PISO_DE_IDENTIFICACAO, linhasDaConfiabilidade, textoDoAlerta, type AnaliseDoPeriodo, type AnaliseDosSemContribuicao, type Confiabilidade, type PessoaSemContribuicao } from "@/lib/contribuicoes";

const dataBr = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;
const cab = (...t: string[]): Celula[] => t.map(v => ({ v, estilo: "cabecalho" as const }));
const MOEDA = (v: number | null): Celula => (v === null ? null : { v, estilo: "moeda" });
const INT = (v: number | null): Celula => (v === null ? null : { v, estilo: "inteiro" });
const DATA = (ymd: string | null): Celula => (ymd ? { v: serialDoExcel(ymd), estilo: "data" } : null);

export function textoDoPeriodo(ini: string, fim: string) { return `${dataBr(ini)} a ${dataBr(fim)}`; }

/** O resumo e as semanas/meses — só agregados. */
export function abasDoPainel(a: AnaliseDoPeriodo, emitidoPor: string, hoje: string, criterios: { rotulo: string; valor: string }[] = []): Aba[] {
  const c = a.cobertura;
  return [
    {
      nome: "Resumo", larguras: [34, 18],
      linhas: [
        [{ v: "CONTRIBUIÇÕES — RESUMO", estilo: "titulo" }],
        [`Período: ${textoDoPeriodo(a.periodo.ini, a.periodo.fim)}`],
        [`Emitido em ${dataBr(hoje)} por ${emitidoPor || "Sistema"}`],
        ...criterios.map((c): Celula[] => [`${c.rotulo}: ${c.valor}`]), [],
        cab("Indicador", "Valor"),
        ["Dizimistas (dízimo identificado)", INT(a.dizimistas)],
        ["Doadores (dízimos, ofertas ou missões)", INT(a.doadores)],
        [{ v: "Arrecadado", estilo: "negrito" }, { v: a.arrecadado, estilo: "moedaNegrito" }],
        ["   Dízimos", MOEDA(a.porTipo.dizimo)], ["   Ofertas", MOEDA(a.porTipo.oferta)], ["   Ofertas para Missões", MOEDA(a.porTipo.missoes)],
        ["Média mensal", MOEDA(a.mediaMensal)], ["Média por doador", MOEDA(a.mediaPorDoador)],
        ["Frequência média (contribuições por doador)", a.frequenciaMedia],
        [`Recorrentes (todos os ${a.recorrentes?.meses ?? 0} meses completos)`, a.recorrentes ? INT(a.recorrentes.pessoas) : "não se aplica"],
        ["Novos contribuintes (primeira contribuição identificada)", a.novos === null ? "sem histórico anterior confiável" : INT(a.novos)],
        ["Novos dizimistas (primeiro dízimo identificado)", a.novosDizimistas === null ? "sem histórico anterior confiável" : INT(a.novosDizimistas)],
        [], cab("Cobertura da identificação", "Valor"),
        ["Valor com pessoa identificada", MOEDA(c.valorIdentificado)], ["Valor sem identificação", MOEDA(c.valorNaoIdentificado)],
        ["Entradas sem identificação", INT(c.entradasSemPessoa)], ["% do valor identificado", c.pctDoValor === null ? null : c.pctDoValor / 100],
      ],
    },
    {
      nome: "Semanas", larguras: [14, 16, 16], linhaDoCabecalho: 0,
      linhas: [cab("Semana (segunda)", "Contribuintes", "Valor"), ...a.semanas.map((s): Celula[] => [DATA(s.inicio), INT(s.contribuintes), MOEDA(s.valor)])],
    },
    {
      nome: "Meses", larguras: [12, 16, 16], linhaDoCabecalho: 0,
      linhas: [cab("Mês", "Contribuintes", "Valor"), ...a.meses.map((m): Celula[] => [`${m.mes.slice(5)}/${m.mes.slice(0, 4)}`, INT(m.contribuintes), MOEDA(m.valor)])],
    },
  ];
}

export interface LinhaDePessoa { posicao: number; nome: string; quantidade: number; ultima: string; total: number; mediaMensal: number; valorMedio: number; dizimista: boolean; recorrente: boolean | null; nova: boolean | null }

export function abaDePessoas(linhas: LinhaDePessoa[], periodo: { ini: string; fim: string }): Aba {
  const sn = (v: boolean | null) => (v === null ? "—" : v ? "Sim" : "Não");
  return {
    nome: "Pessoas", larguras: [6, 38, 14, 16, 16, 16, 16, 12, 12, 10], linhaDoCabecalho: 3,
    linhas: [
      [{ v: "CONTRIBUIÇÕES POR PESSOA", estilo: "titulo" }], [`Período: ${textoDoPeriodo(periodo.ini, periodo.fim)}`], [],
      cab("#", "Nome", "Contribuições", "Última", "Total", "Média mensal", "Valor médio", "Dizimista", "Recorrente", "Novo"),
      ...linhas.map((p): Celula[] => [INT(p.posicao), p.nome, INT(p.quantidade), DATA(p.ultima), MOEDA(p.total), MOEDA(p.mediaMensal), MOEDA(p.valorMedio), sn(p.dizimista), sn(p.recorrente), sn(p.nova)]),
    ],
  };
}

const SITUACAO = { nunca: "Sem registro anterior ao período", antes: "Contribuiu antes do período" } as const;
const observacao = (p: PessoaSemContribuicao) => [p.menor ? "menor de 18 anos" : "", p.semNascimento ? "sem data de nascimento" : "", p.familiaContribui ? "alguém da família contribuiu no período" : ""].filter(Boolean).join("; ");

/** O texto do quadro de confiabilidade para o topo da planilha/CSV: o aviso e as linhas (nível, % identificado, pendências, impacto, data dos dados). */
export function linhasDeConfiabilidadeParaArquivo(c: Confiabilidade): string[] {
  return ["CONFIABILIDADE DESTA LISTA", AVISO_SO_IDENTIFICADAS, ...(c.alertar ? [textoDoAlerta(c)] : []), ...linhasDaConfiabilidade(c)];
}

export function abasDosSemContribuicao(a: AnaliseDosSemContribuicao, periodo: { ini: string; fim: string }, quemEntra: string, oque = "contribuições", confiabilidade?: Confiabilidade | null): Aba[] {
  // com todas as contribuições escolhidas o título é o de sempre; com só dízimo: "SEM DÍZIMO REGISTRADO NO PERÍODO ANALISADO"
  const titulo = oque === "contribuições" ? "SEM CONTRIBUIÇÃO REGISTRADA NO PERÍODO" : `SEM ${oque} NO PERÍODO ANALISADO`.toUpperCase();
  const preambulo: Celula[][] = [
    [{ v: titulo, estilo: "titulo" }], [`Período: ${textoDoPeriodo(periodo.ini, periodo.fim)} · ${quemEntra}`],
    ["Lista para cuidado pastoral. Quem contribui por outra pessoa da família, em espécie ou sem identificação pode aparecer aqui."],
    ...(confiabilidade ? [[], ...linhasDeConfiabilidadeParaArquivo(confiabilidade).map((l): Celula[] => [l])] : [[AVISO_SO_IDENTIFICADAS]]), [],
  ];
  return [
    {
      nome: oque === "contribuições" ? "Sem contribuição" : "Sem dízimo registrado".slice(0, 31), larguras: [38, 14, 36, 16, 10, 40], linhaDoCabecalho: preambulo.length,
      linhas: [
        ...preambulo,
        cab("Nome", "Tipo", "Situação", "Última contribuição", "Dias", "Observação"),
        ...a.lista.map((p): Celula[] => [p.nome, p.tipo === "membro" ? "Membro" : p.tipo === "visitante" ? "Visitante" : "Congregado", SITUACAO[p.classificacao], DATA(p.ultima), INT(p.dias), observacao(p)]),
      ],
    },
    {
      nome: "Resumo", larguras: [44, 14],
      linhas: [
        cab("Indicador", "Valor"),
        ["Base (membros e congregados ativos)", INT(a.base)], ["Contribuíram no período", INT(a.contribuiram)], ["Não contribuíram", INT(a.naoContribuiram)],
        ["Adesão", a.adesaoPct === null ? null : a.adesaoPct / 100], ["Sem contribuição no período e sem registro anterior", INT(a.nuncaDesdeOPiso)], ["Contribuíram antes do período", INT(a.jaContribuiuAntes)],
        ["Com alguém da família que contribuiu", INT(a.comFamiliaQueContribui)], ["Menores de 18 anos fora da base", INT(a.menoresFora)],
      ],
    },
  ];
}

/** CSV para o Excel brasileiro: separador ';', aspas quando preciso, BOM para os acentos. */
export function paraCSV(linhas: (string | number | null)[][]): string {
  const celula = (v: string | number | null) => {
    const t = v === null ? "" : typeof v === "number" ? String(v).replace(".", ",") : v;
    return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return "﻿" + linhas.map(l => l.map(celula).join(";")).join("\r\n");
}
