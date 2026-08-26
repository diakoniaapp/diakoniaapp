-- ─── "Sem telefone" não é a mesma coisa que "fora de alcance" ──────────────
--
-- ── O DEFEITO ──────────────────────────────────────────────────────────────
--
-- O aviso de cadastro conta quem está sem telefone e diz, embaixo, "a igreja
-- não tem como falar com elas". Para boa parte da lista isso é falso.
--
-- Medido em 26/08/2026, entre os 63 ativos sem telefone:
--
--   menores de 12 anos ....................... 23
--   12 anos ou mais .......................... 17
--   sem data de nascimento (idade ignorada) .. 23
--
--   das 23 crianças: têm família ............. 20
--   das 23 crianças: têm PARENTE COM TELEFONE  20
--
-- Uma criança de um mês não tem celular e nunca vai ter tão cedo. Mas a
-- igreja fala com ela — pelo telefone da mãe. Ela não está fora de alcance;
-- está na lista errada.
--
-- O estrago não é o número inflado, é o que ele faz com a lista: um alerta
-- que não zera para de ser lido. Um terço dele nunca sairia por trabalho
-- nenhum da secretaria, porque não há o que corrigir.
--
-- ── A COLUNA ───────────────────────────────────────────────────────────────
--
-- `telefone_dispensado` diz "esta pessoa não tem telefone próprio, e está
-- certo assim". Não é "já tentei" nem "ela recusou" — é a constatação de que
-- o campo não se aplica.
--
-- Serve a criança, mas não só: idoso que usa o telefone do filho, pessoa em
-- situação de rua acompanhada pela Cristolândia, qualquer um cujo contato
-- passa por outra pessoa. Por isso o nome não fala em criança — a regra é
-- "não tem telefone próprio", e criança é o caso mais comum dela.
--
-- ── A CARGA INICIAL ────────────────────────────────────────────────────────
--
-- Marca as 20 crianças que já têm parente com telefone. Poderia ser trabalho
-- manual da secretaria, e seriam 20 cliques para registrar o óbvio: o banco
-- já sabe que a mãe tem telefone.
--
-- **Não marca as outras 3.** Criança sem família registrada, ou cuja família
-- inteira está sem telefone, é lacuna de verdade — a igreja realmente não
-- tem por onde chegar nela. Essas continuam na lista, que é onde devem
-- estar; e elas também aparecem em "pessoas sem família", pelo mesmo motivo.
--
-- **Não marca ninguém com 12 anos ou mais**, nem os 23 de idade desconhecida.
-- Adolescente e adulto sem telefone é pergunta a fazer, não fato a registrar.
-- Para esses existe a caixa no formulário, marcada por quem falou com a
-- pessoa.
--
-- Doze anos é o mesmo corte que `ehCrianca` usa na tela de Pessoas. Um corte
-- só para a igreja inteira; dois seriam duas telas discordando sobre quem é
-- criança.

alter table public.membros
  add column if not exists telefone_dispensado boolean not null default false;

comment on column public.membros.telefone_dispensado is
  'Marcada quando a pessoa não tem telefone PRÓPRIO e isso está correto — '
  'criança, ou quem é contatado pelo telefone de um familiar. Tira a pessoa '
  'da pendência "sem telefone" do painel da secretaria. Não confundir com '
  '"não quis informar": esta diz que o campo não se aplica.';

-- ── Carga inicial: as crianças que já têm parente com telefone ─────────────
update public.membros m
   set telefone_dispensado = true
 where m.status = 'ativo'::membro_status
   and m.telefone_celular is null
   and not m.telefone_dispensado
   and m.data_nascimento is not null
   and m.data_nascimento > current_date - interval '12 years'
   and exists (
     select 1
       from public.vinculos_familiares v
       join public.vinculos_familiares v2
         on v2.familia_id = v.familia_id and v2.membro_id <> m.id
       join public.membros p
         on p.id = v2.membro_id
        and p.telefone_celular is not null
        and p.status = 'ativo'::membro_status
      where v.membro_id = m.id
   );
