-- ═══════════════════════════════════════════════════════════════════════════
-- Um posto recuperado do texto livre
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Depois do "critique, dê sugestões" de 03/09, medi os 135 vínculos que ainda
-- carregam `area_voluntarios.funcao` (texto livre) sem nenhum posto no
-- catálogo novo. A primeira estimativa — "48 pessoas com dado real perdido
-- de vista" — estava inflada: não tinha conferido se já existia vínculo.
-- Medindo direito, dos 135:
--
--   • 87 são só "Voluntário" — nenhuma informação a recuperar.
--   • 13 (Abertura, Transmissão×2, Baterista, Contrabaixista, Guitarrista×2,
--     Planejamento, Cozinha×4, Criador de Conteúdo) JÁ estavam ligados ao
--     posto certo — não era gap nenhum.
--   • 9 são "Líder"/"Co-líder" — conferidos um a um contra `areas.lider_id`/
--     `co_lider_id`: todos batem. Não viram posto porque liderança não é
--     posto (o catálogo recusa "Líder" por regra), e a coluna certa já tem
--     o fato.
--   • 16 são "Recepção" em pessoas da área Integração — eco do nome que a
--     área tinha ANTES da fusão de 02/09 (a Integração nasceu do que era
--     Recepção). Não diz qual dos 5 postos de hoje (Abertura, Atendimento,
--     Acolhida de visitante, Acompanhamento, Introdução) a pessoa ocupa —
--     adivinhar seria inventar o dado, não recuperá-lo. Fica para o líder.
--   • 4 são "Vocal" em pessoas da área Vocal — mesмо eco, e a área Vocal
--     ainda não tem catálogo de posto nenhum para casar contra.
--
-- Sobra UM casamento de verdade: Daniel Alves Souza, função livre
-- "Introdução", área Integração — que hoje tem um posto chamado exatamente
-- "Introdução" no catálogo. É o único caso onde o texto livre nomeia,
-- sem ambiguidade, um posto que existe.
--
-- Nasce como autodeclaração pendente, não como fato de liderança — o
-- registro vem de um campo de texto de antes da reforma, não de uma
-- confirmação de quem lidera hoje. Henrique ou a Ana Paula confirmam (ou
-- corrigem) pela tela, como fariam com qualquer outra autodeclaração.

BEGIN;

INSERT INTO public.area_voluntario_funcoes
  (area_voluntario_id, area_funcao_id, principal, origem, observacoes)
VALUES (
  'd8c38a12-0218-4112-8d9a-297f18f90324', -- Daniel Alves Souza, vínculo em Integração
  '0b2cc6c3-99c4-4fc9-bee9-9e258ed2dadc', -- posto "Introdução"
  true,
  'autodeclarada',
  'Recuperado do texto livre area_voluntarios.funcao="Introdução" em 03/09/2026 — pendente de confirmação da liderança.'
);

COMMIT;
