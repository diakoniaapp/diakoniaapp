# STORAGE_AUDIT.md — DiakoniaApp

Auditoria dos buckets de storage do projeto `prjoftmlkusbjoeptabp`, executada em
**25/08/2026**.

> Origem: **Achado 10** da Auditoria Técnica, e **ordem 2** do
> [ACTION_PLAN_90_DAYS.md](./ACTION_PLAN_90_DAYS.md). O ARCHITECTURE.md §5.3 marcava
> explicitamente: *"não auditei o conteúdo dos buckets públicos"*.
>
> **Nenhum bucket, permissão, arquivo ou linha de código foi alterado.** Todo o
> levantamento é leitura de `storage.buckets`, `storage.objects` e do código-fonte.

---

## 1. Resumo em uma frase

**Os dois buckets que a auditoria mandou verificar estão vazios. O bucket que ela deu
como dormente tem 36 arquivos, 131 MB e é público — e 27 desses arquivos são órfãos.**

As duas premissas do Achado 10 estavam invertidas. As correções estão na §2.

---

## 2. Duas correções à Auditoria Técnica

### Correção 1 · `ebd-aulas` e `locais-mapas` estão vazios

O Achado 10 dizia: *"se guardarem lista de chamada ou foto de criança, é exposição sob
a LGPD com agravante"*. **Ambos têm zero arquivos.** O risco era hipotético e
permanece hipotético — mas a configuração pública continua ligada, o que importa para
o futuro, não para hoje.

### Correção 2 · Os buckets "sem referência no código" são referenciados

O CLAUDE.md §7 e o ARCHITECTURE.md §5.3 afirmam que `arrecadacao-nf` e
`campanhas-materiais` não são citados por arquivo nenhum. **Os dois são:**

| Bucket | Referência encontrada |
|---|---|
| `campanhas-materiais` | `src/pages/CampanhasAdmin.tsx:537` e `:543` |
| `arrecadacao-nf` | `src/services/arrecadacaoService.ts:755` e `:767` |

**Os 10 buckets têm referência no código.** Não há bucket órfão de código — o que
existe são arquivos órfãos dentro de um bucket ativo, que é problema diferente e está
na §6.

---

## 3. Configuração dos buckets

| Bucket | Acesso | Arquivos | Tamanho | Último envio | Referência no código |
|---|---|---|---|---|---|
| `campanhas-materiais` | **PÚBLICO** | 36 | 125.1 MB | 2026-06-02 | `src/pages/CampanhasAdmin.tsx:537` |
| `ebd-aulas` | **PÚBLICO** | 0 | — | nunca | `src/services/ebdService.ts:295` |
| `locais-mapas` | **PÚBLICO** | 0 | — | nunca | `src/pages/Locais.tsx:251` |
| `arrecadacao-nf` | privado | 0 | — | nunca | `src/services/arrecadacaoService.ts:755` |
| `documentos` | privado | 2 | 0.0 MB | 2026-06-07 | `src/pages/DocumentosAdmin.tsx` |
| `ebd-comprovantes` | privado | 2 | 0.1 MB | 2026-06-25 | `src/services/ebdService.ts` |
| `fin-comprovantes` | privado | 0 | — | nunca | `src/services/finService.ts` |
| `fiscal-docs` | privado | 0 | — | nunca | `src/services/fiscalService.ts` |
| `membresia-docs` | privado | 0 | — | nunca | `src/services/membresiaService.ts` |
| `pgm-reunioes` | privado | 0 | — | nunca | `src/services/pgmService.ts` |

**Totais:** 10 buckets · **3 públicos** · 7 privados · 40 arquivos · 125.2 MB.

Sobre a tabela `storage.objects` incidem **37 políticas de RLS**. Elas governam quem
pode enviar e listar pela API autenticada — **mas não governam a leitura de um bucket
público**, que acontece por URL direta, sem passar por política nenhuma. Essa é a
distinção que decide todo o resto deste relatório.

### 3.1 Uso ativo x abandono

| Situação | Buckets |
|---|---|
| **Ativo, com conteúdo** | `campanhas-materiais` (36), `ebd-comprovantes` (2), `documentos` (2) |
| **Referenciado, porém vazio** | `ebd-aulas`, `locais-mapas`, `arrecadacao-nf`, `fin-comprovantes`, `fiscal-docs`, `membresia-docs`, `pgm-reunioes` |
| **Sem referência no código** | **nenhum** |

Os 7 vazios correspondem aos módulos que o CLAUDE.md §7 classifica como *"construído,
aguardando adoção"* — financeiro, fiscal, membresia, PGM, arrecadação. **Bucket vazio
aqui não é abandono: é módulo que a igreja ainda não começou a usar.** A distinção
importa, porque a recomendação para abandono seria apagar, e para não-adotado é
esperar.

---

## 4. Inventário completo dos arquivos

### 4.1 `campanhas-materiais` — público, 36 arquivos, 125.1 MB

Todos são `application/pdf`. Os nomes são UUID — **não há nome legível em arquivo
nenhum**, o que impede qualquer inferência de conteúdo pelo nome. A pasta é o `id` da
campanha.

**Pasta `15e58af4-3880-44ff-8eec-09005a9ccabf`** — **ÓRFÃ — não corresponde a nenhuma campanha** · 18 arquivos · 62.5 MB

| Arquivo | Tipo | Tamanho | Criado | Modificado |
|---|---|---|---|---|
| `04666023-46e7-42dc-aa04-b5decd8b4cfa.pdf` | PDF | 4.043 KB | 2026-06-02 | 2026-06-02 |
| `146f964b-1116-4b01-a4f2-6d30d64eb4b5.pdf` | PDF | 688 KB | 2026-06-02 | 2026-06-02 |
| `26f706a0-016b-4b5e-b33a-40d08766aeb5.pdf` | PDF | 5.913 KB | 2026-06-02 | 2026-06-02 |
| `4ba3bdc9-a5eb-4817-86b8-99b31a6aa891.pdf` | PDF | 3.093 KB | 2026-06-02 | 2026-06-02 |
| `52479c29-1807-4929-adb4-8b422c6dcd51.pdf` | PDF | 4.043 KB | 2026-06-02 | 2026-06-02 |
| `531873c5-ada8-4788-81d3-42dbf2ec84e1.pdf` | PDF | 10.807 KB | 2026-06-02 | 2026-06-02 |
| `607c23fc-ed24-4fff-b162-4979ba54d008.pdf` | PDF | 10.807 KB | 2026-06-02 | 2026-06-02 |
| `60e14e35-226b-49fa-803e-7b6f4fc586a2.pdf` | PDF | 310 KB | 2026-06-02 | 2026-06-02 |
| `6d85f8fd-54b4-40e8-b6bc-b6134de2a50f.pdf` | PDF | 310 KB | 2026-06-02 | 2026-06-02 |
| `72594d8e-f942-42ec-b929-d7121697ce1e.pdf` | PDF | 2.173 KB | 2026-06-02 | 2026-06-02 |
| `85db9ebf-7c64-405b-a492-e81501fb6959.pdf` | PDF | 2.417 KB | 2026-06-02 | 2026-06-02 |
| `86b66a85-b6fc-4225-bee8-21f329cf1c23.pdf` | PDF | 2.580 KB | 2026-06-02 | 2026-06-02 |
| `c00c2d15-a84c-4515-8acc-6765fcdc532b.pdf` | PDF | 5.913 KB | 2026-06-02 | 2026-06-02 |
| `c72de3cc-2abe-45c7-8912-b47949918826.pdf` | PDF | 3.093 KB | 2026-06-02 | 2026-06-02 |
| `d9a33dde-3e12-4245-849a-8170f3d00cb0.pdf` | PDF | 2.173 KB | 2026-06-02 | 2026-06-02 |
| `daafe36d-8282-49ae-93c8-a180b6fa47c4.pdf` | PDF | 2.580 KB | 2026-06-02 | 2026-06-02 |
| `db6ae527-c411-4eba-b62b-3824f34c3ee9.pdf` | PDF | 688 KB | 2026-06-02 | 2026-06-02 |
| `e6c63458-4af6-4d49-b5a6-ba223423161d.pdf` | PDF | 2.417 KB | 2026-06-02 | 2026-06-02 |

**Pasta `7a468d6f-7877-457d-80a2-b1035c1f53f1`** — **ÓRFÃ — não corresponde a nenhuma campanha** · 9 arquivos · 31.3 MB

| Arquivo | Tipo | Tamanho | Criado | Modificado |
|---|---|---|---|---|
| `10eaccc8-9b0b-4c4a-914b-af6e45451632.pdf` | PDF | 310 KB | 2026-05-29 | 2026-05-29 |
| `1717c904-bae3-4a36-8a1d-bec7c2e410c7.pdf` | PDF | 688 KB | 2026-05-29 | 2026-05-29 |
| `1fccd958-74e4-49a3-8d47-4e5c95ef3af4.pdf` | PDF | 4.043 KB | 2026-05-29 | 2026-05-29 |
| `2115dd03-97b8-4d74-9b1d-282ec945894f.pdf` | PDF | 3.093 KB | 2026-05-29 | 2026-05-29 |
| `5a6702b3-1451-46fd-80ce-564dbb1dbf43.pdf` | PDF | 2.417 KB | 2026-05-29 | 2026-05-29 |
| `5ee82593-437f-4f1b-9095-5c32ba84af5e.pdf` | PDF | 2.580 KB | 2026-05-29 | 2026-05-29 |
| `6644867a-7d78-4fb8-ba3c-8ff6bacdcd45.pdf` | PDF | 10.807 KB | 2026-05-29 | 2026-05-29 |
| `a92ae6aa-af19-421c-9b99-a77d3030df96.pdf` | PDF | 5.913 KB | 2026-05-29 | 2026-05-29 |
| `e1f9feff-dac3-4602-9099-57ed8449c60d.pdf` | PDF | 2.173 KB | 2026-05-29 | 2026-05-29 |

**Pasta `7ea79019-32ff-4691-9cf2-d5342bde0f57`** — campanha **Vitória Além da Taça** (existe no banco) · 9 arquivos · 31.3 MB

| Arquivo | Tipo | Tamanho | Criado | Modificado |
|---|---|---|---|---|
| `014eff54-a180-4ab2-b2c5-14cc211f40f9.pdf` | PDF | 3.093 KB | 2026-06-02 | 2026-06-02 |
| `4083a5b5-667a-4ceb-8bb6-e9340937fe09.pdf` | PDF | 688 KB | 2026-06-02 | 2026-06-02 |
| `40d3c9bb-c385-4b96-ba0c-8af8f4d58ab6.pdf` | PDF | 2.173 KB | 2026-06-02 | 2026-06-02 |
| `4c27490a-7f2d-43eb-a3d5-ae5a790cab1e.pdf` | PDF | 310 KB | 2026-06-02 | 2026-06-02 |
| `6ed267c9-298a-4d76-be2b-5b7efc98f8ae.pdf` | PDF | 5.913 KB | 2026-06-02 | 2026-06-02 |
| `6fc83f8f-52f5-437a-a9f6-30525dfd3ad0.pdf` | PDF | 10.807 KB | 2026-06-02 | 2026-06-02 |
| `7323db50-9798-439f-8822-d6c8a01416fe.pdf` | PDF | 2.580 KB | 2026-06-02 | 2026-06-02 |
| `d5742972-484e-4a91-b8b1-1936ffade25e.pdf` | PDF | 4.043 KB | 2026-06-02 | 2026-06-02 |
| `f15540d4-8cfe-4f55-8569-7e497ad7ede7.pdf` | PDF | 2.417 KB | 2026-06-02 | 2026-06-02 |

### 4.2 `documentos` — privado, 2 arquivos

| Arquivo | Pasta | Tipo | Tamanho | Criado |
|---|---|---|---|---|
| `1780862521529_teste-auditoria-2.pdf` | `cfb7b0c2-2413-436f-95db-246e08d065ca` | application/pdf | 242 bytes | 2026-06-07 |
| `.emptyFolderPlaceholder` | `Untitled folder` | application/octet-stream | 0 bytes | 2026-06-04 |

**Os dois são resíduo de teste**, não conteúdo: um PDF de **zero byte** chamado
`teste-auditoria-2.pdf`, e o `.emptyFolderPlaceholder` que o Supabase cria para
sustentar uma pasta vazia chamada `Untitled folder`.

### 4.3 `ebd-comprovantes` — privado, 2 arquivos

| Arquivo | Pasta | Tipo | Tamanho | Criado |
|---|---|---|---|---|
| `1781144918266_181a4ee9.jpeg` | `cddf3b61-f599-436d-99de-191bd6a5afed` | image/jpeg | 49 KB | 2026-06-10 |
| `1782426973503_9672eefd.jpeg` | `cddf3b61-f599-436d-99de-191bd6a5afed` | image/jpeg | 96 KB | 2026-06-25 |

Duas fotografias JPEG, em bucket **privado**, na pasta de uma campanha da EBD.
Comprovantes de entrega ou de contribuição, pelo nome do bucket. **A configuração
está correta** — é exatamente o tipo de arquivo que não pode ser público.

---

## 5. Classificação de cada arquivo

### 5.1 O limite desta classificação — leia antes da tabela

**Não baixei nem abri nenhum PDF.** Baixar arquivos exige autorização explícita, e o
pedido de auditoria não é a mesma coisa que autorização para transferir 131 MB de
documentos da igreja para esta máquina.

A consequência é honesta e precisa ser dita: **a classificação abaixo é por
metadado e contexto — tipo, tamanho, pasta, campanha vinculada — não por leitura de
conteúdo.** Onde a decisão depender do que está escrito dentro do PDF, a classificação
é **"Necessita revisão"**, e a §5.3 traz o comando para você mesma verificar.

### 5.2 Tabela de classificação

| Arquivos | Bucket | Classificação | Base da classificação |
|---|---|---|---|
| 9 PDFs da pasta `7ea79019…` | `campanhas-materiais` | **Necessita revisão** | Vinculados a campanha viva. Público sem necessidade comprovada; conteúdo não verificado |
| 18 PDFs da pasta `15e58af4…` | `campanhas-materiais` | **Sensível** | **Órfãos** — a campanha não existe mais. Público, sem dono lógico e sem tela que os alcance |
| 9 PDFs da pasta `7a468d6f…` | `campanhas-materiais` | **Sensível** | **Órfãos** — mesma situação |
| 2 JPEG | `ebd-comprovantes` | **Público apropriado** ¹ | Bucket privado, uso coerente com o nome |
| 1 PDF de 0 byte | `documentos` | **Necessita revisão** | Resíduo de teste em bucket privado. Sem risco, mas sem razão para existir |
| 1 `.emptyFolderPlaceholder` | `documentos` | **Público apropriado** ¹ | Artefato do Supabase, sem conteúdo |

¹ *"Público apropriado" no sentido de **classificação adequada ao que é**: estes estão
em bucket privado e assim devem permanecer. Nenhum arquivo do sistema foi avaliado
como devendo ser público.*

**Nenhum arquivo foi classificado como Crítico** — o que exigiria confirmação de dado
pessoal exposto, e essa confirmação depende de abrir os PDFs.

### 5.3 Como você confirma o conteúdo em dois minutos

Os PDFs estão em bucket público, então basta a URL — não precisa de chave:

```bash
curl -s -o amostra.pdf "$VITE_SUPABASE_URL/storage/v1/object/public/campanhas-materiais/7ea79019-32ff-4691-9cf2-d5342bde0f57/014eff54-a180-4ab2-b2c5-14cc211f40f9.pdf" && echo "baixado" && ls -la amostra.pdf
```

**O fato de esse comando funcionar sem autenticação já é, por si, o achado.**

---

## 6. Verificação de risco LGPD por categoria

| Categoria | Encontrado? | Evidência |
|---|---|---|
| Dados pessoais | **Indeterminado** | Depende do conteúdo dos 36 PDFs |
| Telefones | **Indeterminado** | Idem |
| E-mails | **Indeterminado** | Idem |
| Endereços | **Indeterminado** | Idem |
| Documentos de identidade | **Indeterminado** | Idem |
| Listas de presença | **Indeterminado** | Material de campanha pode conter ficha de inscrição |
| Informações pastorais | **Improvável** | Material de campanha é de divulgação, não de acompanhamento |
| Dados financeiros | **Improvável em público** | Os comprovantes estão em buckets **privados** — configuração correta |
| **Fotos de crianças ou adolescentes** | **Risco real, não confirmado** | `campanhas-materiais` serve campanhas que incluem a EBD. É a categoria de maior agravante |
| Documentos internos da igreja | **Provável** | 131 MB de PDF não é folheto; é material de trabalho |

**A leitura honesta desta tabela:** não há confirmação de exposição de dado pessoal, e
também não há confirmação de ausência. O que existe é **um canal aberto sem
autenticação para 36 documentos de trabalho da igreja**, e a incerteza sobre o
conteúdo é ela própria o problema — porque significa que ninguém sabe o que está
público.

---

## 7. Achados específicos

### 7.1 Arquivos órfãos — 27 arquivos, 93.8 MB

O bucket tem 3 pastas. A tabela `campanhas` tem **1 linha**. Duas pastas apontam para
campanhas que não existem mais:

| Pasta | Arquivos | Tamanho | Campanha |
|---|---|---|---|
| `15e58af4-3880-44ff-8eec-09005a9ccabf` | 18 | 62.5 MB | **não existe no banco** |
| `7ea79019-32ff-4691-9cf2-d5342bde0f57` | 9 | 31.3 MB | **Vitória Além da Taça** — viva |
| `7a468d6f-7877-457d-80a2-b1035c1f53f1` | 9 | 31.3 MB | **não existe no banco** |

**75% do conteúdo do bucket não tem dono.** A campanha foi apagada do banco e os
arquivos ficaram — o que confirma que **`CampanhasAdmin.tsx` não apaga o material ao
apagar a campanha**. É vazamento de armazenamento, e o número só cresce.

### 7.2 Arquivos duplicados

Os 36 arquivos têm apenas **9 tamanhos distintos**, e os 9 se repetem em todas as
pastas:

| | |
|---|---|
| Tamanhos distintos | 9 |
| Arquivos | 36 |
| Conteúdo único estimado | ~31 MB |
| **Redundância estimada** | **~100 MB, cerca de 76%** |

A pasta `15e58af4…` tem **18 arquivos e apenas 9 tamanhos** — cada documento está lá
**duas vezes**, com UUIDs diferentes. Isso sugere que o envio foi repetido e a tela
gerou um novo UUID em vez de substituir. **Nenhuma tela mostra isso**, porque a pasta é
órfã.

> **Ressalva de método.** Tamanho igual é indício forte de duplicidade, não prova.
> Confirmar por hash exigiria baixar os arquivos.

### 7.3 Buckets públicos sem necessidade operacional aparente

| Bucket | Público | Precisa ser? | Análise |
|---|---|---|---|
| `ebd-aulas` | sim | **provavelmente sim** | `ebdService.ts:298` chama `getPublicUrl()`. Material de aula distribuído por link |
| `locais-mapas` | sim | **provavelmente sim** | `Locais.tsx:253` chama `getPublicUrl()`. Mapa de local exibido sem sessão |
| `campanhas-materiais` | sim | **a decidir** | `CampanhasAdmin.tsx` é tela **de administração**. Se o material só é acessado por dentro do sistema, **não há razão para ser público** |

**`campanhas-materiais` é o único dos três em que a configuração pública não se
justifica pelo código.** Os outros dois usam `getPublicUrl()` deliberadamente — a
função só faz sentido em bucket público.

### 7.4 Buckets abandonados

**Nenhum.** Os 7 vazios pertencem a módulos construídos e ainda não adotados. Bucket
vazio de módulo não adotado é expectativa, não abandono.

---

## 8. Tabela resumo

| Bucket | Arquivos | Situação | Risco |
|---|---|---|---|
| `campanhas-materiais` | 36 | Público · 27 órfãos · ~76% duplicado · conteúdo não verificado | **ALTO** |
| `ebd-aulas` | 0 | Público e vazio · uso público justificado no código | **BAIXO** |
| `locais-mapas` | 0 | Público e vazio · uso público justificado no código | **BAIXO** |
| `documentos` | 2 | Privado · só resíduo de teste | **NULO** |
| `ebd-comprovantes` | 2 | Privado · uso correto | **NULO** |
| `arrecadacao-nf` | 0 | Privado · módulo não adotado | **NULO** |
| `fin-comprovantes` | 0 | Privado · módulo não adotado | **NULO** |
| `fiscal-docs` | 0 | Privado · módulo não adotado | **NULO** |
| `membresia-docs` | 0 | Privado · módulo não adotado | **NULO** |
| `pgm-reunioes` | 0 | Privado · módulo não adotado | **NULO** |

**O risco do sistema inteiro está concentrado em um bucket.**

---

# Ações Imediatas Recomendadas

Três, e a soma é **menos de uma hora**.

### 1 · Verificar o conteúdo de um PDF de cada pasta

*Minutos.* Rode o `curl` da §5.3 três vezes, uma por pasta, e abra os arquivos. **Esta
é a única ação que não pode ser adiada**, porque todas as decisões seguintes dependem
da resposta — e enquanto ninguém abrir, ninguém sabe o que está público.

**Se houver foto de criança, ficha de inscrição ou qualquer dado pessoal, o bucket
vira privado no mesmo dia.**

### 2 · Tornar `campanhas-materiais` privado

*Minutos.* É a única ação com efeito imediato sobre o risco, e o código sustenta a
mudança: `CampanhasAdmin.tsx` é tela de administração, acessada com sessão. Se alguma
chamada depender de `getPublicUrl()`, trocar por `createSignedUrl()` — URL temporária,
que é o mecanismo certo para material restrito.

**Ordem correta:** verificar o uso de `getPublicUrl()` no arquivo **antes** de virar a
chave, senão a tela quebra em silêncio.

### 3 · Não apagar os 27 órfãos ainda

*Decisão, não obra.* A tentação é apagar 94 MB sem dono. **Não faça isso antes do
item 1** — se forem material de campanha que a igreja quer preservar, apagar é
irreversível, e não há backup de storage documentado.

O caminho seguro é baixar antes, guardar fora do sistema, e só então limpar.

---

# Recomendações de Médio Prazo

### 1 · Fechar o vazamento na origem

*~1 dia.* Apagar a campanha deixa os arquivos. Duas saídas, e a segunda é melhor:

- **Cascata na aplicação** — `CampanhasAdmin.tsx` remove os arquivos ao apagar a
  campanha. Simples, mas depende de a tela lembrar, e **falha em silêncio se a política
  de `storage.objects` barrar o `DELETE`** — exatamente o Achado 15 da Auditoria
  Técnica.
- **Rotina de reconciliação** — uma função que lista pastas sem campanha
  correspondente e relata. Não apaga: **relata**. Roda mensalmente, e quem decide é uma
  pessoa.

**Recomendo a segunda**, pelo mesmo princípio do `conferir()`: o problema aqui não foi
o arquivo ter ficado, foi ninguém ter percebido durante três meses.

### 2 · Dar nome aos arquivos

*~meio dia.* Nome em UUID torna impossível saber o que é sem abrir. Guardar o nome
original — em coluna de tabela ou no `metadata` do objeto — resolve a auditoria futura
inteira. **Foi a ausência disso que obrigou este relatório a classificar por tamanho.**

### 3 · Evitar a duplicação no envio

*~meio dia.* Enviar com `upsert: true` e caminho determinístico, em vez de gerar UUID
novo a cada envio. `Locais.tsx:251` já usa `upsert: false` explicitamente — a decisão
existe no código, só não foi a mesma nos dois lugares.

### 4 · Revisar as 37 políticas de `storage.objects`

*~1 dia.* Ficaram fora do escopo deste relatório. Valem a mesma leitura que as funções
`SECURITY DEFINER` receberam — e a mesma armadilha se aplica: **políticas permissivas
se somam com OR** (ARCHITECTURE.md §4.4).

### 5 · Limpar os resíduos de teste

*Minutos.* O PDF de zero byte e a `Untitled folder` em `documentos`. Risco nenhum,
mas são as primeiras coisas que alguém vê ao abrir o bucket.

---

## 9. Respostas diretas ao que foi perguntado

| Pergunta | Resposta |
|---|---|
| **Quais buckets devem permanecer públicos?** | `ebd-aulas` e `locais-mapas` — o código usa `getPublicUrl()` deliberadamente e ambos estão vazios |
| **Quais devem se tornar privados?** | `campanhas-materiais`, salvo se a verificação mostrar que o material é de divulgação aberta |
| **Quais arquivos representam risco de LGPD?** | Os 36 PDFs, **em potencial**. Nenhum confirmado — a confirmação exige abrir os arquivos |
| **Quais objetos podem ser removidos?** | Os 27 órfãos e os 2 resíduos de teste — **depois** da verificação de conteúdo e de uma cópia de segurança |
| **Quais buckets estão ativos?** | 3 com conteúdo; 7 vazios de módulos ainda não adotados. **Nenhum abandonado** |

---

## 10. Limitações deste levantamento

1. **Nenhum PDF foi aberto.** Toda classificação de conteúdo é inferência por
   metadado. É a limitação que mais pesa, e a §5.3 traz o comando para superá-la.
2. **Duplicidade inferida por tamanho**, não por hash.
3. **As 37 políticas de `storage.objects` não foram lidas** uma a uma — só contadas.
4. **A verificação de referência no código** buscou o nome literal do bucket entre
   aspas. Um bucket montado por variável não seria encontrado.

---

*Levantamento por leitura de `storage.buckets`, `storage.objects` e `campanhas` no
banco de produção, cruzado com busca textual em `src/`. Nenhum bucket, permissão,
arquivo, migration ou linha de código foi alterado.*
