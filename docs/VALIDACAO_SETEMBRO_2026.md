# Setembro/2026 — o primeiro mês oficial do novo fluxo

Levantamento de 13/10/2026, somente leitura. Nada foi enviado. A regra combinada: **setembro primeiro, depois outubro; só então os meses antigos.**

## Onde setembro está hoje

146 despesas pagas em setembro (saídas, fora de transferências):

| Estado | Despesas | O que falta |
|---|---|---|
| **Pronta para Malote** | **47** | nada |
| **Aguardando conciliação** | **24** | todas na conta Bradesco: foram conferidas à mão, mas **sem vínculo com a linha do banco** |
| **Conciliada** (falta documento/comprovante) | **75** | Bradesco 38 · Caixinha 21 · Cartão 16 |

O que falta nas 99 que não estão Prontas (uma despesa pode faltar mais de uma coisa):
- **conciliação com o banco:** 24
- **comprovante:** 91 (39 só ele; 34 junto com o documento; 12 junto com a conciliação; 6 com tudo)
- **documento original:** 43

O **Fechamento** de setembro não aponta impedimento (nenhuma conta sem conciliar de forma bloqueante, nenhuma despesa sem categoria ou centro, saldo coerente); o Pacote Contábil lista **60 dossiês** e **40 saídas sem documento**.

## O achado: as 24 "aguardando" TÊM prova no banco — o sistema é que não ligou

Cruzei as 24 com o extrato OFX do Bradesco (01/09–05/10): **todas têm a linha correspondente no banco**, ainda sem vínculo. Duas causas, as duas corrigidas:

1. **8 despesas liquidadas pelo extrato** (Localiza, Claro, Tim, Prov Telecom, Prefeitura, DARF Previdenciária, Amil, AL Contabilidade): a liquidação guardou o identificador do banco em `fin_liquidacoes.ofx_fitid`, **mas o lançamento nunca recebeu a marca** — por isso o ciclo as via "sem vínculo". (A de 02/10, R$ 1.875, é do mesmo caso.)
   → **Migration `20261013140000`**: acrescenta a marca `[ofx:FITID]` às observações dessas despesas (o gatilho do D4 cria o vínculo) — **só `observacoes`, só nelas**. E o aplicativo passou a gravar a marca ao liquidar pelo extrato.
2. **16 despesas conferidas à mão** (locações, PIX de pessoas, tarifas, Claro, CBD…): a Mesa de Conciliação tratava a linha do extrato como **"já registrada, não será criada de novo"** e **nunca ligava** nada. Pior: **a CBD (R$ 260, 30/09) aparecia como lançamento NOVO** — uma duplicata a caminho.
   → **Mudança no aplicativo (já no código):** a linha do extrato que casa com uma despesa conferida sem vínculo agora vira **"Conciliar"** ("será ligada ao extrato — fica Conciliada"). Um clique grava a marca e o vínculo; o status e a data de pagamento que já existem não mudam. O caso da CBD deixou de ser "nova".

Conferido com o arquivo real: das 299 linhas de setembro no OFX, **266 já estão ligadas**, **33 viram "Conciliar"** (17 saídas + 16 entradas) e **0 viram "nova"**.

## O roteiro para validar setembro (cada passo é seu)

1. **Aplicar a migration `20261013140000`** (ensaio e script prontos) → as 8 liquidações do extrato ficam Conciliadas.
2. **Mesa de Conciliação → importar o OFX do Bradesco** (o arquivo que cobre setembro) → confirmar **"Conciliar 33"**: as 16 saídas conferidas ganham o vínculo (e as 16 entradas também; é o mesmo critério). Conferir que "Aguardando conciliação" de setembro zerou.
3. **Documentação**: Central de Documentos / Anexos para os **91 comprovantes** e **43 documentos**. Caixinha e Cartão (37 despesas) não têm extrato: valem documento + comprovante + a conferência que já existe.
4. **Fechamento → Setembro**: o "Ciclo das despesas" deve mostrar o número de Prontas crescendo. Quando você decidir que o mês está bom, **Gerar Malote** e **Registrar envio**: as Prontas de setembro ficam **Enviadas** (congeladas).
   - O que **não** estiver Pronto na hora **não** é capturado e pode ir num envio seguinte (a documentação costuma chegar depois).
5. **Depois do envio**, validar o congelamento: tentar mudar valor/categoria/centro/favorecido de uma despesa enviada deve ser recusado; anexar comprovante, conferir e vincular o extrato continuam livres.
6. **Só então** repetir com **outubro**, e por fim decidir os meses antigos.

## Decisões suas incorporadas
- **Conta da despesa NÃO congela.** Pode ser corrigida mesmo depois do envio, **mediante auditoria**: usuário, data/hora, conta anterior e conta nova (e se a despesa estava Enviada). Está na mesma migration `20261013140000`; o detalhe da despesa mostra "Conta alterada em … de X para Y". Valor, categoria, centro, subcentro, favorecido e documento principal continuam congelados.
- **Nada de enviar todos os meses de uma vez.** Setembro → outubro → só depois os mais antigos.
