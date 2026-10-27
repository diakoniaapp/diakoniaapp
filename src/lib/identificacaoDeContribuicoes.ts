// ─── identificacaoDeContribuicoes — a fila de "Pendentes de Identificação" (27/10/2026, Fase 3) ──────────────────────────────────────────────────────────────────────────────────────────
// Puro (sem rede, sem React). Três coisas: (1) tirar do extrato o NOME de quem contribuiu, (2) sugerir a pessoa do cadastro, (3) calcular a taxa de identificação em quatro partes.
//
// O QUE O DADO REAL É (medido em 27/10/2026, 377 pendentes desde 01/01/2026): 307 vêm do Omie com o remetente DENTRO de `observacoes`, depois de "rem" e truncado ("… pix qr code estatic rem sandra
// fulano d 1101": o "d" é um "de" cortado e o "1101" é a data); 54 vêm de OFX com o nome em `descricao`; 16 são manuais, sem texto nenhum. Por isso o extrator lê `descricao` primeiro e, se não houver
// nome, o trecho depois de "rem". A sugestão reusa `fuzzyNome` (exato, subsequência de tokens, truncado, digitação, parecido) e só sugere quando há UM candidato — nunca adivinha entre dois.
import { encontrarDetalhado, normalizarNome, type CandidatoNome, type NivelDoCasamento } from "@/lib/fuzzyNome";

/** A meta de identificação que ela definiu (27/10/2026). */
export const META_DE_IDENTIFICACAO_PCT = 95;

export type DecisaoDeTriagem = "anonimo" | "ignorado";

/** O mínimo de um lançamento para a triagem. `categoria` é o NOME (Dizimos, Ofertas…). */
export interface ContribuicaoParaTriagem {
  id: string;
  data: string;
  valor: number;
  categoria: string | null;
  descricao: string | null;
  observacoes: string | null;
  origem: string | null;
  forma_pagamento: string | null;
  pessoa_id: string | null;
  familia_id: string | null;
  /** a pessoa a que o FAVORECIDO do lançamento está ligado (Favorecido → Pessoas), quando o lançamento tem favorecido ligado; nunca grava sozinho, só sugere */
  fornecedor_pessoa_id?: string | null;
}

// ── (1) o nome do remetente ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const soLetrasEEspacos = (s: string) => normalizarNome(s).replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
/** tem ao menos uma palavra de 3+ letras (descarta "x", "12", "ofx n1168f") */
const pareceNome = (s: string) => soLetrasEEspacos(s).split(" ").some(p => p.length >= 3);

/**
 * O nome de quem contribuiu, como o extrato o escreveu (pode vir cortado), ou `null` se o lançamento não diz. `descricao` primeiro (OFX e lançamento manual com nome);
 * depois o trecho de `observacoes` que vem depois de "rem" (Omie), sem a data que o banco cola no fim.
 */
export function remetenteDoLancamento(descricao: string | null | undefined, observacoes: string | null | undefined): string | null {
  if (descricao && pareceNome(descricao) && !/^\s*(ofx|lote)\b/i.test(descricao)) return soLetrasEEspacos(descricao) || null;
  const obs = normalizarNome(observacoes ?? "");
  const m = obs.match(/(?:^|\s)rem\s+(.+)$/);
  if (!m) return null;
  const tokens = m[1].split(" ").filter(Boolean);
  while (tokens.length > 0 && /^\d+$/.test(tokens[tokens.length - 1])) tokens.pop();   // a data (ddmm) que o banco cola no fim
  const nome = soLetrasEEspacos(tokens.join(" "));
  return pareceNome(nome) ? nome : null;
}

// ── (2) a sugestão ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export type Confianca = "alta" | "media";
/** `favorecido`: a sugestão vem do favorecido ligado a uma pessoa, não do nome no extrato — sem nenhuma inferência (decisão dela, 27/10/2026: sugerir, nunca vincular sozinho). */
export interface Sugestao { pessoaId: string; nome: string; nivel: NivelDoCasamento | "favorecido"; confianca: Confianca }
export type Dificuldade = "facil" | "media" | "dificil";

/** exato, subsequência de tokens e nome truncado são seguros; digitação e "nome contido no outro" pedem que a pessoa CONFIRME. */
const CONFIANCA_DO_NIVEL: Record<NivelDoCasamento, Confianca> = { exato: "alta", tokens: "alta", truncado: "alta", digitacao: "media", parecido: "media" };

export function sugerirPessoa(remetente: string | null, candidatos: CandidatoNome[]): Sugestao | null {
  if (!remetente) return null;
  const r = encontrarDetalhado(remetente, candidatos, true);
  return r ? { pessoaId: r.candidato.id, nome: r.candidato.nome, nivel: r.nivel, confianca: CONFIANCA_DO_NIVEL[r.nivel] } : null;
}

/** Fácil: há sugestão segura. Média: há sugestão que pede confirmação. Difícil: sem nome no extrato ou sem candidato único. */
export const dificuldadeDe = (s: Sugestao | null): Dificuldade => (s === null ? "dificil" : s.confianca === "alta" ? "facil" : "media");

export interface PendenteComSugestao { contribuicao: ContribuicaoParaTriagem; remetente: string | null; sugestao: Sugestao | null; dificuldade: Dificuldade }

/** O favorecido ligado a uma pessoa que está no cadastro: a sugestão mais segura (alta confiança), antes do nome no extrato. */
export function sugerirPeloFavorecido(pessoaId: string | null | undefined, candidatos: CandidatoNome[]): Sugestao | null {
  if (!pessoaId) return null;
  const c = candidatos.find(x => x.id === pessoaId);
  return c ? { pessoaId: c.id, nome: c.nome, nivel: "favorecido", confianca: "alta" } : null;
}

export function prepararPendentes(contribuicoes: ContribuicaoParaTriagem[], candidatos: CandidatoNome[]): PendenteComSugestao[] {
  return contribuicoes.map(c => {
    const remetente = remetenteDoLancamento(c.descricao, c.observacoes);
    const sugestao = sugerirPeloFavorecido(c.fornecedor_pessoa_id, candidatos) ?? sugerirPessoa(remetente, candidatos);
    return { contribuicao: c, remetente, sugestao, dificuldade: dificuldadeDe(sugestao) };
  });
}

// ── (3) a taxa de identificação em quatro partes ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface ParteDaTaxa { quantidade: number; valor: number; pctQuantidade: number | null; pctValor: number | null }
export interface TaxaDeIdentificacao {
  total: { quantidade: number; valor: number };
  identificadas: ParteDaTaxa; anonimas: ParteDaTaxa; ignoradas: ParteDaTaxa; pendentes: ParteDaTaxa;
  metaPct: number;
  /** a taxa de identificação (identificadas ÷ total) em % do VALOR; `null` sem contribuições */
  taxaPct: number | null;
  /** o valor que ainda falta identificar para chegar à meta (0 se já chegou) */
  valorParaAMeta: number;
  atingiuAMeta: boolean;
}

const arred = (n: number) => Math.round(n * 100) / 100;

/**
 * Só "identificada" (tem pessoa) conta como identificada: anônima e ignorada saem da fila, mas ficam à parte — para a taxa não ser inflada. `triagem` = decisão vigente por lançamento.
 */
export function taxaDeIdentificacao(contribuicoes: { id: string; valor: number; pessoa_id: string | null }[], triagem: Map<string, DecisaoDeTriagem>): TaxaDeIdentificacao {
  const soma = { identificadas: [0, 0], anonimas: [0, 0], ignoradas: [0, 0], pendentes: [0, 0] } as Record<string, [number, number]>;
  for (const c of contribuicoes) {
    const chave = c.pessoa_id ? "identificadas" : triagem.get(c.id) === "anonimo" ? "anonimas" : triagem.get(c.id) === "ignorado" ? "ignoradas" : "pendentes";
    soma[chave][0]++; soma[chave][1] += Number(c.valor);
  }
  const totalQ = contribuicoes.length, totalV = arred(contribuicoes.reduce((s, c) => s + Number(c.valor), 0));
  const parte = ([q, v]: [number, number]): ParteDaTaxa => ({ quantidade: q, valor: arred(v), pctQuantidade: totalQ > 0 ? arred((q / totalQ) * 100) : null, pctValor: totalV > 0 ? arred((v / totalV) * 100) : null });
  const identificadas = parte(soma.identificadas);
  const taxaPct = identificadas.pctValor;
  return {
    total: { quantidade: totalQ, valor: totalV },
    identificadas, anonimas: parte(soma.anonimas), ignoradas: parte(soma.ignoradas), pendentes: parte(soma.pendentes),
    metaPct: META_DE_IDENTIFICACAO_PCT, taxaPct,
    valorParaAMeta: totalV > 0 ? Math.max(0, arred((META_DE_IDENTIFICACAO_PCT / 100) * totalV - identificadas.valor)) : 0,
    atingiuAMeta: taxaPct !== null && taxaPct >= META_DE_IDENTIFICACAO_PCT,
  };
}
