-- ─── fin_favoritos — atalhos fixáveis do Workspace Financeiro ───────────
--
-- Fase 12 (Workspace Financeiro), pedido dela (23/09/2026): a Home
-- Financeira ganhou uma faixa "Favoritos da Tesouraria" — atalhos que a
-- própria tesoureira fixa (a conta que confere toda hora, um fornecedor,
-- um relatório) para chegar rápido sem procurar no menu. Ela mesma
-- resumiu o porquê de ser tabela nova e não reaproveitar nada: "Favoritos
-- também pertencem ao usuário e não à área" — é pessoal de quem loga, não
-- config do sistema. MEDIDO antes de criar: nenhuma tabela, view ou coluna
-- do banco tem 'favorito', 'pin' ou 'atalho' no nome — não existia nada
-- pra reaproveitar.
--
-- `rota` guarda o caminho pronto (ex. "/financas/conta/<uuid>") em vez de
-- guardar só um id + tipo e montar a rota na hora: um favorito aponta pra
-- UM destino fixo escolhido no momento de fixar (a ficha de UM fornecedor,
-- o extrato de UMA conta), não pra uma consulta que muda de forma por
-- tipo. Se o registro referenciado for excluído depois, o favorito continua
-- existindo mas a rota pode 404 — aceitável: é só um atalho, a tesoureira
-- desfixa como qualquer outro.
CREATE TABLE public.fin_favoritos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('conta', 'fornecedor', 'relatorio', 'centro_custo', 'categoria', 'projeto', 'outro')),
  rotulo text NOT NULL,
  rota text NOT NULL,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX fin_favoritos_usuario_id_idx ON public.fin_favoritos(usuario_id, ordem);

ALTER TABLE public.fin_favoritos ENABLE ROW LEVEL SECURITY;

-- Pessoal: só o dono do favorito o vê ou mexe nele — diferente da malha
-- de equipe usada no resto do `fin_*` (fin_lancamentos, fin_fornecedores
-- etc., onde os 4 papéis financeiros enxergam tudo). Ainda assim exige um
-- papel financeiro pra gravar, senão qualquer autenticado sem acesso ao
-- módulo conseguiria criar linhas aqui.
CREATE POLICY fin_favoritos_dono ON public.fin_favoritos
  FOR ALL
  USING (usuario_id = auth.uid())
  WITH CHECK (
    usuario_id = auth.uid()
    AND has_any_role(auth.uid(), ARRAY['admin', 'diakonia', 'secretaria', 'tesouraria']::app_role[])
  );

COMMENT ON TABLE public.fin_favoritos IS
  'Atalhos fixados pela própria tesoureira na Home do Workspace Financeiro — pessoais, não compartilhados entre usuários.';
