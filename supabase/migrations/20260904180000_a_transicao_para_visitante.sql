-- ═══════════════════════════════════════════════════════════════════════════
-- A transição para visitante
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Resposta à pergunta em aberto de "onde a ficha do assistido deveria
-- morar" (ver [[diaconia-porta-de-entrada]]): isolada por padrão, com uma
-- ponte deliberada para o caso de sucesso — "estreitar o contato" era o
-- objetivo dela desde o primeiro pedido, e às vezes funciona: quem só
-- vinha buscar cesta começa a frequentar o culto.
--
-- `diaconia_iniciar_frequencia` é essa ponte: cria a ficha de `visitante`
-- em `membros` (mesmo tipo que qualquer visitante novo, pelo mesmo
-- caminho de acolhimento — não inventa um terceiro estado), copiando
-- identidade e endereço que já foram coletados, e liga via `membro_id`.
-- Um registro em `visita_historico` guarda a origem, pro Painel Pastoral
-- não achar que a pessoa apareceu do nada.
--
-- A ficha socioeconômica NÃO se move — continua só em
-- `diaconia_fichas_socioeconomicas`, lida só por quem lidera a Diaconia.
-- A transição muda quem vê que a PESSOA existe, não quem vê a renda dela.
--
-- ── A SEGUNDA METADE: INDICAR UM PEQUENO GRUPO ──────────────────────────────
--
-- Pergunta dela: "como indicar um pequeno grupo para que o assistido possa
-- frequentar?" — `pgm_sugerir_por_bairro(bairro)` já existe (SECURITY
-- DEFINER, sem checagem de papel) desde antes desta sessão, feita
-- exatamente pra isto. `diaconia_pessoas_assistidas` já tem o bairro
-- coletado no cadastro — a sugestão é só chamar a função que já existe
-- com o bairro que já foi digitado, sem inventar nada novo no banco.

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

  INSERT INTO public.membros (
    nome_completo, telefone_celular, data_nascimento, sexo, estado_civil,
    endereco, numero, complemento, bairro, cidade, cep, uf,
    tipo_pessoa, status, data_entrada, como_conheceu, como_conheceu_descricao
  ) VALUES (
    v_pessoa.nome_completo, v_pessoa.telefone, v_pessoa.data_nascimento, v_pessoa.sexo, v_pessoa.estado_civil,
    v_pessoa.endereco, v_pessoa.numero, v_pessoa.complemento, v_pessoa.bairro, v_pessoa.cidade, v_pessoa.cep, v_pessoa.uf,
    'visitante', 'ativo', current_date, 'diaconia',
    'Começou a frequentar — atendida pela Diaconia' || CASE WHEN v_area_nome IS NOT NULL THEN ' (' || v_area_nome || ')' ELSE '' END
  ) RETURNING id INTO v_membro_id;

  UPDATE public.diaconia_pessoas_assistidas SET membro_id = v_membro_id WHERE id = p_pessoa_assistida_id;

  INSERT INTO public.visita_historico (visitante_id, tipo, observacao, registrado_por)
  VALUES (
    v_membro_id, 'observacao',
    'Ficha de visitante criada pela Diaconia' || CASE WHEN v_area_nome IS NOT NULL THEN ' (' || v_area_nome || ')' ELSE '' END || ' — já era assistida, passou a frequentar.',
    auth.uid()
  );

  RETURN v_membro_id;
END;
$$;

COMMIT;
