// ─── cicloDaDespesaService.ts — tudo o que se sabe de UMA despesa, junto (documento, pagamento, OFX, conciliação, comprovante, malote) ────────────
// Só leitura. Reúne o lançamento, seus anexos, a liquidação, a situação da obrigação (juros/multa/desconto), o contrato (recorrência) e o último dia
// coberto por um extrato importado na conta, e entrega o ciclo calculado por `lib/cicloDaDespesa.ts`.
import { supabase } from "@/integrations/supabase/client";
import { cicloDaDespesa, ofxVinculado, type CicloDaDespesa } from "@/lib/cicloDaDespesa";
import { dispensaDocumento } from "@/lib/pacoteContabil";
import { hojeLocal } from "@/lib/data";
import { listarAnexos, type FinLancamentoAnexo, type FinLancamentoExtenso } from "@/services/finService";

export interface DetalhesDaDespesa {
  ciclo: CicloDaDespesa | null;
  anexos: FinLancamentoAnexo[];
  /** o ato de pagar (fin_liquidacoes), quando houve */
  liquidacao: { id: string; data_pagamento: string; valor_total: number; ofx_fitid: string | null; created_at: string } | null;
  /** a situação da obrigação com juros, multa e desconto (vw_fin_obrigacoes), quando existe */
  obrigacao: { valor_original: number; juros: number; multa: number; complemento: number; ajuste: number; desconto: number; total_pago: number; situacao: string } | null;
  contrato: string | null;
  contaNome: string;
  contaTipo: string;
  ofx: string | null;
}

export async function carregarDetalhesDaDespesa(l: FinLancamentoExtenso): Promise<DetalhesDaDespesa> {
  const conta = await supabase.from("fin_contas").select("nome, tipo").eq("id", l.conta_id).maybeSingle();
  const contaTipo = String(conta.data?.tipo ?? "banco");
  const [anexos, liq, obr, rec, extrato] = await Promise.all([
    listarAnexos(l.id).catch(() => [] as FinLancamentoAnexo[]),
    l.liquidacao_id ? supabase.from("fin_liquidacoes" as never).select("id, data_pagamento, valor_total, ofx_fitid, created_at").eq("id" as never, l.liquidacao_id as never).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("vw_fin_obrigacoes" as never).select("valor_original, juros, multa, complemento, ajuste, desconto, total_pago, situacao").eq("obrigacao_id" as never, (l.obrigacao_id ?? l.id) as never).maybeSingle(),
    l.recorrencia_id ? supabase.from("fin_recorrencias").select("descricao").eq("id", l.recorrencia_id).maybeSingle() : Promise.resolve({ data: null }),
    contaTipo === "banco"
      ? supabase.from("fin_lancamentos").select("data, data_pagamento").eq("conta_id", l.conta_id).like("observacoes", "%[ofx:%").not("observacoes", "like", "%[ofx:PDF:%").order("data", { ascending: false }).limit(1)
      : Promise.resolve({ data: [] as { data: string; data_pagamento: string | null }[] }),
  ]);
  const ultimo = (extrato.data ?? [])[0];
  const temComprovante = !!l.comprovante_url || anexos.some(a => a.tipo === "comprovante");
  const temDocumento = anexos.some(a => a.tipo !== "comprovante");
  const ciclo = cicloDaDespesa({
    tipo: l.tipo, status: l.status, data: String(l.data).slice(0, 10), data_pagamento: l.data_pagamento, observacoes: l.observacoes, contaTipo,
    ultimoExtratoDaConta: ultimo ? String(ultimo.data_pagamento ?? ultimo.data).slice(0, 10) : null,
    temCategoria: !!l.categoria_id, temCentro: !!l.centro_custo_id, temDocumento, temComprovante,
    dispensaDocumento: dispensaDocumento({ categoria_nome: l.categoria_nome }), hoje: hojeLocal(),
  });
  const o = obr.data as unknown as Record<string, unknown> | null;
  return {
    ciclo, anexos,
    liquidacao: (liq.data as DetalhesDaDespesa["liquidacao"]) ?? null,
    obrigacao: o ? {
      valor_original: Number(o.valor_original), juros: Number(o.juros), multa: Number(o.multa), complemento: Number(o.complemento), ajuste: Number(o.ajuste),
      desconto: Number(o.desconto), total_pago: Number(o.total_pago), situacao: String(o.situacao),
    } : null,
    contrato: (rec.data as { descricao?: string } | null)?.descricao ?? null,
    contaNome: String(conta.data?.nome ?? ""), contaTipo, ofx: ofxVinculado(l.observacoes),
  };
}
