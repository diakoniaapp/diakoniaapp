-- ─── Aniversários e casamentos na PÁGINA Agenda, para o voluntário ──────────────────────────────────────────────────────────────────────────────
--
-- Decisão dela (16/10/2026): "o voluntário vê todas as datas de aniversário, casamento e todos os eventos" — o voluntário é sempre membro da igreja.
--
-- ── O DEFEITO ────────────────────────────────────────────────────────────
-- Na Home, aniversários e bodas já chegam completos a qualquer conta logada, por `agenda_pastoral_proximos_dias` (SECURITY DEFINER). Na PÁGINA Agenda (`/eventos`), a camada de
-- aniversários e casamentos lê `membros` direto — e a RLS de `membros` (regra do membro comum, 01/09/2026: só a própria ficha) devolve ao voluntário uma linha só: a dele. A
-- agenda dele mostrava o próprio aniversário e mais nada, enquanto a Home mostrava todos.
--
-- ── A CORREÇÃO ───────────────────────────────────────────────────────────
-- Uma função SECURITY DEFINER que devolve SÓ as colunas que a camada usa (nome, datas e vínculo) das pessoas que são membro ou congregado e têm alguma data — a mesma seleção que a
-- tela já fazia direto na tabela. Nada de telefone, endereço ou observação.
--
-- Quem pode chamar: os papéis que trabalham na igreja — administração, dono do sistema, secretaria, tesouraria, pastor, liderança e VOLUNTÁRIO. O `membro` comum fica de fora: a
-- decisão foi sobre o voluntário, e abrir para mais gente é uma linha (acrescentar 'membro' na lista abaixo).
--
-- A tela tenta esta função e, se ela ainda não existir (migration não aplicada) ou falhar, volta à leitura direta de sempre — nada quebra por falta dela.
--
-- ── POR QUE plpgsql (e não `LANGUAGE sql`) — 16/10/2026 ──────────────────────
-- A primeira versão era `LANGUAGE sql` e o editor do Supabase recusou na criação: `42P01: missing FROM-clause entry for table "m"`. Uma função SQL tem o corpo analisado já no
-- CREATE, e as colunas de saída (`id`, `nome_completo`, …) viram nomes de parâmetro que concorrem com as colunas da tabela; se o texto chega ao banco com uma quebra de linha a menos,
-- o `FROM` some. Em plpgsql o corpo só é resolvido na chamada, o conflito de nomes é decidido explicitamente (`#variable_conflict use_column`: o nome vale como coluna) e a consulta
-- vai numa linha só, que não depende de como o texto foi colado.
--
-- Reversível: docs/AGENDA_ANIVERSARIOS_ROLLBACK.sql.

CREATE OR REPLACE FUNCTION public.agenda_aniversarios_casamentos()
 RETURNS TABLE(id uuid, nome_completo text, data_nascimento date, nascimento_dia_mes date, data_casamento date, tipo_pessoa public.tipo_pessoa)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
BEGIN
  IF NOT COALESCE(public.has_any_role((SELECT auth.uid()), ARRAY['admin', 'diakonia', 'secretaria', 'tesouraria', 'pastor', 'lideranca', 'voluntario']::public.app_role[]), false) THEN
    RETURN;
  END IF;
  RETURN QUERY SELECT m.id, m.nome_completo, m.data_nascimento, m.nascimento_dia_mes, m.data_casamento, m.tipo_pessoa FROM public.membros AS m WHERE m.tipo_pessoa IN ('membro', 'congregado') AND (m.data_nascimento IS NOT NULL OR m.nascimento_dia_mes IS NOT NULL OR m.data_casamento IS NOT NULL);
END;
$function$;

REVOKE ALL ON FUNCTION public.agenda_aniversarios_casamentos() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agenda_aniversarios_casamentos() TO authenticated;

COMMENT ON FUNCTION public.agenda_aniversarios_casamentos() IS
  'Nome, datas de nascimento/casamento e vínculo de membros e congregados, para a camada de aniversários e casamentos da Agenda. Só para papéis de trabalho (inclui voluntario). Sem telefone nem endereço.';
