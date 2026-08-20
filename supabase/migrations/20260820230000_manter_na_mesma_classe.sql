-- ─── "Manter nesta classe" — dispensar a progressão de um aluno ────────────
--
-- O alerta de progressão aponta quem passou da idade máxima da classe. Mas a
-- idade é regra, não sentença: há o adolescente que ficou mais um ano com a
-- turma onde tem amigos, o jovem de 26 que ainda está na classe de jovens
-- porque a de adultos não faz sentido para ele ainda, o aluno com deficiência
-- que acompanha melhor a turma mais nova.
--
-- Sem uma forma de dizer "este fica", o alerta reaparece para sempre. E um
-- alerta que não some vira paisagem: quem lê aprende a ignorar o bloco
-- inteiro, e no dia em que aparecer alguém que PRECISA mudar, ninguém vê.
--
-- ── A DECISÃO MORA NA MATRÍCULA, NÃO NA PESSOA ────────────────────────────
--
-- `progressao_dispensada_em` fica em `ebd_matriculas`, e não em `membros`,
-- porque a decisão é sobre esta permanência nesta classe. Se o aluno for
-- movido depois, a matrícula nova nasce sem a dispensa — e volta a ser
-- avaliado pela regra, que é o certo: a decisão anterior era sobre a classe
-- anterior.
--
-- Guarda a DATA e não um booleano: "quem decidiu manter e quando" é o tipo de
-- coisa que se pergunta seis meses depois, e um `true` não responde.

ALTER TABLE public.ebd_matriculas
  ADD COLUMN IF NOT EXISTS progressao_dispensada_em timestamptz;

COMMENT ON COLUMN public.ebd_matriculas.progressao_dispensada_em IS
  'Quando alguem decidiu que este aluno permanece na classe apesar de ter passado da idade maxima. Preenchida = fora do alerta de progressao. Some sozinha ao mover de classe, porque a matricula nova e outra linha.';

-- A view passa a respeitar a decisão.
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
       c.idade_max,
       (m.data_nascimento + ((c.idade_max + 1)::text || ' years')::interval)::date AS passou_da_faixa_em
  FROM ebd_matriculas em
  JOIN membros m       ON m.id = em.pessoa_id
  JOIN ebd_classes c   ON c.id = em.classe_id
 WHERE em.ativo = true
   AND m.data_nascimento IS NOT NULL
   AND c.idade_max IS NOT NULL
   AND EXTRACT(year FROM age(CURRENT_DATE::timestamp with time zone,
                             m.data_nascimento::timestamp with time zone)) > c.idade_max::numeric
   -- Quem foi mantido de propósito sai do alerta.
   AND em.progressao_dispensada_em IS NULL;
