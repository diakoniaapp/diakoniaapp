# Mapa de navegação ideal do Financeiro — jornadas por perfil (20/10/2026)

Só jornada do usuário: sem telas novas, sem código. Parte da arquitetura de 10 telas de `AUDITORIA_ESTRATEGICA_FINANCEIRO_2026-10-20.md`. Os perfis são os que **existem hoje no sistema** (`navConfig.ts`): `tesouraria`, `admin`, `diakonia` (pastor titular), `secretaria`, `pastor` — mais a **Contabilidade**, que é externa e não tem login.

As 10 telas: **Mesa** · **Livro de Obrigações** · **Contas** · **Fechamento do mês** · **Prestação de Contas** · **DRE** · **Painel de gestão** · **Cadastros** · **Doações e Doadores** · **Sustento**.

Princípio que decide o que fica ou sai: **uma tarefa tem uma casa**; detalhe e ferramenta se alcançam por link, não por menu; a mesma obrigação tem a mesma linha em qualquer tela.

## 1. Tesoureiro(a) — o perfil que justifica o módulo

**Todo dia**
1. Chega conta, boleto, nota ou pedido → **Mesa** (o que vence, o que é automático, o que espera quitação, o caixa).
2. **Paga** na própria linha (Pagar agora: documento, Pix/QR, comprovante). Conta que chega de terceiro → fila de quitação, ainda na Mesa.
3. **Débito automático**: confere os 🟡 e 🔴 da Mesa; confirmou no banco → "Marcar debitado"; não achou → vai para Contas.
4. **Contas**: importa o extrato (OFX/PDF) → concilia → resolve diferença (diagnóstico na própria tela).
5. Novo lançamento ou recebimento: ação global da Mesa; fornecedor novo → **Cadastros** (por link, sem sair do fluxo).

**Depois do culto / semanal**
6. Registra dízimos e ofertas → **Doações e Doadores**; concilia em **Contas**.
7. Pergunta pontual ("o que está atrasado no Cartão?", "reembolsos da Caixinha") → **Livro de Obrigações** com filtro de conta.

**Todo mês — fechar**
8. **Fechamento do mês**, em etapas e **sem trocar de tela**: conciliação → classificação → **Prontidão** (fila de pendências: Anexar / Editar / Visualizar; "Anexar em lote" quando há muitos arquivos) → documentos do mês (extrato, OFX, cartão, adquirente) → gerar o ZIP → registrar o envio.
9. **Prestação de Contas** → confere e imprime (modelo Diretoria) para a reunião.

*Telas: Mesa, Contas, Fechamento, Doações, Livro (eventual), Cadastros (eventual), Prestação = 7 de 10.*

## 2. Contabilidade (externa, sem login)
1. **Recebe o malote** (o ZIP): `INDICE.csv`, `PENDENCIAS.csv` (agora com "Documento faltante"), `PENDENCIAS_QUITACAO.csv` e as pastas Conta → Dia.
2. **Analisa a documentação**: abre o PDF consolidado de cada lançamento e confere contra o índice.
3. **Devolve dúvidas** à Tesouraria (fora do sistema).

*Telas do sistema: nenhuma — o ZIP é a interface dela.* Consequência: tudo o que a Prontidão mede existe para **a Tesouraria entregar o malote sem pendência**, e `PENDENCIAS.csv` é o espelho dessa tela. Se um dia a Contabilidade ganhar acesso, a entrada natural é **somente leitura**: Fechamento (estado do mês) + Prestação + DRE.

## 3. Administrador (`admin`) e Pastor titular (`diakonia`)
1. **Consulta indicadores** → **Painel de gestão** (executivo, eclesiásticos, missionários, alertas — uma vez só).
2. **Consulta a prestação** → **Prestação de Contas** (e DRE quando a contabilidade pergunta).
3. **Decide o que a Tesouraria não pode sozinha**: reembolso acima da alçada, oferta de alto risco, reabertura de despesa enviada → **fila na Mesa** (aparece só para quem pode aprovar).
4. **Aprova o mês** → **Fechamento** (etapa final; hoje nunca usada).
5. Política e cadastros-base (contas, categorias, centros) → **Cadastros** (raro).
6. Sustento (só `admin`; `diakonia` fica de fora por regra) → **Sustento**.

*Telas: Painel de gestão, Prestação, DRE (eventual), Mesa (só a fila de decisões), Fechamento (aprovar), Cadastros (raro) = 5–6 de 10.*

## 4. Pastor (`pastor`)
**Hoje não tem acesso ao Financeiro** (`ROLES_FINANCEIRO` = admin, diakonia, secretaria, tesouraria). Se a jornada desejada for "o pastor acompanha a saúde financeira", ela é curta e **só de leitura**:
1. **Painel de gestão** (hoje a Visão Executiva).
2. **Prestação de Contas** quando precisar apresentar.

*Seriam 2 de 10; não precisa de Mesa, Contas nem Fechamento.* É decisão de acesso (§11), não de tela.

## 5. Secretaria (`secretaria`)
Já tem acesso à Visão Executiva (`ROLES_PASTORAL_SEM_TITULAR` = admin, diakonia, secretaria) e ao resto do Financeiro, menos Doações e Sustento. Hipótese (não medida: são 6 usuários e não há telemetria): quando chega um comprovante ou nota de um líder, a secretaria **anexa** ao lançamento; quando surge um fornecedor ou pessoa, **cadastra**.
1. Recebe o documento → **Fechamento › Prontidão** (Anexar na linha certa) ou a linha na **Mesa**.
2. Cadastra favorecido → **Cadastros**.
3. Consulta "já foi pago?" → **Livro de Obrigações** (somente leitura).

*Telas: Livro, Cadastros, Prontidão (por link) = 3 de 10. Não vê Doações nem Sustento.*

## 6. Diretoria e Conselho Fiscal (cargos estatutários — não são perfis de acesso)
1. Recebem o **PDF** da **Prestação de Contas** e do **Livro de Obrigações** no modelo Diretoria (assinaturas da Tesouraria e do Conselho Fiscal).
2. Reunião: lê, questiona, assina.

*Telas do sistema: nenhuma, só papel.* Isso reforça que impressão é uma **saída de primeira classe** (os 4 modelos), não um detalhe.

## 7. Quem usa o quê (● principal · ○ eventual · — nunca)

| Tela | Tesouraria | Admin / Pastor titular | Pastor | Secretaria | Contabilidade (externa) |
|---|---|---|---|---|---|
| **Mesa** | ● | ○ (fila de decisões) | — | ○ | — |
| **Livro de Obrigações** | ○ | ○ | — | ● | — |
| **Contas** | ● | — | — | — | — |
| **Fechamento do mês** | ● | ○ (aprovar) | — | ○ (anexar) | recebe o **ZIP** |
| **Prestação de Contas** | ● | ● | — (sem acesso hoje) | ○ | recebe o PDF |
| **DRE** | ○ | ○ | — | — | ○ (se pedir) |
| **Painel de gestão** | ○ (só os indicadores do Painel; a Visão Executiva é vedada a ela hoje) | ● | — (sem acesso hoje) | ○ | — |
| **Cadastros** | ○ | ○ | — | ● | — |
| **Doações e Doadores** | ● | ○ | — | — | — |
| **Sustento** | ○ | ○ (só `admin`) | — | — | — |

Leitura: **nenhum perfil usa as dez telas**. A Tesouraria usa 6–7; os demais, 2–5. O menu de cada perfil deve mostrar **só as dele** (já é assim por papel; falta enxugar as telas).

## 8. Navegação redundante a eliminar (hoje × ideal)

| Jornada | Hoje (destinos distintos) | Ideal |
|---|---|---|
| **Saber o que vence e pagar** | Mesa, Agenda, Extrato de Obrigações, Liquidações do período, Auditoria (linhas) — 5 | **Mesa** (1) |
| **Conferir um débito automático** | Mesa, Extrato de Obrigações, Conta, Auditoria do Extrato — 4 | Mesa → (se falhar) Contas — 2, no mesmo fluxo |
| **Conciliar** | Gaveta de conciliação, gaveta de extrato, página da Conta, Auditoria do Extrato — 4 | **Contas** (1) |
| **Fechar o mês** | Painel aba 4, Auditoria de Documentos, Central de Documentos, Malote Contábil, Prestação — 5 | **Fechamento** (1 assistente) + Prestação |
| **Gerar o ZIP** | Fechamento, página do Malote, botão da Auditoria — 3 portas | 1 porta (Fechamento) |
| **Ver "o que falta documentar"** | Mesa, Fechamento, Auditoria, Cobertura Documental, `PENDENCIAS.csv` — 5 contadores | **Prontidão** (1 número, 1 lista) |
| **Cadastrar** | Gaveta e página de Favorecidos, Recorrências, Projetos, Estoque, Orçamento — 2 caminhos por cadastro | **Cadastros** (1 caminho) |
| **Ler indicadores** | Executivo, Insights, Indicadores (2 blocos no Painel), alertas ×3 — 6 | **Painel de gestão** (1) |
| **Quitação por terceiro** | Mesa (2 cartões), compacto na aba Gestão, diálogos soltos, Extrato — 4 | **Fila única na Mesa** + ação na linha |

## 9. Entradas do dia (para onde cada perfil "cai" ao abrir o Financeiro)
- **Tesouraria** → **Mesa** (sempre; é o "hoje").
- **Admin / Pastor titular** → **Painel de gestão**, com a fila de decisões no topo quando houver.
- **Pastor** → hoje sem acesso (ver §11).
- **Secretaria** → **Livro de Obrigações**.
- **Contabilidade** → não entra; recebe o malote.

## 10. Regras para não voltar a duplicar
1. **Uma pergunta, uma tela.** Antes de criar uma tela: qual pergunta do tesoureiro ela responde que nenhuma outra responde?
2. **Detalhe e ferramenta por link, não por menu** (projeto, favorecido, centro, anexar em lote).
3. **Uma obrigação, uma linha, um estado** em qualquer lente (Operar, Fechar, Reportar).
4. **Todo relatório tem impressão** nos 4 modelos; relatório que ninguém imprime nem abre não entra no menu.
5. **Perfil novo só entra** com a sua jornada escrita aqui.

## 11. O que ainda não sei
- **Uso real por perfil**: inferido de papéis, dados e pedidos; sem contador de acesso. A jornada da **Secretaria** é hipótese. Confirmar com ela(s) antes de cortar.
- **Acesso**: o `pastor` não entra no Financeiro e a Tesouraria não abre a Visão Executiva (a guarda é admin, diakonia, secretaria). Se o Painel de gestão passar a ser a leitura de saúde financeira, **quem deve vê-lo?** (decisão sua; a RLS do banco precisa acompanhar).
- **Quem na prática faz a conciliação e o fechamento** (só a Tesoureira ou também o Administrador?), o que muda quem vê o Fechamento.
- **Se a Contabilidade pretende acessar o sistema** (muda a entrada "somente leitura").
