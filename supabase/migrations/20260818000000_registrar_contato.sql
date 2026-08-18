-- ---------------------------------------------------------------------------
-- Sprint 0: registrar contato deixa de falhar em silencio
-- ---------------------------------------------------------------------------
--
-- O PROBLEMA
--
-- O papel 'lideranca' enxerga as 283 pessoas e nao consegue alterar nenhuma.
-- Nenhuma das quatro politicas de UPDATE de 'membros' menciona esse papel:
--
--   staff_update_membros          admin, secretaria, diakonia, operador
--   Admin/Sec gerenciam membros   admin, secretaria
--   pastor_acessa_obs_pastorais   pastor, admin, diakonia
--   membro_edita_proprio          membro, voluntario (so a propria linha)
--
-- Ja a LEITURA passa pela politica membros_by_igreja, que nao olha papel
-- nenhum -- basta estar logado. Dai a assimetria que escondeu o defeito por
-- tanto tempo: a tela enche de gente normalmente, e a escrita nao acontece.
--
-- Quando a politica barra um UPDATE, o Postgres nao levanta erro: ele afeta
-- zero linhas e devolve sucesso. O codigo conferia apenas o erro, entao
-- seguia adiante e gravava o historico -- cuja tabela tem outra politica,
-- 'auth.role() = authenticated', que aceita qualquer usuario logado.
--
-- Resultado: existe hoje no banco um historico dizendo que alguem foi
-- contatado e uma ficha dizendo que nunca foi. As duas tabelas discordam
-- sobre quem pode escrever.
--
-- ---------------------------------------------------------------------------
-- A ESCOLHA
--
-- Havia duas saidas, ambas ensaiadas em transacao desfeita antes desta
-- migracao existir:
--
--   A) incluir 'lideranca' em staff_update_membros -- uma linha, mas daria a
--      todo lider poder de editar qualquer campo de qualquer pessoa (CPF,
--      observacoes pastorais, status).
--
--   B) esta: uma funcao que grava SOMENTE os tres campos do contato.
--
-- B foi escolhida porque separa duas coisas que o banco vinha tratando como
-- uma so: "registrar um contato" e "alterar uma pessoa". Um lider precisa da
-- primeira todo dia; se ele deve ter a segunda e uma decisao da igreja, e nao
-- deve ficar embutida numa correcao de defeito.
--
-- Nao e modulo nem tabela nova: e a peca minima que faltava para o papel que
-- mais usa o sistema conseguir fazer o que a tela ja oferecia.
-- ---------------------------------------------------------------------------

create or replace function public.registrar_contato(
  p_pessoa uuid,
  p_tipo   text,
  p_obs    text
)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_linhas integer;
begin
  -- SECURITY DEFINER contorna a politica da tabela, entao a checagem de papel
  -- passa a ser responsabilidade daqui. Pastor entra na lista porque ja tinha
  -- escrita por outra politica; lideranca entra porque e o motivo desta
  -- migracao existir.
  if not public.has_any_role(
       (select auth.uid()),
       array['admin','secretaria','diakonia','operador','pastor','lideranca']::app_role[]
     ) then
    raise exception 'sem permissao para registrar contato';
  end if;

  update public.membros
     set ultimo_contato_em         = now(),
         ultimo_contato_tipo       = p_tipo,
         ultimo_contato_observacao = nullif(btrim(coalesce(p_obs, '')), '')
   where id = p_pessoa;

  get diagnostics v_linhas = row_count;

  -- Devolve se gravou de verdade. E o que impede o chamador de anunciar
  -- sucesso sobre coisa nenhuma -- que foi exatamente o defeito original.
  return v_linhas > 0;
end;
$fn$;

comment on function public.registrar_contato(uuid, text, text) is
  'Registra contato pastoral gravando apenas ultimo_contato_em/_tipo/_observacao. Devolve false se nenhuma linha foi alterada.';

revoke all      on function public.registrar_contato(uuid, text, text) from public;
grant  execute  on function public.registrar_contato(uuid, text, text) to authenticated;
