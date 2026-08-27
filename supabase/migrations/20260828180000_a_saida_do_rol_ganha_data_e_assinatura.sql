-- ─── A saída do rol ganha data e assinatura ────────────────────────────────
--
-- ── O DEFEITO ──────────────────────────────────────────────────────────────
--
-- `membro_status` tem `transferido`, `desligado` e `falecido` desde sempre, e
-- a ficha oferece os três no seletor. **Mas não havia onde guardar QUANDO a
-- pessoa saiu.** Medido em 26/08/2026: nenhuma coluna com "saida",
-- "desligamento" ou "transferencia" em `membros`.
--
-- A consequência apareceu no gráfico "Movimento de membros" do Painel
-- Pastoral: a metade de baixo — as saídas — não tinha como existir, porque
-- uma barra precisa de um ano, e não havia ano nenhum. O único registro de
-- saída do banco inteiro (um falecido) só podia ser contado como "sem data".
--
-- **`updated_at` não serve.** É a data do último salvamento de qualquer
-- campo. Usá-la como data de saída seria repetir exatamente o defeito que a
-- ficha da pessoa acabou de perder na migration `20260827220000`: um carimbo
-- técnico apresentado como fato da vida da pessoa.
--
-- ── A ASSINATURA, E POR QUE VEM DE GATILHO ─────────────────────────────────
--
-- Telma pediu, em 26/08/2026, que a alteração fosse assinada: quem registrou
-- a saída. Isso podia ser preenchido pelo formulário, como as anotações
-- pastorais fazem — e aqui não pode.
--
-- **Neste projeto o navegador fala direto com o Postgres** (AD-1 do
-- CLAUDE.md). Não há servidor no meio. Uma assinatura que o cliente escreve é
-- uma assinatura que o cliente pode omitir, ou escrever com o nome de outro.
-- Para tirar alguém do rol de membros — que é ato de assembleia — isso não
-- basta.
--
-- O gatilho abaixo carimba `auth.uid()` e `now()` sem passar pelo cliente, e
-- resolve nome e função no próprio banco.
--
-- ── POR QUE NOME E FUNÇÃO FICAM CONGELADOS EM TEXTO ────────────────────────
--
-- Mesma decisão da anotação pastoral (`20260828000000`): guardar só o `uuid`
-- e resolver o nome na leitura faria a assinatura MUDAR com o tempo. Quem era
-- secretária em 2026 pode não ser em 2031, e a ficha passaria a dizer que a
-- saída foi registrada por alguém com um cargo que essa pessoa não tinha na
-- data. Assinatura é fotografia, não consulta.
--
-- O nome sai de `profiles.pessoa_id` → `membros.nome_completo`, e não do
-- `auth.users`: o login é por telefone e o e-mail é sintético
-- (`{dígitos}@app.diakonia`). Já testado com dado real — pelo caminho do
-- `auth`, o autor saía como "5521983991229".
--
-- ── O QUE ESTA MIGRATION NÃO FAZ ───────────────────────────────────────────
--
-- **Não cria CHECK** amarrando `data_saida` a um status de saída. Seria a
-- guarda durável, e o custo de errar é alto: qualquer caminho do sistema que
-- volte alguém para `ativo` sem limpar a data passaria a FALHAR o UPDATE. Não
-- há banco de homologação neste projeto (CLAUDE.md §1.2) para varrer esses
-- caminhos com segurança. A integridade fica em dois lugares mais baratos: o
-- formulário limpa a data ao sair dos três status, e o serviço de leitura só
-- conta `data_saida` quando o status é de saída.
--
-- **Não preenche a data de ninguém.** O único falecido do banco continua sem
-- data — ninguém sabe qual é, e inventá-la seria o defeito de novo. Ele segue
-- contado como "sem ano" no gráfico até que alguém o edite.

-- ── As colunas ─────────────────────────────────────────────────────────────

ALTER TABLE public.membros
  ADD COLUMN IF NOT EXISTS data_saida                   date,
  ADD COLUMN IF NOT EXISTS saida_registrada_em          timestamptz,
  ADD COLUMN IF NOT EXISTS saida_registrada_por         uuid,
  ADD COLUMN IF NOT EXISTS saida_registrada_por_nome    text,
  ADD COLUMN IF NOT EXISTS saida_registrada_por_funcao  text;

COMMENT ON COLUMN public.membros.data_saida IS
  'Quando a pessoa deixou o rol. Só faz sentido com status transferido, '
  'desligado ou falecido. NÃO é updated_at: aquela é a data do salvamento, '
  'esta é a data do fato.';

COMMENT ON COLUMN public.membros.saida_registrada_por_nome IS
  'Nome de quem registrou a saída, CONGELADO no momento do registro. Não '
  'resolver pelo uuid na leitura: cargos mudam, e a assinatura passaria a '
  'mentir sobre quem assinou o quê.';

-- ── O gatilho da assinatura ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.assina_saida_do_rol()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  saiu       boolean;
  voltou     boolean;
  nome       text;
  funcao     text;
BEGIN
  saiu := NEW.status IN ('transferido', 'desligado', 'falecido')
      AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status);

  voltou := TG_OP = 'UPDATE'
        AND OLD.status IN ('transferido', 'desligado', 'falecido')
        AND NEW.status NOT IN ('transferido', 'desligado', 'falecido');

  -- Voltou para o rol: a assinatura da saída anterior deixa de valer. Manter
  -- o carimbo antigo faria a ficha de um membro ATIVO exibir quem o desligou.
  IF voltou THEN
    NEW.data_saida                  := NULL;
    NEW.saida_registrada_em         := NULL;
    NEW.saida_registrada_por        := NULL;
    NEW.saida_registrada_por_nome   := NULL;
    NEW.saida_registrada_por_funcao := NULL;
    RETURN NEW;
  END IF;

  IF NOT saiu THEN
    RETURN NEW;
  END IF;

  -- O nome vem do CADASTRO ligado à conta, não do auth.
  SELECT m.nome_completo INTO nome
    FROM public.profiles p
    JOIN public.membros  m ON m.id = p.pessoa_id
   WHERE p.id = auth.uid();

  -- Sem ficha ligada à conta, o nome do próprio profile serve de recurso.
  IF nome IS NULL THEN
    SELECT p.nome INTO nome FROM public.profiles p WHERE p.id = auth.uid();
  END IF;

  -- A função é a mesma etiqueta curta que a assinatura da anotação pastoral
  -- usa na tela (FUNCAO_CURTA, em PessoaCard.tsx). Repetida aqui de
  -- propósito: congelar exige resolver no momento da escrita.
  SELECT string_agg(
           CASE ur.role::text
             WHEN 'admin'      THEN 'Admin'
             WHEN 'secretaria' THEN 'Secretaria'
             WHEN 'diakonia'   THEN 'Pastor titular'
             WHEN 'pastor'     THEN 'Pastor'
             WHEN 'lideranca'  THEN 'Liderança'
             WHEN 'voluntario' THEN 'Voluntário'
             ELSE ur.role::text
           END, ' · ' ORDER BY ur.role::text)
    INTO funcao
    FROM public.user_roles ur
   WHERE ur.user_id = auth.uid();

  NEW.saida_registrada_em         := now();
  NEW.saida_registrada_por        := auth.uid();
  NEW.saida_registrada_por_nome   := nome;
  NEW.saida_registrada_por_funcao := coalesce(funcao, 'Sem função');

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.assina_saida_do_rol() IS
  'Carimba quem e quando registrou a saída de alguém do rol, sem passar pelo '
  'cliente. Limpa o carimbo quando a pessoa volta a ativo ou inativo.';

-- O nome começa com `a_` para o gatilho rodar CEDO entre os de mesma
-- temporalidade: gatilhos de mesmo timing disparam em ordem alfabética, e
-- `zzz_pastor_so_observacoes` (de `20260827200000`) precisa ver o valor final
-- para julgar o que foi alterado.
DROP TRIGGER IF EXISTS a_assina_saida_do_rol ON public.membros;
CREATE TRIGGER a_assina_saida_do_rol
  BEFORE INSERT OR UPDATE ON public.membros
  FOR EACH ROW
  EXECUTE FUNCTION public.assina_saida_do_rol();
