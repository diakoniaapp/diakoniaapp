# Copia o ENSAIO da migration 20261007110000 (view segura + colunas do painel) + o ensaio funcional (8 casos) para a
# area de transferencia, em BEGIN; ... ROLLBACK; (nada fica gravado). Roda DEPOIS de a 20261007100000 estar aplicada.
# ASCII de proposito (PS 5.1).
$raiz = Join-Path $PSScriptRoot ".."
$m = [System.IO.File]::ReadAllText((Join-Path $raiz "supabase/migrations/20261007110000_fin_obrigacoes_seguranca_e_painel.sql"), [System.Text.Encoding]::UTF8)
$t = [System.IO.File]::ReadAllText((Join-Path $raiz "docs/MODELAGEM_LIQUIDACAO_CENTRAL_PAGAMENTOS_ENSAIO_FUNCIONAL.sql"), [System.Text.Encoding]::UTF8)
Set-Clipboard -Value ("BEGIN;`r`n" + $m.TrimEnd() + "`r`n`r`n" + $t.TrimEnd() + "`r`n`r`nROLLBACK;`r`n")
Write-Host "Copiado: ENSAIO da migration 20261007110000 + 8 casos (BEGIN ... ROLLBACK: nada sera gravado)."
