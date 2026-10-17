// ─── agendaAniversariosService.ts — quem faz aniversário e quem casou, para a Agenda (tela e impressão) ─────────────────────────────────────────────────────────
import { supabase } from "@/integrations/supabase/client";

/**
 * Quem faz aniversário e quem casou, para a camada de aniversários e casamentos da Agenda (16/10/2026).
 *
 * Primeiro a função `agenda_aniversarios_casamentos` (SECURITY DEFINER): ela entrega a quem trabalha na igreja — o voluntário incluso — as datas de TODOS os membros e congregados. Ler
 * `membros` direto, como era, devolvia ao voluntário só a ficha dele (a RLS da ficha é de quem ela fala). Se a função ainda não existe (migration não aplicada), falha, ou não devolve
 * nada (conta fora dos papéis de trabalho), volta à leitura direta de sempre — que dá tudo à equipe e só a própria ficha ao membro comum.
 *
 * Serve a tela da Agenda E a página de impressão: as duas precisam mostrar as mesmas datas (a impressão lia `membros` direto e perdia as dos outros para o voluntário).
 */
export async function carregarAniversarios() {
  try {
    const r = await supabase.rpc("agenda_aniversarios_casamentos" as never);
    const linhas = r.data as unknown as unknown[] | null;
    if (!r.error && Array.isArray(linhas) && linhas.length > 0) return { data: linhas, error: null };
  } catch { /* cai na leitura direta */ }
  return supabase
    .from("membros")
    .select("id, nome_completo, data_nascimento, nascimento_dia_mes, data_casamento, tipo_pessoa")
    .in("tipo_pessoa", ["membro", "congregado"])
    .or("data_nascimento.not.is.null,nascimento_dia_mes.not.is.null,data_casamento.not.is.null");
}
