// ─── gradeOfx.ts — as regras da grade de importação OFX (puras, sem React) ─────
//
// A tela só desenha; quem decide "esta linha pode ser lançada agora?", "quantas há em cada
// filtro?" e "o que o botão Confirmar identificadas vai gravar?" mora aqui, onde se testa.
//
// REGRA DE SEGURANÇA: só se grava em lote uma linha que (1) o banco ainda não tem, (2) NÃO é
// transferência entre contas — essa precisa das duas pernas —, e (3) tem categoria, sugerida ou
// escolhida por quem revisa. Linha sem categoria nunca é gravada "para depois".

import type { Sugestao } from "./classificacaoOfx";

export type SituacaoDaLinha = "conciliar" | "ja_registrada" | "ambigua" | "debito_encontrado" | "documento" | "nova";

export interface LinhaDaGrade {
  fitid: string;
  situacao: SituacaoDaLinha;
  sugestao?: Sugestao;
}

/** O que a pessoa mudou à mão numa linha (por FITID). */
export interface Edicao { categoriaId?: string; centroId?: string }

export type Filtro =
  | "todas" | "identificadas" | "pendencias" | "revisar" | "nao_identificadas"
  | "transferencias" | "debitos" | "documentos" | "conciliar" | "ja_registradas";

export const ROTULO_DO_FILTRO: Record<Filtro, string> = {
  todas: "Todas",
  identificadas: "Identificadas",
  pendencias: "Pendências",
  revisar: "Revisar",
  nao_identificadas: "Não identificadas",
  transferencias: "Transferências",
  debitos: "Débitos automáticos",
  documentos: "Documentos a liquidar",
  conciliar: "A conciliar",
  ja_registradas: "Já registradas",
};

export const ORDEM_DOS_FILTROS: Filtro[] = [
  "todas", "identificadas", "pendencias", "revisar", "nao_identificadas", "transferencias", "debitos", "documentos", "conciliar", "ja_registradas",
];

export function pertenceAoFiltro(l: LinhaDaGrade, f: Filtro): boolean {
  if (f === "todas") return true;
  if (f === "conciliar") return l.situacao === "conciliar";
  if (f === "debitos") return l.situacao === "debito_encontrado";
  if (f === "documentos") return l.situacao === "documento";
  if (f === "ja_registradas") return l.situacao === "ja_registrada";
  if (l.situacao !== "nova" && l.situacao !== "ambigua") return false;
  const s = l.sugestao;
  if (f === "transferencias") return !!s?.transferencia;
  // pendências = tudo que uma pessoa ainda precisa olhar: revisar + não identificadas + transferências
  if (f === "pendencias") return !s || s.transferencia || s.banda !== "identificada";
  // uma transferência não conta como "identificada/revisar": ela tem tratamento próprio
  if (s?.transferencia) return false;
  // ambígua (vários lançamentos parecidos) pede olho humano
  if (!s) return f === "revisar" && l.situacao === "ambigua";
  if (f === "identificadas") return s.banda === "identificada";
  if (f === "revisar") return s.banda === "revisar";
  return s.banda === "nao_identificada";
}

export function contarPorFiltro(linhas: LinhaDaGrade[]): Record<Filtro, number> {
  const out = Object.fromEntries(ORDEM_DOS_FILTROS.map(f => [f, 0])) as Record<Filtro, number>;
  for (const l of linhas) for (const f of ORDEM_DOS_FILTROS) if (pertenceAoFiltro(l, f)) out[f] += 1;
  return out;
}

/** Categoria e centro que valem de fato: o que a pessoa escolheu, senão o que foi sugerido. */
export function valoresEfetivos(l: LinhaDaGrade, e?: Edicao): { categoriaId?: string; centroId?: string } {
  return {
    categoriaId: e?.categoriaId || l.sugestao?.categoriaId,
    centroId: e?.centroId || l.sugestao?.centroId,
  };
}

export function podeGravar(l: LinhaDaGrade, e?: Edicao): boolean {
  if (l.situacao !== "nova" || !l.sugestao || l.sugestao.transferencia) return false;
  return !!valoresEfetivos(l, e).categoriaId;
}

/** As linhas que o "Confirmar identificadas" grava: identificadas, gravábeis e ainda marcadas. */
export function identificadasParaConfirmar(
  linhas: LinhaDaGrade[], edicoes: Record<string, Edicao>, marcadas: ReadonlySet<string>,
): LinhaDaGrade[] {
  return linhas.filter(l =>
    l.sugestao?.banda === "identificada" && marcadas.has(l.fitid) && podeGravar(l, edicoes[l.fitid]));
}

/** As marcadas (de qualquer faixa) que podem ser gravadas. */
export function marcadasParaGravar(
  linhas: LinhaDaGrade[], edicoes: Record<string, Edicao>, marcadas: ReadonlySet<string>,
): LinhaDaGrade[] {
  return linhas.filter(l => marcadas.has(l.fitid) && podeGravar(l, edicoes[l.fitid]));
}

/** Quem já vem marcada ao abrir: as identificadas que podem ser gravadas. */
export function marcadasIniciais(linhas: LinhaDaGrade[]): Set<string> {
  return new Set(linhas.filter(l => l.sugestao?.banda === "identificada" && podeGravar(l)).map(l => l.fitid));
}

export function paginar<T>(itens: T[], pagina: number, porPagina: number): { itens: T[]; paginas: number; pagina: number } {
  const paginas = Math.max(1, Math.ceil(itens.length / porPagina));
  const atual = Math.min(Math.max(1, pagina), paginas);
  return { itens: itens.slice((atual - 1) * porPagina, atual * porPagina), paginas, pagina: atual };
}

export function rotuloDaConfianca(banda: Sugestao["banda"]): string {
  return banda === "identificada" ? "Identificada" : banda === "revisar" ? "Revisar" : "Não identificada";
}
