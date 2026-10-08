// ─── lib/mesaOfx.ts — a Mesa de Conciliação: grupos por padrão e a medição da rodada (puro, testado) ───────────
//
// Duas coisas que a tela precisa e que não são desenho:
//
//  1. GRUPOS. "PIX da Cielo", "tarifa bancária", "depósito no caixa eletrônico", "PIX de Quarta Igreja Batista…":
//     linhas que o banco escreve do mesmo jeito e que ninguém identificou pelo nome. Decidir UMA vez para o grupo
//     (categoria e centro) resolve todas — é o que tira dezenas de cliques da fila. Só agrupa linha NOVA, sem pessoa/
//     favorecido identificado, que não seja transferência, com 3 ou mais iguais e do mesmo tipo (entrada/saída).
//
//  2. MEDIÇÃO. Setembro e outubro serão reimportados como teste real da Mesa. O que se quer saber, linha a linha:
//     o sistema acertou sozinho (aceita sem mudar), pediu uma olhada que virou 1 clique, foi corrigida na linha, ou
//     precisou de formulário? `resumirMedicao` conta isso e `textoDaMedicao` gera o relatório que a tesouraria copia.

import { chaveDoMemo, type Banda, type Sugestao } from "./classificacaoOfx";

export interface LinhaParaAgrupar { fitid: string; tipo: "entrada" | "saida"; valor: number; memo: string; situacao: string; sugestao?: Sugestao }

export interface Grupo {
  /** o texto do banco sem números nem acento: a identidade do padrão */
  chave: string;
  tipo: "entrada" | "saida";
  fitids: string[];
  total: number;
  /** um exemplo do texto original, para mostrar */
  amostra: string;
}

export const MINIMO_DO_GRUPO = 3;

/** Separa as linhas que formam um grupo das avulsas. A ordem dos grupos: o mais numeroso primeiro. */
export function agruparPorClasse(linhas: LinhaParaAgrupar[], minimo = MINIMO_DO_GRUPO): { grupos: Grupo[]; avulsas: string[] } {
  const porChave = new Map<string, LinhaParaAgrupar[]>();
  for (const l of linhas) {
    const s = l.sugestao;
    if (l.situacao !== "nova" || !s || s.transferencia || s.pessoa || s.fornecedor) continue;
    const chave = chaveDoMemo(l.memo);
    if (!chave) continue;
    const k = `${l.tipo}|${chave}`;
    const lista = porChave.get(k);
    if (lista) lista.push(l); else porChave.set(k, [l]);
  }
  const grupos: Grupo[] = [];
  const agrupadas = new Set<string>();
  for (const [k, lista] of porChave) {
    if (lista.length < minimo) continue;
    grupos.push({ chave: k.slice(k.indexOf("|") + 1), tipo: lista[0].tipo, fitids: lista.map(l => l.fitid), total: lista.reduce((n, l) => n + l.valor, 0), amostra: lista[0].memo });
    lista.forEach(l => agrupadas.add(l.fitid));
  }
  grupos.sort((a, b) => b.fitids.length - a.fitids.length || b.total - a.total);
  return { grupos, avulsas: linhas.filter(l => l.situacao === "nova" && !agrupadas.has(l.fitid)).map(l => l.fitid) };
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
}

export function resumirMedicao(
  aoAbrir: Medicao["aoAbrir"], total: number, novas: number, registros: RegistroDaMedicao[],
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
  return { total, aoAbrir, resolvidas: r, pendentes: Math.max(0, novas - registros.length), errosNaIdentificada: erros, missoes: { sugeridas, confirmadas } };
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
  ].join("\n");
}
