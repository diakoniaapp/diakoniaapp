// ─── obrigacoesService.ts — a situação de cada conta a pagar (vw_fin_obrigacoes) ─────────────────────────────
//
// Lê a view da liquidação (migrations 20261007100000 + 20261007110000). Antes da segunda migration a view não tem as
// colunas do painel (`id_pendente`, `referencia`…): `obrigacoesDisponiveis()` sonda e o painel simplesmente não aparece.

import { supabase } from "@/integrations/supabase/client";
import type { SituacaoDaObrigacao } from "@/lib/liquidacao";

export interface Obrigacao {
  obrigacao_id: string;
  valor_original: number;
  pago_principal: number;
  desconto: number;
  juros: number;
  multa: number;
  complemento: number;
  ajuste: number;
  saldo_pendente: number;
  total_pago: number;
  situacao: SituacaoDaObrigacao;
  vencimento_pendente: string | null;
  vencimento: string | null;
  ultimo_pagamento: string | null;
  id_pendente: string | null;
  referencia: string | null;
  descricao: string | null;
  fornecedor_id: string | null;
  conta_id: string | null;
  fornecedor_nome?: string | null;
}

const NUMEROS = ["valor_original", "pago_principal", "desconto", "juros", "multa", "complemento", "ajuste", "saldo_pendente", "total_pago"] as const;
const normalizar = (r: Record<string, unknown>): Obrigacao => {
  const o = { ...r } as Record<string, unknown>;
  for (const k of NUMEROS) o[k] = Number(o[k] ?? 0);
  return o as unknown as Obrigacao;
};

let sondagem: { em: number; ok: boolean } | null = null;
export async function obrigacoesDisponiveis(): Promise<boolean> {
  if (sondagem && Date.now() - sondagem.em < 30_000) return sondagem.ok;
  const { error } = await supabase.from("vw_fin_obrigacoes" as never).select("id_pendente, referencia").limit(1);
  sondagem = { em: Date.now(), ok: !error };
  return !error;
}

const PAGINA = 1000;

/** As obrigações cujo dia de referência (último pagamento, senão vencimento) cai em [de, ate]. */
export async function listarObrigacoes(de: string, ate: string): Promise<Obrigacao[]> {
  const lista: Obrigacao[] = [];
  for (let p = 0; ; p++) {
    const { data, error } = await supabase.from("vw_fin_obrigacoes" as never).select("*")
      .gte("referencia" as never, de as never).lte("referencia" as never, ate as never)
      .order("referencia" as never, { ascending: false } as never)
      .range(p * PAGINA, p * PAGINA + PAGINA - 1);
    if (error) throw new Error(error.message);
    const linhas = (data ?? []) as unknown as Record<string, unknown>[];
    lista.push(...linhas.map(normalizar));
    if (linhas.length < PAGINA) break;
  }
  const ids = [...new Set(lista.map(o => o.fornecedor_id).filter((x): x is string => !!x))];
  if (ids.length > 0) {
    const nomes = new Map<string, string>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await supabase.from("fin_fornecedores").select("id, nome").in("id", ids.slice(i, i + 200));
      (data ?? []).forEach(f => nomes.set(f.id, f.nome));
    }
    lista.forEach(o => { o.fornecedor_nome = o.fornecedor_id ? nomes.get(o.fornecedor_id) ?? null : null; });
  }
  return lista;
}

export interface ParcialEmAberto { original: number; pago: number; saldo: number }

/** Contas pagas parcialmente (qualquer época), por id do lançamento que continua previsto — para marcar a linha do "Pagar". */
export async function parciaisEmAberto(): Promise<Map<string, ParcialEmAberto>> {
  const mapa = new Map<string, ParcialEmAberto>();
  const { data, error } = await supabase.from("vw_fin_obrigacoes" as never)
    .select("id_pendente, valor_original, pago_principal, saldo_pendente").eq("situacao" as never, "pago_parcialmente" as never).limit(1000);
  if (error) return mapa;
  for (const r of (data ?? []) as unknown as Record<string, unknown>[]) {
    if (r.id_pendente) mapa.set(String(r.id_pendente), { original: Number(r.valor_original), pago: Number(r.pago_principal), saldo: Number(r.saldo_pendente) });
  }
  return mapa;
}

export interface TotaisDasObrigacoes {
  juros: number; multas: number; economia: number; ajustes: number; complementos: number;
  parciais: number; saldoDasParciais: number; comAjuste: number; comDesconto: number;
}

export function totaisDasObrigacoes(lista: Obrigacao[]): TotaisDasObrigacoes {
  const c = (n: number) => Math.round(n * 100) / 100;
  const t: TotaisDasObrigacoes = { juros: 0, multas: 0, economia: 0, ajustes: 0, complementos: 0, parciais: 0, saldoDasParciais: 0, comAjuste: 0, comDesconto: 0 };
  for (const o of lista) {
    t.juros += o.juros; t.multas += o.multa; t.economia += o.desconto; t.ajustes += o.ajuste; t.complementos += o.complemento;
    if (o.situacao === "pago_parcialmente") { t.parciais += 1; t.saldoDasParciais += o.saldo_pendente; }
    if (o.ajuste > 0) t.comAjuste += 1;
    if (o.desconto > 0) t.comDesconto += 1;
  }
  return { ...t, juros: c(t.juros), multas: c(t.multas), economia: c(t.economia), ajustes: c(t.ajustes), complementos: c(t.complementos), saldoDasParciais: c(t.saldoDasParciais) };
}
