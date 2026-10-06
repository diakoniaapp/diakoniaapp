# Auditoria das migrations — o que está no banco e o que só está no repositório

Levantamento de **06/10/2026**, **somente leitura**: nenhuma migration foi executada e o banco não foi alterado.
Lista completa, uma linha por arquivo: [auditoria-migrations-2026-10-06.csv](auditoria-migrations-2026-10-06.csv).

## 0. Como foi medido — e o que NÃO dá para medir

- **Não existe tabela de controle utilizável.** O schema foi construído fora do CLI do Supabase (medido em 12/08/2026: não há `supabase_migrations.schema_migrations`),
  e o token da API de gerenciamento está **sem acesso** hoje (HTTP 401). Também não usei a chave `service_role`. Sem catálogo, **"aplicada" só pode ser provada objeto por objeto**.
- **Como provei:** li os 236 arquivos de `supabase/migrations`, extraí tabelas, views e colunas criadas e perguntei ao banco (leitura, com a chave pública e com a sessão logada) se existem.
  Para migrations só de **dados**, comparei o estado dos lançamentos com o que a migration produziria.
- **Controles:** uma tabela inventada deu "não existe"; as tabelas reais deram "existe". Uma primeira sonda de funções com a chave pública **falhou no controle**
  (função existente apareceu como inexistente) e foi descartada; refeita com a sessão logada.

| Resultado | Quantidade |
|---|---|
| ✅ Aplicadas, **provadas** (84 por tabela/view/coluna + 2 por efeito nos dados) | **86** |
| ⚠ **Pendentes** (2 por objeto ausente + 4 por efeito nos dados) | **6** |
| ❌ Com problema | **1** |
| ❔ **Não verificáveis** pela API (só função, política, gatilho, tipo ou dado) | **143** |
| **Total** | **236** |

As 143 não verificáveis **não são "aplicadas por suposição"**: simplesmente não deixam rastro que a API enxergue. 88 delas criam funções; das 107 funções,
81 respondem como existentes e as outras 26 são gatilhos e auxiliares que o banco não expõe por RPC (3 delas confirmadas pela dica de nome). Não achei nenhum sinal de função
faltando, mas **política (RLS), gatilho e dado só se provam com acesso ao catálogo**.

## 1. Divergências

| Tipo | O que consegui medir |
|---|---|
| **Com erro** | não é mensurável (sem histórico de execução) |
| **Aplicadas fora de ordem / puladas** | **sim, 3 casos:** `20261003130000` (malote) e `20261006170000` (Pix de pessoa) **foram puladas** enquanto as de `20261006180000`–`200000` foram aplicadas; `20260526120508` (fluxo de visitantes) **nunca foi aplicada** |
| **No banco e não no repositório** | não é mensurável sem o catálogo. Há SQL fora de `supabase/migrations` (pasta `sql/` na raiz: `funcoes_admin.sql`, `limpeza_profiles.sql`, `migracao_dominio_acesso.sql`, `reclassificar_anexos_rpa_dps_2026-10-03.sql`), e o CLAUDE.md já registra que o schema nasceu fora do CLI |
| **Assinatura diferente da aplicada** | não é mensurável (não há checksum guardado) |

## 2. Verificação especial pedida

| STATUS | MIGRATION | Evidência |
|---|---|---|
| ⚠ Pendente | `20261006170000_fin_pessoa_pix` | tabela `fin_pessoa_pix` **não existe** (404 na sessão logada) |
| ⚠ Pendente | `20261003130000_fin_malote_envios` | tabela `fin_malote_envios` **não existe** |
| ⚠ Pendente | `20261006210000_missoes_correcoes_da_auditoria` | C1 ainda em *Ofertas* sem campanha; C2 ainda em *Dízimos*; prebendas sem categoria/centro |
| ⚠ Pendente | `20261006220000` (bazar) | os 6 lançamentos de bazar amostrados continuam sem centro |
| ⚠ Pendente | `20261006230000` (Cristolândia/panetones) | projeto Cristolândia **não existe**; panetones ainda em *Repasses Missionários* |
| ⚠ Pendente | `20261006240000` (4 Pix ",10") | criada hoje, para revisão |

Efeito confirmado de **aplicadas**: `…180000` (4 de 4 objetos), `…190000` (0 saídas nos 4 centros antigos; NF de R$ 337 em Material de Consumo) e `…200000`
(as 12 remessas com a campanha prevista; ajuste de R$ 12.032,69 existe e está **inativo**).

## 3. As 7 que merecem atenção

### ⚠ `20261003130000_fin_malote_envios` — 03/10/2026
- **Objetivo:** registrar que o malote foi enviado à contabilidade (etapa 5 do Fechamento).
- **Tabelas:** cria `fin_malote_envios` (+ índice e política de acesso). **Colunas:** `id, ano, mes, enviado_em, enviado_por, dossies, pendencias_documentos, observacao, created_at`.
- **Risco: baixo** — só cria. O app já funciona sem ela ("registro de envio indisponível"). **Dependências (todas presentes):** `profiles`, `has_any_role`, papel `tesouraria`.

### ⚠ `20261006170000_fin_pessoa_pix` — 06/10/2026
- **Objetivo:** guardar a chave Pix de uma pessoa do catálogo para gerar o QR Code ao pagar folha/RPA/côngrua.
- **Tabelas:** cria `fin_pessoa_pix`. **Colunas:** `pessoa_id` (chave, liga a `membros`, apaga junto), `chave_pix`, `tipo_chave_pix`, `atualizado_em`, `atualizado_por`.
- **Risco: baixo** — só cria; a política restringe à equipe financeira (é dado pessoal). O diálogo "Pagar" já avisa quando falta. **Dependências (presentes):** `membros`, `profiles`, `has_any_role`.

### ⚠ `20261006210000_missoes_correcoes_da_auditoria` — 06/10/2026
- **Objetivo:** C1 (R$ 70,00) e C2 (R$ 250,00) para *Ofertas para Missões*; 21 prebendas para *Prebenda · Sustento*; 6 despesas de feira/preletor para *Mobilização*.
- **Tabelas/colunas:** só atualiza `fin_lancamentos` (categoria, centro, campanha); **nenhuma coluna criada**.
- **Risco: médio** (mexe em dado financeiro) mitigado: cada UPDATE é guardado por id + valor + estado antigo e há verificação final. **Efeito esperado:** saldo registrado **−16.270,80 → −15.950,80**.
- **Dependências:** `…180000` a `…200000` (**aplicadas**).

### ⚠ `20261006220000_missoes_bazar_centro_do_ministerio` — 06/10/2026
- **Objetivo:** dar o centro *Min. Evangelismo e Missões* a 42 entradas de bazar (R$ 2.251,74), que continuam em *Ofertas*.
- **Tabelas/colunas:** só `fin_lancamentos.centro_custo_id`. **Risco: baixo**; não muda saldo nem fundo. **Dependências:** categoria *Ofertas* e o centro (existem).

### ⚠ `20261006230000_missoes_panetones_cristolandia_e_bazar_fora_do_fundo` — 06/10/2026
- **Objetivo:** criar o projeto Cristolândia; mover os 2 panetones (4.050 e 1.000) do Envio Oficial para *Doações e Contribuições*; tirar 2 linhas de bazar do fundo.
- **Tabelas/colunas:** insere 1 linha em `fin_projetos`; atualiza 4 lançamentos. **Nenhuma coluna criada.**
- **Risco: médio** — muda o Envio Oficial (162.217,89 → 157.167,89). **Dependências:** `fin_projetos.missionario` (**presente**, vem da `…180000`).

### ⚠ `20261006240000_missoes_pix_marca_010_alta_confianca` — 06/10/2026
- **Objetivo:** reclassificar os 4 Pix ",10" confirmados (R$ 3.150,40) para *Ofertas para Missões*. **Risco: baixo-médio**; **não ensaiada**. Independente das outras.

### ❌ `20260526120508_fluxo_visitantes` — maio/2026 — **NÃO aplicar como está**
- Cria a view `v_fluxo_visitantes` e a função `atualizar_status_visitantes`; **nenhuma das duas existe no banco**, e **nenhum arquivo de `src/` usa a view** (a regra vive em `lib/visitantesFluxo.ts`).
- **Risco alto se fosse aplicada:** o arquivo dá `GRANT SELECT … TO anon` numa view sobre `membros` (nome e telefone de visitantes). View roda com o privilégio do dono e **ignora a RLS**: o papel anônimo leria esses dados.
- **Recomendação:** não aplicar; marcar o arquivo como obsoleto (ou apagá-lo do repositório, com sua aprovação).

## 4. Ordem de execução recomendada

| Ordem | Migration | Motivo |
|---|---|---|
| 1º | `20261003130000_fin_malote_envios` | sem dependências; só cria; liga o registro de envio |
| 2º | `20261006170000_fin_pessoa_pix` | sem dependências; só cria; liga o QR Pix de pessoa |
| 3º | `20261006210000_missoes_correcoes_da_auditoria` | depende de `…180000–200000` (já aplicadas); saldo −16.270,80 → **−15.950,80** |
| 4º | `20261006220000_missoes_bazar_centro_do_ministerio` | só centro; não muda saldo |
| 5º | `20261006230000_missoes_panetones_cristolandia_e_bazar_fora_do_fundo` | saldo → **−10.980,62**; Envio Oficial **157.167,89** |
| 6º | `20261006240000_missoes_pix_marca_010_alta_confianca` | por último: os números dos relatórios já assumem as anteriores; saldo → **−7.830,22** |
| — | `20260526120508_fluxo_visitantes` | **não aplicar** (ver acima) |

**Como aplicar:** uma por vez, cada uma dentro de `BEGIN; … ROLLBACK;` primeiro (as de Missões têm verificação interna que desfaz sozinha se algo não bater) e só então com `COMMIT`.
Depois de cada uma, conferir na tela o número indicado. As 4 de Missões **não foram ensaiadas** (token sem acesso).
