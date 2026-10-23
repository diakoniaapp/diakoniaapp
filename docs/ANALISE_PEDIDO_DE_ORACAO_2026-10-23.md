# Pedido de Oração — o que existe, o que falta (23/10/2026)

Só análise do código e das migrations. **Não consultei o banco ao vivo** (sem login): as contagens de linhas ficam por medir.

## Resposta curta

O campo "Pedido de oração" da configuração de e-mails ao visitante é **só um link**. Não existe formulário público, página, rota, tabela nem fila de pedidos de oração **do site**. O que existe de oração está em dois lugares isolados, e nenhum usa esse link.

## 1. O que existe hoje

| Peça | Onde | Estado |
|---|---|---|
| Link "Pedido de oração" (config. de e-mails) | `visitante_mensagem_config.link_pedido_oracao`; tela `/admin/mensagens-visitante`; montagem em `_shared/mensagensVisitante/montar.ts` | **Completo como link**: se o bloco está ligado e o link preenchido, o e-mail ganha "Quer que oremos por você? Envie seu pedido:" + o link. Vazio = o bloco some. Só o admin escolhe para onde aponta (formulário externo). |
| Pedido de oração no cadastro por QR (`/bemvindo`) | `visitante_checkins`: `oracao_familia/saude/trabalho/outro` (texto), `prioridade = 1` quando há pedido, `tratado_em/por/obs` | **Funciona**: o visitante marca Família/Saúde/Trabalho/Outro (+ texto). Aparece na Central de Acolhimento (prioridade Alta, "Responder ao pedido de oração", frase em itálico) e na `FilaPastoralQr`; "Retorno feito" grava quem tratou e quando. |
| Pedidos de oração dos PGM | tabela `pgm_pedidos_oracao` (grupo, pessoa ou nome avulso, texto, visibilidade, status ativo/respondido/arquivado, resposta, data); tela `OracaoBlock` dentro de `PgmGrupo`; resumo nos relatórios de reunião | **Completo, mas por grupo**: líder registra, responde, arquiva, exclui. RLS: equipe + líder do próprio PGM. |
| Enum legado `pedidos_oracao_status_oracao_enum` ('Em Oração', 'Respondido', 'Arquivado') | migration inicial de abril | Resquício: nenhuma tabela o usa. |

O link de oração **não é usado em nenhum outro lugar** (nem páginas públicas, nem outros módulos). A tela de Boas-vindas tem "botões extras" genéricos, sem nada de oração.

## 2. O que NÃO existe

Formulário público de pedido de oração · página/rota pública · pedido anônimo × identificado · categorias gerais (só Família/Saúde/Trabalho/Outro no QR) · status Novo/Em oração/Acompanhado/Concluído · encaminhamento a intercessores (nenhum papel/cadastro de intercessor) · comentários internos · registro de testemunhos (a "resposta" do PGM é o mais próximo) · painel de acompanhamento geral · histórico além do "tratado_em/obs" do QR.

## 3. Decisão tomada nesta rodada

Pedido 6 (ocultar se incompleto): **não ocultei**. A opção funciona — se a igreja tiver um formulário externo (Google Forms etc.), o botão aparece no e-mail; esconder tiraria uma função que já presta. Para acabar com a confusão, o texto agora diz que é um **link externo** e que o DiakoniaApp ainda não tem formulário próprio (`MensagensVisitanteAdmin.tsx`). Se preferir ocultar mesmo assim, é trocar o item da lista `BLOCOS` por um filtro (10 minutos).

## 4. Módulo completo — proposta e esforço (estimativa)

Reaproveitar o que há: a mesma porta pública do `/bemvindo` (RPC `SECURITY DEFINER` + anon bloqueado nas tabelas), o padrão da fila pastoral/`tratado_*`, e o status do PGM.

1. **Banco (1 migration + ensaio):** `pedidos_oracao` (nome/contato opcionais, `anonimo`, categoria, texto, `status` novo/em_oracao/acompanhado/concluido, origem: site/QR/PGM/manual, intercessor, datas), `pedidos_oracao_comentarios`, `pedidos_oracao_testemunhos`; RLS por papel (pastoral/intercessão), RPC pública de envio com limite de abuso. **~1 dia.**
2. **Formulário público** `/oracao` (anônimo ou identificado, categoria, LGPD/aceite, confirmação): **~0,5–1 dia.**
3. **Painel interno** (lista por status, filtros, encaminhar a intercessor, comentários, testemunho, histórico) + atalho no menu e na Central de Acolhimento: **~2 dias.**
4. **Integrações:** o link do e-mail passa a apontar sozinho para `/oracao`; pedido do QR e dos PGM entram na mesma fila (ou ficam separados, decisão dela); aviso por e-mail aos intercessores: **~1 dia.**
5. **Testes + conferência na tela:** **~1 dia.**

**Total: ~5 a 6 dias de trabalho.** Uma primeira versão enxuta (formulário público + fila com status + comentários, sem intercessores nem testemunhos) cabe em **~2 a 3 dias**.

## 5. Decisões dela antes de construir

1. Pedidos do QR e dos PGM entram na mesma fila ou ficam separados?
2. Quem são os intercessores (papel novo, ou lista no cadastro de Pessoas)?
3. Pedido anônimo: ninguém da equipe vê quem enviou, ou só a liderança?
4. Quem pode ver pedido sensível (saúde, família)? Hoje o QR é visível a admin/secretaria/diakonia/pastor.
5. Testemunho pode ser publicado (mural/e-mail) ou é só registro interno?
