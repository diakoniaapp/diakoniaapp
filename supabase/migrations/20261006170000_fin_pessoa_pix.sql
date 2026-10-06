-- ─── fin_pessoa_pix — a chave Pix de uma PESSOA do catálogo (para pagar folha, RPA, côngrua) ───
--
-- Pedido da Telma (06/10/2026): ao clicar em "Pagar" num lançamento de pessoa (salário, RPA), o
-- sistema gera o QR Code Pix como já faz para fornecedor. Hoje só `fin_fornecedores` tem chave
-- Pix; `membros` não tem (e não deveria: é o cadastro pastoral, com RLS própria — a tesouraria
-- não edita ali). Por isso uma tabela À PARTE, do financeiro: uma chave por pessoa, visível e
-- editável só por quem opera o financeiro (a mesma regra de todas as tabelas fin_*).
--
-- A tela funciona sem esta tabela: o diálogo "Pagar" mostra o motivo e pede a migration.

CREATE TABLE IF NOT EXISTS public.fin_pessoa_pix (
  pessoa_id      uuid PRIMARY KEY REFERENCES public.membros(id) ON DELETE CASCADE,
  chave_pix      text NOT NULL CHECK (length(btrim(chave_pix)) > 0),
  tipo_chave_pix text CHECK (tipo_chave_pix IN ('cpf','cnpj','telefone','email','aleatoria')),
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE SET NULL
);

ALTER TABLE public.fin_pessoa_pix ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fin_pessoa_pix_equipe ON public.fin_pessoa_pix;
CREATE POLICY fin_pessoa_pix_equipe ON public.fin_pessoa_pix
  AS PERMISSIVE FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]));

COMMENT ON TABLE public.fin_pessoa_pix IS
  'Chave Pix de uma pessoa do catálogo (membros), usada só para gerar o QR Code ao pagar. Fica fora de membros de propósito.';
