// ─── confiabilidade — o quanto se pode confiar numa lista de "sem dízimo" / "sem contribuição" (27/10/2026) ──────────────────────────────────────────────────────────────────────────────────
// Pedido dela (27/10/2026), antes do primeiro relatório oficial ao pastor: a lista de quem NÃO contribuiu só vale se as contribuições do período estão identificadas. Uma contribuição sem pessoa ligada
// (ou ainda sem classificação de "anônima"/"ignorada") pode ser de alguém que aparece na lista sem ter deixado de contribuir. Aqui se mede isso: percentual identificado, pendentes, o impacto potencial
// sobre a lista e a data dos dados. Puro (sem rede): a tela, o Excel e o e-mail usam o MESMO cálculo.
import { tipoDaContribuicao, type LinhaDeContribuicao, type TipoDeContribuicao } from "./analise.ts";

/** Até este percentual do valor pendente a lista é "alta" confiabilidade (a meta dela é 95% identificado). */
export const PENDENTE_MAXIMO_PARA_ALTA_PCT = 5;
/** Até este, "média"; acima, "baixa". */
export const PENDENTE_MAXIMO_PARA_MEDIA_PCT = 15;
/** Com ao menos tantas contribuições pendentes, a tesouraria é avisada antes da lista com nomes, mesmo que o percentual seja bom. */
export const PENDENTES_PARA_ALERTAR = 20;

export type NivelDeConfiabilidade = "alta" | "media" | "baixa";
export type DecisaoDeTriagem = "anonimo" | "ignorado";
interface Parte { quantidade: number; valor: number }

export interface Confiabilidade {
  nivel: NivelDeConfiabilidade;
  /** % do VALOR das contribuições do recorte que tem pessoa identificada */
  pctIdentificado: number | null;
  /** % do VALOR ainda pendente (sem pessoa e sem classificação de anônima/ignorada) */
  pctPendente: number | null;
  total: Parte;
  identificadas: Parte;
  /** sem pessoa, mas já classificadas (anônima por natureza, ou ignorada): não são pendência */
  classificadas: Parte;
  pendentes: Parte;
  /** as pendências que podem mudar ESTA lista: só as de dízimo quando a lista é de dízimo; todas, quando é de qualquer contribuição */
  pendentesDaLista: Parte;
  /** quantas pessoas da lista poderiam sair dela se as pendências fossem identificadas (no máximo uma pessoa por pendência) */
  impacto: { podemSair: number; tamanhoDaLista: number; pctDaLista: number | null };
  /** AAAA-MM-DD da contribuição lançada mais recente (até o fim do período) */
  ultimaContribuicao: string | null;
  /** AAAA-MM-DD do último extrato importado de uma conta de banco, quando se sabe */
  ultimoExtrato: string | null;
  /** a tesouraria deve ser avisada ANTES de gerar/exportar a lista com nomes */
  alertar: boolean;
}

const arred = (n: number) => Math.round(n * 100) / 100;

export interface OpcoesDaConfiabilidade {
  categorias: TipoDeContribuicao[];
  /** quantas pessoas a lista tem (a de "sem dízimo" ou "sem contribuição") */
  tamanhoDaLista: number;
  /** decisão vigente por lançamento (anônima/ignorada), pelo `id` da linha */
  decisoes?: Map<string, DecisaoDeTriagem>;
  ultimoExtrato?: string | null;
}

/** As linhas são as contribuições lidas (com ou sem pessoa); `id` só é necessário para casar com a classificação de anônima/ignorada. */
export function calcularConfiabilidade(linhas: (LinhaDeContribuicao & { id?: string })[], periodo: { ini: string; fim: string }, o: OpcoesDaConfiabilidade): Confiabilidade {
  const soma = { total: [0, 0], identificadas: [0, 0], classificadas: [0, 0], pendentes: [0, 0], pendentesDaLista: [0, 0] } as Record<string, [number, number]>;
  const listaEhDeDizimo = o.categorias.length === 1 && o.categorias[0] === "dizimo";
  let ultima: string | null = null;
  for (const l of linhas) {
    const t = tipoDaContribuicao(l.categoria);
    if (t === null || l.data > periodo.fim) continue;
    if (!ultima || l.data > ultima) ultima = l.data;
    if (l.data < periodo.ini || !o.categorias.includes(t)) continue;
    const v = Number(l.valor);
    soma.total[0]++; soma.total[1] += v;
    if (l.pessoa_id) { soma.identificadas[0]++; soma.identificadas[1] += v; continue; }
    if (l.id && o.decisoes?.has(l.id)) { soma.classificadas[0]++; soma.classificadas[1] += v; continue; }
    soma.pendentes[0]++; soma.pendentes[1] += v;
    // a lista de "sem dízimo" só pode ser alterada por uma pendência de DÍZIMO; a de "sem contribuição", por qualquer uma
    if (!listaEhDeDizimo || t === "dizimo") { soma.pendentesDaLista[0]++; soma.pendentesDaLista[1] += v; }
  }
  const parte = ([q, v]: [number, number]): Parte => ({ quantidade: q, valor: arred(v) });
  const totalV = soma.total[1];
  const pctPendente = totalV > 0 ? arred((soma.pendentes[1] / totalV) * 100) : null;
  const pctIdentificado = totalV > 0 ? arred((soma.identificadas[1] / totalV) * 100) : null;
  const nivel: NivelDeConfiabilidade = pctPendente === null || pctPendente <= PENDENTE_MAXIMO_PARA_ALTA_PCT ? "alta" : pctPendente <= PENDENTE_MAXIMO_PARA_MEDIA_PCT ? "media" : "baixa";
  const podemSair = Math.min(soma.pendentesDaLista[0], o.tamanhoDaLista);
  return {
    nivel, pctIdentificado, pctPendente,
    total: parte(soma.total), identificadas: parte(soma.identificadas), classificadas: parte(soma.classificadas), pendentes: parte(soma.pendentes), pendentesDaLista: parte(soma.pendentesDaLista),
    impacto: { podemSair, tamanhoDaLista: o.tamanhoDaLista, pctDaLista: o.tamanhoDaLista > 0 ? arred((podemSair / o.tamanhoDaLista) * 100) : null },
    ultimaContribuicao: ultima, ultimoExtrato: o.ultimoExtrato ?? null,
    alertar: nivel !== "alta" || soma.pendentesDaLista[0] >= PENDENTES_PARA_ALERTAR,
  };
}

export const ROTULO_DO_NIVEL: Record<NivelDeConfiabilidade, string> = { alta: "Alta", media: "Média", baixa: "Baixa" };

/** O aviso que acompanha toda lista de "sem dízimo"/"sem contribuição": o que ela considera e o que não considera. */
export const AVISO_SO_IDENTIFICADAS = "Esta lista considera apenas contribuições identificadas e vinculadas a pessoas. Uma contribuição ainda sem pessoa vinculada (pendente de identificação) pode fazer alguém aparecer aqui sem ter deixado de contribuir.";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const ddmmaaaa = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;
const pct = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);

/** As linhas do quadro de confiabilidade (tela, e-mail e Excel dizem as mesmas coisas, com as mesmas palavras). */
export function linhasDaConfiabilidade(c: Confiabilidade): string[] {
  const linhas = [
    `Confiabilidade: ${ROTULO_DO_NIVEL[c.nivel]}`,
    `Contribuições identificadas: ${pct(c.pctIdentificado)} do valor (${c.identificadas.quantidade} de ${c.total.quantidade})`,
    `Contribuições pendentes de identificação: ${c.pendentes.quantidade} (${brl(c.pendentes.valor)}, ${pct(c.pctPendente)} do valor)`,
  ];
  if (c.classificadas.quantidade > 0) linhas.push(`Já classificadas como anônimas ou ignoradas: ${c.classificadas.quantidade} (${brl(c.classificadas.valor)}) — não contam como pendência`);
  linhas.push(c.impacto.tamanhoDaLista === 0
    ? "Impacto potencial: a lista está vazia."
    : c.pendentesDaLista.quantidade === 0
      ? "Impacto potencial: nenhum — não há pendência que possa mudar esta lista."
      : `Impacto potencial: até ${c.impacto.podemSair} das ${c.impacto.tamanhoDaLista} pessoas desta lista (${pct(c.impacto.pctDaLista)}) podem ter contribuição pendente de identificação.`);
  const dados = [c.ultimoExtrato ? `último extrato importado em ${ddmmaaaa(c.ultimoExtrato)}` : "nenhum extrato de banco com data conhecida", c.ultimaContribuicao ? `última contribuição lançada em ${ddmmaaaa(c.ultimaContribuicao)}` : "nenhuma contribuição lançada"];
  linhas.push(`Dados atualizados até: ${dados.join("; ")}.`);
  return linhas;
}

/** A frase da trava: o que se diz à tesouraria antes de gerar a lista com nomes. */
export function textoDoAlerta(c: Confiabilidade): string {
  return `Existem ${c.pendentes.quantidade} contribuições pendentes de identificação (${brl(c.pendentes.valor)}). Os resultados podem mudar quando elas forem identificadas. Qualidade da identificação: ${pct(c.pctIdentificado)}.`;
}
