-- ─── O cumprimento de efeméride passa a caber no histórico ──────────────────
--
-- O painel HOJE vira lista de tarefas: o que já foi feito sai da tela. Para o
-- aniversário sair, é preciso registrar em algum lugar que ele foi
-- cumprimentado — e esse lugar já existe.
--
-- `visita_historico` é a tabela de contatos pastorais: 283 registros, e a
-- linha do tempo da ficha já a lê e traduz cada `tipo` para uma frase legível.
-- Um "parabéns pelos 12 anos" é um contato pastoral como qualquer outro.
--
-- O que faltava era só permissão de vocabulário: o CHECK de `tipo` tem lista
-- fechada, e recusava qualquer valor novo. Nenhuma tabela nova, nenhuma coluna
-- nova, nenhuma linha alterada — quatro palavras a mais numa lista.
--
-- Quatro e não uma porque a ficha da pessoa vai mostrar isso: "Parabéns de
-- aniversário" e "Parabéns de membresia" são acontecimentos diferentes na vida
-- de alguém, e um único `felicitacao` genérico obrigaria quem lê a adivinhar.
-- É também o que permite ao painel saber QUAL efeméride já foi cumprida quando
-- a mesma pessoa faz aniversário e completa anos de casa no mesmo dia.
--
-- Por que não `historico_membro`: as políticas de lá aceitam apenas admin,
-- secretaria e diakonia. Dos 6 usuários reais, 4 são `lideranca` — não
-- gravariam, e nem sequer leriam o que os outros gravaram. `visita_historico`
-- aceita qualquer usuário autenticado, que é o que um mural de tarefas
-- compartilhado exige.

ALTER TABLE public.visita_historico
  DROP CONSTRAINT IF EXISTS visita_historico_tipo_check;

ALTER TABLE public.visita_historico
  ADD CONSTRAINT visita_historico_tipo_check CHECK (
    tipo = ANY (ARRAY[
      -- os que já existiam, preservados na íntegra
      'whatsapp'::text,
      'ligacao'::text,
      'visita_presencial'::text,
      'email'::text,
      'retorno_culto'::text,
      'evento'::text,
      'observacao'::text,
      'cadastro'::text,
      'promocao_congregado'::text,
      'promocao_membro'::text,
      -- os quatro novos
      'felicitacao_aniversario'::text,
      'felicitacao_casamento'::text,
      'felicitacao_membresia'::text,
      'felicitacao_pastorado'::text
    ])
  );

COMMENT ON CONSTRAINT visita_historico_tipo_check ON public.visita_historico IS
  'Vocabulário de contatos pastorais. Os quatro felicitacao_* são gravados pelo painel HOJE quando alguém cumprimenta uma efeméride, e é o que faz o item sair da lista de tarefas do dia.';
