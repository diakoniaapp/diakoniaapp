import { supabase } from "@/integrations/supabase/client";

export type EstoqueMovTipo = "entrada" | "saida" | "ajuste";
export type EstoqueUrgencia = "esgotado" | "critico" | "comprar" | "baixo" | "ok";

export interface EstoqueItem {
  id: string;
  nome: string;
  descricao: string | null;
  unidade: string;
  categoria: string | null;
  estoque_atual: number;
  estoque_minimo: number;
  ponto_pedido: number | null;
  custo_medio: number | null;
  fornecedor_padrao_id: string | null;
  centro_custo_id: string | null;
  imagem_url: string | null;
  ativo: boolean;
  observacao: string | null;
}

export interface EstoqueAlerta extends EstoqueItem {
  consumo_medio_dia: number;
  consumo_medio_mes: number;
  dias_restantes_estimados: number | null;
  urgencia: EstoqueUrgencia;
}

export interface EstoqueMovimento {
  id: string;
  item_id: string;
  data: string;
  tipo: EstoqueMovTipo;
  quantidade: number;
  valor_unitario: number | null;
  valor_total: number | null;
  lancamento_id: string | null;
  fornecedor_id: string | null;
  motivo: string | null;
  created_at?: string;
}

export const URGENCIA_LABEL: Record<EstoqueUrgencia, string> = {
  esgotado: "Esgotado",
  critico:  "Estoque crítico",
  comprar:  "Hora de comprar",
  baixo:    "Estoque baixo",
  ok:       "OK",
};

export const URGENCIA_COR: Record<EstoqueUrgencia, string> = {
  esgotado: "bg-rose-100 text-rose-700 border-rose-300",
  critico:  "bg-rose-50 text-rose-700 border-rose-200",
  comprar:  "bg-amber-50 text-amber-700 border-amber-300",
  baixo:    "bg-blue-50 text-blue-700 border-blue-200",
  ok:       "bg-emerald-50 text-emerald-700 border-emerald-200",
};

export const UNIDADES = ["un", "kg", "g", "L", "mL", "m", "cx", "pacote", "rolo", "frasco", "saco"];

export const CATEGORIAS_PADRAO = [
  "Limpeza", "Escritório", "Som", "Bíblias", "Alimentação",
  "Manutenção predial", "Cozinha", "Bebê", "Decoração", "Outros",
];

// ─── CRUD itens ─────────────────────────────────────────────────────────
export async function listarItens(incluirInativos = false): Promise<EstoqueItem[]> {
  let q = supabase.from("fin_estoque_itens").select("*").order("nome");
  if (!incluirInativos) q = q.eq("ativo", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as EstoqueItem[];
}

export async function carregarItem(id: string): Promise<EstoqueItem | null> {
  const { data } = await supabase.from("fin_estoque_itens").select("*").eq("id", id).maybeSingle();
  return (data ?? null) as EstoqueItem | null;
}

export async function criarItem(input: Partial<EstoqueItem>): Promise<EstoqueItem> {
  const { data, error } = await supabase.from("fin_estoque_itens").insert(input as any).select("*").single();
  if (error) throw error;
  return data as EstoqueItem;
}

export async function atualizarItem(id: string, patch: Partial<EstoqueItem>): Promise<void> {
  const { error } = await supabase.from("fin_estoque_itens").update(patch as any).eq("id", id);
  if (error) throw error;
}

export async function desativarItem(id: string): Promise<void> {
  const { error } = await supabase.from("fin_estoque_itens").update({ ativo: false }).eq("id", id);
  if (error) throw error;
}

// ─── Movimentos ─────────────────────────────────────────────────────────
export async function listarMovimentos(itemId: string): Promise<EstoqueMovimento[]> {
  const { data, error } = await supabase
    .from("fin_estoque_movimentos")
    .select("*")
    .eq("item_id", itemId)
    .order("data", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as EstoqueMovimento[];
}

export async function registrarMovimento(input: {
  item_id: string;
  tipo: EstoqueMovTipo;
  quantidade: number;
  valor_unitario?: number | null;
  data?: string;
  motivo?: string | null;
  fornecedor_id?: string | null;
  lancamento_id?: string | null;
}): Promise<EstoqueMovimento> {
  const { data, error } = await supabase.from("fin_estoque_movimentos").insert({
    item_id: input.item_id,
    tipo: input.tipo,
    quantidade: input.quantidade,
    valor_unitario: input.valor_unitario ?? null,
    valor_total: input.valor_unitario ? input.quantidade * input.valor_unitario : null,
    data: input.data ?? new Date().toISOString().slice(0, 10),
    motivo: input.motivo ?? null,
    fornecedor_id: input.fornecedor_id ?? null,
    lancamento_id: input.lancamento_id ?? null,
  }).select("*").single();
  if (error) throw error;
  return data as EstoqueMovimento;
}

export async function excluirMovimento(id: string): Promise<void> {
  const { error } = await supabase.from("fin_estoque_movimentos").delete().eq("id", id);
  if (error) throw error;
}

// ─── Alertas (view) ─────────────────────────────────────────────────────
export async function listarAlertas(): Promise<EstoqueAlerta[]> {
  const { data, error } = await supabase
    .from("vw_fin_estoque_alertas")
    .select("*")
    .order("urgencia")
    .order("dias_restantes_estimados", { ascending: true });
  if (error) throw error;
  return (data ?? []) as EstoqueAlerta[];
}

export async function itensCriticos(): Promise<EstoqueAlerta[]> {
  const todos = await listarAlertas();
  return todos.filter(i => i.urgencia !== "ok");
}
