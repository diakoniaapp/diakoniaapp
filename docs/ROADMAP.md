# Roadmap

> Horizonte, não promessa. Datas só quando houver compromisso real.

## Onde estamos

Os módulos de **pessoas, acolhimento, famílias, ministérios, escalas, agenda,
EBD, organograma, permissões e LGPD** estão em uso com dado real — 294
pessoas, 75 famílias, 117 matrículas, 33 eventos.

**Financeiro, governança, fiscal, membresia, pequenos grupos e arrecadação**
existem construídos e quase sem uso: as telas estão prontas, as tabelas
vazias. Não são funcionalidades incompletas — são módulos que a igreja ainda
não começou a usar.

**PDV** tem 8 tabelas no banco e zero arquivos em `src/`.

## O tema deste ciclo: comunicação

A agenda parou de esconder eventos e passou a saber quem é transmitido. O
convite ganhou saudação, assinatura e as formas de participar. O próximo passo
natural é fechar esse laço — que a igreja consiga divulgar o que faz sem sair
do sistema.

## O que decide o próximo ciclo

Depende de qual módulo a igreja começar a usar. **Não construir mais nada
antes disso**: já há seis módulos prontos esperando adoção, e o custo de um
sétimo é maior que o de fazer um dos seis andar.

## Dívida que cresce sozinha

- **Sem CI** — cada entrega depende de alguém lembrar de rodar três comandos
- **TypeScript não estrito** — `strictNullChecks: false` em 285 arquivos
- **57 objetos do banco nunca consultados** — antes de criar qualquer coisa, conferir se já existe
