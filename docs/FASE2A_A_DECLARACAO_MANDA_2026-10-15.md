# Fase 2A — A Declaração manda (15/10/2026)

> Pedido: "qualquer mudança em informação que conste na declaração deve invalidá-la" e "a aprovação deve cair sempre que a declaração for invalidada"; histórico imutável de edição para **todos** os lançamentos; editar a nota continua permitido, **com confirmação, motivo e aviso claro**.
> Estado: **código e migration commitados; NADA aplicado em produção, nada publicado.** Ordem: (1) Matriz de Ofertas (`docs/QUITACAO_OFERTA_APLICAR.sql`) → (2) ensaio desta fase → (3) APLICAR desta fase → (4) publicar o código.
> Arquivos: migration `20261016170000_fin_declaracao_manda.sql` · `docs/DECLARACAO_MANDA_ENSAIO.sql` · `docs/DECLARACAO_MANDA_APLICAR.sql` · `docs/DECLARACAO_MANDA_ROLLBACK.sql`.

## 1. O que estava errado (medido no código e no banco em 15/10/2026)

| # | Defeito | Onde |
|---|---|---|
| 1 | O grau "Formal" da intenção valia só porque **existe um anexo** `declaracao_terceiro`, mesmo depois de nota, valor, fornecedor ou data mudarem. O estado `desatualizada` já existia (`fin_declaracao_estado`), mas **nada o usava**. | `fin_quitacao_grau_conjunto`, `fin_quitacao_entrada` |
| 2 | A aprovação só caía quando a **quitação** mudava; editar a **nota** (valor, fornecedor, número, chave, data) não derrubava aprovação nenhuma. | `fin_quitacao_aprovacoes` |
| 3 | `projeto_id` não era congelado depois do envio à contabilidade. | `fin_lanc_congela_atualizar` |
| 4 | Editar um lançamento não deixava rastro do antes e do depois (só "quem mexeu por último"). | `fin_lancamentos.audit_*` |
| 5 | Nomes de quem agiu saíam **em branco** para a Tesouraria (a tabela `profiles` só deixa cada um ler o próprio nome). Medido: `reaberturas` e `contasAlteradas` devolviam `por: null` sempre. | `cicloDaDespesaService`, `quitacaoService` |

## 2. As decisões dela, como ficaram

| Decisão | Como foi feita |
|---|---|
| Histórico para **todos** os lançamentos | `fin_lancamento_historico`, alimentada por gatilho para qualquer lançamento: valor, data, fornecedor, favorecido, categoria, centro, projeto, conta, número e chave da nota. |
| Declaração **externa** só vale se posterior à última alteração | `fin_quitacao_tipos_validos`: a declaração anexada à mão e o pedido de reembolso só contam se `enviado_em` é depois da última alteração da quitação ou invalidação. |
| Editar a nota: **permitir, com confirmação, motivo e aviso** | Diálogo no formulário ("Esta alteração invalidará a declaração atual e cancelará quaisquer aprovações relacionadas."), motivo ≥ 5 caracteres; **o banco também recusa sem motivo**. |
| Todo dado da declaração invalida | Intenção, quem pagou, forma e data do pagamento, declarante, **chave PIX**, cadastro do fornecedor → pelo **selo** (hash do "declarado", o mesmo código impresso na Declaração). Valor, fornecedor, número, chave e data da nota → também pelo **gatilho de edição**, que grava o evento `declaracao_invalidada`. |
| Estorno conciliado, Anular, Mudar Intenção | Fases 2B–2D (não nesta entrega). |

## 3. Desenho técnico

1. **`fin_quitacao_tipos_validos(q)`** — os tipos de anexo que *provam*, sem as declarações que não valem: a gerada pelo sistema só vale com estado `assinada` (via mais nova = registro de hoje); a externa e o pedido de reembolso, só se posteriores à última alteração. `fin_quitacao_grau_conjunto` e `fin_quitacao_entrada` passam a usá-la; **`fin_quitacao_avaliar` (a Matriz) não muda uma linha**. Sem declaração vigente a intenção volta a **Relatado** e a Matriz decide o resto.
2. **Selo da aprovação** — `fin_quitacao_selo(q)` = hash dos fatos declarados (se a declaração ainda não é gerável, hash de um resumo dos mesmos fatos). Um gatilho `BEFORE INSERT` em `fin_quitacao_eventos` grava o selo em **toda** decisão de aprovação. `fin_quitacao_aprovacoes` só dá a decisão por vigente se (a) é posterior à última mudança (registro, alteração **ou invalidação**) **e** (b) o selo de hoje é igual ao da decisão. Devolve também `reembolso_caiu` / `relatado_caiu`, e a tela avisa "a aprovação dada por X em D **deixou de valer**".
   *Consequência desejada:* assinar a nova via **não ressuscita** a aprovação antiga — é preciso decidir de novo, sobre os fatos novos.
3. **Gatilho de edição** `fin_lanc_historico_declaracao` (`BEFORE UPDATE`): grava a trilha; se a edição muda um dado declarado e a quitação (reembolso ou oferta) já tem declaração, anexo declaratório ou aprovação → exige o motivo (usuário do aplicativo) e grava o evento `declaracao_invalidada` (campos, antes e depois, motivo, quem). Rotinas de manutenção (sem usuário) passam, com o motivo "rotina sem motivo informado". O motivo viaja no mesmo `UPDATE` pela coluna-canal `fin_lancamentos.motivo_edicao`, que o gatilho **zera** (nunca fica gravada).
4. **Reavaliação na hora** — `fin_lanc_declaracao_sincroniza` (`AFTER UPDATE`) chama `fin_quitacao_sincronizar`: a oferta extinta cuja declaração caiu **volta a "previsto"** na hora (evento `extincao_desfeita`), sem esperar o agendador; ao assinar a nova via, volta a ser extinta.
5. **Projeto congelado** depois do envio (função e gatilho `fin_lanc_congela_*`).
6. **Nomes** — `fin_nomes_dos_usuarios(uuid[])` (RPC, só equipe do financeiro; cai para o nome da pessoa vinculada quando o perfil não tem nome) e, no gatilho, o nome **gravado na hora** (`por_nome`). Usado em: eventos da quitação, reaberturas, trocas de conta, conferência, remessa missionária e na trilha.
7. **`fin_impacto_edicao(lancamento, patch)`** — a tela pergunta, antes de salvar, o que a edição invalidaria (campos, estado da declaração, se derruba aprovações).

**Não é edição de valor** a baixa parcial/total (o `valor` vira o pago e `valor_original` guarda o da nota **no mesmo UPDATE**): ela não gera trilha de valor nem invalida declaração.

## 4. Impacto (medido em produção, só leitura)

- **6 quitações**, **8 declarações geradas**, **5 aprovações**, 13.927 lançamentos.
- As 5 quitações que têm declaração estão **`assinada`** (via gerada) → **nenhuma muda de grau**; a sexta está `aguardando_assinatura` e não tem anexo declaratório.
- As 5 aprovações existentes **não têm selo** (são anteriores): seguem a regra de antes (válidas se posteriores à última mudança). Elas **também caem** na primeira edição de nota (o gatilho grava `declaracao_invalidada`); não caem por mudança de PIX/cadastro (não têm selo para comparar). Nova aprovação nasce selada.
- Nenhuma tabela, view ou função **existente** perde coluna ou assinatura. O que muda é a definição de 4 funções (aprovações, grau conjunto, entrada, congelamento) e 1 gatilho (congelamento).
- Custo: o gatilho dispara só quando um campo rastreado muda; uma baixa em lote gera as linhas de trilha correspondentes (conta) e nada mais.

## 5. Verificação (feita)

- **Banco (Postgres 18 local, esquema mínimo + as migrations reais):** 55 verificações — ensaio `TUDO OK` sem deixar nada; guarda recusa quando uma função foi alterada; APLICAR duas vezes idêntico; **regressão** (4 quitações da Matriz avaliam igual); declaração vale/cai/volta; edição sem motivo recusada (e motivo curto); motivo→evento→trilha→canal zerado; extinção desfeita e refeita; aprovação cai por fornecedor **e por PIX (sem evento)**, não ressuscita, e a nova decisão vale; aprovação antiga (sem selo) preservada; externa e pedido (antes/depois da alteração); rotina sem usuário; trilha para lançamento comum com rótulos; baixa parcial não conta; trilha imutável; projeto congelado; nomes (inclusive sem nome no perfil e papel fora do financeiro); `fin_impacto_edicao`; **ROLLBACK devolve as 4 funções byte a byte** (impressão idêntica), mantém a trilha se houver linhas, roda duas vezes e o APLICAR volta a funcionar.
- **Aplicativo:** `tsc` limpo; `vite build` ok; 19 testes novos (lib, serviços, cartão). Suite inteira: 1450 de 1451 — a falha é de `navConfig.test.ts` ("/financas/reunioes sumiu do menu"), **anterior a este trabalho e sem relação com ele**.

## 6. Rollback

`docs/DECLARACAO_MANDA_ROLLBACK.sql`: devolve as quatro funções e o gatilho de congelamento à definição de antes, remove gatilhos, funções e a coluna-canal. A **trilha de edição** e os eventos `declaracao_invalidada` são prova: **ficam** se tiverem linhas (a tabela sai se estiver vazia). Nenhum outro dado é tocado.

## 7. Como aplicar (ordem)

1. `docs/QUITACAO_OFERTA_APLICAR.sql` (Matriz de Ofertas) — pré-requisito: a guarda desta fase **recusa** se a Matriz ainda não estiver aplicada.
2. `docs/DECLARACAO_MANDA_ENSAIO.sql` — termina em erro de propósito; a mensagem é o resultado (`TUDO OK`); nada fica gravado.
3. `docs/DECLARACAO_MANDA_APLICAR.sql` — devolve 8 linhas com `ok = true`.
4. Só então publicar o código (sem a migration, a tela não pergunta nada e a edição segue como antes).

## 8. Pontos para ela decidir / observar

- **Assinar depois de aprovar derruba a aprovação** (comportamento anterior, mantido): `fin_registrar_assinatura_declaracao` grava `declarado_em` e isso conta como alteração da quitação. A ordem certa é assinar e **depois** aprovar. Se preferir que a assinatura da *mesma* via não derrube aprovação, é uma mudança pequena e isolada.
- As 5 aprovações de antes não têm selo (ver §4); se quiser que também caiam por PIX/cadastro, basta pedir nova decisão sobre elas depois da aplicação.
- `MÉDIA 4` (histórico imutável) cobre o rastro **daqui para a frente**: o que foi editado antes da migration não tem antes/depois.

## 9. Próximas fases (já aprovadas, não iniciadas)

2B **Mudar Intenção** (Oferta ⇄ Reembolso, com nova declaração) · 2C **Anular Registro** (Administrador/Tesouraria; desfazer só Administrador) · 2D **Estornar Reembolso** (só Administrador; antes, desfazer vínculo com o extrato e a conciliação).
