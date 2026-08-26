-- ─── "Quem edita pessoa?" tinha três respostas diferentes ──────────────────
--
-- ── O DEFEITO ──────────────────────────────────────────────────────────────
--
-- Medido em 26/08/2026, ao conferir o Painel de Acessos contra o banco:
--
--   política RLS `staff_update_membros` .. admin, secretaria, diakonia,
--                                          operador, lideranca      (5)
--   permissão `editar_pessoa` (a tela) ... admin, secretaria         (2)
--   `useAuth.podeEditarPessoas` .......... admin, secretaria,
--                                          lideranca                (3)
--
-- Três mecanismos, três respostas. E a que a igreja LÊ — a tabela de
-- permissões dos perfis, em /usuarios — era a mais restritiva das três:
-- alguém abrindo a aba "Liderança" concluía que liderança não edita pessoas,
-- enquanto o banco deixava. A tela não mentia por estar errada; mentia por
-- descrever só um dos três lugares onde a regra mora.
--
-- ── A DECISÃO ──────────────────────────────────────────────────────────────
--
-- Telma, 26/08/2026: **admin, secretaria e pastor titular**.
--
-- Saem `lideranca` e `operador`. `operador` não custa nada — ninguém tem esse
-- papel. `lideranca` custa uma pessoa: o Bruno deixa de editar cadastro.
--
-- Isto REVERTE PARCIALMENTE a migration `20260820140000_lideranca_edita_pessoas`,
-- de seis dias atrás, e vale registrar por que não é contradição. Aquela
-- decisão tinha um motivo escrito nela: *"quatro dos seis usuários da igreja
-- têm o papel lideranca, e nenhum deles conseguia alterar um telefone"*.
--
-- Hoje são TRÊS usuários — um admin, uma secretaria, uma liderança. A Lourdes
-- passou de `lideranca` a `secretaria`, e os outros três acessos deixaram de
-- existir. A premissa acabou; a decisão que ela sustentava também.
--
-- ── POR QUE O PASTOR TITULAR FICA ──────────────────────────────────────────
--
-- Ele precisa gravar `observacoes_pastorais` — 7 pessoas já têm o campo
-- preenchido. RLS é por LINHA, não por coluna: não há como deixá-lo escrever
-- a observação e barrar o resto da ficha sem um gatilho por coluna. Entre
-- inventar esse gatilho e aceitar que quem cuida também corrige um telefone,
-- a segunda é mais simples e não tira nada de ninguém.
--
-- `pastor_acessa_obs_pastorais` fica, apesar de agora estar contida na
-- política abaixo. Ela é a garantia EXPLÍCITA de que o pastor escreve
-- observação: se um dia alguém restringir `staff_update_membros`, é ela que
-- impede o efeito colateral silencioso de o cuidado pastoral parar junto.
--
-- ── CRIAR ANDA COM EDITAR ──────────────────────────────────────────────────
--
-- `criar_pessoa` era admin+lideranca+secretaria e o INSERT permitia os mesmos
-- cinco papéis do UPDATE. Deixar só o UPDATE restrito produziria o pior dos
-- dois mundos: o Bruno cadastraria uma pessoa e não poderia corrigir um erro
-- de digitação um minuto depois. Quem cadastra é quem edita.

-- ── UPDATE ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS staff_update_membros ON public.membros;

CREATE POLICY staff_update_membros ON public.membros
  FOR UPDATE
  USING (
    public.has_any_role(
      (SELECT auth.uid()),
      ARRAY['admin', 'secretaria', 'diakonia', 'pastor']::app_role[]
    )
  );

COMMENT ON POLICY staff_update_membros ON public.membros IS
  'Quem edita a ficha de uma pessoa: admin, secretaria e pastor titular '
  '(diakonia/pastor). Decisão de 26/08/2026. Espelhada em '
  'role_permissoes.editar_pessoa e em useAuth.podeEditarPessoas — os três '
  'precisam mudar juntos, senão a tela volta a prometer o que o banco recusa.';

-- ── INSERT ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS staff_insert_membros ON public.membros;

CREATE POLICY staff_insert_membros ON public.membros
  FOR INSERT
  WITH CHECK (
    public.has_any_role(
      (SELECT auth.uid()),
      ARRAY['admin', 'secretaria', 'diakonia', 'pastor']::app_role[]
    )
  );

-- DELETE não é tocado: continua só de admin, como manda a convenção deste
-- banco e como a migration de 20/08 já dizia. Editar errado se conserta.

-- ── A tabela que a igreja LÊ ───────────────────────────────────────────────
--
-- Sem isto a tela continuaria dizendo "admin, secretaria" enquanto o banco
-- passa a aceitar quatro papéis — trocaríamos uma divergência por outra.
INSERT INTO public.role_permissoes (role, permissao_codigo)
VALUES ('diakonia', 'editar_pessoa'), ('pastor', 'editar_pessoa'),
       ('diakonia', 'criar_pessoa'),  ('pastor', 'criar_pessoa')
ON CONFLICT DO NOTHING;

DELETE FROM public.role_permissoes
 WHERE role = 'lideranca'
   AND permissao_codigo IN ('editar_pessoa', 'criar_pessoa');
