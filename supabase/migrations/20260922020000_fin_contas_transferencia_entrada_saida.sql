-- Refinamento do item 5 (pedido da Telma, 22/09/2026, olhando a tela em
-- produção): "Transferências entre contas" como UMA flag só não bastava —
-- uma conta pode fazer sentido só RECEBER transferência (ex.: Aplicação, só
-- entra dinheiro nela por transferência) sem nunca ser ORIGEM de uma. Vira
-- duas flags: `aceita_transferencia_entrada` (pode ser destino) e
-- `aceita_transferencia_saida` (pode ser origem).
--
-- Ela já tinha personalizado `aceita_transferencias` por conta (medido
-- antes desta migration: Caixinha Administrativo = false, as outras 4 =
-- true) — então a divisão parte do valor que já estava salvo em cada
-- conta pras duas colunas novas, não do default true, pra não apagar a
-- configuração que ela já tinha feito.
ALTER TABLE fin_contas
  ADD COLUMN IF NOT EXISTS aceita_transferencia_entrada boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS aceita_transferencia_saida boolean NOT NULL DEFAULT true;

UPDATE fin_contas SET
  aceita_transferencia_entrada = aceita_transferencias,
  aceita_transferencia_saida = aceita_transferencias;

ALTER TABLE fin_contas DROP COLUMN aceita_transferencias;
