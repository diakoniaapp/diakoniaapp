-- ─── fin_fornecedores.centro_custo_padrao_id ──────────────────────────────
--
-- Pedido da Telma (15/09/2026): leitura de nota fiscal mais precisa ao
-- lançar despesa, com categoria e centro de custo preenchidos sozinhos
-- "aguardando apenas confirmação". `categoria_padrao_id` já existia e já
-- fazia metade disso — quando o fornecedor é identificado (por CNPJ via
-- OCR, ou escolhido na lista), a categoria vem sozinha; o centro de custo
-- dependia de um segundo passo indireto (`fin_sugerir_centro_por_categoria`,
-- o centro mais usado HISTORICAMENTE para aquela categoria em geral).
--
-- "temos poucos fornecedores; e são poucos que enviam xml por email" — com
-- poucos fornecedores fixos e recorrentes, o centro de custo certo é quase
-- sempre o MESMO fornecedor→centro, não uma média da categoria inteira
-- (ex.: "OBRAMAX ATACADO DE CONSTRUÇÃO" pode ser sempre pago pelo centro
-- "Manutenção Predial", mesmo que a categoria "Material de Escritório"
-- tenha outro centro mais frequente somando todos os fornecedores juntos).
-- Este campo guarda essa memória direto no fornecedor, no mesmo padrão de
-- `categoria_padrao_id` — mesma tela (FornecedorForm), mesmo fluxo.
ALTER TABLE fin_fornecedores
  ADD COLUMN centro_custo_padrao_id uuid REFERENCES fin_centros_custo(id);

COMMENT ON COLUMN fin_fornecedores.centro_custo_padrao_id IS
  'Centro de custo lembrado por fornecedor -- preenche direto ao identificar o fornecedor, sem depender do encadeamento categoria -> centro mais comum (fin_sugerir_centro_por_categoria).';
