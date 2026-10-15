# Documentos do Fechamento — proposta funcional e implementação (15/10/2026)

> Pedido: controlar, dentro do Fechamento Mensal, os documentos institucionais enviados ao escritório (extratos, OFX, faturas de cartão, relatórios Cielo e Rede, aplicações, rendimentos e outros), que **não pertencem a despesa, obrigação nem fornecedor: pertencem ao fechamento do mês**.
> Estado: **código e migration commitados; NADA aplicado em produção, nada publicado.** Ordem: ensaio → aplicar → publicar.
> Arquivos: migration `20261016150000_fin_fechamento_documentos.sql` · `docs/FECHAMENTO_DOCUMENTOS_ENSAIO.sql` · `docs/FECHAMENTO_DOCUMENTOS_APLICAR.sql` · `docs/FECHAMENTO_DOCUMENTOS_ROLLBACK.sql`.

## 1. O problema (medido no código)

- `fin_lancamento_anexos` prende o arquivo a **um lançamento** (e o dossiê é por despesa): extrato e OFX não cabem ali sem inventar um lançamento fictício.
- O malote leva **só documento de despesa**. O que o escritório também precisa (extratos, cartões, adquirentes) sai por fora, sem registro.
- O checklist do fechamento não sabe se os documentos do mês foram reunidos.

## 2. Proposta funcional

**Onde:** aba **4 Fechamento**, nova **etapa 4 "Documentos do fechamento"** (entre Documentação e Pacote contábil; o Pacote vira 5 e o Envio 6).

| Função | Como funciona |
|---|---|
| **Anexar** | Escolhe um ou mais arquivos, o **tipo** (extrato bancário, OFX, fatura de cartão, relatório Cielo, relatório Rede, aplicação, rendimentos, outro), a **conta** (opcional) e uma descrição. O tipo é **sugerido pelo nome** do arquivo (".ofx", "cielo", "fatura"…) e a pessoa confirma. Aceita pdf, jpg, png, ofx, qfx, csv, xls, xlsx, txt, xml, zip, até 25 MB |
| **Listar** | Os anexos do mês, com tipo, nome, tamanho, conta, **quem incluiu e quando (data e hora)** e a pasta em que vão no malote. **Abrir** gera um link temporário (10 min) |
| **Excluir** | Pede o **motivo** (mín. 5 caracteres). O arquivo sai do armazenamento e do malote; **o registro fica** (quem excluiu, quando, por quê) |
| **Histórico** | "Ver histórico": tudo o que entrou e saiu no mês, com quem e quando. **Nunca some**: o banco não deixa apagar nem editar a trilha |
| **Anti-duplicidade** | O mesmo arquivo (hash SHA-256) não entra duas vezes no mês; depois de excluído, pode entrar de novo |
| **Usuário, data e hora** | Gravados **pelo banco** (não pela tela), com o **nome no momento** (a tabela de perfis só deixa cada um ler o próprio) |

### Checklist (quatro itens)
`[ ] Extrato bancário anexado` · `[ ] OFX anexado` · `[ ] Cartão anexado` · `[ ] Adquirente anexado` (Cielo **ou** Rede).
- **Item sem arquivo é ATENÇÃO, não bloqueio.** Mantém a decisão de 02/10/2026: o malote sai mesmo com pendência.
- **"Não se aplica neste mês"** (decisão minha, para o checklist poder fechar num mês sem cartão ou sem vendas): pede motivo, registra quem e quando, e se desfaz. **Anexar vale mais que dispensar**: se o arquivo chegou depois, o item conta como anexado.
- Aplicação, rendimentos e "outros" vão no malote, mas **não têm item** (não há como saber se o mês deveria ter).

### Malote
Os documentos vão **dentro do pacote contábil**, em `Documentos do fechamento/<pasta do tipo>/arquivo`, com um **`INDICE_DOCUMENTOS.csv`** (tipo, arquivo, caminho, descrição, conta, tamanho, quem incluiu, quando). Pastas: `Extratos bancários`, `OFX`, `Cartões`, `Adquirentes/Cielo`, `Adquirentes/Rede`, `Aplicações`, `Rendimentos`, `Outros`. Um arquivo que não baixa **não derruba o pacote**: vai para `ERROS.txt`. O cartão do malote e a etapa do pacote mostram a contagem.

### FASE FUTURA — `Fechamento_AAAA_MM.zip`
A estrutura **já está decidida e codificada** (`estruturaDoFechamentoZip`, com teste), para o gerador futuro só montar o ZIP:
```
Fechamento_2026_09/
  Malote/                (o pacote contábil de hoje, inteiro)
  Extratos bancários/ · OFX/ · Cartões/ · Adquirentes/Cielo/ · Adquirentes/Rede/ · Aplicações/ · Rendimentos/ · Outros/
  INDICE_DOCUMENTOS.csv
```
Hoje os mesmos documentos vão dentro do pacote com as mesmas pastas, então a fase futura é **reorganizar, não reaprender**.

## 3. Desenho técnico

| Peça | O que é |
|---|---|
| `fin_fechamento_documentos` | Um arquivo por linha, do **mês** (`ano`, `mes`): tipo, conta (opcional), descrição, nome, caminho, hash, tamanho, **incluído em/por/nome**, **removido em/por/nome/motivo**. Trilha imutável por gatilho: só a remoção é permitida (uma vez, com motivo); `DELETE` é recusado |
| `fin_fechamento_docs_dispensas` | "Não se aplica neste mês" por item do checklist (motivo, quem, quando; desfazível; uma ativa por item e mês) |
| Bucket `fin-fechamento-docs` | Privado, 25 MB, políticas só para **admin, diakonia, secretaria e tesouraria** (liderança não opera o financeiro) |
| Aplicativo | `lib/fechamentoDocumentos.ts` (regra pura), `services/fechamentoDocumentosService.ts`, `components/financas/DocumentosDoFechamento.tsx`, etapa nova em `FechamentoMensal.tsx`, malote em `pacoteContabilService.ts` |

**Alternativa descartada:** reaproveitar `fin_lancamento_anexos` com um "lançamento do mês": inventa uma despesa fictícia e leva o documento para o ciclo da despesa (dossiê, congelamento).

## 4. Impacto
- **Nenhuma tabela, view ou função existente muda.** Despesas, saldos, DRE, conciliação e o malote atual ficam iguais; o pacote só **ganha** a pasta quando houver documento.
- A seção **some sozinha** se a migration não estiver aplicada (sondagem), e o pacote segue como antes. Se a leitura dos documentos falhar, o malote de despesas **não deixa de sair**.

## 5. Verificação (feita)
- Banco (Postgres local, esquema mínimo): ensaio, aplicação duas vezes, trilha imutável, RLS (liderança não enxerga nem inclui), nome gravado na hora, rollback que **recusa** quando há documento (é prova) e remove quando vazio — tudo OK.
- Aplicativo: 25 testes novos (checklist, arquivo, estrutura/pastas, índice, componente e **o ZIP do malote de verdade**).

## 6. Rollback
`docs/FECHAMENTO_DOCUMENTOS_ROLLBACK.sql`: **só remove** tabelas e bucket se estiverem **vazios** (um documento anexado é prova); senão para com mensagem.

## 7. Como aplicar (ordem)
1. `docs/FECHAMENTO_DOCUMENTOS_ENSAIO.sql` — termina em erro de propósito; a mensagem é o resultado (17 verificações); nada fica gravado.
2. `docs/FECHAMENTO_DOCUMENTOS_APLICAR.sql` — deve devolver `tabelas = 2`, `bucket_privado = 1`, `politicas_storage = 3`.
3. Só então publicar o código.

## 8. Fora do escopo (próximas)
Leitura automática do conteúdo (OFX/PDF) para conferir saldo com o extrato; alerta por e-mail quando faltar item perto do fim do mês; retenção/arquivamento de meses antigos; a geração do `Fechamento_AAAA_MM.zip` em si.
