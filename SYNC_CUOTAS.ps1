# =============================================================================
#  SYNC_CUOTAS.ps1 - Cuotas de las casas de apuestas (the-odds-api)
#  PowerShell puro, cero dependencias.
#
#  Baja 1X2 y Over/Under de la proxima fecha, promedia TODAS las casas,
#  y les saca el margen de la casa (asi las probabilidades suman 100% de verdad).
#
#  Salida: dataCuotas.json
#  Ojo: la clave gratis tiene 500 consultas por mes. Este script gasta 1.
# =============================================================================

Set-StrictMode -Off
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'

$carpeta = $PSScriptRoot
if (-not $carpeta) { $carpeta = (Get-Location).Path }

$clave = '8a6d8b4cf6a4ce19d1163793902d564b'
$direccion = "https://api.the-odds-api.com/v4/sports/soccer_argentina_primera_division/odds/?apiKey=$clave&regions=eu,uk&markets=h2h,totals&oddsFormat=decimal"

function Promedio($lista) {
  if ($null -eq $lista -or $lista.Count -eq 0) { return $null }
  $suma = 0.0
  foreach ($valor in $lista) { $suma += [double]$valor }
  return $suma / $lista.Count
}
function R3($valor) { return [math]::Round([double]$valor, 3) }

Write-Host ""
Write-Host "-- bajando cuotas de las casas de apuestas --" -ForegroundColor Cyan
Write-Host ""

$respuesta = $null
try {
  $respuesta = Invoke-RestMethod -Uri $direccion -TimeoutSec 30
} catch {
  Write-Host ("   FALLO: {0}" -f $_.Exception.Message) -ForegroundColor Red
  if ($_.Exception.Response) {
    $codigo = [int]$_.Exception.Response.StatusCode
    if ($codigo -eq 401) { Write-Host "   La clave de la API no es valida." -ForegroundColor Red }
    if ($codigo -eq 429) { Write-Host "   Se agotaron las 500 consultas del mes." -ForegroundColor Red }
  }
  Write-Host ""
  exit
}

if ($null -eq $respuesta -or @($respuesta).Count -eq 0) {
  Write-Host "   No hay partidos con cuotas ahora mismo." -ForegroundColor Yellow
  Write-Host ""
  exit
}

$partidos = New-Object System.Collections.ArrayList

foreach ($encuentro in $respuesta) {

  $nombreLocal     = [string]$encuentro.home_team
  $nombreVisitante = [string]$encuentro.away_team

  $cuotasLocal = New-Object System.Collections.ArrayList
  $cuotasEmpate = New-Object System.Collections.ArrayList
  $cuotasVisitante = New-Object System.Collections.ArrayList
  $cuotasOver = New-Object System.Collections.ArrayList
  $cuotasUnder = New-Object System.Collections.ArrayList
  $lineaTotales = 2.5
  $cantidadCasas = 0

  foreach ($casa in $encuentro.bookmakers) {
    $cantidadCasas++
    foreach ($mercado in $casa.markets) {

      if ($mercado.key -eq 'h2h') {
        foreach ($resultado in $mercado.outcomes) {
          $etiqueta = [string]$resultado.name
          if ($etiqueta -eq $nombreLocal)          { [void]$cuotasLocal.Add([double]$resultado.price) }
          elseif ($etiqueta -eq $nombreVisitante)  { [void]$cuotasVisitante.Add([double]$resultado.price) }
          elseif ($etiqueta -eq 'Draw')            { [void]$cuotasEmpate.Add([double]$resultado.price) }
        }
      }

      if ($mercado.key -eq 'totals') {
        foreach ($resultado in $mercado.outcomes) {
          if ($resultado.name -eq 'Over')  {
            [void]$cuotasOver.Add([double]$resultado.price)
            if ($null -ne $resultado.point) { $lineaTotales = [double]$resultado.point }
          }
          if ($resultado.name -eq 'Under') { [void]$cuotasUnder.Add([double]$resultado.price) }
        }
      }
    }
  }

  $promLocal     = Promedio $cuotasLocal
  $promEmpate    = Promedio $cuotasEmpate
  $promVisitante = Promedio $cuotasVisitante
  $promOver      = Promedio $cuotasOver
  $promUnder     = Promedio $cuotasUnder

  if ($null -eq $promLocal -or $null -eq $promEmpate -or $null -eq $promVisitante) { continue }

  # Sacarle el margen de la casa: 1/cuota suma mas de 1, hay que normalizar
  $crudoLocal     = 1.0 / $promLocal
  $crudoEmpate    = 1.0 / $promEmpate
  $crudoVisitante = 1.0 / $promVisitante
  $sumaCrudos = $crudoLocal + $crudoEmpate + $crudoVisitante
  $margen = $sumaCrudos - 1.0

  $probLocal     = $crudoLocal / $sumaCrudos
  $probEmpate    = $crudoEmpate / $sumaCrudos
  $probVisitante = $crudoVisitante / $sumaCrudos

  $probOver = $null
  if ($null -ne $promOver -and $null -ne $promUnder) {
    $crudoOver  = 1.0 / $promOver
    $crudoUnder = 1.0 / $promUnder
    $probOver = $crudoOver / ($crudoOver + $crudoUnder)
  }

  $registro = [ordered]@{
    local          = $nombreLocal
    visitante      = $nombreVisitante
    cuando         = [string]$encuentro.commence_time
    casas          = $cantidadCasas
    cuotaLocal     = R3 $promLocal
    cuotaEmpate    = R3 $promEmpate
    cuotaVisitante = R3 $promVisitante
    probLocal      = R3 $probLocal
    probEmpate     = R3 $probEmpate
    probVisitante  = R3 $probVisitante
    margenCasa     = R3 $margen
    lineaTotales   = $lineaTotales
    cuotaOver      = $(if ($null -ne $promOver)  { R3 $promOver }  else { $null })
    cuotaUnder     = $(if ($null -ne $promUnder) { R3 $promUnder } else { $null })
    probOver       = $(if ($null -ne $probOver)  { R3 $probOver }  else { $null })
  }
  [void]$partidos.Add($registro)
}

$resultado = [ordered]@{
  generado = (Get-Date).ToString('o')
  fuente   = 'the-odds-api · promedio de casas · sin margen'
  partidos = $partidos.Count
  cuotas   = $partidos
}

$textoJson = $resultado | ConvertTo-Json -Depth 5
$rutaSalida = Join-Path $carpeta 'dataCuotas.json'
[System.IO.File]::WriteAllText($rutaSalida, $textoJson, (New-Object System.Text.UTF8Encoding($false)))

Write-Host "LISTO. Escrito: dataCuotas.json" -ForegroundColor Green
Write-Host ""
Write-Host ("   partidos con cuotas: {0}" -f $partidos.Count)
Write-Host ""
Write-Host ("   {0,-26} {1,-26} {2,6} {3,6} {4,6}   {5,7} {6,7} {7,7}" -f 'LOCAL','VISITANTE','1','X','2','P(loc)','P(emp)','P(vis)')
foreach ($partido in $partidos) {
  Write-Host ("   {0,-26} {1,-26} {2,6:N2} {3,6:N2} {4,6:N2}   {5,7:P0} {6,7:P0} {7,7:P0}" -f `
    $partido['local'], $partido['visitante'], `
    $partido['cuotaLocal'], $partido['cuotaEmpate'], $partido['cuotaVisitante'], `
    $partido['probLocal'], $partido['probEmpate'], $partido['probVisitante'])
}
Write-Host ""

$margenes = @()
foreach ($partido in $partidos) { $margenes += [double]$partido['margenCasa'] }
if ($margenes.Count -gt 0) {
  $margenMedio = (Promedio $margenes)
  Write-Host ("   margen promedio de las casas: {0:P1}  (eso es lo que le sacamos a las cuotas)" -f $margenMedio)
}
Write-Host ""
