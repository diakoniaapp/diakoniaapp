# Recorrências como modelo completo de lançamento

Levantamento de **06/10/2026**, sobre o código e o banco de produção (somente leitura).

## 1. O bug "só gera até dezembro de 2026" — três causas, todas no gerador SQL

Lendo o corpo de `fin_gerar_recorrencias` (`supabase/baseline/schema.sql`):

| # | Causa | Efeito |
|---|---|---|
| 1 | `p_ate_data` vazio vira `current_date + 90 dias`, e o formulário chamava a função sem data | Criada em 06/10, a série ia até ~04/01/2027. **12 parcelas viravam 3** (out/nov/dez) |
| 2 | A primeira geração "começa do mês corrente" e **ignora `data_inicio`**; se a data já passou, pula | Início 05/10 gerado em 06/10 **perdia a parcela de 05/10** |
| 3 | Só `data_fim` encerrava a série; **"N parcelas" não existia** | Parcelamento era impossível de expressar |

Confirmado nos dados: as 6 recorrências de dia 5 (sem data de fim) estão todas com `ultimo_gerado_ate = 05/12/2026`; nenhuma tem favorecido vinculado (`fornecedor_id` nulo nas 10).

**Correção:** a geração saiu do SQL e passou para o app (`src/lib/recorrencia.ts` + `src/services/recorrenciaService.ts`), onde é testável.

- Parcelamento gera **todas** as parcelas de uma vez; a contínua sem fim gera **12 meses** à frente (e o botão "Gerar próximos" repõe o horizonte).
- A série respeita `data_inicio`, conta parcelas, recua o dia 31 nos meses curtos e volta a 31 depois.
- Contínua que começou há muito tempo não despeja meses de atrasados (tolerância de 31 dias); parcelamento gera tudo, porque a pessoa escolheu a parcela inicial.
- Nunca duplica: confere por `recorrencia_id` e, para os previstos antigos, por descrição+conta+tipo (inclusive cancelados).
- **Funciona antes de aplicar a migration** (as colunas novas são sondadas; sem elas a geração segue só sem o vínculo).

**Teste obrigatório dela** (`recorrencia.test.ts` e `recorrenciaService.test.ts`): início 05/10/2026, 12 ocorrências → `05/10/2026 … 05/09/2027`, com favorecido, categoria, centro, conta e valor em cada lançamento. Também 24 parcelas a partir de 20/09/2026 → até 20/08/2028; 3, 4, 5 e 12 parcelas; parcela inicial 4 de 12.

## 2. O modelo completo

- **Favorecido obrigatório** (nas saídas) e **vinculado ao cadastro real**: fornecedor *ou* pessoa do catálogo (`fornecedor_id` / `pessoa_id`), com busca nos dois cadastros ao mesmo tempo. Os lançamentos nascem com ele.
- **Ao escolher o favorecido**: último pagamento, último valor, categoria e centro habituais, tipos de documento de costume e quantos pagamentos há (`lib/habitosDoFavorecido.ts`). Categoria, centro e valor vazios são preenchidos; nada preenchido é sobrescrito.
- **Contínua × Parcelamento**: nº de parcelas, "esta é a parcela nº" e a prévia ("vai gerar 12 parcelas: de 05/10/2026 (1/12) até 05/09/2027 (12/12)"). O cartão da recorrência mostra parcela atual, próxima, término, próximo vencimento e "gerada até".
- **Subcentro** é o mesmo campo do centro (`centro_custo_id`; o nome vem como "Administração · Serviços"), então já vai no lançamento.
- Editar a recorrência atualiza os previstos **futuros** (favorecido, categoria, centro, valor se fixo); o que já foi pago ou venceu não muda.
- Quem ainda não tem favorecido aparece com o aviso "sem favorecido vinculado".

## 3. O que depende da migration

`supabase/migrations/20261006150000_fin_recorrencias_modelo_completo.sql` (colunas `pessoa_id`, `tipo_recorrencia`, `total_parcelas`, `parcela_inicial` em `fin_recorrencias`; `recorrencia_id`, `parcela_numero`, `parcela_total` em `fin_lancamentos`; preenche `recorrencia_id` nos previstos atuais só onde a ligação é inequívoca). Sem ela: o corte em dezembro já está corrigido, mas parcelamento e favorecido-pessoa pedem a migration (o app avisa com a frase exata).
