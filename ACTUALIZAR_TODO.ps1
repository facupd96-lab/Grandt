# =============================================================================
#  ACTUALIZAR_TODO.ps1 - Un solo paso para dejar la app al dia.
#
#  Corre los cuatro sync en orden y despues regenera datos.js, que es lo que
#  lee index.html. Antes eso ultimo lo hacia yo a mano.
#
#  El unico obstaculo era que armar.js necesita Node y no estaba instalado.
#  Este script lo resuelve solo: si no encuentra Node, se baja el ejecutable
#  oficial (portable, no instala nada, no toca el registro ni el PATH) y lo
#  deja en la carpeta. Se hace una sola vez.
# =============================================================================

Set-StrictMode -Off
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'

$carpeta = $PSScriptRoot
if (-not $carpeta) { $carpeta = (Get-Location).Path }

function Titulo([string]$texto) {
  Write-Host ""
  Write-Host ("=" * 70) -ForegroundColor DarkCyan
  Write-Host ("  {0}" -f $texto) -ForegroundColor Cyan
  Write-Host ("=" * 70) -ForegroundColor DarkCyan
}

# ---------------------------------------------------------------------------
# 0. Conseguir Node
# ---------------------------------------------------------------------------
function Buscar-Node {
  $local = Join-Path $carpeta 'node.exe'
  if (Test-Path $local) { return $local }
  $enPath = Get-Command node -ErrorAction SilentlyContinue
  if ($enPath) { return $enPath.Source }
  return $null
}

function Bajar-Node {
  Write-Host "   Node no esta instalado. Lo bajo una sola vez (unos 30 MB)." -ForegroundColor Yellow
  Write-Host "   Es el ejecutable oficial de nodejs.org, portable: queda como un" -ForegroundColor DarkGray
  Write-Host "   archivo mas en esta carpeta y no instala ni modifica nada." -ForegroundColor DarkGray
  Write-Host ""

  # Preguntar a nodejs.org cual es la ultima version LTS, en vez de cablear una
  $version = $null
  try {
    $indice = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json' -TimeoutSec 40
    foreach ($v in $indice) { if ($v.lts -and $v.lts -ne $false) { $version = [string]$v.version; break } }
  } catch {
    Write-Host ("   no pude consultar nodejs.org: {0}" -f $_.Exception.Message) -ForegroundColor Red
  }
  if (-not $version) { Write-Host "   no pude averiguar la version de Node." -ForegroundColor Red; return $null }

  $arch = if ([Environment]::Is64BitOperatingSystem) { 'x64' } else { 'x86' }
  $url  = "https://nodejs.org/dist/$version/node-$version-win-$arch.zip"
  $zip  = Join-Path $env:TEMP "node-$version.zip"
  $tmp  = Join-Path $env:TEMP "node-$version-extraido"

  Write-Host ("   bajando {0} ..." -f $url) -NoNewline
  try {
    Invoke-WebRequest -Uri $url -OutFile $zip -TimeoutSec 600 -UseBasicParsing
    Write-Host " ok" -ForegroundColor Green
  } catch {
    Write-Host " FALLO" -ForegroundColor Red
    Write-Host ("   {0}" -f $_.Exception.Message) -ForegroundColor Red
    return $null
  }

  Write-Host "   extrayendo..." -NoNewline
  try {
    if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::ExtractToDirectory($zip, $tmp)
    $exe = Get-ChildItem -Path $tmp -Filter 'node.exe' -Recurse | Select-Object -First 1
    if ($null -eq $exe) { Write-Host " no encontre node.exe en el zip" -ForegroundColor Red; return $null }
    Copy-Item $exe.FullName (Join-Path $carpeta 'node.exe') -Force
    Write-Host " ok" -ForegroundColor Green
  } catch {
    Write-Host " FALLO" -ForegroundColor Red
    Write-Host ("   {0}" -f $_.Exception.Message) -ForegroundColor Red
    return $null
  } finally {
    if (Test-Path $zip) { Remove-Item $zip -Force -ErrorAction SilentlyContinue }
    if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue }
  }
  return (Join-Path $carpeta 'node.exe')
}

# ---------------------------------------------------------------------------
# 1. Los cuatro sync
# ---------------------------------------------------------------------------
$arranque = Get-Date
Titulo "ACTUALIZAR TODO - Gran DT"
Write-Host ("   {0}" -f $arranque.ToString('dddd dd/MM/yyyy HH:mm'))

$pasos = @(
  @{ archivo = 'SYNC_PLANETA.ps1'; que = 'planilla oficial: puntos, cotizaciones, goles, tarjetas' },
  @{ archivo = 'SYNC_365.ps1';     que = 'tiros, xG y minutos por jugador, mas tarjetas con fecha' },
  @{ archivo = 'SYNC_CUOTAS.ps1';  que = 'cuotas 1X2 y Over/Under de la proxima fecha' },
  @{ archivo = 'SYNC_COPAS.ps1';   que = 'calendario de liga y copas, fixture y rotacion' }
)

$fallaron = @()
foreach ($paso in $pasos) {
  $ruta = Join-Path $carpeta $paso.archivo
  if (-not (Test-Path $ruta)) {
    Write-Host ("   falta {0}, lo salteo" -f $paso.archivo) -ForegroundColor Yellow
    continue
  }
  Titulo $paso.que
  try {
    & $ruta
    if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { $fallaron += $paso.archivo }
  } catch {
    Write-Host ("   ERROR en {0}: {1}" -f $paso.archivo, $_.Exception.Message) -ForegroundColor Red
    $fallaron += $paso.archivo
  }
}

# ---------------------------------------------------------------------------
# 2. Regenerar datos.js
# ---------------------------------------------------------------------------
Titulo "recalculando el motor y regenerando datos.js"
$node = Buscar-Node
if (-not $node) { $node = Bajar-Node }

if (-not $node) {
  Write-Host ""
  Write-Host "   Los datos quedaron actualizados, pero no pude regenerar datos.js" -ForegroundColor Yellow
  Write-Host "   porque no consegui Node. La app va a seguir mostrando lo anterior." -ForegroundColor Yellow
} else {
  # OJO: package.json de la carpeta tiene "type": "module", asi que Node trata
  # cualquier .js como modulo ES y armar.js usa require(). Por eso el motor va
  # como .cjs, que fuerza el modo CommonJS sin tocar el package.json ni el resto.
  $motor = Join-Path $carpeta 'armar.cjs'
  if (-not (Test-Path $motor)) { $motor = Join-Path $carpeta 'armar.js' }
  Push-Location $carpeta
  & $node $motor
  $codigo = $LASTEXITCODE
  Pop-Location
  if ($codigo -eq 0) {
    Write-Host ""
    Write-Host "   datos.js regenerado." -ForegroundColor Green
  } else {
    Write-Host ("   armar.js termino con codigo {0}" -f $codigo) -ForegroundColor Red
    $fallaron += 'armar'
  }
}

# ---------------------------------------------------------------------------
# 3. Resumen
# ---------------------------------------------------------------------------
$tardo = [math]::Round(((Get-Date) - $arranque).TotalMinutes, 1)
Titulo "listo"
Write-Host ("   tardo {0} minutos" -f $tardo)
if ($fallaron.Count -gt 0) {
  Write-Host ("   con problemas en: {0}" -f ($fallaron -join ', ')) -ForegroundColor Yellow
  Write-Host "   (mira mas arriba el detalle de cada uno)" -ForegroundColor DarkGray
} else {
  Write-Host "   todo ok. Abri index.html y recarga con Ctrl+F5." -ForegroundColor Green
}
foreach ($archivo in @('dataPlaneta.json','data365.json','dataCuotas.json','dataCopas.json','dataFixture.json','datos.js')) {
  $r = Join-Path $carpeta $archivo
  if (Test-Path $r) {
    $f = Get-Item $r
    Write-Host ("      {0,-22} {1,8:N0} KB   {2}" -f $archivo, ($f.Length/1KB), $f.LastWriteTime.ToString('dd/MM HH:mm')) -ForegroundColor DarkGray
  } else {
    Write-Host ("      {0,-22} FALTA" -f $archivo) -ForegroundColor Red
  }
}
Write-Host ""
