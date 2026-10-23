// ─── lerNomeDaIgreja — o nome que vai no cabeçalho de todo e-mail (a Identidade da Igreja é a fonte única) ──────────────────────────────────────────────────────────────────────────────
// Sem a linha, sem a coluna ou em qualquer erro devolve `null`: o e-mail sai só com a marca do DiakoniaApp no cabeçalho — nunca deixa de sair por causa do nome.

/** `cliente` é só o que se usa do supabase-js (o módulo não importa a biblioteca). */
export async function lerNomeDaIgreja(cliente: { from: (tabela: string) => any }): Promise<string | null> {
  try {
    const r = await cliente.from("identidade_igreja").select("nome_igreja").eq("ativa", true).order("created_at", { ascending: true }).limit(1).maybeSingle();
    const nome = r?.data?.nome_igreja;
    return typeof nome === "string" && nome.trim() ? nome.trim() : null;
  } catch {
    return null;
  }
}
