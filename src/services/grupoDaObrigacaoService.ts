// ─── grupoDaObrigacaoService.ts — o dossiê da OBRIGAÇÃO, para quem lê anexos linha a linha (Fase A, análise de 13/10/2026) ─────────────────
//
// Num pagamento parcial a obrigação vira várias linhas de `fin_lancamentos` (a original e as parcelas, todas com `obrigacao_id` = a raiz). O boleto
// da obrigação fica numa linha; o comprovante de cada pagamento, na linha dele. Quem conta "esta despesa tem documento?" olhando UMA linha acha que
// falta — o Pacote Contábil, o Ciclo do mês, o Painel e a Central de Documentos faziam isso.
//
// Regra (a do documento de arquitetura): o DOCUMENTO pertence à obrigação — toda linha do grupo o herda; o COMPROVANTE pertence ao pagamento — cada
// linha prova o seu, e nunca herda o da irmã.
//
// Custo: só as PARCELAS (obrigacao_id ≠ id) entram na consulta — poucas —, então UMA consulta pagina todas e o resto é em memória.
import { supabase } from "@/integrations/supabase/client";
import { ehDocumentoOriginal } from "@/lib/quitacao";
import { irmaosPorLinha } from "@/lib/grupoDaObrigacao";

const PAGINA = 1000;
const LOTE = 150;
const VALIDADE_MS = 30_000;

let guardado: { em: number; mapa: Map<string, string[]> } | null = null;
export function esquecerGrupos() { guardado = null; }

/** Para cada linha que tem irmãs na mesma obrigação, os ids delas. Linhas sozinhas não aparecem. Falha da consulta = ninguém tem irmã (nunca derruba a tela). */
export async function irmaosDasLinhas(): Promise<Map<string, string[]>> {
  if (guardado && Date.now() - guardado.em < VALIDADE_MS) return guardado.mapa;
  // D1 (13/10/2026): linha nova nasce com obrigacao_id = o próprio id, então "tem obrigacao_id" não quer mais dizer "tem irmã". A view lista só as PARCELAS
  // (obrigacao_id ≠ id). Antes da migration 20261013100000 ela não existe: cai na leitura antiga (todas as linhas com obrigacao_id, que eram só as liquidadas).
  let linhas = await paginar("vw_fin_obrigacao_filhas");
  if (linhas === null) linhas = await paginar("fin_lancamentos");
  if (linhas === null) return new Map();
  const mapa = irmaosPorLinha(linhas);
  guardado = { em: Date.now(), mapa };
  return mapa;
}

async function paginar(origem: "vw_fin_obrigacao_filhas" | "fin_lancamentos"): Promise<{ id: string; obrigacao_id: string | null }[] | null> {
  const linhas: { id: string; obrigacao_id: string | null }[] = [];
  try {
    for (let p = 0; ; p++) {
      const { data, error } = await supabase.from(origem as never).select("id, obrigacao_id").not("obrigacao_id" as never, "is", null).order("id" as never).range(p * PAGINA, p * PAGINA + PAGINA - 1);
      if (error) return null;
      linhas.push(...((data ?? []) as unknown as { id: string; obrigacao_id: string | null }[]));
      if ((data ?? []).length < PAGINA) break;
    }
  } catch { return null; }
  return linhas;
}

export interface DocumentoHerdado { lancamento_id: string; de: string; tipo: string; url: string; nome: string | null; enviado_em: string | null }

/**
 * Dos `ids` pedidos, os que têm irmãs recebem os DOCUMENTOS (tudo que não é comprovante) das irmãs. Chave = a linha que herda; cada item diz de qual irmã veio (`de`).
 * Vazio quando ninguém tem irmã — o caso comum.
 */
export async function documentosHerdados(ids: string[]): Promise<Map<string, DocumentoHerdado[]>> {
  const out = new Map<string, DocumentoHerdado[]>();
  const irmaos = await irmaosDasLinhas();
  if (irmaos.size === 0) return out;
  const herdeiros = ids.filter(id => irmaos.has(id));
  if (herdeiros.length === 0) return out;
  const doadoras = [...new Set(herdeiros.flatMap(id => irmaos.get(id)!))];
  const docs: { lancamento_id: string; tipo: string; url: string; nome: string | null; enviado_em: string | null }[] = [];
  for (let i = 0; i < doadoras.length; i += LOTE) {
    const { data, error } = await supabase.from("fin_lancamento_anexos").select("lancamento_id, tipo, url, nome, enviado_em")
      .in("lancamento_id", doadoras.slice(i, i + LOTE)).neq("tipo", "comprovante");
    if (error) throw new Error(error.message);
    // as provas da quitação (declaração, pedido de reembolso, prova do pagamento do terceiro) não são o documento original que a parcela herda
    docs.push(...((data ?? []) as typeof docs).filter(d => ehDocumentoOriginal(d.tipo)));
  }
  for (const id of herdeiros) {
    const lista = docs.filter(d => irmaos.get(id)!.includes(d.lancamento_id)).map(d => ({ ...d, lancamento_id: id, de: d.lancamento_id }));
    if (lista.length > 0) out.set(id, lista);
  }
  return out;
}
