// ─── lib/mesaOfx.ts — a Mesa de Conciliação: grupos por padrão e a medição da rodada (puro, testado) ───────────
//
// Duas coisas que a tela precisa e que não são desenho:
//
//  1. GRUPOS — e o quanto é SEGURO decidir cada um em lote. Linhas novas parecidas (mesmo favorecido; só na falta dele, o mesmo
//     texto do banco) formam um grupo; o texto bancário é o ÚLTIMO critério e sozinho nunca basta: "PAGTO ELETRON COBRANCA …
//     NET EMPRESA" cobre 13 pagamentos de favorecidos, valores, categorias e centros diferentes. Só o grupo "seguro" (mesma
//     categoria e centro, todas identificadas) aceita decisão em lote; o resto é decidido linha a linha.
//
//  2. MEDIÇÃO. Setembro e outubro serão reimportados como teste real da Mesa. O que se quer saber, linha a linha:
//     o sistema acertou sozinho (aceita sem mudar), pediu uma olhada que virou 1 clique, foi corrigida na linha, ou
//     precisou de formulário? `resumirMedicao` conta isso e `textoDaMedicao` gera o relatório que a tesouraria copia.

import { chaveDoMemo, type Banda, type Sugestao } from "./classificacaoOfx";
import { ehDepositoEmDinheiro } from "./transferenciaOfx";

export interface LinhaParaAgrupar { fitid: string; tipo: "entrada" | "saida"; valor: number; memo: string; situacao: string; sugestao?: Sugestao }

/**
 * O quanto se pode confiar numa decisão EM LOTE para o grupo (pedido dela, 08/10/2026, ao ver "13 saídas com o mesmo texto:
 * PAGTO ELETRON COBRANCA … NET EMPRESA" — valores, favorecidos, categorias e centros diferentes sob o mesmo texto bancário):
 *  · seguro    — mesmo favorecido (ou mesmo padrão histórico), mesma categoria, mesmo centro e TODAS identificadas: aceita lote;
 *  · parcial   — parecem iguais mas algo diverge (centro, confiança, valores): só linha a linha;
 *  · inseguro  — categorias divergentes, texto genérico ou sem sugestão: o texto do banco não identifica ninguém.
 */
export type Seguranca = "seguro" | "parcial" | "inseguro";

export interface Grupo {
  /** a identidade do padrão: o id do favorecido, ou o texto do banco sem números nem acento */
  chave: string;
  /** como o grupo foi formado — o favorecido vale mais que o texto bancário, que é o último critério */
  por: "favorecido" | "texto";
  tipo: "entrada" | "saida";
  fitids: string[];
  total: number;
  /** um exemplo do texto original, para mostrar */
  amostra: string;
  favorecido?: string;
  seguranca: Seguranca;
  /** por que não é seguro (ou o que o faz seguro), em português */
  motivo: string;
  categoriaId?: string;
  centroId?: string;
  menor: number;
  maior: number;
}

export const MINIMO_DO_GRUPO = 3;
/** Texto bancário sem favorecido com valores muito distantes não é "o mesmo tipo de pagamento". */
const RAZAO_MAXIMA_DE_VALORES = 3;

const mesmoValor = (a: number, b: number) => Math.abs(a - b) < 0.005;
const ehPix = (memo: string) => /\bpix\b/i.test(memo);

function avaliar(lista: LinhaParaAgrupar[], por: Grupo["por"]): Pick<Grupo, "seguranca" | "motivo" | "categoriaId" | "centroId"> {
  const sugs = lista.map(l => l.sugestao!);
  // dinheiro depositado no caixa eletrônico costuma ser o Caixa/Envelopes indo para o banco: transferência interna, não oferta
  if (lista.some(l => ehDepositoEmDinheiro(l.memo))) return { seguranca: "inseguro", motivo: "depósito em dinheiro: pode ser transferência interna do caixa ou dos envelopes, não receita" };
  if (sugs.some(s => s.generico)) return { seguranca: "inseguro", motivo: "o texto do banco serve a vários favorecidos (boleto/cobrança genérica)" };

  // ,10 em parte das linhas: cada contribuição da mesma pessoa pode ter uma natureza (dízimo, oferta, oferta missionária)
  const comSinalMissionario = sugs.filter(s => s.possivelMissoes).length;
  if (comSinalMissionario > 0 && comSinalMissionario < sugs.length) {
    return { seguranca: "inseguro", motivo: `${comSinalMissionario} das ${sugs.length} têm o sinal de oferta missionária (,10) e as outras não — cada uma tem natureza própria` };
  }
  const cats = new Set(sugs.map(s => s.categoriaId ?? ""));
  if (cats.size > 1) return { seguranca: "inseguro", motivo: `${cats.size} categorias diferentes sugeridas para o mesmo padrão` };
  const categoriaId = sugs[0].categoriaId;
  if (!categoriaId) return { seguranca: "inseguro", motivo: "nenhuma categoria sugerida" };

  const comFavorecido = por === "favorecido";
  // A MESMA pessoa pode dar dízimo, oferta e oferta missionária no mesmo mês: se o histórico dela mistura categorias, o
  // remetente não diz qual é a natureza desta linha (pedido dela, 08/10/2026).
  if (comFavorecido) {
    const habituais = new Set(sugs.flatMap(s => (s.historico ?? []).map(h => h.categoriaId ?? "")));
    if (habituais.size > 1) return { seguranca: "inseguro", motivo: "o histórico dele(a) mistura categorias (dízimo, oferta…): o remetente não diz a natureza de cada linha", categoriaId };
  }

  const centros = new Set(sugs.map(s => s.centroId ?? ""));
  const centroId = centros.size === 1 && sugs[0].centroId ? sugs[0].centroId : undefined;
  const valores = lista.map(l => l.valor);
  const menor = Math.min(...valores), maior = Math.max(...valores);
  const doisDoMesmoRemetente = comFavorecido || lista.some(l => ehPix(l.memo));
  const naoIdentificadas = sugs.filter(s => s.banda !== "identificada").length;

  const falhas: string[] = [];
  if (naoIdentificadas > 0) falhas.push(`${naoIdentificadas} com confiança abaixo de 85%`);
  if (!centroId) falhas.push(centros.size > 1 ? "centros de custo diferentes" : "sem centro de custo sugerido");
  if (comFavorecido && sugs.some(s => (s.historico?.length ?? 0) < 2)) falhas.push("histórico curto (menos de 2 lançamentos anteriores)");
  if (doisDoMesmoRemetente) {
    // mesma pessoa só é "o mesmo comportamento" quando o VALOR também se repete — e já apareceu antes
    if (!mesmoValor(menor, maior)) falhas.push("mesma pessoa, valores diferentes");
    else if (comFavorecido && lista[0].tipo === "entrada" && lista.some((l, i) => !(sugs[i].historico ?? []).some(h => mesmoValor(h.valor, l.valor)))) falhas.push("valor sem precedente no histórico");
  } else if (menor > 0 && maior / menor > RAZAO_MAXIMA_DE_VALORES) {
    falhas.push("valores muito diferentes para o mesmo texto");
  }
  if (!comFavorecido && !doisDoMesmoRemetente && falhas.length > 1) return { seguranca: "inseguro", motivo: falhas.join(" · "), categoriaId, centroId };
  if (falhas.length > 0) return { seguranca: "parcial", motivo: falhas.join(" · "), categoriaId, centroId };
  return {
    seguranca: "seguro", categoriaId, centroId,
    motivo: comFavorecido ? "mesma pessoa/favorecido, mesmo valor, mesma categoria histórica e mesmo centro" : "mesmo padrão histórico, categoria e centro",
  };
}

/**
 * Forma os grupos de linhas novas parecidas e diz o quão seguro é decidir cada um em lote. Ordem de prioridade da identidade
 * (pedido dela): o favorecido identificado primeiro; o texto bancário só quando nada mais identifica a linha.
 * Os grupos vêm do mais numeroso para o menos; `avulsas` são as linhas novas que não formam grupo.
 */
export function agruparPorClasse(linhas: LinhaParaAgrupar[], minimo = MINIMO_DO_GRUPO): { grupos: Grupo[]; avulsas: string[] } {
  const porChave = new Map<string, { por: Grupo["por"]; nome?: string; lista: LinhaParaAgrupar[] }>();
  for (const l of linhas) {
    const s = l.sugestao;
    if (l.situacao !== "nova" || !s || s.transferencia) continue;
    const fav = s.pessoa ?? s.fornecedor;
    const texto = chaveDoMemo(l.memo);
    if (!fav && !texto) continue;
    const k = fav ? `${l.tipo}|f:${fav.id}` : `${l.tipo}|t:${texto}`;
    const g = porChave.get(k);
    if (g) g.lista.push(l); else porChave.set(k, { por: fav ? "favorecido" : "texto", nome: fav?.nome, lista: [l] });
  }
  const grupos: Grupo[] = [];
  const agrupadas = new Set<string>();
  for (const [k, { por, nome, lista }] of porChave) {
    if (lista.length < minimo) continue;
    const valores = lista.map(l => l.valor);
    grupos.push({
      chave: k.slice(k.indexOf("|") + 3), por, tipo: lista[0].tipo, fitids: lista.map(l => l.fitid),
      total: valores.reduce((n, v) => n + v, 0), amostra: lista[0].memo, favorecido: nome,
      menor: Math.min(...valores), maior: Math.max(...valores), ...avaliar(lista, por),
    });
    lista.forEach(l => agrupadas.add(l.fitid));
  }
  grupos.sort((a, b) => b.fitids.length - a.fitids.length || b.total - a.total);
  return { grupos, avulsas: linhas.filter(l => l.situacao === "nova" && !agrupadas.has(l.fitid)).map(l => l.fitid) };
}

/** Quantos grupos e linhas há em cada grau de segurança — vai para a medição. */
export interface ResumoDosAgrupamentos { seguros: { grupos: number; linhas: number }; parciais: { grupos: number; linhas: number }; inseguros: { grupos: number; linhas: number } }
export function resumirAgrupamentos(grupos: Grupo[]): ResumoDosAgrupamentos {
  const r: ResumoDosAgrupamentos = { seguros: { grupos: 0, linhas: 0 }, parciais: { grupos: 0, linhas: 0 }, inseguros: { grupos: 0, linhas: 0 } };
  for (const g of grupos) {
    const alvo = g.seguranca === "seguro" ? r.seguros : g.seguranca === "parcial" ? r.parciais : r.inseguros;
    alvo.grupos++; alvo.linhas += g.fitids.length;
  }
  return r;
}

// ── a medição ───────────────────────────────────────────────────────────────

/** Como cada linha foi resolvida na rodada. */
export type Desfecho = "aceita" | "corrigida" | "manual" | "ignorada";

export interface RegistroDaMedicao { banda: Banda | "sem_sugestao"; desfecho: Desfecho; possivelMissoes?: boolean; emGrupo?: boolean }

export interface Medicao {
  /** linhas do extrato */
  total: number;
  /** como o motor classificou ao abrir (antes de qualquer clique) */
  aoAbrir: { identificadas: number; revisar: number; naoIdentificadas: number; jaRegistradas: number; conciliar: number; debitos: number; documentos: number; transferencias: number };
  /** o que aconteceu até agora com as linhas novas */
  resolvidas: { aceitasSemMudar: number; aceitasEmIdentificadas: number; aceitasEmRevisar: number; corrigidas: number; manuais: number; ignoradas: number; viaGrupo: number };
  pendentes: number;
  /** das que o motor marcou "identificada", quantas a tesouraria precisou corrigir */
  errosNaIdentificada: number;
  missoes: { sugeridas: number; confirmadas: number };
  /** quantos padrões repetidos (grupos) aceitam decisão em lote, quantos só linha a linha e quantos não identificam ninguém */
  agrupamentos?: ResumoDosAgrupamentos;
}

export function resumirMedicao(
  aoAbrir: Medicao["aoAbrir"], total: number, novas: number, registros: RegistroDaMedicao[], agrupamentos?: ResumoDosAgrupamentos,
): Medicao {
  const r = { aceitasSemMudar: 0, aceitasEmIdentificadas: 0, aceitasEmRevisar: 0, corrigidas: 0, manuais: 0, ignoradas: 0, viaGrupo: 0 };
  let erros = 0, sugeridas = 0, confirmadas = 0;
  for (const x of registros) {
    if (x.desfecho === "aceita") { r.aceitasSemMudar++; if (x.banda === "identificada") r.aceitasEmIdentificadas++; else r.aceitasEmRevisar++; }
    else if (x.desfecho === "corrigida") { r.corrigidas++; if (x.banda === "identificada") erros++; }
    else if (x.desfecho === "manual") r.manuais++;
    else r.ignoradas++;
    if (x.emGrupo) r.viaGrupo++;
    if (x.possivelMissoes) { sugeridas++; if (x.desfecho === "aceita") confirmadas++; }
  }
  return { total, aoAbrir, resolvidas: r, pendentes: Math.max(0, novas - registros.length), errosNaIdentificada: erros, missoes: { sugeridas, confirmadas }, agrupamentos };
}

const pct = (n: number, d: number) => (d > 0 ? `${Math.round((1000 * n) / d) / 10}%`.replace(".", ",") : "—");

/** O relatório da rodada em texto, pronto para colar. */
export function textoDaMedicao(m: Medicao, quando = ""): string {
  const novas = m.aoAbrir.identificadas + m.aoAbrir.revisar + m.aoAbrir.naoIdentificadas;
  const r = m.resolvidas;
  const feitas = r.aceitasSemMudar + r.corrigidas + r.manuais + r.ignoradas;
  return [
    `Medição da conciliação${quando ? ` — ${quando}` : ""}`,
    `Extrato: ${m.total} movimentos · ${novas} novos para decidir`,
    ``,
    `O motor, ao abrir (antes de qualquer clique):`,
    `  ✓ identificados automaticamente: ${m.aoAbrir.identificadas} (${pct(m.aoAbrir.identificadas, novas)} dos novos)`,
    `  ⚠ precisam de revisão: ${m.aoAbrir.revisar} (${pct(m.aoAbrir.revisar, novas)})`,
    `  ❌ não identificados: ${m.aoAbrir.naoIdentificadas} (${pct(m.aoAbrir.naoIdentificadas, novas)})`,
    `  fora da fila: ${m.aoAbrir.jaRegistradas} já registrados · ${m.aoAbrir.conciliar} a conciliar · ${m.aoAbrir.debitos} débitos automáticos · ${m.aoAbrir.documentos} documentos a pagar · ${m.aoAbrir.transferencias} transferências`,
    ``,
    `O que a tesouraria fez até agora (${feitas} de ${novas}):`,
    `  aceitou a sugestão sem mudar nada: ${r.aceitasSemMudar} (${pct(r.aceitasSemMudar, novas)} dos novos) — ${r.aceitasEmIdentificadas} das identificadas, ${r.aceitasEmRevisar} das que pediam revisão`,
    `  corrigiu na própria linha (categoria, centro ou favorecido): ${r.corrigidas}`,
    `  precisou de formulário completo ou transferência: ${r.manuais}`,
    `  ignorou: ${r.ignoradas}`,
    `  decididas em grupo: ${r.viaGrupo}`,
    `  ainda pendentes: ${m.pendentes}`,
    ``,
    `Confiabilidade: das identificadas, ${m.errosNaIdentificada} precisaram de correção.`,
    `Possível oferta missionária (,10): ${m.missoes.sugeridas} sugeridas, ${m.missoes.confirmadas} confirmadas como Missões.`,
    ...(m.agrupamentos ? [
      ``,
      `Agrupamentos (padrões repetidos entre os novos — só os seguros aceitam decisão em lote):`,
      `  seguros: ${m.agrupamentos.seguros.grupos} (${m.agrupamentos.seguros.linhas} linhas)`,
      `  parcialmente seguros: ${m.agrupamentos.parciais.grupos} (${m.agrupamentos.parciais.linhas} linhas)`,
      `  inseguros: ${m.agrupamentos.inseguros.grupos} (${m.agrupamentos.inseguros.linhas} linhas)`,
    ] : []),
  ].join("\n");
}
