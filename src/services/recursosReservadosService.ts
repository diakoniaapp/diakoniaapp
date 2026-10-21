// ─── recursosReservadosService — lê os projetos com reserva e os lançamentos deles (só leitura) ─────────────────────────────────────────────────────────
// A conta em si é `lib/recursosReservados.ts`. Aqui só se busca o que ela precisa: os projetos marcados "com Reserva Financeira" e, deles, os lançamentos que passaram pela conta
// (realizado/conciliado, fora transferência — o filtro fino repete na lib). Se a coluna ainda não existe no banco (migration não aplicada), devolve vazio: o card mostra zero em vez de quebrar.
import { supabase } from "@/integrations/supabase/client";
import { calcularReservaDosProjetos, type ItemReservado, type LancamentoDeReserva } from "@/lib/recursosReservados";

const PAGINA = 1000;

export async function carregarReservaDosProjetos(): Promise<ItemReservado[]> {
  const { data: projetos, error } = await supabase.from("fin_projetos").select("id, nome").eq("reserva_financeira", true).order("nome");
  if (error) {
    // 42703 = coluna inexistente (migration 20261021150000 ainda não aplicada): sem projeto reservado, sem quebrar a Tesouraria
    if ((error as { code?: string }).code === "42703") return [];
    throw error;
  }
  if (!projetos || projetos.length === 0) return [];
  const ids = projetos.map(p => p.id);
  const lancamentos: LancamentoDeReserva[] = [];
  for (let p = 0; ; p++) {
    const { data, error: e2 } = await supabase.from("fin_lancamentos")
      .select("projeto_id, tipo, status, valor, origem")
      .in("projeto_id", ids).in("status", ["realizado", "conciliado"]).neq("origem", "transferencia")
      .order("id").range(p * PAGINA, p * PAGINA + PAGINA - 1);
    if (e2) throw e2;
    lancamentos.push(...((data ?? []) as LancamentoDeReserva[]));
    if ((data ?? []).length < PAGINA) break;
  }
  return calcularReservaDosProjetos(projetos, lancamentos);
}
