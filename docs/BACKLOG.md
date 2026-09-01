# Backlog — em ordem de valor por esforço

> Um item sai daqui quando entra em `CURRENT_SPRINT.md`. Nada de "algum dia":
> se não vale ser feito, apague.

## Agora

1. **Terminar a transmissão ao vivo** — ver `NEXT_TASK.md`
2. **Devolver a EBD ao calendário** — depende da Telma dizer até quando a série vale
3. **Os 39 `confirm()`** — priorizar os destrutivos (excluir campanha, arquivar reserva, excluir lançamento). Referência de conserto: `pages/Ebd.tsx`

## Em seguida

4. **Abas do Discipulado no celular** — dar rolagem horizontal ao contêiner
5. **A barra de "% do perfil"** — decidir o que ela deve dizer quando passa de 100% ou quando o perfil é zero
6. **`meta description`** — reescrever sem "campanhas" e sem "e muito mais"
7. **Gatilho de meia-assinatura** — `IF auth.uid() IS NULL THEN RETURN NEW`

## Quando houver fôlego

8. **Indicador de série encerrada na lista da agenda** — hoje só aparece ao abrir o evento para editar. Foi a falta disso que deixou a EBD sumir por sete meses
9. **`manualChunks`** para `pdfjs-dist`, `tesseract.js`, `leaflet`, `recharts` — 2,7 MB na primeira carga
10. **CI** rodando `tsc -p tsconfig.app.json`, `vite build` e `vitest`
11. **`apple-touch-icon.png`**
12. **Validações de formulário** (nascimento no futuro, casamento antes dos 14)
13. **Renomear `visita_historico` / `visitante_id`**
14. **Limpar as 3 colunas vazias** e a tabela `observacoes_pastorais_arquivadas`

## Ideias não decididas

- Horário por dia da semana na recorrência (a grade do Google faz; nosso caso não precisa)
- Inscrição com vagas para eventos
- IA para variar o texto do convite — ver `DECISIONS.md` D-6
