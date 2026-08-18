-- ---------------------------------------------------------------------------
-- registrar_contato: tira a execucao de quem nao esta logado
-- ---------------------------------------------------------------------------
--
-- A migracao original fez:
--
--     revoke all on function ... from public;
--     grant execute on function ... to authenticated;
--
-- e eu acreditei que isso bastava. Nao bastou. O Supabase tem privilegios
-- padrao (ALTER DEFAULT PRIVILEGES) que concedem EXECUTE de toda funcao nova
-- do schema public a anon, authenticated e service_role. Esse grant e DIRETO,
-- nao vem via PUBLIC — entao o revoke acima nao o alcancou.
--
-- Confirmado na ACL da funcao:
--
--     {postgres=X/postgres, anon=X/postgres, authenticated=X/postgres, ...}
--
-- NAO ERA EXPLORAVEL, e isso foi testado: a funcao confere o papel por dentro,
-- auth.uid() e nulo para anon, has_any_role devolve falso e a chamada termina
-- em excecao. Um anon que chamasse a funcao levava "sem permissao".
--
-- Ainda assim fica errado deixar. E uma funcao SECURITY DEFINER que escreve em
-- `membros`, exposta pelo PostgREST em /rpc/registrar_contato a qualquer um com
-- a chave publica do projeto — que e publica por definicao, vai no pacote do
-- navegador. A unica coisa entre um visitante da internet e uma escrita na
-- tabela de pessoas e uma linha de IF dentro da funcao.
--
-- Defesa em profundidade: se alguem um dia mexer nessa funcao e tirar o IF, ou
-- se has_any_role mudar de comportamento com uid nulo, o buraco abre sozinho e
-- em silencio. Tirar o privilegio custa uma linha e remove a possibilidade.
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.registrar_contato(uuid, text, text) FROM anon;

-- Confirma que `authenticated` continua podendo — e ela que o aplicativo usa.
GRANT EXECUTE ON FUNCTION public.registrar_contato(uuid, text, text) TO authenticated;
