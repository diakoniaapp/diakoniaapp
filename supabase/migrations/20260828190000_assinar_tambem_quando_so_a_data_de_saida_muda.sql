-- ─── Assinar também quando só a data de saída muda ─────────────────────────
--
-- ── O DEFEITO ──────────────────────────────────────────────────────────────
--
-- O gatilho `a_assina_saida_do_rol`, criado ontem em `20260828180000`, só
-- carimbava quando o STATUS mudava para transferido, desligado ou falecido:
--
--   saiu := NEW.status IN (...) AND (TG_OP = 'INSERT'
--                                    OR OLD.status IS DISTINCT FROM NEW.status);
--
-- Isso deixa de fora o caso mais comum do trabalho que está começando: as
-- pessoas que JÁ estavam marcadas como falecidas ou transferidas, vindas da
-- importação, e a quem falta só a data.
--
-- **Aconteceu na primeira hora de uso.** Em 26/08/2026, às 23h50, a data de
-- saída de um falecido foi preenchida (19/08/2026). O status não mudou —
-- continuava `falecido` —, o gatilho não disparou, e o registro ficou **sem
-- assinatura nenhuma**: nem nome, nem função, nem hora.
--
-- ── POR QUE ISSO IMPORTA ───────────────────────────────────────────────────
--
-- A assinatura existe porque tirar alguém do rol é ato de assembleia, e a
-- ficha tem de dizer quem registrou. Preencher a data de saída **é** registrar
-- a saída: é ela que faz a saída existir para o sistema — sem data, o
-- Movimento de Membros nem desenha a barra. Um registro que passa a contar e
-- não é assinado é exatamente o que o gatilho foi criado para impedir.
--
-- ── A CORREÇÃO ─────────────────────────────────────────────────────────────
--
-- Mais uma condição: qualquer mudança em `data_saida`, com a pessoa em status
-- de saída, também assina. Cobre preencher pela primeira vez e corrigir uma
-- data errada — nos dois casos, quem mexeu fica registrado.
--
-- ── O QUE NÃO É FEITO AQUI ─────────────────────────────────────────────────
--
-- **A assinatura que faltou não é preenchida.** Seria possível deduzir quem
-- foi — só três pessoas têm acesso, e o horário aponta para uma delas —, e
-- deduzir uma assinatura é pior que não ter nenhuma. Assinatura inventada é a
-- mesma família de defeito que este sistema passou a semana removendo: o
-- carimbo de importação virando "Chegou à igreja", o `updated_at` virando data
-- de saída.
--
-- **E ela não se recupera salvando de novo.** Medido no ensaio: reenviar a
-- MESMA data não dispara nada, porque `IS DISTINCT FROM` é falso — o Postgres
-- não vê mudança onde não há. Só uma data diferente assina.
--
-- Ou seja: aquele registro fica sem assinatura, e está certo que fique. Ele é
-- anterior à regra, como as anotações pastorais que a ficha mostra sem autor.
-- O que esta migration garante é que não se repita.
--
-- ── A TENTAÇÃO QUE FOI DESCARTADA ──────────────────────────────────────────
--
-- Assinar sempre que houvesse `data_saida` sem assinatura, em QUALQUER
-- salvamento da ficha. Resolveria o caso do Leonardo — e criaria um problema
-- pior: quem editasse o telefone dessa pessoa amanhã apareceria como quem
-- registrou a saída dela. Atribuição falsa é pior que lacuna declarada.

CREATE OR REPLACE FUNCTION public.assina_saida_do_rol()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  saiu    boolean;
  voltou  boolean;
  nome    text;
  funcao  text;
BEGIN
  -- Assina em três situações, e todas são "alguém registrou esta saída":
  --   · a pessoa acabou de receber um status de saída;
  --   · nasceu já com ele (INSERT);
  --   · a data de saída foi preenchida ou corrigida.
  saiu := NEW.status IN ('transferido', 'desligado', 'falecido')
      AND (
        TG_OP = 'INSERT'
        OR OLD.status     IS DISTINCT FROM NEW.status
        OR OLD.data_saida IS DISTINCT FROM NEW.data_saida
      );

  voltou := TG_OP = 'UPDATE'
        AND OLD.status IN ('transferido', 'desligado', 'falecido')
        AND NEW.status NOT IN ('transferido', 'desligado', 'falecido');

  -- Voltou para o rol: a assinatura da saída anterior deixa de valer. Manter
  -- o carimbo antigo faria a ficha de um membro ATIVO exibir quem o desligou.
  IF voltou THEN
    NEW.data_saida                  := NULL;
    NEW.saida_registrada_em         := NULL;
    NEW.saida_registrada_por        := NULL;
    NEW.saida_registrada_por_nome   := NULL;
    NEW.saida_registrada_por_funcao := NULL;
    RETURN NEW;
  END IF;

  IF NOT saiu THEN
    RETURN NEW;
  END IF;

  -- O nome vem do CADASTRO ligado à conta, não do auth: o login é por
  -- telefone e o e-mail é sintético (`{dígitos}@app.diakonia`).
  SELECT m.nome_completo INTO nome
    FROM public.profiles p
    JOIN public.membros  m ON m.id = p.pessoa_id
   WHERE p.id = auth.uid();

  IF nome IS NULL THEN
    SELECT p.nome INTO nome FROM public.profiles p WHERE p.id = auth.uid();
  END IF;

  SELECT string_agg(
           CASE ur.role::text
             WHEN 'admin'      THEN 'Admin'
             WHEN 'secretaria' THEN 'Secretaria'
             WHEN 'diakonia'   THEN 'Pastor titular'
             WHEN 'pastor'     THEN 'Pastor'
             WHEN 'lideranca'  THEN 'Liderança'
             WHEN 'voluntario' THEN 'Voluntário'
             ELSE ur.role::text
           END, ' · ' ORDER BY ur.role::text)
    INTO funcao
    FROM public.user_roles ur
   WHERE ur.user_id = auth.uid();

  NEW.saida_registrada_em         := now();
  NEW.saida_registrada_por        := auth.uid();
  NEW.saida_registrada_por_nome   := nome;
  NEW.saida_registrada_por_funcao := coalesce(funcao, 'Sem função');

  RETURN NEW;
END;
$$;
