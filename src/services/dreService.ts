// ─── dreService.ts ───────────────────────────────────────────────────────
//
// Item 5 do roadmap do ERP financeiro: "DRE Eclesiástica no formato de
// demonstração contábil" — Receitas → Despesas por grupo de natureza →
// Resultado do Período, não a lista solta de categorias que o malote
// mensal (`resumoMensal`) e a prestação de contas por centro já mostram.
// O DADO já existia (é o mesmo `fin_lancamentos`); o que faltava era o
// FORMATO da demonstração — por isso nenhuma migration entra aqui.
//
// ── DE ONDE VEM O AGRUPAMENTO ABAIXO ──────────────────────────────────
//
// `fin_categorias.conta_contabil` existe desde sempre na tabela — e está
// NULL nas 33 categorias que existem em produção hoje (conferido direto
// no Postgres em 12/09/2026). Não há um plano de contas de verdade para
// reaproveitar ainda. O ROADMAP_FINANCEIRO_ERP.md registrava isso como
// decisão pendente da Telma ("qual modelo? CBB, ou modelo próprio da
// contabilidade?") — sem uma resposta específica, o agrupamento abaixo
// usa uma estrutura GENÉRICA, comum a demonstrações de igreja (Contri-
// buições / Despesas com Pessoal / Administrativas / Instalações /
// Ministeriais), por NOME de categoria — não por código contábil
// inventado. Se a Telma trouxer um plano de contas oficial depois, é só
// popular `conta_contabil` e trocar a chave de agrupamento por ele; nada
// no schema muda, e nenhum lançamento precisa ser remapeado à mão.
import { listarLancamentos, type FinLancamentoExtenso } from "./finService";

const GRUPO_RECEITA: Record<string, string> = {
  "dízimos": "Contribuições",
  "ofertas": "Contribuições",
  "ofertas especiais": "Contribuições",
  "campanhas": "Campanhas e Eventos",
  "eventos": "Campanhas e Eventos",
  "doações": "Doações",
  "vendas (livraria)": "Outras Receitas Operacionais",
  "outras receitas": "Outras Receitas Operacionais",
  "rendimento aplicação": "Receitas Financeiras",
};
const ORDEM_GRUPO_RECEITA = [
  "Contribuições", "Campanhas e Eventos", "Doações",
  "Outras Receitas Operacionais", "Receitas Financeiras",
];
const GRUPO_RECEITA_FALLBACK = "Outras Receitas Operacionais";

const GRUPO_DESPESA: Record<string, string> = {
  "prebenda pastoral": "Despesas com Pessoal",
  "salários clt": "Despesas com Pessoal",
  "inss / fgts / encargos": "Despesas com Pessoal",
  "vale alimentação": "Despesas com Pessoal",
  "vale transporte": "Despesas com Pessoal",
  "rpa (autônomos)": "Despesas com Pessoal",
  "mei (prestadores)": "Despesas com Pessoal",
  "material de escritório": "Despesas Administrativas",
  "material de limpeza": "Despesas Administrativas",
  "tarifas bancárias": "Despesas Administrativas",
  "internet/telefone": "Despesas Administrativas",
  "impostos / taxas": "Despesas Administrativas",
  "aluguel": "Despesas com Instalações",
  "água e esgoto": "Despesas com Instalações",
  "energia elétrica": "Despesas com Instalações",
  "manutenção predial": "Despesas com Instalações",
  "manutenção equipamentos": "Despesas com Instalações",
  "construção / reforma": "Despesas com Instalações",
  "material de som": "Despesas com Instalações",
  "materiais ebd": "Despesas Ministeriais",
  "eventos / almoço": "Despesas Ministeriais",
  "transporte/combustível": "Despesas Ministeriais",
  "diaconia / assistência": "Despesas Ministeriais",
  "missões": "Despesas Ministeriais",
  "outras despesas": "Outras Despesas",
};
const ORDEM_GRUPO_DESPESA = [
  "Despesas com Pessoal", "Despesas Administrativas",
  "Despesas com Instalações", "Despesas Ministeriais", "Outras Despesas",
];
const GRUPO_DESPESA_FALLBACK = "Outras Despesas";

export interface DRELinha { nome: string; total: number; }
export interface DREGrupo { nome: string; linhas: DRELinha[]; total: number; }
export interface DREResultado {
  ano: number;
  gruposReceita: DREGrupo[];
  totalReceitas: number;
  gruposDespesa: DREGrupo[];
  totalDespesas: number;
  resultado: number;
  qtdLancamentos: number;
  lancamentos: FinLancamentoExtenso[];
}

function normaliza(s: string): string {
  return s.trim().toLowerCase();
}

// Categoria nova que ninguém incluiu no mapa ainda cai no grupo "Outras"
// correspondente — nunca some da demonstração, só fica no lugar genérico
// até alguém (eu ou a Telma) decidir o grupo certo pra ela.
function agrupar(
  lancs: FinLancamentoExtenso[],
  mapa: Record<string, string>,
  ordem: string[],
  fallback: string,
): { grupos: DREGrupo[]; total: number } {
  const porCategoria = new Map<string, number>();
  lancs.forEach(l => {
    const nome = l.categoria_nome ?? "Sem categoria";
    porCategoria.set(nome, (porCategoria.get(nome) ?? 0) + Number(l.valor));
  });

  const porGrupo = new Map<string, DRELinha[]>();
  porCategoria.forEach((total, nome) => {
    const grupo = mapa[normaliza(nome)] ?? fallback;
    if (!porGrupo.has(grupo)) porGrupo.set(grupo, []);
    porGrupo.get(grupo)!.push({ nome, total });
  });

  const ordemCompleta = [...ordem, ...Array.from(porGrupo.keys()).filter(g => !ordem.includes(g))];
  const grupos = ordemCompleta
    .filter(g => porGrupo.has(g))
    .map(g => {
      const linhas = porGrupo.get(g)!.sort((a, b) => b.total - a.total);
      return { nome: g, linhas, total: linhas.reduce((s, l) => s + l.total, 0) };
    });

  return { grupos, total: grupos.reduce((s, g) => s + g.total, 0) };
}

// Anual, não mensal — o malote (`resumoMensal`) já cobre o mês; uma DRE
// faz sentido como demonstração de um exercício. `listarLancamentos` tem
// um teto de 300 linhas (proteção existente, não desta função); para o
// volume de hoje (produção com poucas dezenas de lançamentos) não pesa —
// se a igreja crescer a ponto de passar de 300 lançamentos realizados por
// ano, este teto passa a truncar a demonstração e precisa virar paginação.
export async function gerarDRE(ano: number): Promise<DREResultado> {
  const lancs = await listarLancamentos({
    dataInicio: `${ano}-01-01`,
    dataFim: `${ano}-12-31`,
  });
  const realizados = lancs.filter(l => l.status === "realizado" || l.status === "conciliado");

  const entradas = realizados.filter(l => l.tipo === "entrada");
  const saidas = realizados.filter(l => l.tipo === "saida");

  const { grupos: gruposReceita, total: totalReceitas } =
    agrupar(entradas, GRUPO_RECEITA, ORDEM_GRUPO_RECEITA, GRUPO_RECEITA_FALLBACK);
  const { grupos: gruposDespesa, total: totalDespesas } =
    agrupar(saidas, GRUPO_DESPESA, ORDEM_GRUPO_DESPESA, GRUPO_DESPESA_FALLBACK);

  return {
    ano, gruposReceita, totalReceitas, gruposDespesa, totalDespesas,
    resultado: totalReceitas - totalDespesas,
    qtdLancamentos: realizados.length,
    lancamentos: realizados,
  };
}

export function gerarCSVDRE(dre: DREResultado): string {
  const linhas: string[] = ["Secao;Grupo;Categoria;Valor"];
  dre.gruposReceita.forEach(g => {
    g.linhas.forEach(l => linhas.push(`Receitas;${g.nome};${l.nome};${l.total.toFixed(2)}`));
    linhas.push(`Receitas;${g.nome};TOTAL DO GRUPO;${g.total.toFixed(2)}`);
  });
  linhas.push(`Receitas;;TOTAL DE RECEITAS;${dre.totalReceitas.toFixed(2)}`);
  dre.gruposDespesa.forEach(g => {
    g.linhas.forEach(l => linhas.push(`Despesas;${g.nome};${l.nome};${l.total.toFixed(2)}`));
    linhas.push(`Despesas;${g.nome};TOTAL DO GRUPO;${g.total.toFixed(2)}`);
  });
  linhas.push(`Despesas;;TOTAL DE DESPESAS;${dre.totalDespesas.toFixed(2)}`);
  linhas.push(`;;RESULTADO DO PERIODO;${dre.resultado.toFixed(2)}`);
  return linhas.join("\n");
}
