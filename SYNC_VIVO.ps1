# =============================================================================
#  SYNC_VIVO.ps1 - Puntajes EN VIVO de la fecha (Planeta Gran DT)
#
#  Baja el feed JSON de Blogger de la seccion "Puntajes" y despues llama a
#  vivo.cjs, que lo parsea y escribe dataVivo.js.
#
#  ESTO NO ALIMENTA AL MOTOR. Es a proposito. Planeta corrige los puntajes
#  cuando la fecha termina; si el motor comiera de aca, cada correccion le
#  cambiaria el pasado. Los datos con los que se calcula siguen saliendo de la
#  planilla oficial (SYNC_PLANETA.bat -> dataPlaneta.json).
#  Esto es solo para mirar el Versus mientras se juega.
#
#  Se puede correr las veces que uno quiera: son 2 segundos y no pisa nada mas
#  que dataVivo.js.
# =============================================================================

Set-StrictMode -Off
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'

$carpeta = $PSScriptRoot
if (-not $carpeta) { $carpeta = (Get-Location).Path }
Set-Location $carpeta

# Cuantos posts traer. Planeta publica uno por dia de partidos, asi que con 10
# sobra para cubrir una fecha entera (viernes a lunes) con margen.
$cuantos = 10
$url = "https://www.planetagrandt.com.ar/feeds/posts/default/-/Puntajes?alt=json&max-results=$cuantos"

Write-Host ""
Write-Host "-- puntajes en vivo: bajando los posts de Planeta --" -ForegroundColor Cyan

function Bajar([string]$direccion) {
  for ($intento = 1; $intento -le 3; $intento++) {
    try {
      $r = Invoke-WebRequest -Uri $direccion -UseBasicParsing -TimeoutSec 45 `
             -Headers @{ 'User-Agent' = 'Mozilla/5.0'; 'Accept' = 'application/json' }
      if ($r.RawContentStream) {
        $bytes = $r.RawContentStream.ToArray()
        if ($bytes.Length -gt 0) { return [System.Text.Encoding]::UTF8.GetString($bytes) }
      }
      return [string]$r.Content
    } catch {
      Write-Host ("   intento {0} de 3 fallo: {1}" -f $intento, $_.Exception.Message) -ForegroundColor DarkYellow
      if ($intento -lt 3) { Start-Sleep -Seconds (2 * $intento) }
    }
  }
  return $null
}

$texto = Bajar $url
if (-not $texto) {
  Write-Host "  no pude bajar el feed. Puede ser internet, o que Planeta este caido." -ForegroundColor Red
  Write-Host "  dataVivo.js queda como estaba: la app sigue mostrando lo de la corrida anterior." -ForegroundColor Yellow
  exit 1
}

# Chequeo minimo de que lo que vino es el feed y no una pagina de error.
if ($texto.Length -lt 2000 -or $texto -notmatch '"entry"') {
  Write-Host ("  lo que vino no parece el feed ({0} caracteres, sin entradas). No piso nada." -f $texto.Length) -ForegroundColor Red
  exit 1
}

$destino = Join-Path $carpeta 'feedVivo.json'
[System.IO.File]::WriteAllText($destino, $texto, (New-Object System.Text.UTF8Encoding($false)))
Write-Host ("   feed bajado: {0:N0} KB" -f ($texto.Length / 1024)) -ForegroundColor DarkGray

# ---- parsear ----
$node = Join-Path $carpeta 'node.exe'
if (-not (Test-Path $node)) { $node = 'node' }
& $node (Join-Path $carpeta 'vivo.cjs')
if ($LASTEXITCODE -ne 0) {
  Write-Host "  vivo.cjs termino con error. Mira lo que dijo aca arriba." -ForegroundColor Red
  exit $LASTEXITCODE
}
Write-Host ""
