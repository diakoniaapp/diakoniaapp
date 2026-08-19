-- ─── As datas de cada função na igreja ─────────────────────────────────────
--
-- O enum `funcao_ministerial` já existia, com treze valores:
--
--   membro · voluntario · lider · pastor · professor_ebd · tesoureiro
--   secretario · evangelista · missionario · diacono · presbitero
--   coordenador · obreiro
--
-- E `membros.funcao_ministerial` já estava preenchido nas 283 pessoas — todas
-- com "membro", o padrão. Nenhuma linha do sistema lia ou escrevia o campo. É
-- de lá que vinham "Tesoureiro" e "Professor EBD" no antigo filtro de perfil
-- de acesso: alguém, um dia, misturou função na igreja com permissão de login.
-- São coisas diferentes e continuam em tabelas diferentes:
--
--   membros.funcao_ministerial   a função  — um diácono que não usa o sistema
--   user_roles.role              o acesso  — uma secretária sem função
--
-- ── UMA DATA POR FUNÇÃO ───────────────────────────────────────────────────
--
-- Decisão: cada função com a sua própria data, e não duas colunas genéricas.
-- Uma coluna chamada `funcao_desde` teria de significar consagração pastoral
-- numa linha e posse de tesoureiro na outra — e ninguém saberia, olhando o
-- banco, o que aquela data celebra.
--
--   data_consagracao_pastoral      pastor            (JÁ EXISTIA, 2 preenchidos)
--   data_ordenacao_diaconal        diácono
--   data_ordenacao_presbiteral     presbítero
--   data_consagracao_missionaria   evangelista e missionário
--
-- Os quatro são atos únicos: acontecem uma vez e não expiram.
--
-- ── VIGÊNCIA, PARA AS FUNÇÕES QUE TERMINAM ────────────────────────────────
--
-- Líder, coordenador, tesoureiro, secretário, obreiro e professor de EBD são
-- exercidos por período. Para esses vale a vigência:
--
--   funcao_inicio   quando assumiu
--   funcao_fim      quando deixou (ou vai deixar)
--
-- `funcao_fim` é HISTÓRICO, por decisão: não gera alerta, não vira pendência,
-- não aparece em nenhuma fila. Registra que a pessoa foi tesoureira de 2023 a
-- 2025, e é só isso que se pediu dela. Se um dia virar aviso de vencimento,
-- será outra decisão, tomada de propósito — e não um efeito colateral de ter
-- guardado a data.
--
-- ── POR QUE COLUNAS, E NÃO UMA TABELA DE FUNÇÕES ──────────────────────────
--
-- Uma tabela `membros_funcoes` guardaria o histórico completo: todas as funções
-- que a pessoa já teve, com começo e fim de cada um. É o desenho certo para
-- quem precisa da sucessão inteira.
--
-- Não é o caso aqui, e a diretriz da casa é não criar tabela nova enquanto o
-- que existe responde. Hoje a pergunta é "qual é a função desta pessoa e desde
-- quando" — uma linha por pessoa. No dia em que for preciso saber quem foi
-- tesoureiro antes do atual, aí sim a tabela se justifica, com esta migração
-- como ponto de partida.

alter table public.membros
  add column if not exists data_ordenacao_diaconal      date,
  add column if not exists data_ordenacao_presbiteral   date,
  add column if not exists data_consagracao_missionaria date,
  add column if not exists funcao_inicio                date,
  add column if not exists funcao_fim                   date;

comment on column public.membros.funcao_ministerial is
  'Função na igreja. NÃO é acesso ao sistema — esse vive em user_roles.role.';
comment on column public.membros.data_consagracao_pastoral is
  'Data da consagração pastoral. Só para funcao_ministerial = pastor.';
comment on column public.membros.data_ordenacao_diaconal is
  'Data da ordenação/consagração diaconal. Só para funcao_ministerial = diacono.';
comment on column public.membros.data_ordenacao_presbiteral is
  'Data da ordenação presbiteral. Só para funcao_ministerial = presbitero.';
comment on column public.membros.data_consagracao_missionaria is
  'Consagração/comissionamento. Para evangelista e missionario.';
comment on column public.membros.funcao_inicio is
  'Início da vigência das funções por período (líder, coordenador, tesoureiro, secretário, obreiro, professor de EBD).';
comment on column public.membros.funcao_fim is
  'Fim da vigência. HISTÓRICO por decisão: não gera alerta nem pendência.';
