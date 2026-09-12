# Fase 1 — Mapeamento de categorias: atuais → Plano de Contas Oficial 2025

> Base: [PROJETO_TESOURARIA_PRESTACAO_CONTAS.md](./PROJETO_TESOURARIA_PRESTACAO_CONTAS.md)
> §1–2. Decisões da Telma em 12/09/2026: **Doações funde com Ofertas** (revisão da
> mesma tarde — a primeira decisão do dia era mantê-la independente); **Diaconia e
> Missões deixam de existir como categoria** — no modelo oficial são centro de
> custo (ministério), não categoria de despesa.
>
> Medido em produção antes desta fase: 7 lançamentos, dos quais só 4 referenciam
> categoria — `Ofertas` ×1, `Dízimos` ×2, `Energia elétrica` ×1. Nenhum usa
> `Diaconia / assistência` ou `Missões`. A migração de dado real é trivial: as 3
> categorias em uso são renomeadas no lugar (mesmo `id`), não recriadas.

## Parte A — as 34 categorias que já existem em produção

| Categoria atual | Categoria oficial 2025 | Centro de custo associado | Tipo | Ação técnica |
|---|---|---|---|---|
| Dízimos ★ | Dizimos | — (independe de ministério) | Receita · Receitas Regulares | Manter (mesmo id) — grafia oficial |
| Ofertas ★ | Ofertas | — | Receita · Receitas Regulares | Manter |
| Ofertas para Missões | Ofertas para Missões | — | Receita · Receitas Regulares | Manter |
| Rendimento aplicação | Rendimentos de Aplicações | — | Receita · Outras Receitas | Renomear |
| Outras receitas | *(sem equivalente oficial)* | — | Receita · fora do Plano Oficial | **Descontinuar** (`ativo=false`) |
| Campanhas | *(fora do Plano Oficial — módulo Arrecadação)* | — | Receita · fora do Plano Oficial | Manter ativa, sem classificação |
| Doações | Ofertas | — | Receita · Receitas Regulares | **Fundir com Ofertas** — decisão da Telma, 12/09/2026 (revisão do mesmo dia) |
| Eventos | *(fora do Plano Oficial — módulo Arrecadação)* | — | Receita · fora do Plano Oficial | Manter ativa, sem classificação |
| Vendas (livraria) | *(fora do Plano Oficial — módulo Bazar/Cantina)* | — | Receita · fora do Plano Oficial | Manter ativa, sem classificação |
| Água e esgoto | Água e Esgoto | qualquer ministério | Despesa | Renomear |
| Aluguel | Aluguel | qualquer | Despesa | Manter |
| Energia elétrica ★ | Energia Elétrica | qualquer | Despesa | Renomear |
| Impostos / taxas | Impostos e Taxas | qualquer | Despesa | Renomear |
| Material de escritório | Material de Escritório | qualquer | Despesa | Renomear (capitalização) |
| Salários CLT | Salários | qualquer | Despesa | Renomear |
| Vale Transporte | Vale Transporte | qualquer | Despesa | Manter |
| Vale Alimentação | Vale Refeição | qualquer | Despesa | Renomear |
| Manutenção predial | Manutenção de Imobilizado | qualquer | Despesa | Renomear |
| Prebenda pastoral | Prebenda | qualquer | Despesa | Renomear — "Sustento Pastoral" passa a existir como categoria nova separada (Parte B) |
| MEI (prestadores) | Serviço Prestado PJ | qualquer | Despesa | Renomear |
| RPA (autônomos) | Serviço Prestado PF | qualquer | Despesa | Renomear |
| Material de limpeza | Limpeza e Dedetização | qualquer | Despesa | Renomear |
| Manutenção equipamentos | Móveis e Equipamentos em Geral | qualquer | Despesa | Renomear (aproximação documentada) |
| Material de som | Móveis e Equipamentos em Geral | qualquer | Despesa | **Descontinuar** — funde com a linha acima, não duplica categoria oficial |
| Eventos / Almoço | Material de Consumo | qualquer | Despesa | Renomear (aproximação documentada) |
| Transporte/combustível | Combustível | qualquer | Outras Despesas | Renomear |
| Tarifas bancárias | Tarifas Bancárias | — (centro "Geral / Operacional") | Despesa Financeira | Renomear |
| INSS / FGTS / Encargos | INSS + FGTS + INSS/IRRF | qualquer | Despesa | **Descontinuar** — desmembra em 3 categorias novas (Parte B) |
| Internet/telefone | Internet + Telefonia | qualquer | Despesa | **Descontinuar** — desmembra em 2 categorias novas (Parte B) |
| Construção / reforma | *(sem equivalente — é capex, não despesa corrente)* | — | Despesa · fora do Plano Oficial | **Descontinuar** (revisar se a igreja passar a reformar com frequência) |
| Diaconia / assistência | *(não é categoria — é centro de custo)* | **Min. Diaconia e Ação Social** | — | **Descontinuar como categoria** — decisão da Telma, 12/09/2026 |
| Missões | *(não é categoria — é centro de custo)* | **Min. Evangelismo e Missões** | — | **Descontinuar como categoria** — decisão da Telma, 12/09/2026. Repasse a missões usa a categoria oficial "Outros Repasses Missionários" |
| Materiais EBD | *(fora do Plano Oficial — módulo EBD)* | qualquer | Despesa · fora do Plano Oficial | Manter ativa, sem classificação |
| Outras despesas | *(fallback controlado)* | qualquer | Despesa · fora do Plano Oficial | Manter ativa como fallback — não oferecer como 1ª opção |

★ = uma das 3 categorias com lançamento real hoje.

## Parte B — categorias oficiais sem equivalente atual (criar do zero)

38 categorias novas, 0 delas com lançamento histórico para migrar.

| Categoria oficial 2025 | Tipo | Centro de custo associado |
|---|---|---|
| Descontos Obtidos | Receita · Outras Receitas | — |
| Férias · Rescisões · 13º Salário · INSS · FGTS · IRRF · PIS · Assessoria Saude Ocupacional · Seguro de Vida · Sustento Pastoral · Sustento Pastoral Auxiliar · Outros Benefícios · INSS/IRRF · Condomínio · Telefonia · Seguros · IPTU · Contabilidade · Internet · Ofertas Preletores · Gas · Monitoramento · Sistemas de Informática · Aluguel de Equipamentos · Assinaturas e Mensalidades · Assistente Musical · Dedetização · ISS · Outros Repasses Missionários | Despesa | qualquer ministério (29 categorias) |
| Juros · Multas · IOF · Tarifa Cartão Credito | Despesa Financeira | — (centro "Geral / Operacional") |
| PENDENCIAS FINANCEIRO · Assembleia Convenção Batista Brasileira · Outros Gastos Cartão · Doações e Contribuições | Outras Despesas | qualquer / "Geral / Operacional" |

## Resultado depois da Fase 1

- **59 categorias ativas e classificadas** (5 receita + 44 despesa + 5 despesa
  financeira + 5 outras despesas) — o Plano de Contas Oficial completo, igual às
  4 planilhas de 2025.
- **8 categorias descontinuadas** (`ativo=false`, nunca apagadas — convenção do
  projeto): Outras receitas, Material de som, Doações, INSS/FGTS/Encargos,
  Internet/telefone, Construção/reforma, Diaconia/assistência, Missões.
- **5 categorias mantidas fora do Plano Oficial**, ativas para outros módulos:
  Campanhas, Eventos, Vendas (livraria), Materiais EBD, Outras despesas.
- **Centros de custo**: nenhuma mudança nesta fase — os 11 ministérios já existem
  (ver §3.1 do projeto). Diaconia e Missões, ao perderem a categoria, passam a se
  apoiar inteiramente em `Min. Diaconia e Ação Social` e `Min. Evangelismo e
  Missões`, que já existem.
