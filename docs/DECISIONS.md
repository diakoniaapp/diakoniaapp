# Decisões — o que foi decidido e por quê

> As decisões de ARQUITETURA (AD-1 a AD-6) estão em `../CLAUDE.md §3.2`.
> Aqui ficam as de produto e de interface, que não cabem lá.

## D-1 · Registro incompleto é aceito, mas continua pendente

Meia data de nascimento (dia/mês sem ano) pode ser gravada. **A regra da casa
continua sendo cadastro completo**: quem tem meia data aparece numa segunda
fila de pendências, dizendo o que ainda não dá para fazer.

*Por quê:* das 294 pessoas ativas, 53 não tinham data nenhuma — e o que se
perdia não era estatística, era a felicitação de aniversário. Aceitar a
metade destrava o que a igreja faz; escondê-la faria parecer resolvido.

## D-2 · Nunca inventar valor para preencher campo

Descartado preencher o ano com 1900. `idadeEm()` responderia "126 anos" com
toda a confiança, e essa idade alimenta a pirâmide etária e a regra dos 9 anos
do batismo. **Idade errada é pior que idade ausente** — a ausência já é
tratada como indecidível.

## D-3 · O número rotula o que está embaixo dele… exceto quando mede trabalho

Regra geral: contador e lista têm de bater (o cabeçalho de
`pendenciasCadastro.ts` registra o dia em que uma faixa dizia 21 sobre 22
linhas).

**Exceção decidida pela Telma:** na aba "Esperados" da EBD, o número conta só
quem está SEM classe. Quem já tem classe aparece na lista, esmaecido, e a
frase acima declara que está fora da conta. *Razão:* o número mede trabalho a
fazer, e quem já tem classe não é trabalho.

## D-4 · Transmissão é atributo, não tipo

`tipo = 'live'` não resolve: um tipo não carrega valor (diria "é transmitido",
não "por onde") e o tipo já tem outro trabalho — dizer o que o evento É. Um
culto transmitido continua sendo culto.

Duas colunas em `eventos` fazem os três estados caírem sozinhos: presencial,
online, híbrido. Mesma forma que `gov_reunioes` já usava (`online` +
`link_online`).

## D-5 · O endereço da transmissão: programado vence, canal socorre

`transmissao_url` preenchida vence; vazia cai no atalho `@canal/live`.

O atalho aponta sempre para o que está NO AR — bom para "assista agora",
inútil num convite enviado na quinta para o domingo. A transmissão programada
tem endereço próprio desde que é criada, e abre a contagem regressiva com
botão de lembrete. Numa **série recorrente** use o atalho: a série é uma linha
só, e um endereço nela apontaria todos os domingos para a mesma transmissão.

## D-6 · Não usar IA para gerar o convite, por ora

Possível, mas exigiria uma Edge Function no Supabase (chave de API no
navegador ficaria exposta) mais custo por chamada. **O gargalo não era o
texto — era o link não estar no sistema.** Resolver isso foram duas colunas.
Se depois faltar variação, a Edge Function é um passo contido, e o desenho
certo é a IA sugerir e alguém aprovar antes de enviar.

## D-7 · Aposentado é lido, nunca oferecido

Convenção herdada das funções ministeriais (`CLAUDE.md §5.2`), aplicada agora
a `tipo = 'live'`: o valor continua no enum para os registros antigos, e o
formulário para de oferecê-lo. *Pendente de confirmação da Telma.*

## D-8 · Verificar na tela, e nunca em cadastro real

Campo novo se experimenta em "Nova pessoa" / "Novo evento", que não têm
registro para estragar. Escrito depois de uma gravação escapar durante teste e
gravar um aniversário inventado numa ficha real. §1.2 do CLAUDE.md diz que não
há banco de homologação; isto é o que essa frase significa na prática.
