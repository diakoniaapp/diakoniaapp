// ─── lib/rascunhoDaConciliacao.ts — a conciliação do OFX guarda onde a pessoa parou, por alguns minutos ────────────────────────────────────────────
//
// Pedido dela (22/10/2026): fechar a Conciliação OFX (ou sair para abrir uma obrigação e voltar) não pode jogar fora o arquivo já analisado, o filtro, a página, as linhas marcadas e as
// edições feitas. Guardamos o ESTADO DA PESSOA em memória (módulo — sobrevive à navegação dentro do app, morre ao recarregar a página) por `VALIDADE_MS`. A ANÁLISE em si não é guardada: ao
// retomar, o arquivo é analisado de novo contra o banco de agora — o que foi lançado nesse meio-tempo já aparece como registrado.
// Uma conta por rascunho. Aqui só há regra, sem React.

/** Quanto tempo o rascunho vale. */
export const VALIDADE_MS = 15 * 60 * 1000;

export interface RascunhoDaConciliacao<TTransacao = unknown, TEdicao = unknown, TRegistro = unknown> {
  arquivo: File;
  transacoes: TTransacao[];
  filtro: string;
  pagina: number;
  agrupar: boolean;
  marcadas: string[];
  edicoes: Record<string, TEdicao>;
  registros: [string, TRegistro][];
  confirmadas: [string, string[]][];
  lote: { loteId: string; ids: string[] } | null;
  totalDoArquivo: number;
  aoAbrir: unknown;
  agrupamentosAoAbrir: unknown;
  /** O que a tesouraria decidiu à mão nesta rodada e que a reanálise não sabe sozinha. */
  decisoes: { reconhecidas: [string, string][]; semDocumento: string[]; semJaRegistrado: string[] };
}

interface Guardado { em: number; rascunho: RascunhoDaConciliacao }

const guardados = new Map<string, Guardado>();

export function guardarRascunho(contaId: string, rascunho: RascunhoDaConciliacao, agora = Date.now()) {
  if (!rascunho.transacoes || rascunho.transacoes.length === 0) return;   // nada analisado: não apaga um rascunho bom com um vazio
  guardados.set(contaId, { em: agora, rascunho });
}

/** O rascunho da conta, se ainda vale; devolve também há quantos minutos foi guardado. Vencido = esquecido. */
export function lerRascunho(contaId: string, agora = Date.now()): { rascunho: RascunhoDaConciliacao; minutos: number } | null {
  const g = guardados.get(contaId);
  if (!g) return null;
  if (agora - g.em > VALIDADE_MS) { guardados.delete(contaId); return null; }
  return { rascunho: g.rascunho, minutos: Math.max(0, Math.round((agora - g.em) / 60000)) };
}

export function descartarRascunho(contaId: string) { guardados.delete(contaId); }
