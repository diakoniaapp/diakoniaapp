// ─── contextoExtrato.ts — UM contexto de trabalho para o extrato, em duas telas ───
//
// A movimentação de uma conta existe em duas telas que eram dois mundos separados:
//   · o painel lateral (`ExtratoContaDrawer`), que sempre abria "hoje, sem filtro";
//   · a página `/financas/conta/:id` ("Extrato completo"), com filtros próprios na URL.
// Quem filtrava no painel e abria o extrato completo recomeçava do zero — e o contrário
// também. Pedido da Telma (06/10/2026): "as duas telas passam a ser apenas duas visualizações
// do mesmo contexto de trabalho".
//
// Aqui mora esse contexto: período, tipo, categoria, centro, fornecedor, busca, faixa de valor
// e se o painel está em tela cheia. Quem muda um filtro grava; quem abre lê. Vive no
// `sessionStorage` (a aba de trabalho), não na URL: a URL do painel é a do Painel da
// Tesouraria e misturaria o filtro de uma conta com o resto da tela.
//
// A volta também é lembrada (`RetornoDoExtrato`): ao sair do painel para o extrato completo, o
// painel promete reabrir, na mesma conta, quando a pessoa voltar — por `location.state` (botão
// "Voltar para movimentações") ou, se ela usar o "voltar" do navegador, pela marca com prazo.

export type TipoDoFiltro = "todos" | "entrada" | "saida" | "transferencia";

export interface ContextoExtrato {
  /** "hoje", "mes"... (relativo, recalculado a cada abertura) ou "personalizado" (usa de/ate). */
  periodo: string;
  de: string;
  ate: string;
  tipo: TipoDoFiltro;
  categoriaId: string;
  centroId: string;
  fornecedorId: string;
  busca: string;
  valorMin: string;
  valorMax: string;
  telaCheia: boolean;
}

const CHAVE = "diakonia:extrato-contexto";
const CHAVE_RETORNO = "diakonia:extrato-retorno";
/** Quanto tempo uma volta prometida continua valendo (o "voltar" do navegador, minutos depois). */
export const VALIDADE_DO_RETORNO_MS = 30 * 60 * 1000;

const TIPOS: TipoDoFiltro[] = ["todos", "entrada", "saida", "transferencia"];
const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Aceita o que veio do armazenamento/URL e devolve só o que é válido (nada de lixo). */
export function sanear(bruto: unknown): Partial<ContextoExtrato> {
  if (!bruto || typeof bruto !== "object") return {};
  const b = bruto as Record<string, unknown>;
  const out: Partial<ContextoExtrato> = {};
  const texto = (k: string, max = 200) => (typeof b[k] === "string" && (b[k] as string).length <= max ? (b[k] as string) : undefined);
  const periodo = texto("periodo", 30); if (periodo) out.periodo = periodo;
  const de = texto("de", 10); if (de && YMD.test(de)) out.de = de;
  const ate = texto("ate", 10); if (ate && YMD.test(ate)) out.ate = ate;
  if (typeof b.tipo === "string" && (TIPOS as string[]).includes(b.tipo)) out.tipo = b.tipo as TipoDoFiltro;
  for (const k of ["categoriaId", "centroId", "fornecedorId", "busca", "valorMin", "valorMax"] as const) {
    const v = texto(k); if (v !== undefined) out[k] = v;
  }
  if (typeof b.telaCheia === "boolean") out.telaCheia = b.telaCheia;
  return out;
}

export function lerContextoExtrato(): Partial<ContextoExtrato> | null {
  try {
    const bruto = sessionStorage.getItem(CHAVE);
    if (!bruto) return null;
    const c = sanear(JSON.parse(bruto));
    return Object.keys(c).length > 0 ? c : null;
  } catch { return null; }
}

/** Mescla `parcial` por cima do que já está guardado. */
export function salvarContextoExtrato(parcial: Partial<ContextoExtrato>): void {
  try {
    const atual = lerContextoExtrato() ?? {};
    sessionStorage.setItem(CHAVE, JSON.stringify({ ...atual, ...sanear(parcial) }));
  } catch { /* aba privada: o contexto só não é lembrado */ }
}

export function limparContextoExtrato(): void {
  try { sessionStorage.removeItem(CHAVE); } catch { /* idem */ }
}

// ── URL: o que a página "Extrato completo" já entendia ───────────────────────

/** Os mesmos nomes de parâmetro que `FinancasConta.tsx` lê e grava (não inventa um dialeto). */
export function contextoParaQuery(c: Partial<ContextoExtrato>): URLSearchParams {
  const p = new URLSearchParams();
  if (c.tipo && c.tipo !== "todos") p.set("tipo", c.tipo);
  if (c.busca) p.set("busca", c.busca);
  if (c.categoriaId) p.set("categoria", c.categoriaId);
  if (c.centroId) p.set("centro", c.centroId);
  if (c.fornecedorId) p.set("fornecedor", c.fornecedorId);
  if (c.valorMin?.trim()) p.set("valorMin", c.valorMin);
  if (c.valorMax?.trim()) p.set("valorMax", c.valorMax);
  p.set("periodo", c.periodo ?? "personalizado");
  if (c.de) p.set("de", c.de);
  if (c.ate) p.set("ate", c.ate);
  return p;
}

export function queryParaContexto(p: URLSearchParams): Partial<ContextoExtrato> {
  return sanear({
    periodo: p.get("periodo") ?? undefined, de: p.get("de") ?? undefined, ate: p.get("ate") ?? undefined,
    tipo: p.get("tipo") ?? undefined, categoriaId: p.get("categoria") ?? undefined, centroId: p.get("centro") ?? undefined,
    fornecedorId: p.get("fornecedor") ?? undefined, busca: p.get("busca") ?? undefined,
    valorMin: p.get("valorMin") ?? undefined, valorMax: p.get("valorMax") ?? undefined,
  });
}

// ── a volta prometida ──────────────────────────────────────────────────────

export interface RetornoDoExtrato {
  /** Onde estava (caminho + hash), ex.: "/painel-tesouraria#cadastros". */
  origem: string;
  /** A conta cujo painel deve reabrir ("__todas__" = consolidado). */
  contaId: string;
  em: number;
  /** Quanto a lista do painel estava rolada (px) ao sair — devolvido ao voltar. */
  rolagem?: number;
}

export function prometerRetorno(origem: string, contaId: string, agora = Date.now(), rolagem?: number): void {
  try {
    const r: RetornoDoExtrato = { origem, contaId, em: agora, ...(rolagem && rolagem > 0 ? { rolagem: Math.round(rolagem) } : {}) };
    sessionStorage.setItem(CHAVE_RETORNO, JSON.stringify(r));
  } catch { /* idem */ }
}

export function lerRetorno(agora = Date.now()): RetornoDoExtrato | null {
  try {
    const bruto = sessionStorage.getItem(CHAVE_RETORNO);
    if (!bruto) return null;
    const r = JSON.parse(bruto) as Partial<RetornoDoExtrato>;
    if (typeof r.origem !== "string" || !r.origem.startsWith("/") || r.origem.startsWith("//")) return null;
    if (typeof r.contaId !== "string" || typeof r.em !== "number") return null;
    if (agora - r.em > VALIDADE_DO_RETORNO_MS) return null;
    return { origem: r.origem, contaId: r.contaId, em: r.em, ...(typeof r.rolagem === "number" && r.rolagem > 0 ? { rolagem: r.rolagem } : {}) };
  } catch { return null; }
}

export function limparRetorno(): void {
  try { sessionStorage.removeItem(CHAVE_RETORNO); } catch { /* idem */ }
}
