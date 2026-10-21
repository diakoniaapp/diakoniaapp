// ─── lib/filtrosDoExtrato.ts — os Filtros avançados do Extrato da conta (puro, testado) ─────────────────────────────────────────────────────────────────────
//
// Pedido dela (21/10/2026): Tipo, Categoria, Centro de custo, Situação, Valor e Data exata saem da barra e vão para um popover "⚙ Filtros (n)". Favorecido e Projeto saíram dos filtros:
// a busca já acha pelo nome do favorecido (`idsPorNomeFornecedorOuPessoa`), e há um projeto só. A regra que não pode quebrar: NUNCA há filtro escondido filtrando sem aviso —
// o botão leva o contador e cada filtro ativo aparece como chip removível logo abaixo da barra (`chipsDosFiltros`).
//
// "Atrasados" deixou de ser um período (era um preset que trocava o par de datas por "sem chão, até ontem" e escondia as datas): virou a Situação "Só vencidos em aberto".
import type { FinMovimentoTipo, FinStatus } from "@/services/finService";

export type TipoDoFiltro = FinMovimentoTipo | "transferencia" | "todos";
export type SituacaoDoFiltro = "todas" | "previsto" | "realizado" | "conciliado" | "vencidos";

export interface FiltrosAvancados {
  tipo: TipoDoFiltro;
  situacao: SituacaoDoFiltro;
  categoriaId: string;
  centroCustoId: string;
  /** texto livre ("928,00") — `<input type="number">` recusa vírgula */
  valorMin: string;
  valorMax: string;
  /** AAAA-MM-DD; "" = sem filtro */
  dataExata: string;
}

export const FILTROS_VAZIOS: FiltrosAvancados = {
  tipo: "todos", situacao: "todas", categoriaId: "", centroCustoId: "", valorMin: "", valorMax: "", dataExata: "",
};

export const ROTULO_DO_TIPO: Record<TipoDoFiltro, string> = {
  todos: "Todos", entrada: "Entradas", saida: "Saídas", transferencia: "Transferências",
};

export const ROTULO_DA_SITUACAO: Record<SituacaoDoFiltro, string> = {
  todas: "Todas",
  previsto: "Previstos",
  realizado: "Realizados",
  conciliado: "Conferidos / conciliados",
  vencidos: "Só vencidos em aberto",
};

export const SITUACOES_EM_ORDEM: SituacaoDoFiltro[] = ["todas", "previsto", "realizado", "conciliado", "vencidos"];

/** O que a Situação pede ao servidor. "Vencidos" é previsto sem chão de data (pode ser de qualquer época), até ontem — as datas da barra não valem. */
export function consultaDaSituacao(situacao: SituacaoDoFiltro, ontem: string): { status?: FinStatus; ignoraDatas: boolean; teto?: string } {
  if (situacao === "vencidos") return { status: "previsto", ignoraDatas: true, teto: ontem };
  if (situacao === "todas") return { ignoraDatas: false };
  return { status: situacao, ignoraDatas: false };
}

const dataBr = (iso: string) => iso.split("-").reverse().join("/");

export interface ChipDeFiltro {
  chave: "tipo" | "situacao" | "categoria" | "centro" | "valor" | "dataExata";
  rotulo: string;
  /** o que zerar ao remover o chip */
  limpar: Partial<FiltrosAvancados>;
}

/** Um chip por filtro ativo. `nomes` traduz os ids guardados na tela para o que a pessoa escolheu. */
export function chipsDosFiltros(
  f: FiltrosAvancados,
  nomes: { categorias: { id: string; nome: string }[]; centros: { id: string; nome: string }[] },
): ChipDeFiltro[] {
  const chips: ChipDeFiltro[] = [];
  if (f.tipo !== "todos") chips.push({ chave: "tipo", rotulo: `Tipo: ${ROTULO_DO_TIPO[f.tipo]}`, limpar: { tipo: "todos" } });
  if (f.situacao !== "todas") chips.push({ chave: "situacao", rotulo: `Situação: ${ROTULO_DA_SITUACAO[f.situacao]}${f.situacao === "vencidos" ? " (ignora as datas)" : ""}`, limpar: { situacao: "todas" } });
  if (f.categoriaId) chips.push({ chave: "categoria", rotulo: `Categoria: ${nomes.categorias.find(c => c.id === f.categoriaId)?.nome ?? "…"}`, limpar: { categoriaId: "" } });
  if (f.centroCustoId) chips.push({ chave: "centro", rotulo: `Centro de custo: ${nomes.centros.find(c => c.id === f.centroCustoId)?.nome ?? "…"}`, limpar: { centroCustoId: "" } });
  const min = f.valorMin.trim();
  const max = f.valorMax.trim();
  if (min || max) {
    const rotulo = min && max ? `Valor: de ${min} a ${max}` : min ? `Valor: a partir de ${min}` : `Valor: até ${max}`;
    chips.push({ chave: "valor", rotulo, limpar: { valorMin: "", valorMax: "" } });
  }
  if (f.dataExata) chips.push({ chave: "dataExata", rotulo: `Só o dia ${dataBr(f.dataExata)}`, limpar: { dataExata: "" } });
  return chips;
}

/** Quantos filtros avançados estão ativos (o número do botão "Filtros (n)"). Valor mínimo e máximo contam como um só. */
export function contarFiltrosAtivos(f: FiltrosAvancados): number {
  return [
    f.tipo !== "todos", f.situacao !== "todas", !!f.categoriaId, !!f.centroCustoId,
    !!(f.valorMin.trim() || f.valorMax.trim()), !!f.dataExata,
  ].filter(Boolean).length;
}

// ─── O endereço da tela espelha os filtros (sobrevive a F5 e a sair/voltar) ────────────────────────────────────────────────────────────────────────────
// Nomes de parâmetro mantidos dos de antes (`tipo`, `categoria`, `centro`, `valorMin`, `valorMax`, `dataExata`) — links e favoritos antigos continuam valendo; `situacao` é novo.
// `fornecedor=` (o filtro que saiu) é ignorado em silêncio, sem filtrar nada às escondidas.
const TIPOS_VALIDOS: TipoDoFiltro[] = ["todos", "entrada", "saida", "transferencia"];

/** `vencidosLegado`: o link antigo `?periodo=atrasados` vira a Situação "Só vencidos em aberto". */
export function filtrosDaUrl(params: URLSearchParams, vencidosLegado = false): FiltrosAvancados {
  const tipo = params.get("tipo") as TipoDoFiltro | null;
  const situacao = params.get("situacao") as SituacaoDoFiltro | null;
  return {
    tipo: tipo && TIPOS_VALIDOS.includes(tipo) ? tipo : "todos",
    situacao: situacao && SITUACOES_EM_ORDEM.includes(situacao) ? situacao : vencidosLegado ? "vencidos" : "todas",
    categoriaId: params.get("categoria") ?? "",
    centroCustoId: params.get("centro") ?? "",
    valorMin: params.get("valorMin") ?? "",
    valorMax: params.get("valorMax") ?? "",
    dataExata: params.get("dataExata") ?? "",
  };
}

/** Escreve só o que foge do padrão. */
export function filtrosParaUrl(f: FiltrosAvancados, params: URLSearchParams): void {
  if (f.tipo !== "todos") params.set("tipo", f.tipo);
  if (f.situacao !== "todas") params.set("situacao", f.situacao);
  if (f.categoriaId) params.set("categoria", f.categoriaId);
  if (f.centroCustoId) params.set("centro", f.centroCustoId);
  if (f.valorMin.trim()) params.set("valorMin", f.valorMin);
  if (f.valorMax.trim()) params.set("valorMax", f.valorMax);
  if (f.dataExata) params.set("dataExata", f.dataExata);
}
