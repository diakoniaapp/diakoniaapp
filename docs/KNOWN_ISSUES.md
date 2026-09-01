# Defeitos conhecidos — medidos em 27/08/2026

Ordenados por custo de descobrir tarde. Números foram contados, não estimados.

## Alcançam o usuário

| # | Defeito | Medida |
|---|---|---|
| 1 | **39 `confirm()` nativos** fora de `AlertDialog`. Em navegador embarcado devolvem "cancelou" sem perguntar — botão que não faz nada no celular, sem erro | `grep -rn "confirm(" src --include=*.tsx \| grep -v AlertDialog` |
| 2 | **Abas do Discipulado inalcançáveis no celular**: 474px sem ancestral rolável; o `<main>` recorta e as abas da direita não podem ser tocadas | conferido a 375px |
| 3 | ~~**EBD fora da agenda desde janeiro**~~ — **resolvido em 01/09/2026**: o fim da série passou de 04/01 para 27/12, a mesma data dos dois cultos dominicais. A causa (o campo "Em" preenchido com hoje) foi corrigida em `cb542d5`; sem ela, o UPDATE seria remendo | restam 2 séries vencidas, possivelmente legítimas: Ensaio Jovens (24/07) e Vigília pelas Famílias (29/05) |
| 4 | **Barra "% do perfil matriculado"** dá 0% no Berçário (8 alunos) e 150% em Crianças | tela do módulo EBD |
| 5 | **`meta description`** promete "campanhas" (módulo sem uso) e termina em "e muito mais" | `index.html:9` |
| 6 | **Não existe `apple-touch-icon.png`** — instruções num comentário do `index.html` | `public/` |

## Banco

| # | Defeito |
|---|---|
| 7 | Gatilho carimba **meia-assinatura** quando `auth.uid()` é NULL (escrita pela API de gerenciamento). Conserto: `IF auth.uid() IS NULL THEN RETURN NEW; END IF;` |
| 8 | Política **`membros_by_igreja` não checa papel** — e permissivas se somam com OR, anulando as mais estreitas |
| 9 | **Leonardo Pereira Vieira**: falecido em 19/08, saída sem assinatura. Não inventamos quem registrou |
| 10 | **`observacoes_pastorais_arquivadas`** existe vazia; o DROP foi barrado |
| 11 | Três colunas **100% vazias**: `data_membro`, `data_congregado`, `data_batismo` |
| 12 | Renomear **`visita_historico` / `visitante_id`** — dizem "visita" para contato pastoral de qualquer pessoa |

## Achado pela Supabase CLI (27/08)

| # | Defeito |
|---|---|
| ~~18~~ | ~~**`sugerir_voluntarios_escala` existe DUAS vezes** no banco — sobrecarga de 5 e de 7 argumentos. O código só usa a de 7 (`escalaService.ts:208`). Efeito colateral: o gerador de tipos PULA funções sobrecarregadas, então ela fica fora do `types.ts` gerado — e é por isso que a regeneração ainda não é segura. Apagar a de 5 destrava a geração automática~~ — **RESOLVIDO em 27/08** (migration 20260828250000). O `types.ts` passou a ser GERADO pela Supabase CLI, encerrando o Risco 9 do CLAUDE.md |

## Sistêmicos, do levantamento

| # | Defeito |
|---|---|
| 13 | **`--muted-foreground` com opacidade reduzida** (36 usos `/80` a `/30`) reprova em contraste. O token base foi corrigido; os modificadores não têm conserto sem caso a caso |
| 14 | **Validações de formulário nunca construídas**: nascimento no futuro ou acima de 120 anos, casamento antes dos 14, entrada no futuro |
| 15 | **Sem CI.** Nada roda sozinho |
| 16 | **Testes e2e pulam** sem `E2E_TELEFONE` / `E2E_SENHA` |
| 17 | **Pacote de 2,7 MB** sem `manualChunks` — primeira carga lenta em 3G, e a igreja usa celular |

## Corrigidos nesta rodada, registrados para não voltarem

- `toISOString()` em data local (dois lugares na agenda) — das 21h à meia-noite respondia amanhã
- Padrão do fim de série era **hoje**, criando séries de um encontro só
- Filtro salvo escondia eventos com aviso quase invisível e sem forma de limpar
- Impressão sem a categoria `arrecadacao` no padrão
