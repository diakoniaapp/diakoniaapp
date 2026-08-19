-- ─── 123 telefones que o sistema tinha e não enxergava ─────────────────────
--
-- A tabela `membros` guarda telefone em duas colunas:
--
--     telefone_celular   94 preenchidos   ← a única que o aplicativo lê
--     telefone_e164     200 preenchidos   ← nenhuma linha de código toca
--
-- `telefone_e164` não é lido nem escrito em lugar nenhum do sistema: aparece
-- só nos tipos gerados do Supabase. Veio da importação de 02/06/2026
-- (importacao_id 0b142703-0888-4ebb-ae0c-e4c37a6af67d, que trouxe 257 dos 283
-- cadastros), e ficou ali.
--
-- Resultado medido:
--
--     tem telefone em alguma das duas       217
--     só em telefone_e164                   123   ← invisíveis
--     sem telefone nenhum                    66
--
-- Ou seja: o sistema dizia "189 pessoas sem telefone" quando são 66. Para
-- essas 123 pessoas, nenhuma tela oferecia WhatsApp, nenhuma entrava em "dá
-- para procurar", e o painel de cadastros incompletos pedia que alguém fosse
-- atrás de um número que já estava gravado na mesma linha da tabela.
--
-- ── O QUE ESTA MIGRAÇÃO FAZ ───────────────────────────────────────────────
--
-- Copia para `telefone_celular` os 123 números que só existem em
-- `telefone_e164`, no formato que o aplicativo usa: só dígitos, com DDI.
-- Conferido antes: os 123 casam com ^55 + DDD + 8 ou 9 dígitos.
--
-- ── O QUE ELA NÃO FAZ, DE PROPÓSITO ───────────────────────────────────────
--
-- 1. Não toca em quem já tem `telefone_celular`. Cinco cadastros têm as duas
--    colunas preenchidas com números DIFERENTES, e não há como saber daqui
--    qual é o certo — um deles, inclusive, está malformado (código de país
--    "21" em vez de "55"), e outro tem um fixo de um lado e um celular do
--    outro:
--
--      Andrea da Silva Santos               97637-8305  ×  99311-1791
--      Andreia Machado Conceicao            98940-5915  ×  97897-4971
--      Julia Oliveira Trindade De Souza     97234-9928  ×  2516-6035 (fixo)
--      Patricia Oliveira Da Silva Barreto   98233-3658  ×  98349-7392
--      Thalita Mordehachvili                96623-4263  ×  +21 21966234263
--
--    Escolher por conta própria seria trocar um telefone certo por um errado
--    em silêncio. Ficam como estão, para alguém da secretaria confirmar com
--    as cinco pessoas.
--
-- 2. Não preenche `telefone_e164` a partir de `telefone_celular` para os 17
--    que só têm a primeira. Alimentar uma coluna que ninguém lê é manter viva
--    a segunda fonte de verdade que criou este problema.
--
-- 3. Não apaga `telefone_e164`. Dado que se apaga não volta, e ela ainda é a
--    prova de origem destes 123 números. Quando a consolidação estiver
--    confirmada na prática, a coluna pode cair numa migração própria.

update public.membros
   set telefone_celular = replace(telefone_e164, '+', '')
 where telefone_celular is null
   and telefone_e164 is not null
   and replace(telefone_e164, '+', '') ~ '^55[1-9]{2}9?[0-9]{8}$';
