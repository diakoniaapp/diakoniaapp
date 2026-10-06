# Auditoria da conta Investimento (Invest Fácil) — como refazer

Ferramentas usadas na auditoria de 06/10/2026 (`docs/AUDITORIA_CONTA_INVESTIMENTO_2026-10-06.md`). Não gravam nada
em lugar nenhum: leem os extratos do banco e produzem arquivos locais.

1. `extrair-extrato-pdf.mjs <extrato.pdf> <saida.txt>` — texto do "Extrato Mensal / Por Período" do Bradesco, linha a linha.
2. `extrair-fundo-do-texto.mjs <saida.txt> <fundo.json>` — as linhas `APLIC.INVEST FACIL`, `RESGATE INVEST FACIL`,
   `RENTAB.INVEST FACILCRED*` e `RESG.AUTOM.INVEST FACIL*` (data, lote, valor) e a tabela "Saldos Invest Fácil / Plus".
3. `extrair-ofx.mjs <extrato.ofx> <saida.json>` — transações do OFX (o OFX NÃO traz aplicação/resgate, só o rendimento).

Rodar com `node scripts/auditoria-investimento/<script>.mjs …`. O cruzamento com o sistema é feito no navegador,
lendo `fin_lancamentos` da conta (ver o relatório, §3 e §5, para a metodologia e as regras de conferência).
