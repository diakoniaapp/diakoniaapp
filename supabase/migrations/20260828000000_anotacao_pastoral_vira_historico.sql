-- ─── A anotação pastoral deixa de ser um campo e vira histórico ────────────
--
-- ── O QUE MUDA ─────────────────────────────────────────────────────────────
--
-- `membros.observacoes_pastorais` é UM texto. Quem anota hoje apaga o que o
-- outro anotou em março, e ninguém fica sabendo: não há data, não há autor,
-- não há o que comparar. Numa igreja, a anotação de um pastor sobre uma
-- família É a memória do cuidado — e ela vinha sendo sobrescrita.
--
-- Cada anotação passa a ser uma LINHA em `visita_historico`, com data, quem
-- escreveu e em que função escreveu.
--
-- ── POR QUE UM TIPO NOVO, E NÃO O `observacao` QUE JÁ EXISTIA ──────────────
--
-- `observacao` está tomado por mensagem automática. Medido em 26/08/2026, as
-- 8 linhas desse tipo são:
--
--   "Status de acolhimento atualizado: novo → …"      (5)
--   "Contato registrado"                              (2)
--   "Respondeu"                                       (1)
--
-- Nenhuma é anotação de gente. Reaproveitar o tipo misturaria a memória
-- pastoral com o log do sistema na mesma lista, e a ficha mostraria "Anotação
-- pastoral: Status de acolhimento atualizado".
--
-- ── A FUNÇÃO FICA GRAVADA NA LINHA, E NÃO É LOOKUP ─────────────────────────
--
-- `registrado_por` guarda o id do usuário — e só está preenchido em 5 das 289
-- linhas, porque nem todo caminho de escrita o informava. Pior: papel muda. A
-- pessoa que anotou como Secretária pode ser Pastora daqui a dois anos, e a
-- ficha passaria a dizer que a Pastora escreveu aquilo.
--
-- Por isso nome e função são gravados como TEXTO no momento da escrita. É
-- desnormalizado de propósito: a anotação registra quem disse aquilo naquele
-- dia, e isso não muda depois.
--
-- ── O QUE JÁ ESTAVA ESCRITO NÃO É INVENTADO ────────────────────────────────
--
-- 9 pessoas têm texto no campo antigo. Ele NÃO é migrado para o histórico:
-- não se sabe quem escreveu nem quando, e criar uma linha com data chutada
-- seria repetir o defeito que passamos o dia consertando — data plausível e
-- falsa. A coluna fica, a ficha mostra o texto como "nota anterior ao
-- histórico", e ninguém mais escreve nela.

-- ── 1. O tipo novo ─────────────────────────────────────────────────────────
ALTER TABLE public.visita_historico DROP CONSTRAINT IF EXISTS visita_historico_tipo_check;

ALTER TABLE public.visita_historico
  ADD CONSTRAINT visita_historico_tipo_check CHECK (
    tipo = ANY (ARRAY[
      'whatsapp', 'ligacao', 'visita_presencial', 'email', 'retorno_culto',
      'evento', 'observacao', 'cadastro', 'promocao_congregado',
      'promocao_membro', 'felicitacao_aniversario', 'felicitacao_casamento',
      'felicitacao_membresia', 'felicitacao_pastorado',
      -- Anotação escrita por uma pessoa sobre o cuidado de outra. Distinta de
      -- `observacao`, que o sistema usa para registrar mudança de estado.
      'anotacao_pastoral'
    ])
  );

-- ── 2. Quem escreveu, e em que função ──────────────────────────────────────
ALTER TABLE public.visita_historico
  ADD COLUMN IF NOT EXISTS registrado_por_nome   text,
  ADD COLUMN IF NOT EXISTS registrado_por_funcao text;

COMMENT ON COLUMN public.visita_historico.registrado_por_nome IS
  'Nome de quem escreveu, gravado no momento da escrita. Texto, e não join: '
  'a conta pode ser revogada e a anotação continua precisando dizer de quem é.';

COMMENT ON COLUMN public.visita_historico.registrado_por_funcao IS
  'A função de quem escreveu NO DIA em que escreveu — "Pastor titular", '
  '"Secretaria". Congelada de propósito: papel muda, e a anotação de 2026 '
  'não pode passar a ser atribuída ao cargo que a pessoa tem em 2028.';

-- ── 3. A coluna antiga para de receber escrita ─────────────────────────────
COMMENT ON COLUMN public.membros.observacoes_pastorais IS
  'LEGADA desde 27/08/2026. Anotação pastoral virou histórico: uma linha por '
  'anotação em visita_historico, tipo anotacao_pastoral, com data e autor. '
  'As 9 pessoas que tinham texto aqui continuam com ele — a ficha o mostra '
  'como "nota anterior ao histórico" —, mas nada novo é gravado nesta coluna: '
  'um texto único apaga o que o anterior escreveu, sem deixar rastro.';
