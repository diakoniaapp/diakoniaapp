-- APLICAÇÃO DEFINITIVA (08/10/2026, autorizada por ela): 1) índice único do Invest Fácil; 2) correção de fin_recalc_saldo_conta. GRAVA, mas nenhum DADO muda.
-- Se o passo 1 achar chave repetida ele aborta e NADA é aplicado (o editor roda o script numa transação só). Depois: docs/VERIFICACAO_POS_APLICACAO.sql.
-- Desfazer: docs/INVEST_FACIL_INDICE_UNICO_ROLLBACK.sql e docs/PARECER_SALDO_ROLLBACK.sql.

-- ══ PASSO 1 — índice único do Invest Fácil ══
-- ─── Uma linha do PDF do Invest Fácil só pode virar UMA transferência por conta, mesmo com duas abas confirmando ao mesmo tempo ─────────────
-- Defeito que previne: a Mesa de Conciliação confere a chave `[invest-pdf:…]` no banco IMEDIATAMENTE antes de gravar, mas conferir e gravar são dois
-- comandos. Duas abas (ou dois usuários) que confirmem a mesma linha no mesmo instante passam as duas pela conferência e gravam as duas: a conta
-- corrente e a de aplicação ganham uma transferência em dobro. Só o banco consegue fechar essa janela — por isso o índice único.
--
-- O que faz: cria um índice ÚNICO e PARCIAL sobre (conta_id, chave extraída da marca `[invest-pdf:CHAVE]` de `observacoes`). A chave é
-- `data:APLICACAO|RESGATE:lote:valor[#n]` (lib/investFacil.ts); a Mesa grava a marca nas DUAS pernas de cada transferência, cada uma numa conta
-- diferente — por isso a unicidade é por (conta, chave), não pela chave sozinha. O INSERT das duas pernas é um comando só: se a chave já existe em
-- qualquer conta, o banco recusa o comando inteiro (23505) e nenhuma perna é criada. "Vincular Evidência PDF" (UPDATE que acrescenta a marca a uma
-- transferência feita à mão) também fica protegido. Reimportar o mesmo PDF não é afetado: a leitura nunca grava, e a linha já registrada sai como
-- "Transferência já registrada"; o Desfazer apaga as pernas e libera a chave.
--
-- Compatível com o que existe: o índice é PARCIAL (só linhas com a marca), então nenhum lançamento antigo entra nele; medido na auditoria prévia
-- (docs/INVEST_FACIL_INDICE_UNICO_AUDITORIA.sql) — esperado 0 lançamentos marcados e 0 conflitos. O bloco aborta SEM criar nada se achar conflito.
-- Custo: a marca fica numa fração mínima da tabela (2 linhas por transferência); a criação em ~43 mil linhas leva menos de um segundo e só segura
-- ESCRITA nesse intervalo (lock_timeout de 5 s: se não conseguir o travamento, desiste em vez de enfileirar a tela do tesoureiro).
-- Limite honesto: a marca vive no texto de `observacoes`. Quem apagar o texto da observação de uma transferência tira a marca da linha — e com ela a
-- proteção (e o "já registrada") para aquela linha. É o mesmo risco das marcas `[ofx:FITID]` do resto do sistema.
-- Reversível sem tocar em dado: DROP INDEX public.fin_lancamentos_invest_pdf_chave_uq (docs/INVEST_FACIL_INDICE_UNICO_ROLLBACK.sql).
DO $migracao$
DECLARE
  conflitos text;
  valido boolean;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  -- 1. conflito existente impede o índice: aborta sem criar nada e diz quais
  SELECT string_agg(c.nome || ' · ' || d.chave || ' (' || d.n || 'x)', E'\n') INTO conflitos
    FROM (
      SELECT x.conta_id, x.chave, count(*) AS n
        FROM (SELECT conta_id, substring(observacoes from '\[invest-pdf:([^\]]+)\]') AS chave
                FROM public.fin_lancamentos WHERE observacoes LIKE '%[invest-pdf:%') x
       WHERE x.chave IS NOT NULL
       GROUP BY x.conta_id, x.chave HAVING count(*) > 1
    ) d JOIN public.fin_contas c ON c.id = d.conta_id;
  IF conflitos IS NOT NULL THEN
    RAISE EXCEPTION E'Há chaves do Invest Fácil repetidas na mesma conta — nada foi criado. Resolva (Desfazer na Mesa) e rode de novo:\n%', conflitos;
  END IF;

  -- 2. o índice
  EXECUTE $ddl$
    CREATE UNIQUE INDEX IF NOT EXISTS fin_lancamentos_invest_pdf_chave_uq
      ON public.fin_lancamentos (conta_id, (substring(observacoes from '\[invest-pdf:([^\]]+)\]')))
      WHERE observacoes LIKE '%[invest-pdf:%'
  $ddl$;

  -- 3. conferência final: o índice existe, é válido e é único
  SELECT i.indisvalid AND i.indisunique INTO valido
    FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
   WHERE c.relname = 'fin_lancamentos_invest_pdf_chave_uq' AND c.relnamespace = 'public'::regnamespace;
  IF valido IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'O índice fin_lancamentos_invest_pdf_chave_uq não ficou válido e único — nada foi mantido.';
  END IF;

  EXECUTE $c$COMMENT ON INDEX public.fin_lancamentos_invest_pdf_chave_uq IS 'Uma linha do PDF do Invest Fácil (marca [invest-pdf:CHAVE] em observacoes) só vira uma transferência por conta — fecha a corrida entre duas abas. Criado em 08/10/2026.'$c$;
END
$migracao$;

-- ══ PASSO 2 — fin_recalc_saldo_conta trava a conta antes de somar ══
-- ─── fin_recalc_saldo_conta: duas gravações simultâneas na mesma conta deixavam saldo_atual sem uma delas ───────────────────────────────
-- Defeito (reproduzido em Postgres 18 real, 08/10/2026 — ver docs/PARECER_SALDO_CONCORRENCIA.md): a função recalcula o saldo com UM comando só,
--   UPDATE fin_contas SET saldo_atual = saldo_inicial + (SELECT SUM(...) FROM fin_lancamentos ...) WHERE id = conta
-- e o gatilho `fin_lanc_saldo` a chama a cada lançamento realizado/conciliado. Com a transação A gravando e a B gravando ao mesmo tempo na MESMA conta,
-- o UPDATE da B espera o travamento da linha da conta (que a A segura); quando a A confirma, a B continua — mas a soma dela usa o retrato tirado
-- ANTES da A confirmar (o READ COMMITTED reavalia a linha travada, não a subconsulta). Resultado: as duas gravações dão certo, os dois lançamentos
-- existem, e `saldo_atual` fica sem o da A. Medido: 5 de 5 tentativas; 200 gravações simultâneas deixaram 200 contra 201 devidos.
-- Quando acontece o saldo errado persiste até o PRÓXIMO lançamento realizado/conciliado da mesma conta (o recálculo é completo, então se corrige sozinho).
--
-- Correção mínima: ANTES do UPDATE, travar a linha da conta num comando separado (`SELECT … FOR NO KEY UPDATE`). A espera acontece nesse comando;
-- o UPDATE que vem depois começa com um retrato NOVO e enxerga o que a outra transação confirmou. Mesma tabela, mesma fórmula, mesma assinatura,
-- nenhuma coluna nova. `NO KEY UPDATE` (e não `UPDATE`) é o mesmo nível de travamento que o UPDATE já pedia: não bloqueia as checagens de chave
-- estrangeira de quem insere lançamentos na conta, então não cria espera nem deadlock novos (medido: 200 gravações simultâneas, 0 deadlocks).
-- Custo: o travamento já era segurado até o fim da transação pelo próprio UPDATE; só passa a ser pedido um comando antes. Nenhum dado muda ao aplicar.
-- Reversível: docs/PARECER_SALDO_ROLLBACK.sql devolve o corpo anterior (idêntico ao de supabase/baseline/schema.sql).
CREATE OR REPLACE FUNCTION public.fin_recalc_saldo_conta(p_conta_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- 1) serializa por conta: espera a outra transação que esteja recalculando a MESMA conta terminar
  perform 1 from public.fin_contas where id = p_conta_id for no key update;
  -- 2) este comando começa DEPOIS da espera, com retrato novo: a soma enxerga tudo o que já foi confirmado
  update public.fin_contas c
     set saldo_atual = c.saldo_inicial + coalesce((
       select sum(case when l.tipo = 'entrada' then l.valor else -l.valor end)
       from public.fin_lancamentos l
       where l.conta_id = c.id
         and l.status in ('realizado','conciliado')
     ), 0)
   where c.id = p_conta_id;
end;$function$;
