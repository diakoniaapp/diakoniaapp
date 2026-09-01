# Próxima tarefa

## Terminar a transmissão ao vivo dos eventos

O banco já mudou; falta a interface. Ordem sugerida:

1. ~~**`types.ts`**~~ — **feito em 27/08** com apoio da Supabase CLI, que também
   revelou um tipo órfão (`ebd_mover_aluno`, função já apagada do banco).

2. **`EventDialog.tsx`** — caixa "Transmitido ao vivo" e, quando marcada, o
   campo de endereço. Incluir no `EventFormPayload` e no `onSubmit` de
   `Eventos.tsx`.

3. ~~**Primeiro consumidor de `montarConvite`**~~ — **feito em 01/09**, mas
   em outro arquivo: `components/eu/AgendaDaSemana.tsx`, na Home. Ele já monta
   a mensagem inteira com quem assina (nome + função + sexo, da própria ficha),
   a igreja e o canal (`identidade_igreja`), e o endereço (`transmissao_url`
   do evento, ou `atalhoDoCanal()` do YouTube). Conferido na tela: convite
   copiado com saudação por horário, local, horário e assinatura.

   **`ConvidarParaEvento.tsx` continua com o `montarMensagem` local** — é o
   que o Painel Pastoral usa, e é a duplicação que sobra. Trocar por
   `montarConvite` é agora um recorte-e-cola do que a Home já faz.

4. **`AgendaDoDia.tsx`** — passar `transmissao_online` e `transmissao_url` ao
   `ConvidarParaEvento`.

5. Verificar na tela **sem salvar em cadastro real** — usar "Novo evento".

## Depois disso

`docs/BACKLOG.md`, item por item, na ordem em que estão.
