-- ═══════════════════════════════════════════════════════════════════════════
-- E se já for membro?
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Pergunta dela: "E para os membros que também são assistidos?" —
-- `diaconia_pessoas_assistidas.membro_id` existe desde a primeira migration
-- (03/09) exatamente para isto, mas nenhuma tela jamais ofereceu um jeito
-- de escolher o membro. Medido antes de construir: `membros` só é legível
-- por admin/secretaria/diakonia, mais duas frestas estreitas (a própria
-- equipe do líder, o aluno da própria classe de EBD) — nenhuma delas serve
-- pra "este líder da Diaconia busca se um assistido já é membro". O
-- componente de busca já pronto no sistema (`BuscaPessoa`) lê `membros`
-- direto pela sessão do usuário: voltaria vazio pra qualquer líder que não
-- seja também admin/secretaria/diakonia.
--
-- `diaconia_buscar_membro` é a porta própria: SECURITY DEFINER, devolve só
-- nome/tipo/telefone (não CPF, não endereço — o mínimo pra reconhecer a
-- pessoa), e só responde a quem já é staff de alguma área de Diaconia (ou
-- admin/secretaria/diakonia). Não abre `membros` pra ninguém que a RLS de
-- `membros` já não deixaria entrar por outro caminho — só empresta a busca
-- para dentro do fluxo da Diaconia, sem dar a tabela inteira.

BEGIN;

CREATE OR REPLACE FUNCTION public.diaconia_buscar_membro(p_termo text)
RETURNS TABLE(id uuid, nome_completo text, tipo_pessoa text, telefone_celular text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT m.id, m.nome_completo, m.tipo_pessoa::text, m.telefone_celular
    FROM public.membros m
   WHERE length(btrim(coalesce(p_termo, ''))) >= 2
     AND m.status = 'ativo'
     AND m.nome_completo ILIKE '%' || btrim(p_termo) || '%'
     AND (
       public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria','diakonia']::app_role[])
       OR EXISTS (
            SELECT 1 FROM public.areas a
             JOIN public.ministerios mi ON mi.id = a.ministerio_id
            WHERE a.ativo AND mi.modulo = 'diaconia' AND public.diaconia_posso_atender(a.id)
          )
     )
   ORDER BY m.nome_completo
   LIMIT 20;
$$;

-- Vincular (ou desvincular) o membro de quem já está cadastrado como
-- assistido — a metade que faltava de `diaconia_atualizar_pessoa`, que só
-- mexia em identidade/endereço. Mesma porta larga: quem serve na área
-- também reconhece "essa pessoa é a Dona Fulana, que já é da igreja."
CREATE OR REPLACE FUNCTION public.diaconia_vincular_membro(
  p_pessoa_assistida_id uuid, p_membro_id uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_pode boolean; v_nome text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.diaconia_vinculos v
     WHERE v.pessoa_assistida_id = p_pessoa_assistida_id AND v.ativo
       AND public.diaconia_posso_atender(v.area_id)
  ) INTO v_pode;
  IF NOT v_pode THEN
    RAISE EXCEPTION 'Você não atende esta pessoa.' USING ERRCODE = '42501';
  END IF;

  IF p_membro_id IS NOT NULL THEN
    SELECT nome_completo INTO v_nome FROM public.membros WHERE id = p_membro_id;
    IF v_nome IS NULL THEN
      RAISE EXCEPTION 'Membro não encontrado.';
    END IF;
  END IF;

  UPDATE public.diaconia_pessoas_assistidas
     SET membro_id = p_membro_id,
         nome_completo = COALESCE(v_nome, nome_completo)
   WHERE id = p_pessoa_assistida_id;
END;
$$;

COMMIT;
