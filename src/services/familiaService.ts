// ─── familiaService.ts — Famílias Fase A ────────────────────────────────────
import { supabase, supabaseRel } from "@/integrations/supabase/client";
import { conferir } from "@/lib/escritaConferida";

export type ParentescoTipo =
  | "pai_mae" | "conjuge" | "filho" | "avo" | "neto"
  | "enteado" | "tutelado" | "irmao" | "outro";

export const PARENTESCO_LABEL: Record<ParentescoTipo, string> = {
  pai_mae:  "Pai/Mãe",
  conjuge:  "Cônjuge",
  filho:    "Filho(a)",
  avo:      "Avô/Avó",
  // Logo depois de avô, que é a outra ponta da mesma relação. A ordem
  // deste objeto é a ordem do seletor no formulário.
  neto:     "Neto(a)",
  enteado:  "Enteado(a)",
  tutelado: "Tutelado(a)",
  irmao:    "Irmão(ã)",
  outro:    "Outro vínculo",
};

export interface Familia {
  id: string;
  nome_familia: string;
  endereco?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  cep?: string | null;
  data_casamento?: string | null;
  observacoes?: string | null;
}

export interface VinculoFamiliar {
  id: string;
  familia_id: string;
  membro_id: string;
  parentesco: ParentescoTipo;
  responsavel_familia: boolean;
}

export interface SugestaoVinculo {
  pessoa_id: string;
  nome_completo: string;
  sobrenome: string;
  familia_id: string | null;
  familia_nome: string | null;
  parentesco: ParentescoTipo | null;
  responsavel: boolean;
}

/**
 * Procura PESSOAS para vincular, não famílias.
 *
 * A busca antiga (`buscarFamilias`) casava pelo nome de quem estava na
 * família mas devolvia a FAMÍLIA. Quem cadastra procura o parente — "é a
 * mulher do Roger" —, e recebia de volta uma linha "Família Paixão · por
 * causa de Roger Ferreira Cury Paixao". Duas traduções para chegar à mesma
 * pessoa, e nenhuma delas para quem ainda não tem família nenhuma: pessoa
 * sem vínculo simplesmente não aparecia no resultado, porque não havia
 * família para representá-la.
 *
 * O retorno é `SugestaoVinculo`, o mesmo tipo das sugestões automáticas por
 * sobrenome. Não é conveniência: é o que permite os dois resultados caírem
 * na mesma lista, com a mesma caixa de seleção e o mesmo diálogo de
 * parentesco. Duas listas de pessoas com aparências diferentes na mesma tela
 * seriam duas coisas para manter iguais.
 *
 * `familia_id` nulo é resultado legítimo e frequente: 294 pessoas no cadastro
 * para 75 famílias. Quem escolher uma dessas cai no fluxo de criar família
 * nova com as duas — que `abrirVincSugestao` já trata.
 */
export async function buscarPessoasParaVinculo(
  termo: string,
  excluirPessoaId?: string | null,
): Promise<SugestaoVinculo[]> {
  const t = termo.trim();
  if (t.length < 2) return [];

  // `supabaseRel` por causa do embed aninhado (membros → vínculo → família):
  // com o cliente tipado, percorrer o grafo de relacionamentos estoura o
  // limite de profundidade do TypeScript e contamina a consulta inteira.
  // Ver AD-4 no CLAUDE.md.
  const { data, error } = await supabaseRel
    .from("membros")
    .select("id, nome_completo, vinculos_familiares(familia_id, parentesco, responsavel_familia, familias(nome_familia))")
    .ilike("nome_completo", `%${t}%`)
    .eq("status", "ativo")
    .order("nome_completo")
    .limit(20);
  if (error) throw error;

  const achados: SugestaoVinculo[] = [];
  for (const m of (data ?? []) as any[]) {
    if (excluirPessoaId && m.id === excluirPessoaId) continue;   // ninguém é parente de si
    const v = m.vinculos_familiares?.[0];
    const partes = (m.nome_completo ?? "").trim().split(/\s+/);
    achados.push({
      pessoa_id: m.id,
      nome_completo: m.nome_completo,
      sobrenome: partes.length > 1 ? partes[partes.length - 1] : "",
      familia_id: v?.familia_id ?? null,
      familia_nome: v?.familias?.nome_familia ?? null,
      parentesco: (v?.parentesco ?? null) as ParentescoTipo | null,
      responsavel: v?.responsavel_familia ?? false,
    });
  }
  return achados;
}

// ── Sugestões automáticas por sobrenome ────────────────────────────────────
export async function sugerirVinculos(
  pessoaId?: string | null,
  nomeCompleto?: string | null,
): Promise<SugestaoVinculo[]> {
  const { data, error } = await supabase.rpc("sugerir_vinculos_familiares", {
    p_pessoa_id: pessoaId ?? null,
    p_nome_completo: nomeCompleto ?? null,
  });
  if (error) throw error;
  return (data ?? []) as SugestaoVinculo[];
}

// ── Família atual da pessoa ────────────────────────────────────────────────
export async function familiaDaPessoa(pessoaId: string): Promise<
  { vinculo: VinculoFamiliar; familia: Familia } | null
> {
  const { data } = await supabase
    .from("vinculos_familiares")
    .select("id, familia_id, membro_id, parentesco, responsavel_familia, familias(*)")
    .eq("membro_id", pessoaId)
    .maybeSingle();
  if (!data) return null;
  return {
    vinculo: {
      id: (data as any).id,
      familia_id: (data as any).familia_id,
      membro_id: (data as any).membro_id,
      parentesco: (data as any).parentesco as ParentescoTipo,
      responsavel_familia: (data as any).responsavel_familia,
    },
    familia: (data as any).familias as Familia,
  };
}

// ── Criar família + opcionalmente vincular a pessoa como responsável ───────
export async function criarFamilia(
  nomeFamilia: string,
  enderecoSeed?: Partial<Familia>,
): Promise<Familia> {
  const payload: any = { nome_familia: nomeFamilia.trim() };
  if (enderecoSeed) {
    ["endereco", "numero", "complemento", "bairro", "cidade", "cep"].forEach(k => {
      const v = (enderecoSeed as any)[k];
      if (v) payload[k] = v;
    });
  }
  const { data, error } = await supabase
    .from("familias")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return data as Familia;
}

// ── Vincular pessoa a família (via RPC: UPSERT + responsavel exclusivo) ────
export async function vincularPessoa(
  familiaId: string,
  pessoaId: string,
  parentesco: ParentescoTipo,
  responsavel = false,
  copiarEnderecoParaFamilia = false,
): Promise<string> {
  const { data, error } = await supabase.rpc("vincular_pessoa_familia", {
    p_familia_id: familiaId,
    p_pessoa_id: pessoaId,
    p_parentesco: parentesco,
    p_responsavel: responsavel,
    p_copiar_endereco_para_familia: copiarEnderecoParaFamilia,
  });
  if (error) throw error;
  return data as string;
}

// ── Desvincular (deleta vínculo, família permanece) ────────────────────────
export async function desvincularPessoa(vinculoId: string): Promise<void> {
  // A politica de DELETE em `vinculos_familiares` e admin+secretaria. Barrada,
  // devolve zero linhas e sucesso — o `throw error` sozinho nunca dispararia.
  // Mantem-se a convencao deste arquivo de lancar, para nao mudar a assinatura.
  const r = conferir(
    await supabase
      .from("vinculos_familiares")
      .delete()
      .eq("id", vinculoId)
      .select("id"),
    "O vínculo",
  );
  if (!r.ok) throw new Error(r.erro);
}

// ── Atualizar família ──────────────────────────────────────────────────────
export async function atualizarFamilia(familiaId: string, patch: Partial<Familia>): Promise<void> {
  const r = conferir(
    await supabase
      .from("familias")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", familiaId)
      .select("id"),
    "A família",
  );
  if (!r.ok) throw new Error(r.erro);
}

// ── Helper: sugere nome de família a partir do sobrenome ───────────────────
export function nomeFamiliaSugerido(nomeCompleto: string): string {
  // Pega a última palavra significativa
  const partes = nomeCompleto.trim().toLowerCase().split(/\s+/);
  const pular = new Set([
    "da", "de", "do", "das", "dos", "e",
    "filho", "filha", "junior", "jr", "jr.", "neto", "neta",
    "iii", "ii"
  ]);
  for (let i = partes.length - 1; i >= 0; i--) {
    const p = partes[i].replace(/[.,;:]/g, "");
    if (!pular.has(p) && p.length >= 3) {
      // Capitaliza primeira letra
      return "Família " + p.charAt(0).toUpperCase() + p.slice(1);
    }
  }
  return "Família " + nomeCompleto.split(" ").pop();
}

// ─── Buscar uma família que já existe ────────────────────────────────────────
//
// ── POR QUE ISTO PRECISOU EXISTIR ───────────────────────────────────────────
//
// `sugerirVinculos` acha gente por SOBRENOME. Resolve o caso comum e falha em
// dois que acontecem toda semana nesta igreja:
//
//   • a família já existe com outro nome — "Rocha De Costa Souza" não casa com
//     a família "Souza", e quem cadastra não tem como saber disso;
//   • a pessoa não tem sobrenome em comum com ninguém — genro, nora, enteado,
//     alguém que adotou o nome do cônjuge. Aí `sugestoes` volta VAZIO, e o
//     bloco inteiro não aparecia: o formulário simplesmente não oferecia
//     família nenhuma.
//
