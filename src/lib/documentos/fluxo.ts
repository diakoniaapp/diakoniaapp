// ─── lib/documentos/fluxo.ts — o item da Central e o que se faz com ele ──────
//
// Lógica PURA da Central de Documentos (Fase 1): o modelo de cada arquivo da fila,
// em qual grupo da tela ele cai, o que já vem marcado, pra onde vai de fato, e em
// que ordem se grava. Tudo aqui é testável sem navegador e sem banco.
//
// Os três grupos que a Telma pediu (03/10/2026), mais um:
//   ✅ Vinculação automática  — o motor achou com confiança alta (já vêm MARCADOS);
//   ⚠  Revisão necessária     — dá pra sugerir, mas exige olho humano (nada marcado);
//   ❌ Não identificado       — sem candidato claro (escolha manual ou deixar de fora);
//   ↺  Já anexado             — mesmo conteúdo de um anexo existente (nunca liga de novo).

import type { FinAnexoTipo } from "@/services/finService";
import type { DocumentoLido } from "./leitura";
import type { Banda, LancamentoPool, ResultadoCasamento } from "./casamento";
import type { NomeLido } from "./nomeArquivo";

export type AcaoItem = "pendente" | "confirmado" | "ignorado";
export type EtapaItem = "na_fila" | "lendo" | "lido" | "erro";
export type GrupoUI = "automatico" | "revisao" | "nao_identificado" | "ja_anexado";

export interface ItemCentral {
  id: string;
  nome: string;
  /** Caminho relativo na pasta escolhida (ou no armazenamento, se for órfão). */
  caminho: string;
  bytes: number;
  /** `upload`: arquivo do computador (ainda NÃO enviado). `orfao`: já está no armazenamento. */
  origem: "upload" | "orfao";
  storagePath?: string;
  etapa: EtapaItem;
  /** Como o texto foi obtido; `nao_lido` = XML ou arquivo sem leitura automática. */
  fonte?: "texto" | "ocr" | "nao_lido";
  erro?: string;
  hash?: string;
  leitura?: DocumentoLido;
  nomeLido?: NomeLido;
  resultado?: ResultadoCasamento;
  tipo: FinAnexoTipo;
  acao: AcaoItem;
  /** "Escolher outro lançamento": vale no lugar da sugestão. */
  escolhido?: LancamentoPool | null;
  /** Parcelas desmarcadas de uma compra parcelada. */
  parcelasExcluidas: string[];
  gravado?: boolean;
}

// ── tipo do documento ───────────────────────────────────────────────────────

/** O tipo que a tela já sugere (o usuário pode trocar). */
export function tipoSugerido(leitura?: DocumentoLido, nome?: NomeLido, ehXml = false): FinAnexoTipo {
  if (ehXml) return "xml";
  switch (leitura?.tipo) {
    case "nfe": case "nfce": case "nfse": return "nota_fiscal";
    case "boleto": return "boleto";
    case "fatura": return "fatura";
    case "rpa": return "rpa";
    case "rps": return "rps";
    case "dps": return "dps";
    default: break;
  }
  // o nome do arquivo da tesouraria às vezes diz (RPA/RPS, BOLETO, FATURA)
  if (nome?.recibo === "RPA") return "rpa";
  if (nome?.recibo === "RPS" || nome?.recibo === "RSP") return "rps";
  if (nome?.recibo === "DPS") return "dps";
  if (nome?.tipoDocumento === "BOLETO") return "boleto";
  if (nome?.tipoDocumento === "FATURA") return "fatura";
  if (nome?.nf) return "nota_fiscal";
  return "outro";
}

// ── grupos e ação inicial ───────────────────────────────────────────────────

export function grupoDe(item: Pick<ItemCentral, "etapa" | "resultado">): GrupoUI | null {
  if (item.etapa === "erro") return "nao_identificado";
  if (item.etapa !== "lido" || !item.resultado) return null;
  const mapa: Record<Banda, GrupoUI> = {
    pronto: "automatico", revisar: "revisao", sem_destino: "nao_identificado", duplicata: "ja_anexado",
  };
  return mapa[item.resultado.banda];
}

/** Só a vinculação automática já vem marcada; revisão e não identificado esperam
 *  uma decisão; duplicata já nasce ignorada. */
export function acaoInicial(banda: Banda): AcaoItem {
  if (banda === "pronto") return "confirmado";
  if (banda === "duplicata") return "ignorado";
  return "pendente";
}

// ── pra onde vai ────────────────────────────────────────────────────────────

/**
 * Os lançamentos que receberão o documento:
 *  1. o que o usuário ESCOLHEU ("Escolher outro lançamento") — vale sozinho;
 *  2. compra parcelada: TODAS as parcelas (menos as desmarcadas) — o mesmo
 *     documento aparece em cada parcela (decisão dela, 03/10/2026);
 *  3. a melhor sugestão, se o motor a considerou vinculável (pronto/revisar);
 *  4. nada: "não identificado" exige escolha explícita (ou "usar o palpite").
 */
export function destinosEfetivos(item: Pick<ItemCentral, "escolhido" | "resultado" | "parcelasExcluidas">): LancamentoPool[] {
  if (item.escolhido) return [item.escolhido];
  const r = item.resultado;
  if (!r || r.banda === "duplicata") return [];
  if (r.parcelamento) return r.parcelamento.lancamentos.filter(l => !item.parcelasExcluidas.includes(l.id));
  if (r.banda === "pronto" || r.banda === "revisar") return r.candidatos[0] ? [r.candidatos[0].lancamento] : [];
  return [];
}

export function podeGravar(item: ItemCentral): boolean {
  return item.acao === "confirmado" && !item.gravado && destinosEfetivos(item).length > 0;
}

// ── contagens (cabeçalho, filtros e rodapé) ─────────────────────────────────

export interface Contagens {
  total: number;
  lidos: number;
  automatico: number;
  revisao: number;
  nao_identificado: number;
  ja_anexado: number;
  /** Itens marcados para gravar. */
  confirmados: number;
  /** Vínculos que serão criados (uma compra parcelada vale N). */
  vinculos: number;
  gravados: number;
}

export function contagens(itens: ItemCentral[]): Contagens {
  const c: Contagens = { total: itens.length, lidos: 0, automatico: 0, revisao: 0, nao_identificado: 0, ja_anexado: 0, confirmados: 0, vinculos: 0, gravados: 0 };
  for (const it of itens) {
    const g = grupoDe(it);
    if (g) { c[g] += 1; c.lidos += 1; }
    if (it.gravado) c.gravados += 1;
    if (podeGravar(it)) { c.confirmados += 1; c.vinculos += destinosEfetivos(it).length; }
  }
  return c;
}

// ── ordem de gravação (= ordem das páginas do dossiê) ───────────────────────

/** Comprovante é, por natureza, o ÚLTIMO documento da sequência (primeiro a nota
 *  ou o recibo, depois a prova do pagamento). */
const PRIORIDADE: Record<string, number> = { comprovante: 9, xml: 8, outro: 7 };

/**
 * Ordem em que os vínculos de UM lote devem ser gravados. A ordem das páginas do
 * dossiê é o `enviado_em` crescente, e dentro de um lote os documentos de um mesmo
 * lançamento chegam na ordem em que foram soltos — que não tem relação com a
 * sequência documental. Aqui o documento fiscal vem antes do comprovante; entre
 * iguais, vale a ordem em que apareceram. (Suposição a confirmar com ela.)
 */
export function ordemDeGravacao<T extends { tipo: string }>(vinculos: T[]): T[] {
  return vinculos
    .map((v, i) => ({ v, i }))
    .sort((a, b) => (PRIORIDADE[a.v.tipo] ?? 0) - (PRIORIDADE[b.v.tipo] ?? 0) || a.i - b.i)
    .map(x => x.v);
}
