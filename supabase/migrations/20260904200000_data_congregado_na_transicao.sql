-- ═══════════════════════════════════════════════════════════════════════════
-- data_congregado na transição
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Ela perguntou por que o teste dela não aparecia como candidato ao batismo
-- no Painel Pastoral. A resposta real foi que a criação nunca chegou a
-- acontecer (bateu no bug do telefone, corrigido em 20260904190000, e a
-- transação inteira desfez). Mas checando isso achei uma lacuna de verdade:
-- `diaconia_iniciar_frequencia` nunca gravava `data_congregado`.
--
-- `candidatosMembresia()` (painelPastoralService.ts) ordena os elegíveis por
-- `data_congregado` — "quem é congregado há mais tempo primeiro". Sem essa
-- data, a pessoa não fica de fora da lista (o filtro é só idade), mas cai
-- pro fim da fila como se tivesse acabado de chegar, quando na verdade pode
-- já estar sendo atendida pela Diaconia há anos. `tornarCongregado()`
-- (visitanteService.ts, o caminho já existente de visitante → congregado)
-- sempre grava essa data — esta migration só faz o caminho da Diaconia
-- gravar a mesma coisa, pelo mesmo motivo.

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
    tipo_pessoa, status, data_entrada, data_congregado, como_conheceu, como_conheceu_descricao
  ) VALUES (
    v_pessoa.nome_completo, v_tel, v_pessoa.data_nascimento, v_pessoa.sexo, v_pessoa.estado_civil,
    v_pessoa.endereco, v_pessoa.numero, v_pessoa.complemento, v_pessoa.bairro, v_pessoa.cidade, v_pessoa.cep, v_pessoa.uf,
    'congregado', 'ativo', current_date, now(), 'diaconia',
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
