# Copia para a area de transferencia o ENSAIO COMPLETO da liquidacao: modelagem + ensaio funcional, embrulhados em
# BEGIN; ... ROLLBACK; (nada fica gravado). Cole no SQL Editor do Supabase e clique em Run.
# "Success. No rows returned" = estrutura criada E todos os casos passaram. Este arquivo e ASCII de proposito (PS 5.1).
$docs = Join-Path $PSScriptRoot "..\docs"
$a = [System.IO.File]::ReadAllText((Join-Path $docs "MODELAGEM_LIQUIDACAO_CENTRAL_PAGAMENTOS.sql"), [System.Text.Encoding]::UTF8)
$b = [System.IO.File]::ReadAllText((Join-Path $docs "MODELAGEM_LIQUIDACAO_CENTRAL_PAGAMENTOS_ENSAIO_FUNCIONAL.sql"), [System.Text.Encoding]::UTF8)
Set-Clipboard -Value ("BEGIN;`r`n" + $a.TrimEnd() + "`r`n`r`n" + $b.TrimEnd() + "`r`n`r`nROLLBACK;`r`n")
Write-Host "Copiado: ENSAIO COMPLETO (modelagem + 7 casos de teste, BEGIN ... ROLLBACK: nada sera gravado)."
Write-Host "Agora cole no SQL Editor do Supabase e clique em Run."
