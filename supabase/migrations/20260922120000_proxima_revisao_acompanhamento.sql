-- ─── data de próxima revisão — pastoral e Diaconia ───────────────────────
--
-- Bússola do Diakonia, seção 8 ("Quem está entrando"), extensão natural
-- registrada mas nunca construída: "todo caso de acompanhamento — pastoral
-- ou social — ganha uma data de próxima revisão, não só um status.
-- Visitante sem contato há mais de N dias, família sem reavaliação social
-- há mais de 90 dias — o mesmo mecanismo, uma vez construído, serve às
-- duas frentes." Escolhida por ela em 22/09/2026 entre três continuações
-- possíveis da Bússola.
--
-- MEDIDO antes de construir: hoje o acompanhamento pastoral (visitante) já
-- tem um "próximo passo" em texto livre (`acompanhamentos_visitante.
-- proximo_passo`), mas nenhuma DATA marcada pra isso — quem decide "falo
-- com ela de novo daqui uma semana" não tem onde guardar esse compromisso,
-- só o `status_acolhimento` calculado por dias corridos
-- (`visitantesFluxo.ts`). A Diaconia não tem nada parecido: a ficha
-- socioeconômica (`diaconia_fichas_socioeconomicas`) grava quando foi
-- preenchida, mas não quando precisa ser preenchida de novo — a intenção
-- dela nas próprias palavras, registrada no comentário de
-- `diaconiaService.ts`: "não houve acompanhamento... até pra saber se pode
-- continuar ou se já não precisa de ajuda."
--
-- Os dois campos são OPCIONAIS de propósito — ninguém é obrigado a marcar
-- uma data toda vez que registra um contato ou preenche uma ficha; quando
-- não marcam, o sistema continua funcionando exatamente como hoje (pelos
-- prazos fixos já existentes). A data só entra quando alguém escolhe
-- agendar um retorno específico.

ALTER TABLE public.acompanhamentos_visitante
  ADD COLUMN IF NOT EXISTS proxima_revisao_em date;

COMMENT ON COLUMN public.acompanhamentos_visitante.proxima_revisao_em IS
  'Quando alguém marca "falo com essa pessoa de novo em X" ao registrar um '
  'acompanhamento pastoral. Opcional — null é o normal, significa que o '
  'prazo padrão por dias corridos (visitantesFluxo.ts) continua valendo.';

ALTER TABLE public.diaconia_fichas_socioeconomicas
  ADD COLUMN IF NOT EXISTS proxima_revisao_em date;

COMMENT ON COLUMN public.diaconia_fichas_socioeconomicas.proxima_revisao_em IS
  'Quando a ficha socioeconômica precisa ser preenchida de novo — a '
  'situação de quem é assistido muda, e sem essa marca ninguém revisita de '
  'propósito. Opcional; null significa que ninguém agendou uma revisão '
  'específica ainda.';
