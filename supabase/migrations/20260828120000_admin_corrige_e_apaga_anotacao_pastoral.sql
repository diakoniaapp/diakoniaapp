-- ─── Administrador passa a poder corrigir e apagar anotação ────────────────
--
-- ── O DEFEITO ──────────────────────────────────────────────────────────────
--
-- `visita_historico` tinha DUAS políticas e nada mais:
--
--   SELECT ... auth.role() = 'authenticated'
--   INSERT ... auth.role() = 'authenticated'
--
-- Sem UPDATE e sem DELETE, o que entrava ali não saía nunca. Enquanto a
-- tabela guardava carimbo de cadastro isso passava por decisão de projeto —
-- há até um comentário em `AcoesDoDia.tsx` dizendo "não há como desfazer".
--
-- Desde 27/08/2026 ela guarda ANOTAÇÃO PASTORAL, e a conta mudou. Anotação
-- tem erro de digitação, tem nome trocado, tem coisa escrita na pessoa
-- errada. E tinha teste: a linha "Teste" que a Telma escreveu para conferir a
-- funcionalidade só saiu porque foi apagada por fora, pela API de
-- gerenciamento. Um recurso cujo desfazer exige acesso de serviço não tem
-- desfazer.
--
-- ── SÓ ADMIN, E SÓ ANOTAÇÃO ────────────────────────────────────────────────
--
-- `is_admin()` porque apagar é a operação sem volta, e é a convenção deste
-- banco: dezenas de tabelas dão INSERT e UPDATE a vários papéis e DELETE só
-- ao admin.
--
-- E `tipo = 'anotacao_pastoral'` no USING das duas políticas, para o resto
-- continuar imutável. Carimbo de cadastro, felicitação enviada e contato
-- registrado são REGISTRO DO QUE ACONTECEU — nem o admin reescreve. Sem esta
-- cláusula, abrir a porta para consertar um texto abriria junto a de apagar
-- a prova de que alguém foi procurado.
--
-- ── O QUE ISTO ACEITA COMO CUSTO ───────────────────────────────────────────
--
-- Editar uma anotação reescreve memória, e a nova versão não guarda a antiga.
-- É deliberado: o alvo é corrigir o que se escreveu, não auditar quem mudou o
-- quê. Se um dia a igreja precisar da versão anterior, o caminho é uma tabela
-- de versões — e aí vale para a anotação inteira, não só para o admin.
--
-- A data e o autor NÃO mudam ao editar: a linha continua dizendo quem
-- escreveu aquilo e quando. Quem corrige um erro de digitação não vira autor
-- da anotação.

CREATE POLICY admin_update_anotacao ON public.visita_historico
  FOR UPDATE
  USING (public.is_admin() AND tipo = 'anotacao_pastoral')
  WITH CHECK (tipo = 'anotacao_pastoral');

COMMENT ON POLICY admin_update_anotacao ON public.visita_historico IS
  'Só o administrador, e só em anotação pastoral. O resto da tabela é '
  'registro do que aconteceu e permanece imutável — inclusive para ele.';

CREATE POLICY admin_delete_anotacao ON public.visita_historico
  FOR DELETE
  USING (public.is_admin() AND tipo = 'anotacao_pastoral');

COMMENT ON POLICY admin_delete_anotacao ON public.visita_historico IS
  'Só o administrador, e só em anotação pastoral. Carimbo de cadastro, '
  'felicitação e contato registrado não são apagáveis por ninguém.';
