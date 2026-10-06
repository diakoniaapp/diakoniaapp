# Copia uma migration para a area de transferencia, pronta para colar no SQL Editor do Supabase.
#
#   -Ensaio      embrulha em BEGIN; ... ROLLBACK;  (roda tudo, confere e DESFAZ: nada fica gravado)
#   sem -Ensaio  copia o arquivo puro (para valer: o SQL Editor grava ao executar)
#
# Uso (na raiz do projeto):
#   powershell -NoProfile -File scripts/copiar-migration.ps1 20261003130000 -Ensaio
#   powershell -NoProfile -File scripts/copiar-migration.ps1 20261003130000
#
# Este arquivo e ASCII de proposito: o Windows PowerShell 5.1 le .ps1 sem BOM como ANSI e quebraria acentos.
# O SQL, esse sim, e lido como UTF-8 (os acentos das migrations chegam intactos).
param(
  [Parameter(Mandatory = $true)][string]$Numero,
  [switch]$Ensaio
)

$pasta = Join-Path $PSScriptRoot "..\supabase\migrations"
$arquivo = Get-ChildItem -Path $pasta -Filter "$Numero*.sql" | Select-Object -First 1
if (-not $arquivo) { Write-Host "Nenhuma migration comeca com '$Numero'." -ForegroundColor Red; exit 1 }

$sql = [System.IO.File]::ReadAllText($arquivo.FullName, [System.Text.Encoding]::UTF8)
if ($Ensaio) { $sql = "BEGIN;`r`n" + $sql.TrimEnd() + "`r`n`r`nROLLBACK;`r`n" }

Set-Clipboard -Value $sql
if ($Ensaio) { $modo = "ENSAIO (BEGIN ... ROLLBACK): nada sera gravado" } else { $modo = "PARA VALER: vai gravar ao executar" }
Write-Host ("Copiado: " + $arquivo.Name) -ForegroundColor Green
Write-Host ("Modo:    " + $modo)
Write-Host "Agora cole no SQL Editor do Supabase e clique em Run."
