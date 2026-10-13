# D4 — revisão antes de aplicar (13/10/2026)

Nada foi aplicado. Arquivos: migration `supabase/migrations/20261013120000_fin_extrato_vinculos_e_conferencia.sql` · `docs/VINCULOS_ENSAIO.sql` · `docs/VINCULOS_APLICAR.sql` · `docs/VINCULOS_ROLLBACK.sql`.
Ensaiado em Postgres real (esquema de teste): ensaio → aplicar duas vezes → gatilho → reverter, tudo OK.

---

## 1. Estrutura da tabela

`fin_extrato_vinculos` — **uma linha por vínculo** entre uma despesa e uma linha do banco.

| Coluna | Para quê |
|---|---|
| `conta_id`, `fitid` | a linha do banco (conta + identificador do extrato). **Único enquanto o vínculo estiver ativo** |
| `origem` | `ofx` ou `pdf` (o PDF do Invest Fácil) — uma característica do vínculo, na mesma tabela |
| `lancamento_id` | a linha de `fin_lancamentos` ligada. Vira vazio se a despesa for excluída (o registro **fica**) |
| `obrigacao_id` | a identidade da despesa no momento da ligação (sem chave estrangeira: é história) |
| `vinculado_em`, `vinculado_por` | quando e quem (quem gravou a marca) |
| `desfeito_em`, `desfeito_por`, `desfeito_motivo` | preenchidos **só quando o vínculo é fechado** — e sempre juntos (o banco exige) |
| `nota` | texto livre (no preenchimento inicial diz que a data é aproximada) |

**Patrimônio histórico, em prática**
- O vínculo **nunca é apagado**. Sai a marca da observação, ou a despesa é excluída/fundida → ele é **fechado** com motivo, data e usuário, e continua na tabela.
- Reabrir ou mudar o status de uma despesa **não toca** no vínculo.
- Fechado o vínculo, a linha do banco fica livre: pode ser ligada a outra despesa, e a história guarda **os dois** registros.
- O aplicativo **só lê** a tabela (RLS sem permissão de escrita): quem escreve é o gatilho. A história não pode ser adulterada pela API.

**Recusa da segunda ligação** (decisão 1): o banco impede e responde, por exemplo:
> *Esta linha do banco (N11EAA) já está ligada a outra despesa: Verisure — conciliado de 05/10/2026, R$ 278,22 (lançamento …). Uma linha do extrato só pode pertencer a uma despesa.*  Dica: *desfaça o vínculo anterior (ou use a despesa que já está ligada)…*

**Conferência** — 3 colunas novas **vazias** em `fin_lancamentos`: `conferido_em`, `conferido_por`, `conferencia_nota`. A marcação manual passa a gravá-las; desmarcar as limpa.

**Gatilhos** (decisão 2): AFTER INSERT e AFTER UPDATE (só quando há marca `[ofx:…]` ou havia) e BEFORE DELETE (só quando havia marca). Linhas sem marca — a imensa maioria — **não disparam nada**.

---

## 2. Estratégia de preenchimento inicial dos 336 vínculos

1. Antes de existir gatilho, **um único INSERT** lê cada marca `[ofx:…]` das observações e cria um vínculo: conta e FITID da marca, `origem` = `pdf` se o FITID começa com `PDF:`, senão `ofx`; `lancamento_id` = a linha; `obrigacao_id` = `COALESCE(obrigacao_id, id)`.
2. `vinculado_em` = a data de **criação** do lançamento (a data real da ligação não foi guardada — a `nota` diz que é **aproximada**); `vinculado_por` = quem gravou o lançamento, quando conhecido.
3. **Nenhum lançamento é tocado** — só nascem linhas na tabela nova.
4. Medido hoje: **336 marcas = 308 OFX + 28 PDF**, **0 chaves repetidas na mesma conta**, **0 linhas com duas marcas**. Portanto nada deve ser pulado; o ensaio **confere que entraram todas**.
5. O preenchimento é idempotente: rodar o script de aplicar duas vezes não duplica.

---

## 3. Resultado esperado do ensaio

O ensaio roda a migration inteira dentro de uma transação que é desfeita no fim e responde com um erro de propósito. A mensagem esperada é:

> **ENSAIO CONCLUÍDO (nada foi gravado) — TUDO OK, pode aplicar:**
> ANTES: **~15.661** lançamentos; **336** com marca (**308** OFX + **28** PDF); **~5.772** saídas na vw_fin_ciclo.
> DEPOIS: **336** vínculos (**308** OFX + **28** PDF), **336** ativos, **0** sem lançamento/obrigação; **0** marcas sem vínculo ativo; conferência preenchida em **0** linhas. vw_fin_ciclo devolve **exatamente o mesmo resultado de antes**.
> A linha nova com marca ganhou o vínculo. A segunda ligação foi **RECUSADA**, dizendo qual despesa usa a linha. Apagar a despesa fechou o vínculo e manteve o registro.

Qualquer divergência vem escrita como **FALHOU** e a mensagem termina com **HÁ FALHAS, NÃO aplique**. (Os números de lançamentos podem diferir de poucas unidades se algo foi lançado hoje; o que **tem** de bater é 336 = 336, 0 e "exatamente o mesmo".)

---

## 4. Impacto nos relatórios e nas telas atuais

| Onde | Efeito |
|---|---|
| **Extrato, saldo, DRE, Orçamento, Dashboard, Prestação de Contas** | **nenhum** — o `status` e os valores não mudam; nenhum lançamento é alterado |
| **Importação OFX** (linhas novas, conciliar, débito automático, liquidar pelo extrato) e **Invest Fácil** | **mesma tela, mesmo fluxo** — continuam escrevendo a marca; o vínculo nasce sozinho. Se uma linha do banco já estiver ligada a outra despesa, o erro da recusa aparece no aviso da tela. Em dados reais isso **não ocorre hoje** (0 chaves repetidas); só aconteceria numa tentativa de duplicar |
| **Fusão** ("Contas já pagas") | o vínculo do pagamento duplicado é **fechado** (despesa fundida) e a obrigação ganha o vínculo ativo — a história guarda os dois (testado) |
| **Excluir/desfazer lote** | o vínculo é fechado, nunca apagado |
| **Detalhe da despesa** | passa a mostrar: origem do vínculo (OFX/PDF), **vínculos anteriores já fechados com o motivo**, "Conferida por … em …", "Conferida (Histórico)" e "Conferida à mão — sem vínculo com o banco" |
| **Botões "Conciliar" do extrato / Mesa / Painel** | continuam gravando `status = conciliado`, **mais o carimbo de quem e quando** (é **Conferir**, não conciliar). **O rótulo do botão ainda diz "Conciliar"** — sugiro renomear para "Conferir" numa etapa à parte (é decisão de texto, não de dado) |
| **`vw_fin_ciclo`** | **mesmo resultado** (conferido no ensaio) + 4 colunas no fim: `conferido_em`, `conferido_por`, `vinculo_origem`, `vinculo_fitid`. Correção de detalhe: `tem_vinculo` deixa de ser nulo quando a observação é nula (passa a `false`) — não muda nenhum estado |
| **Antes da migration** | o aplicativo atual **continua funcionando**: sem as colunas, a marcação manual grava só o status; sem a tabela, o detalhe simplesmente não lista vínculos |
| **Desempenho** | o gatilho só dispara em linhas com marca; a tabela tem índices por conta+FITID, lançamento e obrigação |

**Riscos e reversão**
- **Risco: Médio** — o gatilho roda nas gravações que mexem em marca; a regra "uma linha do banco, uma despesa" passa a ser imposta pelo banco.
- **Reversão:** `docs/VINCULOS_ROLLBACK.sql` remove os gatilhos e devolve a view anterior. **Por padrão mantém a tabela e as colunas** (o histórico não se perde). Apagar tudo é opcional e está comentado no próprio script.
