# =============================================================================
#  RECALCULAR.ps1 - Rehace las cuentas SIN volver a bajar datos.
#
#  ACTUALIZAR_TODO tarda 40 minutos porque baja Planeta, 365, cuotas y copas.
#  Cuando lo que cambio es el MOTOR y no los datos, eso es tiempo tirado: los
#  json ya estan en la carpeta y alcanza con volver a calcular.
#
#  Nace de un error concreto (03/09): se cambio motorV3.cjs despues de la ultima
#  corrida, salida.json quedo de la corrida anterior, y el auditor del algoritmo
#  marco 80 jugadores como rotos. No estaban rotos: estaba auditando un archivo
#  viejo. Con esto se rehace en segundos y el auditor mira lo que corresponde.
#
#  NO toca dataPlaneta.json, data365.json, dataCuotas.json ni dataCopas.json.
#  Solo rehace salida.json, datos.js e index.html.
# =============================================================================

Set-StrictMode -Off
$ErrorActionPreference = 'Continue'

$carpeta = $PSScriptRoot
if (-not $carpeta) { $carpeta = (Get-Location).Path }

function Titulo([string]$texto) {
  Write-Host ""
  Write-Host ("=" * 70) -ForegroundColor DarkCyan
  Write-Host ("  {0}" -f $texto) -ForegroundColor Cyan
  Write-Host ("=" * 70) -ForegroundColor DarkCyan
}

$node = Join-Path $carpeta 'node.exe'
if (-not (Test-Path $node)) { $node = 'node' }

Push-Location $carpeta

Titulo "rehaciendo las cuentas (armar.cjs)"
& $node 'armar.cjs'
if ($LASTEXITCODE -ne 0) {
  Write-Host "   armar.cjs fallo. No sigo." -ForegroundColor Red
  Pop-Location
  Read-Host "Enter para cerrar"
  exit 1
}

if (Test-Path (Join-Path $carpeta 'construir.cjs')) {
  Titulo "rehaciendo index.html (construir.cjs)"
  & $node 'construir.cjs'
}

Titulo "1. los datos: hay algo que no puede ser?"
& $node 'auditar.cjs'

Titulo "2. la coherencia: la pantalla dice lo mismo que el motor?"
& $node 'auditar_numeros.cjs'

Titulo "3. el algoritmo: el puntaje esta bien armado?"
& $node 'auditar_motor.cjs'

Pop-Location
Write-Host ""
Write-Host "   Listo. Abri index.html y recarga con Ctrl+F5." -ForegroundColor Green
Read-Host "Enter para cerrar"
