-- ═══════════════════════════════════════════════════════════════════════════
-- O parentesco completo na família
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Pedido dela ao ver a lista de parentesco da ficha da Diaconia: "copie
-- esses graus de parentesco para a ficha de pessoas do sistema, na hora de
-- alocá-la em famílias."
--
-- Medindo antes de mexer: `vinculos_familiares.parentesco` (o enum
-- `parentesco_tipo`) já tinha 9 valores — mas `VinculosDialog.tsx` só
-- expunha 6 no formulário. `neto`, `irmao` e `outro` já existiam no banco,
-- escondidos da tela. Faltavam de verdade só quatro: sogro(a), genro/nora,
-- sobrinho(a), cunhado(a) — que é o que este arquivo acrescenta.
--
-- O front-end (`VinculosDialog.tsx`) muda separado deste arquivo, para
-- expor os nove que já existiam mais os quatro novos.

BEGIN;

ALTER TYPE public.parentesco_tipo ADD VALUE IF NOT EXISTS 'sogro_sogra';
ALTER TYPE public.parentesco_tipo ADD VALUE IF NOT EXISTS 'genro_nora';
ALTER TYPE public.parentesco_tipo ADD VALUE IF NOT EXISTS 'sobrinho_sobrinha';
ALTER TYPE public.parentesco_tipo ADD VALUE IF NOT EXISTS 'cunhado_cunhada';

COMMIT;
