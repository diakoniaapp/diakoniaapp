# Próxima tarefa

## Terminar a transmissão ao vivo dos eventos

O banco já mudou; falta a interface. Ordem sugerida:

1. ~~**`types.ts`**~~ — **feito em 27/08** com apoio da Supabase CLI, que também
   revelou um tipo órfão (`ebd_mover_aluno`, função já apagada do banco).

2. **`EventDialog.tsx`** — caixa "Transmitido ao vivo" e, quando marcada, o
   campo de endereço. Incluir no `EventFormPayload` e no `onSubmit` de
   `Eventos.tsx`.

3. **`ConvidarParaEvento.tsx`** — trocar o `montarMensagem` local pelo
   `montarConvite` de `lib/agenda/convite.ts`. Buscar:
   - quem assina: `v_meu_contexto` (`nome_completo`, `funcao_ministerial`)
     mais `membros.sexo` pelo mesmo id;
   - a igreja e o canal: `identidade_igreja` (`nome_igreja`, `redes_sociais`);
   - o endereço: `transmissao_url` do evento, ou `atalhoDoCanal()` do YouTube.

4. **`AgendaDoDia.tsx`** — passar `transmissao_online` e `transmissao_url` ao
   `ConvidarParaEvento`.

5. Verificar na tela **sem salvar em cadastro real** — usar "Novo evento".

## Depois disso

`docs/BACKLOG.md`, item por item, na ordem em que estão.
