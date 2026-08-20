-- ─── O alerta da EBD passa a ser só de progressão ──────────────────────────
--
-- `vw_ebd_alertas_idade` marcava os DOIS lados da faixa:
--
--   idade < idade_min   a pessoa é nova demais para a classe
--   idade > idade_max   a pessoa passou da idade da classe
--
-- Só o segundo é progressão, e só o segundo pede ação.
--
-- ── O CASO QUE MOSTROU O PROBLEMA ──────────────────────────────────────────
--
-- Kaila, 11 anos, matriculada em Adolescentes (12–17). O sistema apontava
-- "fora da faixa" e sugeria mover para Juniores (9–11) — ou seja, mandar uma
-- menina de volta para a classe das crianças mais novas. Ela vai fazer 12 e
-- entrar na faixa sozinha; não há nada a corrigir, e a sugestão pedia
-- exatamente o contrário de progredir.
--
-- Descer de classe pode até ser decisão da igreja em algum caso, mas não é
-- coisa que um alerta automático deva propor a partir de uma data de
-- nascimento.
--
-- ── QUANDO A PESSOA PASSOU DA FAIXA ────────────────────────────────────────
--
-- A view passa a devolver `passou_da_faixa_em`: a data do aniversário em que a
-- pessoa ultrapassou o teto da classe. É o "a partir da data de aniversário na
-- ficha" — e responde o que a idade sozinha não responde: há quanto tempo essa
-- mudança está em atraso. Um aluno que passou da faixa no mês passado e outro
-- que passou há três anos são situações diferentes.

CREATE OR REPLACE VIEW public.vw_ebd_alertas_idade AS
SELECT em.pessoa_id,
       m.nome_completo,
       m.sexo::text AS sexo,
       m.data_nascimento,
       EXTRACT(year FROM age(CURRENT_DATE::timestamp with time zone,
                             m.data_nascimento::timestamp with time zone))::integer AS idade_atual,
       em.classe_id AS classe_atual_id,
       c.nome AS classe_atual,
       sugerir_classe_ebd(m.data_nascimento, m.sexo::text) AS classe_sugerida_id,
       -- As duas novas vão no FIM: CREATE OR REPLACE VIEW exige que as colunas
       -- que já existiam mantenham nome, tipo e posição.
       c.idade_max,
       -- O aniversário em que ficou acima do teto: se o teto é 17, passou no
       -- aniversário de 18.
       (m.data_nascimento + ((c.idade_max + 1)::text || ' years')::interval)::date AS passou_da_faixa_em
  FROM ebd_matriculas em
  JOIN membros m       ON m.id = em.pessoa_id
  JOIN ebd_classes c   ON c.id = em.classe_id
 WHERE em.ativo = true
   AND m.data_nascimento IS NOT NULL
   AND c.idade_max IS NOT NULL
   -- Só quem PASSOU do teto. Quem ainda não alcançou o piso entra na faixa
   -- sozinho, com o próximo aniversário.
   AND EXTRACT(year FROM age(CURRENT_DATE::timestamp with time zone,
                             m.data_nascimento::timestamp with time zone)) > c.idade_max::numeric;

COMMENT ON VIEW public.vw_ebd_alertas_idade IS
  'Alunos que passaram da idade maxima da classe e estao prontos para progredir. NAO inclui quem esta abaixo do minimo: esse entra na faixa sozinho no proximo aniversario, e sugerir que desca de classe seria o contrario de progressao.';
