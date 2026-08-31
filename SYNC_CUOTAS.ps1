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
# La MEJOR cuota de todas las casas para ese resultado.
# Promediar cuotas de 25 casas tira el precio para abajo y hace parecer que el
# margen es enorme: en la fecha 7 daba entre 7.9% y 16.5% segun el partido, y
# 16.5% no lo cobra ninguna casa. El margen real sale de tomar el mejor precio
# disponible de cada resultado, que es lo que pagaria alguien que compara.
# Se sigue guardando el promedio para mostrar, pero las PROBABILIDADES salen
# del mejor precio, que es el mas afilado.
function Mejor($lista) {
  if ($null -eq $lista -or $lista.Count -eq 0) { return $null }
  $max = 0.0
  foreach ($valor in $lista) { if ([double]$valor -gt $max) { $max = [double]$valor } }
  return $max
}

Write-Host ""
Write-Host "-- bajando cuotas de las casas de apuestas --" -ForegroundColor Cyan
Write-Host ""

# Reintentos. El 27/08 fallo con "No se puede resolver el nombre remoto" —un
# tropiezo de DNS, no un problema de la API— y como no habia reintento se quedo
# sin cuotas toda la corrida. Las cuotas son la fuente PRINCIPAL de los goles
# esperados: sin ellas el motor queda ciego. Tres intentos con espera.
$respuesta = $null
$esperas = @(0, 5, 15)
for ($intento = 0; $intento -lt $esperas.Count; $intento++) {
  if ($esperas[$intento] -gt 0) {
    Write-Host ("   reintentando en {0} segundos..." -f $esperas[$intento]) -ForegroundColor DarkGray
    Start-Sleep -Seconds $esperas[$intento]
  }
  try {
    $respuesta = Invoke-RestMethod -Uri $direccion -TimeoutSec 30
    break
  } catch {
    $mensaje = $_.Exception.Message
    $fatal = $false
    if ($_.Exception.Response) {
      $codigo = [int]$_.Exception.Response.StatusCode
      if ($codigo -eq 401) { Write-Host "   La clave de la API no es valida." -ForegroundColor Red; $fatal = $true }
      if ($codigo -eq 429) { Write-Host "   Se agotaron las 500 consultas del mes." -ForegroundColor Red; $fatal = $true }
    }
    Write-Host ("   FALLO (intento {0} de {1}): {2}" -f ($intento + 1), $esperas.Count, $mensaje) -ForegroundColor Red
    if ($fatal) { break }
  }
}
if ($null -eq $respuesta) {
  Write-Host ""
  Write-Host "   No se pudieron bajar las cuotas. dataCuotas.json queda como estaba." -ForegroundColor Yellow
  Write-Host "   Si el archivo es de esta misma fecha, el motor sigue andando igual." -ForegroundColor Yellow
  Write-Host "   Si no, corre SYNC_CUOTAS.bat de nuevo antes de armar el equipo." -ForegroundColor Yellow
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
  $porLinea = @{}
  $lineaTotales = $null
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

      # --- OVER / UNDER, agrupado POR LINEA ---
      # BUG ARREGLADO 27/08. Antes esto metia TODOS los Over de todas las casas
      # en la misma bolsa y se quedaba con el "point" de la ultima casa que
      # aparecia. Si ocho casas cotizaban Over 2.5 y dos cotizaban Over 1.5, el
      # promedio mezclaba las diez y quedaba etiquetado con la linea de la
      # ultima. Riestra vs Velez salio con linea 1.5 —el unico partido de la
      # fecha con esa linea, los otros 14 con 2.0— y eso le tiro los goles
      # esperados del partido a 1.87 cuando el resto de la fecha esta en 2.4-2.9.
      # A Velez le daba 0.88 goles esperados y una cuota de gol de 1.70, contra
      # el 1.55 que pagaban las casas de verdad.
      # Ahora se agrupa por linea y se usa la que cotizan MAS casas, que es la
      # linea principal. Las alternativas quedan afuera.
      if ($mercado.key -eq 'totals') {
        foreach ($resultado in $mercado.outcomes) {
          if ($null -eq $resultado.point) { continue }
          $pt = [string]([double]$resultado.point)
          if (-not $porLinea.ContainsKey($pt)) {
            $porLinea[$pt] = @{ over = New-Object System.Collections.ArrayList
                                under = New-Object System.Collections.ArrayList }
          }
          if ($resultado.name -eq 'Over')  { [void]$porLinea[$pt].over.Add([double]$resultado.price) }
          if ($resultado.name -eq 'Under') { [void]$porLinea[$pt].under.Add([double]$resultado.price) }
        }
      }
    }
  }

  # Se elige la linea que cotizan mas casas. Si empatan, la mas cercana a 2.5,
  # que es la linea normal del futbol argentino.
  $mejorLinea = $null; $mejorCant = -1
  foreach ($pt in $porLinea.Keys) {
    $cant = $porLinea[$pt].over.Count + $porLinea[$pt].under.Count
    $empata = ($cant -eq $mejorCant -and $null -ne $mejorLinea -and
               [math]::Abs([double]$pt - 2.5) -lt [math]::Abs([double]$mejorLinea - 2.5))
    if ($cant -gt $mejorCant -or $empata) { $mejorCant = $cant; $mejorLinea = $pt }
  }
  if ($null -ne $mejorLinea) {
    $lineaTotales = [double]$mejorLinea
    $cuotasOver  = $porLinea[$mejorLinea].over
    $cuotasUnder = $porLinea[$mejorLinea].under
    $otras = @($porLinea.Keys | Where-Object { $_ -ne $mejorLinea })
    if ($otras.Count -gt 0) {
      Write-Host ("   ({0} vs {1}: se usa la linea {2}, cotizada por {3} casas. Se descartaron las lineas {4})" -f `
        $nombreLocal, $nombreVisitante, $lineaTotales, [int]($mejorCant/2), ($otras -join ', ')) -ForegroundColor DarkGray
    }
  }

  $promLocal     = Promedio $cuotasLocal
  $promEmpate    = Promedio $cuotasEmpate
  $promVisitante = Promedio $cuotasVisitante
  $promOver      = Promedio $cuotasOver
  $promUnder     = Promedio $cuotasUnder
  # Para las probabilidades se usa el mejor precio de cada resultado.
  $mejLocal      = Mejor $cuotasLocal
  $mejEmpate     = Mejor $cuotasEmpate
  $mejVisitante  = Mejor $cuotasVisitante
  $mejOver       = Mejor $cuotasOver
  $mejUnder      = Mejor $cuotasUnder

  if ($null -eq $promLocal -or $null -eq $promEmpate -or $null -eq $promVisitante) { continue }

  # Sacarle el margen: 1/cuota suma mas de 1, hay que normalizar.
  # Las probabilidades salen del MEJOR precio de cada resultado, no del
  # promedio. Con el promedio de 25 casas el margen aparente daba hasta 16.5%
  # en un partido de la fecha 7, y ese margen no lo cobra nadie: es el efecto de
  # promediar. Con el mejor precio el margen queda en el 2-4% real.
  $crudoLocal     = 1.0 / $mejLocal
  $crudoEmpate    = 1.0 / $mejEmpate
  $crudoVisitante = 1.0 / $mejVisitante
  $sumaCrudos = $crudoLocal + $crudoEmpate + $crudoVisitante
  $margen = $sumaCrudos - 1.0

  # Margen del promedio, solo para poder comparar los dos numeros.
  $cP = (1.0/$promLocal) + (1.0/$promEmpate) + (1.0/$promVisitante)
  $margenPromedio = $cP - 1.0

  $probLocal     = $crudoLocal / $sumaCrudos
  $probEmpate    = $crudoEmpate / $sumaCrudos
  $probVisitante = $crudoVisitante / $sumaCrudos

  $probOver = $null
  if ($null -ne $mejOver -and $null -ne $mejUnder) {
    $crudoOver  = 1.0 / $mejOver
    $crudoUnder = 1.0 / $mejUnder
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
    margenCasa       = R3 $margen
    margenPromediando = R3 $margenPromedio
    cuotaLocalMejor  = R3 $mejLocal
    cuotaEmpateMejor = R3 $mejEmpate
    cuotaVisitanteMejor = R3 $mejVisitante
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

$margenes = @(); $margenesProm = @()
foreach ($partido in $partidos) {
  $margenes += [double]$partido['margenCasa']
  if ($null -ne $partido['margenPromediando']) { $margenesProm += [double]$partido['margenPromediando'] }
}
if ($margenes.Count -gt 0) {
  $margenMedio = (Promedio $margenes)
  Write-Host ("   margen con el MEJOR precio de cada resultado: {0:P1}  (es el que usamos)" -f $margenMedio)
  if ($margenesProm.Count -gt 0) {
    Write-Host ("   margen si promediaramos las 25 casas:         {0:P1}  (inflado, no lo cobra nadie)" -f (Promedio $margenesProm)) -ForegroundColor DarkGray
  }
}
Write-Host ""
