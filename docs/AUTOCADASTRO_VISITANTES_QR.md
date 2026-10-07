# AutoCadastro de Visitantes por QR Code — modelagem

Proposta de **07/10/2026**, para revisão. **Nada foi aplicado.** SQL em rascunho (com ensaio de 8 casos):
[AUTOCADASTRO_VISITANTES_QR.sql](AUTOCADASTRO_VISITANTES_QR.sql) · [ENSAIO](AUTOCADASTRO_VISITANTES_QR_ENSAIO_FUNCIONAL.sql).

## 1. O fluxo

**Recepção → QR Code → página pública → cadastro automático → acompanhamento pastoral.**

1. A recepção exibe/imprime o QR (tela "Recepção", com o QR do ponto *Recepção*).
2. O visitante lê com a câmera do celular e cai numa página pública, sem login, de uma coluna só, para preencher em menos de 1 minuto.
3. Ao enviar, uma única função do banco valida, grava e responde só "visita registrada".
4. A pessoa aparece em **Visitantes de hoje** (recepção) e na **fila pastoral** (quem pediu oração primeiro, depois quem pediu contato).

Ao enviar, a tela mostra o texto que você definiu: *"Obrigado por sua visita! Foi uma alegria receber você na Quarta Igreja Batista do Rio de Janeiro. ✅ Sua visita foi registrada."*

## 2. O que já existe e é reaproveitado (nada disso muda de significado)

| Já existe | Como entra |
|---|---|
| `membros` com `tipo_pessoa = 'visitante'` | o visitante novo nasce **aí**, igual ao cadastro de hoje (mesma ficha, mesmo `MembroForm`, mesmo acolhimento) |
| `visitas` (data, origem, observações) | cada preenchimento vira uma linha: **Visita 1, 2, 3…**, com `origem = 'qr_code'` |
| `membros.numero_visitas` e `status_acolhimento` | o fluxo de acolhimento atual (boas-vindas, incentivo, cuidado, "retornou" a partir da 2ª visita) continua valendo sozinho |
| `consentimento` | o aceite LGPD fica registrado, com canal `qr_code` |
| `acompanhamentos_visitante` | quem pede oração ou contato entra como *pendente* na tela de acompanhamento que já existe |
| `normalizar_telefone()` | o mesmo telefone canônico (`55DDDNÚMERO`) usado em todo o sistema |
| `como_conheceu`, `convidado_nome` | as respostas do formulário caem nos campos atuais (o nome de quem convidou vai em `convidado_nome`, o campo de texto livre que já existe; `quem_convidou` é um vínculo com outro membro) |

## 3. O que se acrescenta

| Peça | Para quê |
|---|---|
| `visitante_pontos` | o QR em si: um código aleatório de 32 caracteres, que **não se adivinha**, pode ser desligado e **trocado se vazar** (a recepção cria um novo) |
| `visitante_sessoes` | "culto/evento de hoje", escolhido pela recepção (opcional). Sem escolha, o culto é deduzido do dia e da hora (ex.: *Culto de domingo (noite)*) |
| `visitante_checkins` | o registro de cada preenchimento: culto/evento, origem, primeira visita?, quer contato?, quer informações?, os pedidos de oração, quem convidou, WhatsApp, e se a equipe já deu retorno |
| `membros.whatsapp_celular` | o WhatsApp quando é diferente do telefone (hoje só existe um número) |
| `visitante_autocadastro()` | a **porta única** da página pública |
| 2 views | *Visitantes de hoje* e *Aguardando contato* (a fila pastoral) |

## 4. Os campos do formulário (do cartão físico) e para onde vão

- **Dados pessoais:** nome completo*, data de nascimento, telefone*, WhatsApp, endereço. (* É obrigatório o nome e **um** número, telefone ou WhatsApp, para reconhecer quem volta. O restante é opcional, para caber em 1 minuto.)
- **Como conheceu:** Convite de Familiar/Amigo (abre "Quem convidou você?") · Redes Sociais · Evento/Campanha · Sou da Vizinhança · Outro (abre um campo de texto).
- **Pedidos de oração:** Família · Saúde · Trabalho · Outro (abre campo de texto).
- **Novos:** É sua primeira visita? · Deseja receber contato pastoral? · Deseja receber informações da igreja? (Sim/Não).
- **Aceite:** uma caixa de concordância com o uso dos dados (obrigatória; ver §6).

## 5. Visitante que volta

Se o telefone ou o WhatsApp já existe, **não se cria outra pessoa**: registra-se só a **nova visita** (Visita 2, 3…) e `numero_visitas` sobe.

- Reenviar o mesmo formulário no mesmo culto **não** vira duas visitas.
- Quem sabe o telefone de um visitante **não consegue reescrever a ficha dele**: só se preenche o que estava vazio.
- Se o número é de um **congregado ou membro**, a ficha não muda; fica só o registro do check-in (aparece rotulado na recepção).
- A tela **nunca diz** "este telefone já está cadastrado": responde igual nos dois casos. Assim o formulário não vira consulta de quem é da igreja.

## 6. Segurança e LGPD (o ponto mais delicado)

A página é **pública**: qualquer pessoa com o link pode enviar. Por isso:

- O anônimo **não ganha acesso a nenhuma tabela**. Continua bloqueado em `membros`, `visitas`, `consentimento` etc. Ele só chama uma função, que devolve `{ok, visita, novo}` (nunca ids nem dados de ninguém).
- **Freios:** código do QR obrigatório e desligável; no máximo 40 preenchimentos a cada 10 minutos; validação de tamanho, telefone e data; o mesmo envio repetido não duplica.
- **Limite honesto:** o QR é público por natureza (está impresso). Alguém mal-intencionado com o link pode enviar cadastros falsos até o freio (40 por 10 min). O remédio é desligar e trocar o código. Um *captcha* (Cloudflare Turnstile) resolveria de vez, mas depende de uma conta externa; fica como evolução se houver abuso.
- **Dados sensíveis:** pedido de oração de **saúde** e crença religiosa são dados sensíveis (LGPD, art. 11). Por isso o aceite é específico ("uso dos meus dados e pedidos de oração para contato e acompanhamento pastoral"), e a leitura dos pedidos fica restrita a quem acompanha visitantes (admin, secretaria, diakonia/pastor titular, pastor). **Não** vão para o painel de recepção: a recepção vê só "pediu oração".
- Menores de idade: a pergunta de nascimento é opcional; se vier de menor, o contato pastoral deve ser com o responsável. Fica como regra de acompanhamento.

## 7. Painéis

- **Visitantes de hoje** (recepção): quem se cadastrou pelo QR hoje, atualizando sozinho a cada poucos segundos, com selo de *novo* ou *voltou (visita N)*, e se pediu oração/contato.
- **Aguardando contato** (pastoral): todo visitante novo que ainda não recebeu retorno, em ordem de prioridade: **1** pediu oração · **2** quer contato pastoral · **3** os demais. Sai da fila quando a equipe marca como tratado, **ou** quando já há contato registrado na ficha depois do check-in (reaproveita o "registrar contato" de hoje).

## 8. Preparado para o futuro (sem construir agora)

WhatsApp (o número e o *aceite de receber informações* já ficam guardados) · acompanhamento pastoral (a fila e o `tratado_em`) · conversão para congregado e membresia (a ficha é a mesma de sempre: mudar `tipo_pessoa` continua sendo o caminho de hoje).

## 9. Decisões que preciso de você

1. **Culto/evento:** a recepção escolhe o "culto de hoje" numa lista rápida (Culto de domingo manhã/noite, etc.), ou deixo só a dedução automática por dia e hora? Preciso saber os **horários dos cultos** para a dedução (hoje assumi: antes das 12h = manhã, até 18h = tarde, depois = noite).
2. **Quem vê a fila e os pedidos de oração:** admin, secretaria, diakonia (pastor titular) e pastor, como na tabela de visitas. Mais alguém (por ex. a liderança de acolhimento)? Menos alguém?
3. **"É sua primeira visita?":** guardo só o que o visitante respondeu. Se ele disser "Não" e não existir cadastro, não invento visita anterior (`numero_visitas` continua 1). Combinado?
4. **Obrigatoriedade:** nome + um número obrigatórios, resto opcional. Quer exigir também a data de nascimento ou o endereço?
5. **Texto do aceite:** proponho *"Concordo que a Quarta Igreja Batista do Rio de Janeiro use meus dados e pedidos de oração para contato e acompanhamento pastoral."* Quer ajustar?

## 10. Fases

| Fase | Entrega |
|---|---|
| 1 | Migration (tabelas, função, views) — **você revisa o SQL, eu entrego o ensaio, você aplica** |
| 2 | Página pública `/visitante` (mobile, < 1 minuto) e a tela da recepção com o QR |
| 3 | Painel *Visitantes de hoje* + fila *Aguardando contato* na tela de visitantes |
| 4 | Ligar à ficha: "Visita 1, 2, 3", WhatsApp com a mensagem de boas-vindas existente, marcar como tratado |

## 11. Riscos

- **Cadastro duplicado por número diferente:** a mesma pessoa com outro telefone vira outra ficha. A equipe junta à mão (como hoje); não há deduplicação por nome, para não fundir pessoas diferentes.
- **Migration não ensaiada:** a função grava em várias tabelas. O ensaio de 8 casos (visitante novo, volta, não reescreve a ficha, membro intocado, entradas inválidas, freio, anônimo sem leitura, fila) roda com `BEGIN/ROLLBACK` antes de valer.
- **Constraints desconhecidas:** não consegui ler o esquema de `membros` e `consentimento` hoje; se alguma coluna obrigatória faltar na função, o ensaio acusa com o texto do erro.
