# Correção histórica da data de pagamento

Corrige `data_pagamento` dos pagamentos já feitos pela data lida do comprovante anexado, **sem revisão manual**.
Só corrige o que é inequívoco. A documentação completa está em
[docs/CORRECAO_DATA_PAGAMENTO_COMPROVANTE.md](../../docs/CORRECAO_DATA_PAGAMENTO_COMPROVANTE.md): critérios,
exclusões, rollback e exemplos reais.

```bash
npm run correcao-data:ler        # lê os comprovantes (não grava)
npm run correcao-data:plano      # mostra o que corrige e o que não, e por quê (não grava)
npm run correcao-data:aplicar    # grava + trilha em log_auditoria
npm run correcao-data:desfazer -- --lote AAAA-MM-DD            # mostra o que desfaria
npm run correcao-data:desfazer -- --lote AAAA-MM-DD --aplicar  # desfaz
```

`saida/` fica fora do git: tem o texto dos comprovantes (nomes, contas).
