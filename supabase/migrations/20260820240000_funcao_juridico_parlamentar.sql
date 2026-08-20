-- ─── "Jurídico/Parlamentar" entra nas funções ministeriais ─────────────────
--
-- O cargo já existe na igreja e já aparece na tela de Estrutura, vindo do
-- regimento, com três nomes: Ana Lúcia Gomes da Silva, Denise Miranda Fanfono
-- e Felipe Lopes Pinto.
--
-- O que não existia era o valor no enum. Ou seja: a igreja tem o cargo, o
-- documento tem o cargo, a tela de Estrutura mostra o cargo — e a ficha da
-- pessoa não tinha onde registrá-lo. Quem ocupa o Jurídico aparecia como
-- "Membro" no catálogo.
--
-- ── POSIÇÃO: DEPOIS DE `auditor` ───────────────────────────────────────────
--
-- Não é escolha estética. `auditor` é o único outro cargo do regimento que é
-- CONSELHO e não diretoria — e o comentário dele em `funcaoMinisterial.ts`
-- explica por quê: "a auditoria fiscaliza a diretoria, e colocá-la dentro do
-- quadro que audita inverteria o que o organograma diz".
--
-- O Jurídico/Parlamentar tem a mesma natureza: assessora e fiscaliza, não
-- executa. Por isso entra ao lado da auditoria, e também sem nível de
-- diretoria.

ALTER TYPE public.funcao_ministerial
  ADD VALUE IF NOT EXISTS 'juridico_parlamentar' AFTER 'auditor';
