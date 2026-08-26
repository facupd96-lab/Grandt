# =============================================================================
#  PREPARAR_GITHUB.ps1 - Arma una carpeta lista para subir al repositorio.
#
#  Copia SOLO lo que hace falta, deja afuera lo que no debe subirse (node.exe,
#  que pesa 80 MB) y te dice exactamente que arrastrar a GitHub.
# =============================================================================

Set-StrictMode -Off
$ErrorActionPreference = 'Continue'

$carpeta = $PSScriptRoot
if (-not $carpeta) { $carpeta = (Get-Location).Path }
$destino = Join-Path $carpeta '_subir_github'

# --- Que va y por que ---
$grupos = @(
  @{ titulo = 'LA WEB (sin esto la pagina no anda)'
     archivos = @('index.html','styles.css','teamsRegistry.js','appV3.js','datos.js') },
  @{ titulo = 'EL MOTOR (para poder regenerar datos desde otra PC)'
     archivos = @('armar.cjs','motorV3.cjs','package.json',
                  'ACTUALIZAR_TODO.bat','ACTUALIZAR_TODO.ps1',
                  'SYNC_PLANETA.bat','SYNC_PLANETA.ps1',
                  'SYNC_365.bat','SYNC_365.ps1',
                  'SYNC_365_HISTORICO.bat','SYNC_365_HISTORICO.ps1',
                  'SYNC_CUOTAS.bat','SYNC_CUOTAS.ps1',
                  'SYNC_COPAS.bat','SYNC_COPAS.ps1',
                  'VER_STATS.bat','VER_STATS.ps1',
                  'BACKTEST.bat','backtest.cjs') },
  @{ titulo = 'LOS DATOS'
     archivos = @('data.js','dataPlaneta.json','data365.json','data365_historico.json',
                  'dataCuotas.json','dataCopas.json','dataFixture.json') },
  @{ titulo = 'DEL REPOSITORIO'
     archivos = @('README.md','.gitignore','PREPARAR_GITHUB.bat','PREPARAR_GITHUB.ps1') }
)

Write-Host ""
Write-Host "-- preparando la carpeta para GitHub --" -ForegroundColor Cyan
Write-Host ""

if (Test-Path $destino) { Remove-Item $destino -Recurse -Force }
New-Item -ItemType Directory -Path $destino | Out-Null

$copiados = 0; $faltantes = @(); $pesoTotal = 0
foreach ($grupo in $grupos) {
  Write-Host ("   {0}" -f $grupo.titulo) -ForegroundColor White
  foreach ($nombre in $grupo.archivos) {
    $origen = Join-Path $carpeta $nombre
    if (-not (Test-Path $origen)) {
      Write-Host ("      {0,-28} FALTA" -f $nombre) -ForegroundColor Red
      $faltantes += $nombre
      continue
    }
    Copy-Item $origen (Join-Path $destino $nombre) -Force
    $kb = (Get-Item $origen).Length / 1KB
    $pesoTotal += $kb
    $copiados++
    Write-Host ("      {0,-28} {1,8:N0} KB" -f $nombre, $kb) -ForegroundColor DarkGray
  }
  Write-Host ""
}

# el historial de recomendaciones: es lo que permite el backtest
$hist = Join-Path $carpeta 'historial'
if (Test-Path $hist) {
  $destHist = Join-Path $destino 'historial'
  New-Item -ItemType Directory -Path $destHist | Out-Null
  $n = 0
  Get-ChildItem $hist -Filter '*.json' | ForEach-Object { Copy-Item $_.FullName $destHist -Force; $n++ }
  Write-Host ("   HISTORIAL DE RECOMENDACIONES") -ForegroundColor White
  Write-Host ("      historial\  {0} fotos de fecha" -f $n) -ForegroundColor DarkGray
  Write-Host ""
}

Write-Host ("   {0} archivos · {1:N1} MB en total" -f $copiados, ($pesoTotal/1024)) -ForegroundColor Green
if ($faltantes.Count -gt 0) {
  Write-Host ("   faltan: {0}" -f ($faltantes -join ', ')) -ForegroundColor Yellow
}

# Aviso sobre lo que NO se copia
$node = Join-Path $carpeta 'node.exe'
if (Test-Path $node) {
  Write-Host ("   (node.exe queda afuera a proposito: {0:N0} MB, se rebaja solo)" -f ((Get-Item $node).Length/1MB)) -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "   COMO SUBIRLO" -ForegroundColor Cyan
Write-Host "   1. Abri  https://github.com/facupd96-lab/Grandt"
Write-Host "   2. Boton  Add file  ->  Upload files"
Write-Host "   3. Arrastra TODO el contenido de la carpeta _subir_github"
Write-Host "   4. Abajo escribi que cambiaste y dale  Commit changes"
Write-Host ""
Write-Host "   Los archivos con el mismo nombre se reemplazan solos." -ForegroundColor DarkGray
Write-Host ""

Start-Process $destino
