# =============================================================================
#  SYNC_GRANDT.ps1 - El "Ayudante de campo" del Gran DT oficial
#  PowerShell puro, cero dependencias.
#
#  Esto es lo que nos faltaba y no tiene ninguna otra fuente: el propio Gran DT
#  publica, en dos archivos JSON abiertos, el estado de cada jugador antes de
#  la fecha. LESIONADO, EN DUDA, SUSPENDIDO, EXPULSADO, NO JUEGA, JUEGA COPA.
#  Hasta hoy los suspendidos los cargabamos a mano en suspendidos.json y los
#  lesionados directamente no los teniamos.
#
#  De paso vienen la ley del ex de verdad (la de carrera, no la del torneo
#  pasado), el tarjetometro oficial, las figuras, el equipo ideal de la fecha
#  anterior y el momento exacto en que cierran los cambios.
#
#  Los dos archivos son publicos: se bajan sin estar logueado. Probado.
#    ESTATICO  cambia cuando cambia el plantel o se publica una fecha (~260 KB)
#    DINAMICO  cambia todo el tiempo, es el que trae los estados (~30 KB)
#
#  Salida: dataGranDT.json
# =============================================================================

Set-StrictMode -Off
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

$carpeta = $PSScriptRoot
if (-not $carpeta) { $carpeta = (Get-Location).Path }
$destino = Join-Path $carpeta 'dataGranDT.json'

$base  = 'https://www.grandt.clarin.com/ayudante/'
$sello = [DateTimeOffset]::Now.ToUnixTimeSeconds()
# Sin User-Agent de navegador algunos CDN de Clarin contestan 403.
$agente = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36'

Write-Host ""
Write-Host "-- ayudante de campo del Gran DT oficial --" -ForegroundColor Cyan

function Bajar-Json([string]$archivo, [string]$comoSeLlama) {
  $url = $base + $archivo + '?v=' + $sello
  for ($intento = 1; $intento -le 3; $intento++) {
    try {
      $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 45 -Headers @{ 'User-Agent' = $agente }
      $texto = $r.Content
      if ($texto -isnot [string]) { $texto = [Text.Encoding]::UTF8.GetString($r.Content) }
      $obj = $texto | ConvertFrom-Json
      Write-Host ("   {0}: {1:N0} KB" -f $comoSeLlama, ($texto.Length / 1kb)) -ForegroundColor DarkGray
      return $obj
    } catch {
      if ($intento -lt 3) {
        Write-Host ("   {0}: fallo el intento {1}, reintento..." -f $comoSeLlama, $intento) -ForegroundColor Yellow
        Start-Sleep -Seconds 3
      } else {
        Write-Host ("   {0}: no se pudo bajar. {1}" -f $comoSeLlama, $_.Exception.Message) -ForegroundColor Red
      }
    }
  }
  return $null
}

$est = Bajar-Json 'tmpCentralRefuerzosEstatico.gdt' 'estatico'
$din = Bajar-Json 'tmpCentralRefuerzosDinamico.gdt' 'dinamico'

# ---------------------------------------------------------------------------
# RED DE SEGURIDAD. Misma idea que en los otros syncs: si la bajada vino a
# medias, es mejor dejar el archivo de ayer que pisarlo con uno roto. Un
# dataGranDT.json vacio significaria "no hay ningun lesionado", que es la
# mentira mas cara que podriamos escribir.
# ---------------------------------------------------------------------------
$problemas = @()
if ($null -eq $est) { $problemas += 'no se pudo bajar el estatico' }
elseif (-not $est.todosLosJugadores -or $est.todosLosJugadores.Count -lt 300) { $problemas += 'el estatico vino sin plantel' }
if ($null -eq $din) { $problemas += 'no se pudo bajar el dinamico' }
elseif (-not $din.estadoPorJugador -or $din.estadoPorJugador.Count -lt 300) { $problemas += 'el dinamico vino sin estados' }

if ($problemas.Count -gt 0) {
  Write-Host ""
  Write-Host "  NO SE ESCRIBIO dataGranDT.json:" -ForegroundColor Red
  foreach ($p in $problemas) { Write-Host ("   - {0}" -f $p) -ForegroundColor Red }
  if (Test-Path $destino) {
    Write-Host "  Se deja el archivo anterior, que sirve igual salvo por los cambios de ultimo momento." -ForegroundColor Yellow
  }
  exit 1
}

$salida = [ordered]@{
  generado = (Get-Date).ToString('o')
  fuente   = 'Ayudante de campo de grandt.clarin.com (archivos publicos del juego)'
  estatico = $est
  dinamico = $din
}
$salida | ConvertTo-Json -Depth 12 -Compress | Set-Content -Path $destino -Encoding UTF8

# ---------------------------------------------------------------------------
# Resumen para el log: lo que importa es cuantos NO juegan y por que.
# ---------------------------------------------------------------------------
$nombreDeEstado = @{}
foreach ($s in $est.estadosJugador) { $nombreDeEstado[[string]$s.id] = ([string]$s.nombre).Trim() }

$cuenta = @{}
foreach ($e in $din.estadoPorJugador) {
  $k = [string]$e.st
  if (-not $cuenta.ContainsKey($k)) { $cuenta[$k] = 0 }
  $cuenta[$k]++
}

Write-Host ""
Write-Host "LISTO. Escrito: dataGranDT.json" -ForegroundColor Green
Write-Host ("   fecha:            {0}" -f $din.fechaActual.nombre)
if ($din.fechaActual.inicioVeda) {
  $veda = [DateTimeOffset]::FromUnixTimeMilliseconds([long]$din.fechaActual.inicioVeda).LocalDateTime
  Write-Host ("   cierran cambios:  {0:dd/MM HH:mm}" -f $veda)
}
Write-Host ("   jugadores:        {0}" -f $est.todosLosJugadores.Count)
Write-Host ("   ley del ex:       {0}" -f $est.leyDelEx.Count)
Write-Host ("   tarjetometro:     {0}" -f $est.jugTarjetometro.Count)
Write-Host ("   figuras:          {0}" -f $est.jugFiguras.Count)
Write-Host "   -- estado de cada jugador para esta fecha --" -ForegroundColor White
foreach ($k in ($cuenta.Keys | Sort-Object { -$cuenta[$_] })) {
  $nom = $nombreDeEstado[$k]
  if (-not $nom) { $nom = "estado $k" }
  $color = 'Gray'
  if ($nom -eq 'Lesionado' -or $nom -eq 'Suspendido' -or $nom -eq 'Expulsado' -or $nom -eq 'No juega') { $color = 'Red' }
  if ($nom -eq 'En duda' -or $nom -eq 'Jugo Copa' -or $nom -eq 'Juega Copa') { $color = 'Yellow' }
  if ($nom -eq 'Posible Titular') { $color = 'Green' }
  Write-Host ("      {0,-18} {1,4}" -f $nom, $cuenta[$k]) -ForegroundColor $color
}

# Los que directamente no juegan, con nombre y apellido: son los que hay que
# sacar del equipo, asi que van a la vista y no escondidos en un conteo.
$nombrePorId = @{}
foreach ($j in $est.todosLosJugadores) { $nombrePorId[[string]$j.id] = $j }
$fuera = @()
foreach ($e in $din.estadoPorJugador) {
  $nom = $nombreDeEstado[[string]$e.st]
  if ($nom -eq 'Lesionado' -or $nom -eq 'Suspendido' -or $nom -eq 'Expulsado' -or $nom -eq 'No juega') {
    $j = $nombrePorId[[string]$e.idJT]
    if ($j) { $fuera += [pscustomobject]@{ nombre = $j.nombre; club = $j.club; pos = $j.posicionCancha; estado = $nom } }
  }
}
if ($fuera.Count -gt 0) {
  Write-Host ""
  Write-Host ("   NO JUEGAN ({0}):" -f $fuera.Count) -ForegroundColor Red
  foreach ($f in ($fuera | Sort-Object estado, club)) {
    Write-Host ("      {0,-26} {1,-20} {2,-4} {3}" -f $f.nombre, $f.club, $f.pos, $f.estado) -ForegroundColor DarkYellow
  }
}
Write-Host ""
