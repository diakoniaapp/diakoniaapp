# E-mail agregado de contribuições ao pastor — implantação (27/10/2026)

Relatório por e-mail só com números agregados (nenhum nome), sob demanda, a partir de **Comunicação e Relatórios › Relatórios › Doadores e dizimistas › Enviar por e-mail** (ou do botão "Enviar relatório" na tela Doadores, que leva o período que se está vendo).

## Como funciona
- Escolhe o período (atalhos ou personalizado; sempre a partir de 01/01/2026), digita os destinatários (até 10), **Visualizar e-mail** (obrigatório; mudar o período invalida a prévia), opcionalmente **Enviar teste para mim**, **Enviar** com confirmação.
- Quem pode: **admin e diakonia** (o pastor titular). A função confere sessão e papel por dentro.
- Os números são calculados **no servidor** com o mesmo código da tela (`_shared/contribuicoes/*`); a tela só pede período e destinatários.
- Um e-mail por destinatário, de `Diakonia <relatorios@diakoniaapp.com.br>`, com Reply-To da Identidade. O mesmo envio (período + destinatários) é recusado se repetido em 10 minutos.
- Cada envio e cada teste ficam em `comunicacao_envios` (quem pediu, para quem, período, resultado; sem o corpo do e-mail). Aparece em **Histórico**.

## Ordem de implantação
1. Aplicar `supabase/migrations/20261027180000_comunicacao_envios.sql` (rollback: `docs/COMUNICACAO_ENVIOS_ROLLBACK.sql`).
2. Publicar o app.
3. Implantar a função nova (token do Supabase colado no terminal do app; revogar depois):
   `supabase functions deploy contribuicoes-enviar --project-ref prjoftmlkusbjoeptabp` (com verificação de JWT, o padrão).
4. Testar: **Enviar teste para mim** (vai para o e-mail da sua ficha em Pessoas) e conferir o Histórico.

Sem a migration o envio funciona, mas avisa que o histórico não foi gravado. Sem a função implantada a tela diz que ela ainda não foi implantada.

## Não verificado
- O remetente `relatorios@diakoniaapp.com.br` depende de o domínio estar verificado no Resend (verifica o domínio, não a caixa): confirmar no primeiro teste.
- A aparência do e-mail em Gmail/Outlook não foi conferida visualmente (gráficos são tabelas HTML).
