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
// Corrigido em 12/09/2026: a Fase 1 do projeto Tesouraria
// (docs/PROJETO_TESOURARIA_PRESTACAO_CONTAS.md) renomeou boa parte das
// categorias pro nome oficial ("Dízimos"→"Dizimos", "Prebenda pastoral"→
// "Prebenda", "Salários CLT"→"Salários"...) e criou 38 categorias novas —
// e este arquivo continuou com as chaves ANTIGAS, por nome, sem ninguém
// notar até a tela ser conferida de novo: "Dizimos" (R$652 reais em
// produção) caía no fallback "Outras Receitas Operacionais" em vez de
// "Contribuições", porque a chave do mapa ainda dizia "dízimos" com
// acento. Mesma causa afetava a maioria das categorias de despesa.
//
// O comentário original daqui (antes desta correção) já previa o dia em
// que um plano de contas oficial existiria — "é só popular conta_contabil
// e trocar a chave de agrupamento por ele". Não trocou por
// `classificacao_dre` (a classificação oficial, Fase 1) porque ela só tem
// 3 baldes de despesa (despesas / despesas_financeiras / outras_despesas),
// mais grossos que os 5 que esta DRE pastoral já usa (Pessoal /
// Administrativas / Instalações / Ministeriais / Outras) — group por ela
// perderia granularidade que a Telma já está acostumada a ver aqui. A
// correção troca só as CHAVES para o nome oficial atual, mantendo a
// mesma estrutura de 5 baldes.
import { listarLancamentos, type FinLancamentoExtenso } from "./finService";

const GRUPO_RECEITA: Record<string, string> = {
  "dizimos": "Contribuições",
  "ofertas": "Contribuições",
  "ofertas para missões": "Contribuições",
  "campanhas": "Campanhas e Eventos",
  "eventos": "Campanhas e Eventos",
  "vendas (livraria)": "Outras Receitas Operacionais",
  "descontos obtidos": "Receitas Financeiras",
  "rendimentos de aplicações": "Receitas Financeiras",
};
const ORDEM_GRUPO_RECEITA = [
  "Contribuições", "Campanhas e Eventos", "Doações",
  "Outras Receitas Operacionais", "Receitas Financeiras",
];
const GRUPO_RECEITA_FALLBACK = "Outras Receitas Operacionais";

const GRUPO_DESPESA: Record<string, string> = {
  // Pessoal
  "salários": "Despesas com Pessoal",
  "prebenda": "Despesas com Pessoal",
  "férias": "Despesas com Pessoal",
  "rescisões": "Despesas com Pessoal",
  "13º salário": "Despesas com Pessoal",
  "inss": "Despesas com Pessoal",
  "fgts": "Despesas com Pessoal",
  "irrf": "Despesas com Pessoal",
  "pis": "Despesas com Pessoal",
  "assessoria saude ocupacional": "Despesas com Pessoal",
  "vale refeição": "Despesas com Pessoal",
  "vale transporte": "Despesas com Pessoal",
  "seguro de vida": "Despesas com Pessoal",
  "sustento pastoral": "Despesas com Pessoal",
  "sustento pastoral auxiliar": "Despesas com Pessoal",
  "outros benefícios": "Despesas com Pessoal",
  "inss/irrf": "Despesas com Pessoal",
  "serviço prestado pf": "Despesas com Pessoal",
  "serviço prestado pj": "Despesas com Pessoal",
  "assistente musical": "Despesas com Pessoal",
  // Administrativas
  "material de escritório": "Despesas Administrativas",
  "tarifas bancárias": "Despesas Administrativas",
  "tarifa cartão credito": "Despesas Administrativas",
  "internet": "Despesas Administrativas",
  "telefonia": "Despesas Administrativas",
  "impostos e taxas": "Despesas Administrativas",
  "contabilidade": "Despesas Administrativas",
  "sistemas de informática": "Despesas Administrativas",
  "assinaturas e mensalidades": "Despesas Administrativas",
  "iss": "Despesas Administrativas",
  "juros": "Despesas Administrativas",
  "multas": "Despesas Administrativas",
  "iof": "Despesas Administrativas",
  "seguros": "Despesas Administrativas",
  "iptu": "Despesas Administrativas",
  // Instalações
  "aluguel": "Despesas com Instalações",
  "água e esgoto": "Despesas com Instalações",
  "energia elétrica": "Despesas com Instalações",
  "manutenção de imobilizado": "Despesas com Instalações",
  "móveis e equipamentos em geral": "Despesas com Instalações",
  "condomínio": "Despesas com Instalações",
  "limpeza e dedetização": "Despesas com Instalações",
  "dedetização": "Despesas com Instalações",
  "gas": "Despesas com Instalações",
  "monitoramento": "Despesas com Instalações",
  "aluguel de equipamentos": "Despesas com Instalações",
  // Ministeriais
  "material de consumo": "Despesas Ministeriais",
  "combustível": "Despesas Ministeriais",
  "materiais ebd": "Despesas Ministeriais",
  "ofertas preletores": "Despesas Ministeriais",
  "outros repasses missionários": "Despesas Ministeriais",
  // Outras
  "pendencias financeiro": "Outras Despesas",
  "assembleia convenção batista brasileira": "Outras Despesas",
  "outros gastos cartão": "Outras Despesas",
  "doações e contribuições": "Outras Despesas",
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
  // `origem <> 'transferencia'` — mesmo bug já corrigido em
  // `vw_fin_resumo_mes` (12/09/2026): uma transferência entre contas grava
  // DOIS lançamentos (saída na origem + entrada no destino, ver
  // `criarTransferencia()`), e sem este filtro cada perna somava como
  // receita/despesa real na demonstração. Achado ao vivo pela Telma: um
  // TOTAL vendo "Outras Receitas Operacionais / Sem categoria" com o valor
  // exato de uma transferência — transferência não tem categoria, por isso
  // caía no fallback em vez de sumir.
  const realizados = lancs.filter(l =>
    (l.status === "realizado" || l.status === "conciliado") && l.origem !== "transferencia");

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
