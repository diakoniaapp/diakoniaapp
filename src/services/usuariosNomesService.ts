// ─── usuariosNomesService.ts — o NOME de quem agiu no financeiro ─────────────────────────────────────────────────────────────────────────────────────────
// A tabela `profiles` só deixa cada pessoa ler o próprio nome (e a Administração/Secretaria ler todos): para a Tesouraria, "quem conferiu", "quem reabriu" e "quem decidiu"
// saíam em branco. `fin_nomes_dos_usuarios` (migration 20261016170000) devolve só id e nome, restrito à equipe do financeiro, e cai para o nome da pessoa vinculada quando o perfil não tem nome.
// Sem a migration aplicada, a leitura direta de `profiles` continua sendo a alternativa (como era).
import { supabase } from "@/integrations/supabase/client";

export async function nomesDosUsuarios(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter((x): x is string => !!x))];
  const nomes = new Map<string, string>();
  if (unicos.length === 0) return nomes;
  try {
    const r = await supabase.rpc("fin_nomes_dos_usuarios" as never, { p_ids: unicos } as never);
    if (!r.error) {
      for (const x of (r.data ?? []) as unknown as { id: string; nome: string | null }[]) if (x.nome && x.nome.trim()) nomes.set(String(x.id), x.nome.trim());
      return nomes;
    }
  } catch { /* sem a função: a leitura direta abaixo */ }
  try {
    const p = await supabase.from("profiles").select("id, nome").in("id", unicos);
    for (const x of p.data ?? []) if (x.nome && String(x.nome).trim()) nomes.set(String(x.id), String(x.nome).trim());
  } catch { /* só o nome: a tela mostra "usuário" */ }
  return nomes;
}
