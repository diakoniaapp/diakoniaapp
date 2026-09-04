-- ═══════════════════════════════════════════════════════════════════════════
-- Congregado, não visitante
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Correção sobre a migration anterior (20260904180000), pouco depois de
-- verificada ao vivo — ela mesma apontou o problema: "não considero que a
-- pessoa que recebe a cesta, deveria ser um visitante... pois ela vai 1x ao
-- mes... buscar a cesta.. assiste o culto e vai embora... pode ser confundida
-- com um visitante real".
--
-- Ela tinha razão, e o banco já dizia isso antes de eu perguntar:
-- `tipo_pessoa='visitante'` alimenta `bancadaAcolhimentoService.visitantesAtivos`
-- e a fila de "quem chegou e ainda espera" em `SecaoAcolhimento.tsx` — uma fila
-- com prazo, pra gente recém-chegada que ainda não foi procurada. Quem vem
-- todo mês pegar cesta, já é conhecido da Diaconia, não está "esperando
-- contato" nesse sentido; entrar nessa fila infla a métrica e pede uma ação
-- que não faz sentido pra esse vínculo.
--
-- `tipo_pessoa='congregado'` já existe no enum e já tem sentido definido no
-- próprio código (ver src/lib/tipoPessoa.ts, src/services/
-- bancadaAcolhimentoService.ts): "quem frequenta sem ser membro" — exatamente
-- a descrição dela. Congregados aparecem no Painel Pastoral por um caminho
-- diferente (se servem em alguma área ou não), sem prazo de acolhimento.
--
-- ── UM SEGUNDO BUG, ENCONTRADO NO MESMO CLIQUE ──────────────────────────────
--
-- Ela testou ao vivo e bateu em "new row for relation membros violates check
-- constraint membros_telefone_celular_formato". `membros.telefone_celular`
-- exige o formato canônico 55DDDNÚMERO (`^55[0-9]{10,11}$`); o telefone
-- coletado pela Diaconia é digitado cru, sem o "55" (ex.: "21982223333").
-- 100% das transições bateriam nisso — não é um caso raro.
--
-- A mesma normalização de `salvar_meus_dados` (20260901140000) resolve: 10 ou
-- 11 dígitos é DDD + número sem país, prefixa "55". A diferença aqui é que um
-- telefone que não normaliza não deve travar a transição inteira — vira NULL
-- em vez de erro, porque o objetivo da ação é a pessoa virar congregada, não
-- validar o telefone dela.

BEGIN;

CREATE OR REPLACE FUNCTION public.diaconia_iniciar_frequencia(p_pessoa_assistida_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_pode      boolean;
  v_pessoa    record;
  v_membro_id uuid;
  v_area_nome text;
  v_tel       text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.diaconia_vinculos v
     WHERE v.pessoa_assistida_id = p_pessoa_assistida_id AND v.ativo
       AND public.diaconia_posso_atender(v.area_id)
  ) INTO v_pode;
  IF NOT v_pode THEN
    RAISE EXCEPTION 'Você não atende esta pessoa.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_pessoa FROM public.diaconia_pessoas_assistidas WHERE id = p_pessoa_assistida_id;
  IF v_pessoa.id IS NULL THEN
    RAISE EXCEPTION 'Pessoa não encontrada.';
  END IF;
  IF v_pessoa.membro_id IS NOT NULL THEN
    RETURN v_pessoa.membro_id; -- já tem ficha — nada a criar, não duplica
  END IF;

  SELECT a.nome INTO v_area_nome
    FROM public.diaconia_vinculos v JOIN public.areas a ON a.id = v.area_id
   WHERE v.pessoa_assistida_id = p_pessoa_assistida_id AND v.ativo
   LIMIT 1;

  -- Telefone da Diaconia é digitado cru (sem "55"). Normaliza como
  -- salvar_meus_dados normaliza; o que não encaixar vira NULL, não erro —
  -- um telefone ruim não pode travar a pessoa virando congregada.
  v_tel := nullif(regexp_replace(coalesce(v_pessoa.telefone, ''), '[^0-9]', '', 'g'), '');
  IF v_tel IS NOT NULL AND length(v_tel) IN (10, 11) THEN
    v_tel := '55' || v_tel;
  END IF;
  IF v_tel IS NOT NULL AND v_tel !~ '^55[0-9]{10,11}$' THEN
    v_tel := NULL;
  END IF;

  INSERT INTO public.membros (
    nome_completo, telefone_celular, data_nascimento, sexo, estado_civil,
    endereco, numero, complemento, bairro, cidade, cep, uf,
    tipo_pessoa, status, data_entrada, como_conheceu, como_conheceu_descricao
  ) VALUES (
    v_pessoa.nome_completo, v_tel, v_pessoa.data_nascimento, v_pessoa.sexo, v_pessoa.estado_civil,
    v_pessoa.endereco, v_pessoa.numero, v_pessoa.complemento, v_pessoa.bairro, v_pessoa.cidade, v_pessoa.cep, v_pessoa.uf,
    'congregado', 'ativo', current_date, 'diaconia',
    'Começou a frequentar — atendida pela Diaconia' || CASE WHEN v_area_nome IS NOT NULL THEN ' (' || v_area_nome || ')' ELSE '' END
  ) RETURNING id INTO v_membro_id;

  UPDATE public.diaconia_pessoas_assistidas SET membro_id = v_membro_id WHERE id = p_pessoa_assistida_id;

  INSERT INTO public.visita_historico (visitante_id, tipo, observacao, registrado_por)
  VALUES (
    v_membro_id, 'observacao',
    'Ficha de congregado criada pela Diaconia' || CASE WHEN v_area_nome IS NOT NULL THEN ' (' || v_area_nome || ')' ELSE '' END || ' — já era assistida, passou a frequentar.',
    auth.uid()
  );

  RETURN v_membro_id;
END;
$$;

COMMIT;
