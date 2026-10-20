// ─── cicloDoMesService.ts — as despesas pagas do mês, no MESMO ciclo que a Mesa, o Extrato e a Conciliação usam ──────────────────────────────────
// O Malote "enxerga a mesma obrigação": em vez de contar documentos num lugar e conciliações em outro, cada despesa paga no mês recebe o estado de
// `lib/cicloDaDespesa.ts` (Pagamento Realizado, Aguardando Conciliação, Conciliada, Pronta para o Malote) e aqui só se somam. Só leitura.
import { supabase } from "@/integrations/supabase/client";
import { ehTerceiro } from "@/lib/quitacao";
import { documentacaoDaSaida } from "@/lib/documentacaoExigida";
import { quitacoesDasObrigacoes } from "@/services/quitacaoService";
import { documentosHerdados } from "@/services/grupoDaObrigacaoService";
import { cicloDaDespesa, ORDEM_DO_CICLO, periodoAprovadoCobre, type EstadoDoCiclo } from "@/lib/cicloDaDespesa";
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
      .select("id, obrigacao_id, status, data, data_pagamento, observacoes, origem, conta_id, categoria_id, centro_custo_id, comprovante_url, documento_numero")
      .eq("tipo", "saida").in("status", ["realizado", "conciliado"]).neq("origem", "transferencia")
      .or(`and(data_pagamento.gte.${ini},data_pagamento.lte.${fim}),and(data_pagamento.is.null,data.gte.${ini},data.lte.${fim})`)
      .order("id").range(p * PAGINA, p * PAGINA + PAGINA - 1);
    if (error) throw new Error(error.message);
    lancs.push(...((data ?? []) as unknown as Record<string, unknown>[]));
    if ((data ?? []).length < PAGINA) break;
  }
  const [contas, categorias] = await Promise.all([
    supabase.from("fin_contas").select("id, tipo"), supabase.from("fin_categorias").select("id, nome"),
  ]);
  const tipoDaConta = new Map((contas.data ?? []).map(c => [c.id, String(c.tipo)]));
  const nomeDaCategoria = new Map((categorias.data ?? []).map(c => [c.id, String(c.nome)]));

  // anexos: os TIPOS de cada despesa — a regra única (lib/documentacaoExigida.ts) decide o que falta
  const tiposDe = new Map<string, Set<string>>();
  const ids = lancs.map(l => String(l.id));
  const guardar = (id: string, tipo: string) => { const t = tiposDe.get(id) ?? new Set<string>(); t.add(tipo); tiposDe.set(id, t); };
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase.from("fin_lancamento_anexos").select("lancamento_id, tipo").in("lancamento_id", ids.slice(i, i + 200));
    for (const a of data ?? []) guardar(String(a.lancamento_id), String(a.tipo));
  }
  // o documento é da obrigação: a parcela de um pagamento parcial herda o das irmãs (o comprovante, não — cada pagamento prova o seu)
  for (const [id, docs] of await documentosHerdados(ids)) for (const d of docs) guardar(id, d.tipo);
  const quitacoes = await quitacoesDasObrigacoes([...new Set(lancs.map(l => String(l.obrigacao_id ?? l.id)))]);
  // D6: as despesas já ENVIADAS (item de malote ativo) e se o período do envio foi aprovado (ARQUIVADA)
  const enviadas = new Map<string, { ano: number; mes: number }>();
  let fechamentos: { status: string; ano_inicio: number; mes_inicio: number; qtd_meses: number }[] = [];
  try {
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await supabase.from("fin_malote_itens" as never).select("lancamento_id, ano, mes").in("lancamento_id" as never, ids.slice(i, i + 200) as never).is("reaberto_em" as never, null as never);
      if (error) break;   // migration ainda não aplicada: nenhuma despesa está enviada
      for (const x of ((data ?? []) as unknown as { lancamento_id: string; ano: number; mes: number }[])) enviadas.set(x.lancamento_id, { ano: Number(x.ano), mes: Number(x.mes) });
    }
    if (enviadas.size > 0) {
      const f = await supabase.from("fin_fechamentos_periodo" as never).select("status, ano_inicio, mes_inicio, qtd_meses").eq("status" as never, "aprovado" as never);
      fechamentos = ((f.data ?? []) as unknown as typeof fechamentos);
    }
  } catch { /* só o estado Enviada/Arquivada fica de fora */ }
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
    const categoriaNome = l.categoria_id ? nomeDaCategoria.get(String(l.categoria_id)) ?? null : null;
    const dispensa = dispensaDocumento({ categoria_nome: categoriaNome });
    const q = quitacoes.get(String(l.obrigacao_id ?? id));
    const documentacao = documentacaoDaSaida({
      categoriaNome, status: String(l.status), contaTipo: tipoDaConta.get(contaId) ?? null, tipos: [...(tiposDe.get(id) ?? [])], temComprovanteAntigo: !!l.comprovante_url,
      intencao: q?.intencao ?? null, terceiroQuitou: !!q && ehTerceiro(q.responsavel),
      temCategoria: !!l.categoria_id, temCentro: !!l.centro_custo_id, documentoNumero: (l.documento_numero as string | null) ?? null,
    });
    const c = cicloDaDespesa({
      tipo: "saida", status: String(l.status), data: String(l.data).slice(0, 10), data_pagamento: (l.data_pagamento as string) ?? null,
      observacoes: (l.observacoes as string) ?? null, origem: (l.origem as string) ?? null,
      envio: enviadas.has(id) ? { ...enviadas.get(id)!, periodoAprovado: periodoAprovadoCobre(fechamentos, enviadas.get(id)!.ano, enviadas.get(id)!.mes) } : null, contaTipo: tipoDaConta.get(contaId) ?? "banco", ultimoExtratoDaConta: ultimoExtrato.get(contaId) ?? null,
      temCategoria: !!l.categoria_id, temCentro: !!l.centro_custo_id, temDocumento: documentacao.documentosOk, temComprovante: documentacao.comprovanteOk || !!l.comprovante_url,
      dispensaDocumento: dispensa, hoje, documentacao,
    });
    if (!c) continue;
    porEstado[c.estado]++;
    if (!c.etapas.find(e => e.chave === "comprovante")!.feita) semComprovante++;
    if (!c.etapas.find(e => e.chave === "documento")!.feita) semDocumento++;
    if (c.estado === "pagamento_realizado" || c.estado === "aguardando_conciliacao") naoConciliadas++;
  }
  return { total: lancs.length, porEstado, semComprovante, semDocumento, naoConciliadas };
}
