# Pendentes de Identificação — Fase 3, fatia 1 (27/10/2026)

Nova aba em `/financas/doadores`: **Pendentes de identificação**. Transforma as contribuições sem pessoa em fila de trabalho.

## O que a aba faz
- **Taxa de identificação em quatro partes** (valor, quantidade e %): identificadas, anônimas, ignoradas e pendentes. Só "tem pessoa" conta como identificada. **Meta: 95%**, com barra de progresso e quanto falta em valor.
- **Fila** (desde 01/01/2026) com data, categoria, origem, valor, o **nome que veio do extrato** e a melhor **sugestão**, classificada em **fácil** (nome casa com UMA pessoa), **média** (pede confirmação) e **difícil** (sem nome ou sem candidato único). Filtros por dificuldade e origem.
- **Ações por linha:** Aceitar sugestão · Vincular pessoa · Vincular família · Anônimo · Ignorar · **Desfazer** (no aviso depois de agir, e na vista "Classificadas").
- Vincular grava `pessoa_id` (e `familia_id`) no próprio lançamento: o painel, o Excel, os relatórios e os e-mails passam a contar a pessoa sozinhos. A trilha `fin_lancamento_historico` já registra quem mudou. Só vincula se o lançamento ainda estiver sem pessoa; só desvincula se for a mesma pessoa.
- Mês fechado ou falta de permissão: a mensagem do banco aparece e a linha **não** sai da fila.
- A fila mostra nome e valor: é dado nominal. Só aparece depois de registrar o acesso (`ver_pendentes`).

## Como o nome é achado (medido em 27/10/2026)
377 pendentes (R$ 63.829,88) desde 01/01/2026: 307 do Omie (o remetente está em `observacoes`, depois de "rem", cortado e com a data colada), 54 de OFX (nome em `descricao`), 16 manuais sem texto. A sugestão usa o casamento de nomes que o sistema já tinha (`fuzzyNome`: exato, tokens, truncado, digitação, parecido) e **só sugere com um candidato**. Sem nome no extrato, não há o que sugerir.

## Banco
Migration `supabase/migrations/20261027220000_contribuicoes_triagem_de_identificacao.sql` (rollback: `docs/CONTRIBUICOES_TRIAGEM_ROLLBACK.sql`): trilha imutável `fin_contribuicao_triagem` (anônimo/ignorado/desfeita), view `fin_contribuicao_triagem_atual` (security_invoker), função `contribuicao_triar` (única porta de escrita, confere papel e que o lançamento é contribuição sem pessoa) e a ação `ver_pendentes` no registro de acessos.
**Sem a migration:** a aba não abre a fila (o registro do acesso é recusado pelo banco, e a tela avisa qual migration falta). Aplique-a antes de usar.

## Ordem
1. Aplicar a migration. 2. Publicar o app. (Sem função a reimplantar nesta fatia.)

## O que NÃO está nesta fatia
Sugestão por histórico (nenhuma descrição se repete: medido 0), gráfico da curva da fila ao longo do tempo, exportar a fila, ações em lote.
