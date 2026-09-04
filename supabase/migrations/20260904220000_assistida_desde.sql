-- ═══════════════════════════════════════════════════════════════════════════
-- Assistida desde — o primeiro momento
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Pedido dela: "coloque um campo de data para o cadastro da ficha, para
-- registrar esse primeiro momento". Até aqui a única data de origem era
-- `created_at`, automática, sem edição — data em que o registro foi digitado
-- no sistema, não a data em que a pessoa começou a ser assistida. As duas
-- coincidem para gente nova, mas não para as ~40 fichas de papel que ainda
-- vão entrar no sistema: gente atendida desde a pandemia, que só agora ganha
-- ficha digital. Sem um campo próprio, editável, a história real dessas
-- pessoas — "desde quando a igreja cuida dela" — se perderia atrás da data
-- de digitação.
--
-- `assistida_desde` é `date`, não `timestamptz`: só o dia importa, igual
-- `membros.data_entrada`. Ao criar, se não vier no `p_dados`, assume hoje —
-- é o caso comum (gente nova). Ao corrigir depois, `diaconia_atualizar_pessoa`
-- grava o que vier, para poder ajustar quando o preenchimento inicial errar
-- ou quando a ficha de papel for digitada depois.

BEGIN;

ALTER TABLE public.diaconia_pessoas_assistidas
  ADD COLUMN assistida_desde date;

COMMENT ON COLUMN public.diaconia_pessoas_assistidas.assistida_desde IS
  'Quando a pessoa começou a ser assistida pela Diaconia — pode ser anterior ao cadastro no sistema (fichas de papel antigas). Distinto de created_at, que é só a data de digitação.';

CREATE OR REPLACE FUNCTION public.diaconia_criar_pessoa(
  p_area_id uuid, p_nome text, p_membro_id uuid DEFAULT NULL::uuid, p_dados jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_nome text := btrim(p_nome);
  v_id   uuid;
BEGIN
  IF NOT public.diaconia_posso_atender(p_area_id) THEN
    RAISE EXCEPTION 'Você não atende nesta área.' USING ERRCODE = '42501';
  END IF;
  IF v_nome IS NULL OR v_nome = '' THEN
    RAISE EXCEPTION 'Escreva o nome da pessoa.';
  END IF;

  IF p_membro_id IS NOT NULL THEN
    SELECT nome_completo INTO v_nome FROM public.membros WHERE id = p_membro_id;
  END IF;

  INSERT INTO public.diaconia_pessoas_assistidas
    (membro_id, nome_completo, telefone, cep, endereco, numero, complemento, bairro, cidade, uf,
     data_nascimento, sexo, estado_civil, rg, cpf, nacionalidade, naturalidade, profissao, escolaridade,
     assistida_desde)
  VALUES
    (p_membro_id, v_nome,
     nullif(btrim(p_dados->>'telefone'), ''),
     nullif(btrim(p_dados->>'cep'), ''), nullif(btrim(p_dados->>'endereco'), ''),
     nullif(btrim(p_dados->>'numero'), ''), nullif(btrim(p_dados->>'complemento'), ''),
     nullif(btrim(p_dados->>'bairro'), ''), nullif(btrim(p_dados->>'cidade'), ''),
     nullif(btrim(p_dados->>'uf'), ''),
     (p_dados->>'data_nascimento')::date,
     (p_dados->>'sexo')::public.sexo,
     (p_dados->>'estado_civil')::public.estado_civil,
     nullif(btrim(p_dados->>'rg'), ''), nullif(btrim(p_dados->>'cpf'), ''),
     nullif(btrim(p_dados->>'nacionalidade'), ''), nullif(btrim(p_dados->>'naturalidade'), ''),
     nullif(btrim(p_dados->>'profissao'), ''), nullif(btrim(p_dados->>'escolaridade'), ''),
     coalesce((p_dados->>'assistida_desde')::date, current_date))
    RETURNING id INTO v_id;

  INSERT INTO public.diaconia_vinculos (pessoa_assistida_id, area_id)
       VALUES (v_id, p_area_id)
  ON CONFLICT (pessoa_assistida_id, area_id) DO UPDATE SET ativo = true;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.diaconia_atualizar_pessoa(
  p_pessoa_assistida_id uuid, p_nome text, p_dados jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_pode boolean; v_nome text := btrim(p_nome);
BEGIN
  IF v_nome IS NULL OR v_nome = '' THEN
    RAISE EXCEPTION 'Escreva o nome da pessoa.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.diaconia_vinculos v
     WHERE v.pessoa_assistida_id = p_pessoa_assistida_id AND v.ativo
       AND public.diaconia_posso_atender(v.area_id)
  ) INTO v_pode;
  IF NOT v_pode THEN
    RAISE EXCEPTION 'Você não atende esta pessoa.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.diaconia_pessoas_assistidas
     SET nome_completo    = v_nome,
         telefone         = nullif(btrim(p_dados->>'telefone'), ''),
         cep              = nullif(btrim(p_dados->>'cep'), ''),
         endereco         = nullif(btrim(p_dados->>'endereco'), ''),
         numero           = nullif(btrim(p_dados->>'numero'), ''),
         complemento      = nullif(btrim(p_dados->>'complemento'), ''),
         bairro           = nullif(btrim(p_dados->>'bairro'), ''),
         cidade           = nullif(btrim(p_dados->>'cidade'), ''),
         uf               = nullif(btrim(p_dados->>'uf'), ''),
         data_nascimento  = (p_dados->>'data_nascimento')::date,
         sexo             = (p_dados->>'sexo')::public.sexo,
         estado_civil     = (p_dados->>'estado_civil')::public.estado_civil,
         rg               = nullif(btrim(p_dados->>'rg'), ''),
         cpf              = nullif(btrim(p_dados->>'cpf'), ''),
         nacionalidade    = nullif(btrim(p_dados->>'nacionalidade'), ''),
         naturalidade     = nullif(btrim(p_dados->>'naturalidade'), ''),
         profissao        = nullif(btrim(p_dados->>'profissao'), ''),
         escolaridade     = nullif(btrim(p_dados->>'escolaridade'), ''),
         assistida_desde  = (p_dados->>'assistida_desde')::date
   WHERE id = p_pessoa_assistida_id;
END;
$function$;

COMMIT;
