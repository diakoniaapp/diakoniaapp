-- ═══════════════════════════════════════════════════════════════════════════
-- O evento passa a saber se é transmitido, e por onde
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── O DEFEITO ──────────────────────────────────────────────────────────────
--
-- Boa parte dos eventos desta igreja acontece nos dois lugares ao mesmo tempo:
-- no templo e no canal do YouTube. O sistema não sabia disso.
--
-- A informação existe — só que como PROSA, onde nenhum código alcança.
-- Medido em produção, na descrição dos dois eventos de tipo 'live':
--
--   "Live Matinal de Oração, de segunda à sexta, às 6h30, pelo canal do
--    YouTube da Quarta Igreja Batista do Rio de Janeiro."
--
-- E o canal também já está cadastrado, em `identidade_igreja.redes_sociais`:
-- https://www.youtube.com/@qibrj, ao lado do Instagram e do Facebook. Duas
-- informações guardadas, nenhuma utilizável — e o convite que o Painel
-- Pastoral envia saía sem nenhuma forma de participar à distância.
--
-- ── POR QUE NÃO RESOLVE PELO TIPO ──────────────────────────────────────────
--
-- Existe `tipo = 'live'`, com 2 eventos. Não serve por duas razões:
--
--   · um tipo não carrega VALOR. Diria "é transmitido" e não "por onde";
--   · o tipo já tem outro trabalho — dizer o que o evento É. Um culto
--     transmitido continua sendo culto; a "Live Matinal de Oração" é um
--     encontro de oração, e chamá-la de "live" troca a natureza pelo meio.
--
-- Transmissão é ATRIBUTO, não tipo. E é exatamente assim que o módulo de
-- governança já resolveu para as reuniões: `gov_reunioes` tem `online` e
-- `link_online` desde antes. A palavra já estava no vocabulário da casa.
--
-- Com as duas colunas, os três estados caem sozinhos:
--
--   presencial  local sim, transmissão não
--   online      local não, transmissão sim
--   híbrido     os dois — que é a maioria dos cultos
--
-- ── A REGRA DO ENDEREÇO ────────────────────────────────────────────────────
--
-- `transmissao_url` preenchida vence. Vazia, o convite cai no atalho
-- permanente do canal (…/@qibrj/live), montado a partir do que já está em
-- identidade_igreja.
--
-- A distinção importa para convite enviado com antecedência, que é o caso do
-- Painel Pastoral. O atalho do canal aponta sempre para o que está NO AR: bom
-- para "assista agora", inútil na quinta-feira para o culto de domingo, quando
-- leva ao canal e não diz nada sobre domingo. Já a transmissão PROGRAMADA
-- ganha um endereço próprio no momento em que é criada, e esse abre a
-- contagem regressiva com o botão de lembrete.
--
-- Por isso a coluna existe apesar do atalho: é ela que faz o convite
-- antecipado funcionar.
--
-- ── E A SÉRIE RECORRENTE ───────────────────────────────────────────────────
--
-- Uma série é UMA linha para todas as datas (§5.6). Um endereço programado
-- posto na série apontaria todos os domingos do ano para a mesma transmissão.
-- Então: série usa o atalho do canal; a data específica que ganhar endereço
-- próprio vira exceção materializada, mecanismo que já existe.

BEGIN;

ALTER TABLE public.eventos
  ADD COLUMN IF NOT EXISTS transmissao_online boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS transmissao_url text;

COMMENT ON COLUMN public.eventos.transmissao_online IS
  'O evento e transmitido ao vivo. Independe de haver local: presencial+transmitido = hibrido.';
COMMENT ON COLUMN public.eventos.transmissao_url IS
  'Endereco da transmissao PROGRAMADA desta data. Vazio cai no atalho do canal da igreja (identidade_igreja.redes_sociais). Numa serie recorrente, preencher aqui apontaria todas as datas para a mesma transmissao — use a excecao da data.';

-- Endereço sem transmissão marcada é contradição: alguém colou o link e
-- esqueceu de ligar a chave, e o convite sairia sem ele.
ALTER TABLE public.eventos
  DROP CONSTRAINT IF EXISTS eventos_url_exige_transmissao;
ALTER TABLE public.eventos
  ADD CONSTRAINT eventos_url_exige_transmissao
  CHECK (transmissao_url IS NULL OR transmissao_online);

COMMIT;
