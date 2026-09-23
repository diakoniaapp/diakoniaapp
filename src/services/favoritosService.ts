import { supabase } from "@/integrations/supabase/client";
import { conferir } from "@/lib/escritaConferida";

// ─── fin_favoritos — atalhos fixáveis do Workspace Financeiro ──────────
// Ver o cabeçalho da migration 20260923100000_fin_favoritos.sql: pessoal
// de quem loga (RLS por `usuario_id = auth.uid()`), não configuração do
// sistema — por isso não existe listagem "de outro usuário" neste serviço.

export type FinFavoritoTipo = "conta" | "fornecedor" | "relatorio" | "centro_custo" | "categoria" | "projeto" | "outro";

export interface FinFavorito {
  id: string;
  usuario_id: string;
  tipo: FinFavoritoTipo;
  rotulo: string;
  rota: string;
  ordem: number;
  created_at: string;
}

export async function listarFavoritos(): Promise<FinFavorito[]> {
  const { data, error } = await supabase
    .from("fin_favoritos")
    .select("*")
    .order("ordem", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as FinFavorito[];
}

export async function fixarFavorito(input: { tipo: FinFavoritoTipo; rotulo: string; rota: string }): Promise<FinFavorito> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Sessão expirada — faça login de novo.");
  const { data, error } = await supabase
    .from("fin_favoritos")
    .insert({ ...input, usuario_id: auth.user.id } as never)
    .select("*")
    .single();
  if (error) throw error;
  return data as FinFavorito;
}

export async function desfixarFavorito(id: string): Promise<void> {
  const r = conferir(
    await supabase.from("fin_favoritos").delete().eq("id", id).select("id"),
    "O favorito",
  );
  if (!r.ok) throw new Error(r.erro);
}

export async function reordenarFavoritos(idsNaOrdem: string[]): Promise<void> {
  await Promise.all(idsNaOrdem.map((id, i) =>
    supabase.from("fin_favoritos").update({ ordem: i } as never).eq("id", id)));
}
