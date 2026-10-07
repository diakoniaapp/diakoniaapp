# Copia o ENSAIO do AutoCadastro de Visitantes (modelagem + casos de teste) em BEGIN; ... ROLLBACK; (nada fica gravado).
# ASCII de proposito (PS 5.1).
$raiz = Join-Path $PSScriptRoot ".."
$a = [System.IO.File]::ReadAllText((Join-Path $raiz "docs/AUTOCADASTRO_VISITANTES_QR.sql"), [System.Text.Encoding]::UTF8)
$b = [System.IO.File]::ReadAllText((Join-Path $raiz "docs/AUTOCADASTRO_VISITANTES_QR_ENSAIO_FUNCIONAL.sql"), [System.Text.Encoding]::UTF8)
Set-Clipboard -Value ("BEGIN;`r`n" + $a.TrimEnd() + "`r`n`r`n" + $b.TrimEnd() + "`r`n`r`nROLLBACK;`r`n")
Write-Host "Copiado: ENSAIO do AutoCadastro de Visitantes (BEGIN ... ROLLBACK: nada sera gravado)."
