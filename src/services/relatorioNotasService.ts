// ─── relatorioNotasService.ts ────────────────────────────────────────────
//
// Fase 4 do projeto Tesouraria (docs/PROJETO_TESOURARIA_PRESTACAO_CONTAS.md
// §5.2). CRUD de fin_relatorio_notas — o equivalente estruturado do
// comentário 💬 que hoje mora numa célula do Excel. Granularidade por MÊS,
// não por lançamento: uma nota pode cobrir uma categoria inteira, um centro
// de custo inteiro, os dois juntos, ou nenhum (nota geral do mês) — ver o
// exemplo real citado na migration 20260912210000.
//
// Ainda sem tela que o use (isso é Fase 5, o relatório trimestral em si) —
// esta Fase 4 entrega o serviço e o modal (NotaRelatorioModal.tsx),
// exercitáveis por qualquer tela futura sem mudança de schema.
import { supabase } from "@/integrations/supabase/client";
import { conferir } from "@/lib/escritaConferida";

export interface FinRelatorioNota {
  id: string;
  ano: number;
  mes: number;
  categoria_id: string | null;
  centro_custo_id: string | null;
  nota: string;
  criado_por: string | null;
  created_at: string;
  updated_at: string;
}

/** Todas as notas de um ano, opcionalmente filtradas a um mês — para a tela do relatório montar os ícones 💬. */
export async function listarNotasDoPeriodo(ano: number, mes?: number): Promise<FinRelatorioNota[]> {
  let query = supabase.from("fin_relatorio_notas").select("*").eq("ano", ano).order("mes");
  if (mes) query = query.eq("mes", mes);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as FinRelatorioNota[];
}

/** A nota de uma linha específica do relatório (categoria × centro × mês), se existir. */
export async function buscarNota(
  ano: number, mes: number,
  categoriaId: string | null, centroCustoId: string | null,
): Promise<FinRelatorioNota | null> {
  let query = supabase.from("fin_relatorio_notas").select("*").eq("ano", ano).eq("mes", mes);
  query = categoriaId ? query.eq("categoria_id", categoriaId) : query.is("categoria_id", null);
  query = centroCustoId ? query.eq("centro_custo_id", centroCustoId) : query.is("centro_custo_id", null);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data as FinRelatorioNota | null;
}

export interface SalvarNotaInput {
  id?: string;
  ano: number;
  mes: number;
  categoriaId: string | null;
  centroCustoId: string | null;
  nota: string;
}

export async function salvarNota(input: SalvarNotaInput): Promise<void> {
  if (input.id) {
    const r = conferir(
      await supabase.from("fin_relatorio_notas").update({ nota: input.nota }).eq("id", input.id).select("id"),
      "A nota",
    );
    if (!r.ok) throw new Error(r.erro);
    return;
  }

  const userId = (await supabase.auth.getUser()).data.user?.id;
  const { error } = await supabase.from("fin_relatorio_notas").insert({
    ano: input.ano,
    mes: input.mes,
    categoria_id: input.categoriaId,
    centro_custo_id: input.centroCustoId,
    nota: input.nota,
    criado_por: userId ?? null,
  });
  if (error) throw error;
}

export async function apagarNota(id: string): Promise<void> {
  const r = conferir(
    await supabase.from("fin_relatorio_notas").delete().eq("id", id).select("id"),
    "A nota",
  );
  if (!r.ok) throw new Error(r.erro);
}
