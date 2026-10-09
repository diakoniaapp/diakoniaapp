// ─── cicloDoMesService.ts — as despesas pagas do mês, no MESMO ciclo que a Mesa, o Extrato e a Conciliação usam ──────────────────────────────────
// O Malote "enxerga a mesma obrigação": em vez de contar documentos num lugar e conciliações em outro, cada despesa paga no mês recebe o estado de
// `lib/cicloDaDespesa.ts` (Pagamento Realizado, Aguardando Conciliação, Conciliada, Pronta para o Malote) e aqui só se somam. Só leitura.
import { supabase } from "@/integrations/supabase/client";
import { cicloDaDespesa, ORDEM_DO_CICLO, type EstadoDoCiclo } from "@/lib/cicloDaDespesa";
import { hojeLocal } from "@/lib/data";
import { dispensaDocumento } from "@/lib/pacoteContabil";
import { limitesDoMes } from "@/lib/fechamentoMensal";

export interface ResumoDoCiclo {
  /** despesas pagas no mês */
  total: number;
  porEstado: Record<EstadoDoCiclo, number>;
  semComprovante: number;
  semDocumento: number;
  naoConciliadas: number;
}

const PAGINA = 1000;

export async function cicloDoMes(ano: number, mes: number): Promise<ResumoDoCiclo> {
  const { ini, fim } = limitesDoMes(ano, mes);
  const lancs: Record<string, unknown>[] = [];
  for (let p = 0; ; p++) {
    const { data, error } = await supabase.from("fin_lancamentos")
      .select("id, status, data, data_pagamento, observacoes, conta_id, categoria_id, centro_custo_id, comprovante_url")
      .eq("tipo", "saida").in("status", ["realizado", "conciliado"]).neq("origem", "transferencia")
      .or(`and(data_pagamento.gte.${ini},data_pagamento.lte.${fim}),and(data_pagamento.is.null,data.gte.${ini},data.lte.${fim})`)
      .order("id").range(p * PAGINA, p * PAGINA + PAGINA - 1);
    if (error) throw new Error(error.message);
    lancs.push(...((data ?? []) as Record<string, unknown>[]));
    if ((data ?? []).length < PAGINA) break;
  }
  const [contas, categorias] = await Promise.all([
    supabase.from("fin_contas").select("id, tipo"), supabase.from("fin_categorias").select("id, nome"),
  ]);
  const tipoDaConta = new Map((contas.data ?? []).map(c => [c.id, String(c.tipo)]));
  const nomeDaCategoria = new Map((categorias.data ?? []).map(c => [c.id, String(c.nome)]));

  // anexos: quais despesas têm documento e quais têm comprovante
  const comDocumento = new Set<string>(), comComprovante = new Set<string>();
  const ids = lancs.map(l => String(l.id));
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase.from("fin_lancamento_anexos").select("lancamento_id, tipo").in("lancamento_id", ids.slice(i, i + 200));
    for (const a of data ?? []) (a.tipo === "comprovante" ? comComprovante : comDocumento).add(String(a.lancamento_id));
  }
  // o último dia coberto por um extrato, por conta de banco
  const ultimoExtrato = new Map<string, string | null>();
  for (const contaId of new Set(lancs.map(l => String(l.conta_id)))) {
    if (tipoDaConta.get(contaId) !== "banco") continue;
    const { data } = await supabase.from("fin_lancamentos").select("data, data_pagamento").eq("conta_id", contaId)
      .like("observacoes", "%[ofx:%").not("observacoes", "like", "%[ofx:PDF:%").order("data", { ascending: false }).limit(1);
    ultimoExtrato.set(contaId, data?.[0] ? String(data[0].data_pagamento ?? data[0].data).slice(0, 10) : null);
  }

  const hoje = hojeLocal();
  const porEstado = Object.fromEntries([...ORDEM_DO_CICLO, "cancelada"].map(e => [e, 0])) as Record<EstadoDoCiclo, number>;
  let semComprovante = 0, semDocumento = 0, naoConciliadas = 0;
  for (const l of lancs) {
    const id = String(l.id), contaId = String(l.conta_id);
    const dispensa = dispensaDocumento({ categoria_nome: l.categoria_id ? nomeDaCategoria.get(String(l.categoria_id)) : null });
    const c = cicloDaDespesa({
      tipo: "saida", status: String(l.status), data: String(l.data).slice(0, 10), data_pagamento: (l.data_pagamento as string) ?? null,
      observacoes: (l.observacoes as string) ?? null, contaTipo: tipoDaConta.get(contaId) ?? "banco", ultimoExtratoDaConta: ultimoExtrato.get(contaId) ?? null,
      temCategoria: !!l.categoria_id, temCentro: !!l.centro_custo_id, temDocumento: comDocumento.has(id), temComprovante: comComprovante.has(id) || !!l.comprovante_url,
      dispensaDocumento: dispensa, hoje,
    });
    if (!c) continue;
    porEstado[c.estado]++;
    if (!c.etapas.find(e => e.chave === "comprovante")!.feita) semComprovante++;
    if (!c.etapas.find(e => e.chave === "documento")!.feita) semDocumento++;
    if (c.estado === "pagamento_realizado" || c.estado === "aguardando_conciliacao") naoConciliadas++;
  }
  return { total: lancs.length, porEstado, semComprovante, semDocumento, naoConciliadas };
}
