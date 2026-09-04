-- ═══════════════════════════════════════════════════════════════════════════
-- O endereço de quem é assistido
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Pedido de 04/09: "cadastrar endereço também" na tela de quem recebe cesta
-- básica. Mesmos campos e mesmo componente que `membros`/visitantes já usam
-- (`CamposEndereco`, com busca automática por CEP) — não um formato novo.
--
-- Fica em `diaconia_pessoas_assistidas`, não na ficha socioeconômica: é
-- identificação básica (como nome e telefone), não uma leitura de situação.
-- A igreja pediu a ficha "enxuta e qualitativa" — endereço não é isso, é
-- onde a pessoa mora, para quem for entregar ou visitar saber chegar.

BEGIN;

ALTER TABLE public.diaconia_pessoas_assistidas
  ADD COLUMN cep          text,
  ADD COLUMN endereco     text,
  ADD COLUMN numero       text,
  ADD COLUMN complemento  text,
  ADD COLUMN bairro       text,
  ADD COLUMN cidade       text,
  ADD COLUMN uf           text;

-- `diaconia_criar_pessoa` ganha os campos de endereço, todos opcionais —
-- a chamada rápida ("+ novo" durante a confirmação) continua só com nome e
-- telefone; o cadastro completo, em "Pessoas", passa a oferecer o resto.
--
-- DROP explícito primeiro: a assinatura mudou (4 parâmetros → 11), e
-- `CREATE OR REPLACE` com lista de parâmetros diferente não substitui a
-- função antiga — cria uma SEGUNDA, e as duas colidem em qualquer chamada
-- que caiba nas duas (erro real, achado ao ensaiar esta mesma migration).
DROP FUNCTION IF EXISTS public.diaconia_criar_pessoa(uuid, text, text, uuid);

CREATE OR REPLACE FUNCTION public.diaconia_criar_pessoa(
  p_area_id      uuid,
  p_nome         text,
  p_telefone     text DEFAULT NULL,
  p_membro_id    uuid DEFAULT NULL,
  p_cep          text DEFAULT NULL,
  p_endereco     text DEFAULT NULL,
  p_numero       text DEFAULT NULL,
  p_complemento  text DEFAULT NULL,
  p_bairro       text DEFAULT NULL,
  p_cidade       text DEFAULT NULL,
  p_uf           text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
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
    (membro_id, nome_completo, telefone, cep, endereco, numero, complemento, bairro, cidade, uf)
  VALUES
    (p_membro_id, v_nome, nullif(btrim(p_telefone), ''),
     nullif(btrim(p_cep), ''), nullif(btrim(p_endereco), ''), nullif(btrim(p_numero), ''),
     nullif(btrim(p_complemento), ''), nullif(btrim(p_bairro), ''), nullif(btrim(p_cidade), ''),
     nullif(btrim(p_uf), ''))
    RETURNING id INTO v_id;

  INSERT INTO public.diaconia_vinculos (pessoa_assistida_id, area_id)
       VALUES (v_id, p_area_id)
  ON CONFLICT (pessoa_assistida_id, area_id) DO UPDATE SET ativo = true;

  RETURN v_id;
END;
$$;

-- Editar quem já está cadastrado — nome, telefone, endereço. Mesma porta
-- larga da chamada: quem serve na área também pode corrigir um número de
-- telefone errado, não só a liderança.
CREATE OR REPLACE FUNCTION public.diaconia_atualizar_pessoa(
  p_pessoa_assistida_id uuid,
  p_nome         text,
  p_telefone     text DEFAULT NULL,
  p_cep          text DEFAULT NULL,
  p_endereco     text DEFAULT NULL,
  p_numero       text DEFAULT NULL,
  p_complemento  text DEFAULT NULL,
  p_bairro       text DEFAULT NULL,
  p_cidade       text DEFAULT NULL,
  p_uf           text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
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
     SET nome_completo = v_nome,
         telefone      = nullif(btrim(p_telefone), ''),
         cep           = nullif(btrim(p_cep), ''),
         endereco      = nullif(btrim(p_endereco), ''),
         numero        = nullif(btrim(p_numero), ''),
         complemento   = nullif(btrim(p_complemento), ''),
         bairro        = nullif(btrim(p_bairro), ''),
         cidade        = nullif(btrim(p_cidade), ''),
         uf            = nullif(btrim(p_uf), '')
   WHERE id = p_pessoa_assistida_id;
END;
$$;

COMMIT;
