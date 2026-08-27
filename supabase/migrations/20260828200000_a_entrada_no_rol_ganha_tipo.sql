-- ─── A entrada no rol ganha tipo ───────────────────────────────────────────
--
-- Pedido da Telma em 27/08/2026, para melhorar a guarda do rol de membros:
-- ao lado da data de entrada, COMO a pessoa entrou.
--
--   Aclamação · Batismo · Reconciliação · Transferência
--
-- ── POR QUE ISSO IMPORTA ───────────────────────────────────────────────────
--
-- Hoje `data_entrada` diz QUANDO e o rótulo do formulário diz "Data do
-- batismo/profissão de fé" — ou seja, a tela já supõe um tipo e supõe o mais
-- comum. Para quem veio por carta de transferência de outra igreja, esse
-- rótulo está simplesmente errado, e não há onde corrigir.
--
-- É também a informação que a secretaria precisa para emitir carta e para
-- responder à assembleia "quantos batismos tivemos este ano?" — pergunta que
-- hoje não tem resposta no sistema, porque as quatro formas de entrar estão
-- somadas numa coluna só.
--
-- ── O DESENCONTRO COM O MÓDULO DE SOLICITAÇÕES ─────────────────────────────
--
-- `tipo_solicitacao_membresia` já existe e oferece como entrada: batismo,
-- **profissão de fé**, aclamação e transferência recebida.
--
-- **Aquele enum está errado, e a lista de cima é a certa.** Telma explicou em
-- 27/08/2026: *profissão de fé antecede o batismo, é pré-requisito para o
-- batismo de fato*. Não é uma quinta forma de entrar no rol — é a etapa que
-- vem antes de uma delas. Oferecê-la ao lado de "batismo" faria a secretaria
-- escolher entre duas metades do mesmo acontecimento, e a contagem de
-- batismos do ano nasceria repartida entre as duas.
--
-- O que falta naquele enum, e existe de verdade, é **reconciliação**: quem já
-- foi membro, saiu, e volta ao rol. Não há batismo novo aí.
--
-- **Não são o mesmo enum, de propósito.** Aquele descreve o PROCESSO de uma
-- solicitação (tem também os de saída, e a tabela nunca foi usada: 0 linhas);
-- este descreve o FATO gravado na ficha. Reaproveitar o outro obrigaria a
-- ficha a oferecer "transferência emitida" e "falecimento" como formas de
-- entrar.
--
-- Fica registrado que `tipo_solicitacao_membresia` precisa ser corrigido no
-- dia em que o módulo de solicitações for adotado: tirar profissão de fé da
-- lista de entradas e pôr reconciliação.
--
-- ── POR QUE NULO É PERMITIDO ───────────────────────────────────────────────
--
-- 184 membros já têm data de entrada e nenhum tem tipo — a informação existe
-- nas atas, não no banco. Exigir a coluna agora significaria inventar um tipo
-- para todos eles, e "batismo" é o palpite óbvio e errado justamente para
-- quem veio de outra igreja.
--
-- Nulo aqui quer dizer "não sabemos ainda", que é a verdade. O lugar de
-- cobrar isso é o painel da secretaria, junto das outras pendências de
-- cadastro — não uma restrição que impediria salvar qualquer ficha antiga.

CREATE TYPE public.tipo_entrada_rol AS ENUM (
  'aclamacao',
  'batismo',
  'reconciliacao',
  'transferencia'
);

COMMENT ON TYPE public.tipo_entrada_rol IS
  'Como a pessoa entrou no rol de membros. Distinto de '
  '`tipo_solicitacao_membresia`, que descreve o processo de uma solicitação '
  'e inclui os tipos de saída — ver a migration 20260828200000.';

ALTER TABLE public.membros
  ADD COLUMN IF NOT EXISTS tipo_entrada public.tipo_entrada_rol;

COMMENT ON COLUMN public.membros.tipo_entrada IS
  'Como a pessoa entrou no rol: aclamação, batismo, reconciliação ou '
  'transferência. Anda junto de `data_entrada` — uma diz quando, a outra '
  'como. Nulo significa "não registrado", e é o caso dos 184 membros que já '
  'tinham data quando a coluna nasceu.';

-- ── O que NÃO é feito aqui ─────────────────────────────────────────────────
--
-- Nenhum preenchimento retroativo, nem por inferência. Seria possível supor
-- "batismo" para quem tem data antiga, e seria a mesma família de defeito que
-- este sistema passou a semana removendo: o carimbo da importação virando
-- "Chegou à igreja", o `updated_at` virando data de saída.
--
-- Nenhuma restrição ligando `tipo_entrada` a `data_entrada`. Uma CHECK
-- exigindo os dois juntos rejeitaria o salvamento das 184 fichas antigas em
-- qualquer edição de telefone.
