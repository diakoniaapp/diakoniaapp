# Doadores e dizimistas — primeira fatia da Fase 3 (27/10/2026)

Decisão dela: **evoluir a tela Doadores** (`/financas/doadores`), sem criar outra. Esta fatia é a parte DENTRO DO SISTEMA; o e-mail agregado ao pastor é a próxima.

## O que mudou na tela

Três abas na mesma rota (o estado vai na URL; links antigos `?ano=&mes=` continuam funcionando):

| Aba | O que mostra | Nomes? |
|---|---|---|
| **Painel** | Dizimistas, doadores, arrecadado (por categoria), média mensal, média por doador, frequência, recorrência, novos; cobertura da identificação; 3 gráficos (evolução, curva de adesão, distribuição mensal); destaques (maior adesão, maior arrecadação, maior crescimento) | **Não** (só agregados) |
| **Pessoas** | A lista de antes, agora sobre o período, com grupos (Dizimistas, Recorrentes, Novos), busca sem acento, Excel e CSV | Sim — exige registro de acesso |
| **Sem contribuição** | Base (membros e congregados ativos), quem contribuiu, quem não contribuiu, "nenhuma desde 01/01/2026", "contribuíram antes", faixas de 30/60/90/180 dias, "com família que contribuiu"; lista nominal, Excel e CSV | Sim — exige registro de acesso |

**Períodos:** últimos 90 dias, 6 meses (padrão), 12 meses, este ano, desde 01/01/2026 e personalizado.

## Regras (todas no código único `supabase/functions/_shared/contribuicoes/analise.ts`, o mesmo que o e-mail usará)

- **Piso oficial: 01/01/2026.** O período nunca começa antes; a tela avisa. Período inteiro antes do piso: não calcula.
- **Contribuição** = entrada realizada/conciliada de Dízimos, Ofertas ou Ofertas para Missões. Transferências, rendimentos, descontos e estornos ficam de fora.
- **Dizimista** = pessoa com dízimo identificado no período. **Doador** = qualquer das três categorias.
- **Recorrência** = dizimistas que deram dízimo em **todos os meses completos** do período (sobre os dizimistas). Sem mês completo, não se calcula.
- **Novos** = primeira contribuição identificada dentro do período, sem nenhuma entre o piso e o início do período. Se o período começa no piso, não se calcula (não há histórico confiável).
- **Média mensal** = arrecadado ÷ (dias do período ÷ 30,4375).
- **Sem contribuição:** a base é só membro/congregado **ativo**; **menores de 18 anos ficam fora** por padrão (opção para incluir); quem não tem data de nascimento entra, marcado. Quem tem alguém da família (vínculo familiar) contribuindo leva a marca "a família contribuiu", com filtro para esconder. A ordem é **alfabética** (nunca ranking). "Já contribuiu" só conta o que for desde 01/01/2026 (nunca se afirma "nunca na vida").
- As duas últimas definições (recorrência por meses completos; menores fora da base) eram decisões em aberto: ficaram como **padrão explícito**, mudável num lugar só.

## Auditoria de quem vê os nomes

Migration `supabase/migrations/20261027160000_contribuicoes_registro_de_acessos.sql` (rollback: `docs/CONTRIBUICOES_REGISTRO_ROLLBACK.sql`):

- `contribuicoes_acessos` — trilha imutável: quem, ação (`ver_pessoas`, `ver_nao_contribuiram`, `exportar_pessoas`, `exportar_nao_contribuiram`), recorte (período, o que conta, menores), quantas pessoas, quando. **Não guarda nomes nem valores.**
- `contribuicoes_registrar_acesso(...)` — única porta de escrita; confere o papel (admin, diakonia, tesouraria) e carimba quem chamou. O cliente não escolhe "quem".
- Leitura: só **admin e diakonia**.
- A tela só mostra os nomes **depois** de gravar o registro. Registro com erro = sem nomes e sem arquivo. **Enquanto a migration não for aplicada**, a lista aparece com um aviso em destaque ("esta consulta NÃO ficou registrada").
- A mesma consulta (mesma ação e recorte) é gravada uma vez por sessão.

## Ordem de implantação

1. Aplicar a migration (não mexe em nada existente).
2. Publicar o app. (Pode ser antes: sem a migration a tela funciona com o aviso.)
3. Para **ler** o registro (quem viu o quê), por enquanto só por SQL: `select * from contribuicoes_acessos order by em desc;` como admin/diakonia. Uma tela de leitura é uma etapa futura.

## Medido em 27/10/2026 (só contagens, sem listar nomes)

304 membros/congregados ativos (252 membros, 52 congregados), 47 menores de 18 anos, 59 sem data de nascimento. Desde 01/01/2026, 149 pessoas contribuíram (dízimo, oferta ou missões); 159 não, das quais 33 menores, 38 sem data de nascimento e 55 com alguém da família que contribuiu. **O número de "não contribuíram" sem essas ressalvas superestima** — por isso a tela as mostra.

## O que NÃO está nesta fatia

- **E-mail agregado ao pastor** (corpo com indicadores, sem nomes): precisa da função de envio sob demanda e do histórico da Central de Comunicação (Fases 1 e 4 do roadmap dela). Usará o mesmo cálculo.
- Comparação com o período anterior no gráfico mensal (antes do piso não há dado confiável).
- A Prestação de Contas ainda conta dizimistas por nome normalizado; passar a usar este cálculo (decisão 10 da análise) muda o número que a Diretoria vê e fica para quando ela decidir.
- O menu continua "Doadores" (decisão 3 da análise em aberto).
- Tela para consultar o registro de acessos.
