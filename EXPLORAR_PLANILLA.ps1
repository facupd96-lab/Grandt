# Lista TODAS las hojas de la planilla de Planeta Gran DT y las guarda en CSV.
#
# La version anterior probaba los gid del 0 al 80 a ciegas y se perdia las hojas
# con gid alto (Google les pone numeros de nueve cifras a las que se agregan
# despues). Ahora se pide la version publicada en HTML, que trae adentro el
# menu con el NOMBRE y el GID de cada hoja, y se bajan todas.
$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$carpeta = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $carpeta
$salida = Join-Path $carpeta 'planilla_tabs'
if (-not (Test-Path $salida)) { New-Item -ItemType Directory -Path $salida | Out-Null }

# EL ID DE LA PLANILLA VIVE EN planilla.json, NO ACA.
# PlanetaGranDT publica una planilla NUEVA cada fecha, con otro ID. Estuvimos
# bajando la de la fecha 6 cuando ya se habia jugado la 7, y ni nos enteramos:
# el log decia "ultima fecha: F6" y parecia normal. Ahora el ID sale de
# planilla.json, que se cambia en dos segundos, y si el archivo no esta se usa
# el ultimo que conociamos.
$idPlanilla = '2PACX-1vQWGNjh7CL09RS5jbryuvTL88q8AYF6yV5kJqmraLlASvJeyK6jYJlb8XulTFWOuEXwIOhHhVBu1CpY'
$rutaPlanilla = Join-Path $carpeta 'planilla.json'
if (Test-Path $rutaPlanilla) {
  try {
    $cfg = Get-Content $rutaPlanilla -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($cfg.id) {
      $idPlanilla = $cfg.id
      Write-Host ("   planilla: la de la fecha {0} (planilla.json, actualizada el {1})" -f $cfg.fecha, $cfg.actualizado) -ForegroundColor DarkGray
    }
  } catch { Write-Host "   OJO: planilla.json no se pudo leer, uso el ID de siempre." -ForegroundColor Yellow }
}
$sello = [DateTimeOffset]::Now.ToUnixTimeSeconds()

Write-Host ""
Write-Host "  Pidiendo el indice de hojas de la planilla..." -ForegroundColor Cyan

$html = $null
try {
  $r = Invoke-WebRequest -Uri "https://docs.google.com/spreadsheets/d/e/$idPlanilla/pubhtml?t=$sello" -UseBasicParsing -TimeoutSec 40
  $html = $r.Content
} catch {
  Write-Host ("  No pude bajar el indice: {0}" -f $_.Exception.Message) -ForegroundColor Red
}

$hojas = New-Object System.Collections.ArrayList
if ($html) {
  # El menu de hojas viene como {name: "TARJETERO", ... gid: "123456789"}
  foreach ($m in [regex]::Matches($html, '\{name:\s*"([^"]+)",\s*[^}]*?gid:\s*"(\d+)"')) {
    [void]$hojas.Add(@{ nombre = $m.Groups[1].Value; gid = $m.Groups[2].Value })
  }
  if ($hojas.Count -eq 0) {
    foreach ($m in [regex]::Matches($html, 'gid=(\d+)[^>]*>([^<]{2,60})<')) {
      [void]$hojas.Add(@{ nombre = $m.Groups[2].Value.Trim(); gid = $m.Groups[1].Value })
    }
  }
}

if ($hojas.Count -eq 0) {
  Write-Host "  El indice no trajo nombres. Vuelvo a probar gid por gid, del 0 al 200." -ForegroundColor Yellow
  foreach ($g in 0..200) { [void]$hojas.Add(@{ nombre = "gid $g"; gid = "$g" }) }
} else {
  Write-Host ("  {0} hoja(s) en la planilla:" -f $hojas.Count) -ForegroundColor Green
  foreach ($h in $hojas) { Write-Host ("     {0,-12} {1}" -f $h.gid, $h.nombre) -ForegroundColor DarkGray }
}
Write-Host ""

$limpio = {
  param($t)
  $t = $t -replace '[\\/:*?"<>|]', '_'
  $t = $t -replace '\s+', '_'
  if ($t.Length -gt 40) { $t = $t.Substring(0,40) }
  return $t
}

$ok = 0
foreach ($h in $hojas) {
  $url = "https://docs.google.com/spreadsheets/d/e/$idPlanilla/pub?output=csv&gid=$($h.gid)&t=$sello"
  try { $t = (Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 30).Content } catch { continue }
  if ($null -eq $t -or $t.Length -lt 40) { continue }
  $ok++
  $lineas = ($t -split "`r?`n") | Where-Object { $_.Trim().Length -gt 0 }
  $nombre = & $limpio $h.nombre
  $archivo = Join-Path $salida ("{0}__gid{1}.csv" -f $nombre, $h.gid)
  [IO.File]::WriteAllText($archivo, $t, (New-Object Text.UTF8Encoding $true))
  Write-Host ("  {0,-30} {1,5} filas" -f $h.nombre, $lineas.Count) -ForegroundColor Green
  $primera = $lineas | Select-Object -First 1
  if ($primera.Length -gt 110) { $primera = $primera.Substring(0,110) + '...' }
  Write-Host ("       {0}" -f $primera) -ForegroundColor DarkGray
}

Write-Host ""
Write-Host ("  {0} hoja(s) guardadas en planilla_tabs\" -f $ok) -ForegroundColor Green
Write-Host "  Buscamos sobre todo el TARJETERO (suspensiones) y los IDEALES por fecha." -ForegroundColor Cyan
Write-Host ""
Write-Host "  Enter para cerrar."
[void][Console]::ReadLine()
