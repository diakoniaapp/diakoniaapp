-- ─── PIX no cadastro — tipo da chave em fornecedor, e PIX em contratado ──
--
-- Fase 7 do roadmap Financeiro, pedido dela (22/09/2026, "Central
-- Financeira Diakonia").
--
-- MEDIDO antes de construir (22/09/2026): `fin_fornecedores.chave_pix`
-- existe desde sempre — 1 de 322 fornecedores tem a chave preenchida.
-- Não tem `tipo_chave_pix`: quem olha o cadastro vê uma string solta,
-- sem saber se é CPF, CNPJ, telefone, e-mail ou chave aleatória — e o
-- payload do BR Code ("copia e cola") precisa saber o tipo pra formatar
-- certo.
--
-- `fin_contratados` (funcionário/pastor/RPA/MEI/prebenda) **não tem
-- nenhum campo de PIX ou dado bancário** — gap real, achado nesta
-- auditoria. O funcionário/pastor que recebe salário ou prebenda não
-- tinha como ser pago por PIX pelo sistema; a informação vivia fora
-- (planilha, papel, WhatsApp) — exatamente o problema que "Central
-- Financeira" pede para fechar. Espelha os mesmos campos que
-- `fin_fornecedores` já tem, pelo mesmo motivo (Fase 4.1 do roadmap).

ALTER TABLE public.fin_fornecedores
  ADD COLUMN IF NOT EXISTS tipo_chave_pix text
    CHECK (tipo_chave_pix IN ('cpf', 'cnpj', 'telefone', 'email', 'aleatoria'));

COMMENT ON COLUMN public.fin_fornecedores.tipo_chave_pix IS
  'Tipo da chave em chave_pix — necessário para montar o payload do BR '
  'Code (PIX copia e cola / QR Code) corretamente. Opcional, como a '
  'própria chave: null enquanto ninguém preencheu.';

ALTER TABLE public.fin_contratados
  ADD COLUMN IF NOT EXISTS chave_pix text,
  ADD COLUMN IF NOT EXISTS tipo_chave_pix text
    CHECK (tipo_chave_pix IN ('cpf', 'cnpj', 'telefone', 'email', 'aleatoria')),
  ADD COLUMN IF NOT EXISTS banco_nome text,
  ADD COLUMN IF NOT EXISTS agencia text,
  ADD COLUMN IF NOT EXISTS conta text;

COMMENT ON COLUMN public.fin_contratados.chave_pix IS
  'Chave PIX de quem recebe (funcionário, pastor, RPA, MEI) — mesmo '
  'campo que fin_fornecedores.chave_pix, espelhado aqui porque um '
  'contratado não é um fornecedor (é gente ligada a folha/prebenda, não '
  'compra/serviço avulso). Opcional.';
