# =============================================================================
#  SYNC_COPAS.ps1 - Calendario completo de cada equipo (liga + copas)
#  PowerShell puro, cero dependencias.
#
#  Para que? Porque un equipo que juega el miercoles por Libertadores en Brasil
#  y el domingo por la liga pone suplentes. Sus jugadores valen menos y los del
#  rival valen mas. Sin el calendario de copas eso no se puede ver.
#
#  FUENTE: 365Scores (la misma que ya usa SYNC_365 y que en tu maquina anda).
#  ESPN quedo afuera: su API devuelve 403 desde tu red.
#
#  No pide ids de torneo a mano: primero saca los equipos de la liga argentina
#  y despues le pregunta a 365Scores el calendario COMPLETO de cada equipo,
#  sea el torneo que sea. Asi las copas aparecen solas.
#
#  Salida: dataCopas.json  +  dataFixture.json
# =============================================================================

Set-StrictMode -Off
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'

$carpeta = $PSScriptRoot
if (-not $carpeta) { $carpeta = (Get-Location).Path }

$idLiga    = 72
$queryBase = "appTypeId=5&langId=29&timezoneName=America/Argentina/Buenos_Aires&userCountryId=11"

$encabezados = @{
  'User-Agent'      = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
  'Accept'          = 'application/json, text/plain, */*'
  'Accept-Language' = 'es-AR,es;q=0.9,en;q=0.8'
  'Referer'         = 'https://www.365scores.com/'
}

# ---------------------------------------------------------------------------
# Red
# ---------------------------------------------------------------------------
$script:erroresMostrados = 0

function ConvertirNodo($nodo) {
  if ($null -eq $nodo) { return $null }
  if ($nodo -is [System.Collections.IDictionary]) {
    $obj = New-Object PSObject
    foreach ($clave in @($nodo.Keys)) {
      $obj | Add-Member NoteProperty ([string]$clave) (ConvertirNodo $nodo[$clave]) -Force
    }
    return $obj
  }
  if ($nodo -is [string]) { return $nodo }
  if ($nodo -is [System.Collections.IEnumerable]) {
    $lista = New-Object System.Collections.ArrayList
    foreach ($item in $nodo) { [void]$lista.Add((ConvertirNodo $item)) }
    return ,$lista.ToArray()
  }
  return $nodo
}

function Obtener-JsonUnaVez([string]$direccion) {
  $errorUno = ''
  try { return Invoke-RestMethod -Uri $direccion -Headers $encabezados -TimeoutSec 45 }
  catch { $errorUno = $_.Exception.Message }

  $errorDos = ''
  try {
    $respuesta = Invoke-WebRequest -Uri $direccion -Headers $encabezados -TimeoutSec 45 -UseBasicParsing
    $texto = $respuesta.Content
    if ($texto -is [byte[]]) { $texto = [System.Text.Encoding]::UTF8.GetString($texto) }
    try { return ($texto | ConvertFrom-Json) }
    catch {
      Add-Type -AssemblyName System.Web.Extensions -ErrorAction SilentlyContinue
      $serializador = New-Object System.Web.Script.Serialization.JavaScriptSerializer
      $serializador.MaxJsonLength  = [int]::MaxValue
      $serializador.RecursionLimit = 200
      return (ConvertirNodo $serializador.DeserializeObject($texto))
    }
  } catch { $errorDos = $_.Exception.Message }

  $script:ultimoError = $errorUno
  if ($errorUno -eq '') { $script:ultimoError = $errorDos }
  return $null
}

# 365Scores tira 504 cada tanto cuando se le pide muy seguido.
# No es un error nuestro: se espera y se reintenta.
$script:reintentos = 0
function Obtener-Json([string]$direccion) {
  $esperas = @(0, 2, 5, 10)
  for ($vuelta = 0; $vuelta -lt $esperas.Count; $vuelta++) {
    if ($esperas[$vuelta] -gt 0) {
      Start-Sleep -Seconds $esperas[$vuelta]
      $script:reintentos++
    }
    $script:ultimoError = ''
    $respuesta = Obtener-JsonUnaVez $direccion
    if ($null -ne $respuesta) { return $respuesta }
  }
  if ($script:erroresMostrados -lt 3) {
    $script:erroresMostrados++
    Write-Host ""
    Write-Host ("   [error de red] {0}" -f $script:ultimoError) -ForegroundColor DarkYellow
    Write-Host ("   url: {0}" -f $direccion) -ForegroundColor DarkGray
    Write-Host "   (sigo con el resto, no es fatal)" -ForegroundColor DarkGray
  }
  return $null
}

# ---------------------------------------------------------------------------
# Parseo defensivo del objeto "game" de 365Scores
# ---------------------------------------------------------------------------
function Leer-Fecha($texto) {
  if (-not $texto) { return $null }
  $cadena = [string]$texto
  $formatos = @('dd/MM/yyyy HH:mm:ss','dd/MM/yyyy HH:mm','yyyy-MM-ddTHH:mm:ss','yyyy-MM-dd HH:mm:ss','MM/dd/yyyy HH:mm:ss','MM/dd/yyyy HH:mm')
  foreach ($formato in $formatos) {
    try { return [datetime]::ParseExact($cadena, $formato, [Globalization.CultureInfo]::InvariantCulture) } catch { }
  }
  try { return [datetime]::Parse($cadena, [Globalization.CultureInfo]::InvariantCulture) } catch { }
  try { return [datetime]::Parse($cadena) } catch { }
  return $null
}

function Leer-Marcador($competidor) {
  if ($null -eq $competidor) { return $null }
  $valor = $null
  try { if ($null -ne $competidor.score) { $valor = [double]$competidor.score } } catch { return $null }
  if ($null -eq $valor) { return $null }
  if ($valor -lt 0) { return $null }          # 365Scores manda -1 cuando no se jugo
  return [int]$valor
}

function Leer-Lados($juego) {
  if ($null -ne $juego.homeCompetitor -and $null -ne $juego.awayCompetitor) {
    return @{ local = $juego.homeCompetitor; visitante = $juego.awayCompetitor }
  }
  if ($null -ne $juego.competitors) {
    $lista = @($juego.competitors)
    if ($lista.Count -ge 2) { return @{ local = $lista[0]; visitante = $lista[1] } }
  }
  return $null
}

Write-Host ""
Write-Host "-- calendario de liga y copas (fuente: 365Scores) --" -ForegroundColor Cyan
Write-Host ""

# ---------------------------------------------------------------------------
# 0. Prueba de conexion
# ---------------------------------------------------------------------------
Write-Host "   probando la conexion con 365Scores..." -NoNewline
$prueba = Obtener-Json "https://webws.365scores.com/web/games/current/?$queryBase&competitions=$idLiga"
if ($null -eq $prueba) {
  Write-Host " FALLO" -ForegroundColor Red
  Write-Host ""
  Write-Host "   No pude hablar con 365Scores. Pasame las lineas [error de red] de arriba." -ForegroundColor Yellow
  Write-Host "   (SYNC_365 usa el mismo servidor, asi que si ese anda esto tambien deberia)" -ForegroundColor DarkGray
  Write-Host ""
  exit
}
Write-Host " ok" -ForegroundColor Green
Write-Host ""

# ---------------------------------------------------------------------------
# 1. Partidos de la liga -> fixture + lista de equipos argentinos
# ---------------------------------------------------------------------------
$juegosPorId  = @{}
$nombreTorneo = @{}
$equiposLiga  = @{}
$nombresLiga  = New-Object 'System.Collections.Generic.HashSet[string]'

function Guardar-Torneos($respuesta) {
  if ($null -eq $respuesta -or $null -eq $respuesta.competitions) { return }
  foreach ($torneo in @($respuesta.competitions)) {
    if ($null -eq $torneo -or $null -eq $torneo.id) { continue }
    $clave = [string]$torneo.id
    if (-not $nombreTorneo.ContainsKey($clave)) { $nombreTorneo[$clave] = [string]$torneo.name }
  }
}

function Guardar-Juegos($respuesta) {
  if ($null -eq $respuesta -or $null -eq $respuesta.games) { return 0 }
  $nuevos = 0
  foreach ($juego in @($respuesta.games)) {
    if ($null -eq $juego -or $null -eq $juego.id) { continue }
    $clave = [string]$juego.id
    if ($juegosPorId.ContainsKey($clave)) { continue }
    $juegosPorId[$clave] = $juego
    $nuevos++
  }
  return $nuevos
}

Write-Host "   liga argentina:" -ForegroundColor White
foreach ($endpoint in @('results','current','fixtures')) {
  $respuesta = Obtener-Json "https://webws.365scores.com/web/games/$endpoint/?$queryBase&competitions=$idLiga"
  Guardar-Torneos $respuesta
  $agregados = Guardar-Juegos $respuesta
  $total = 0
  if ($respuesta -and $respuesta.games) { $total = @($respuesta.games).Count }
  Write-Host ("      {0,-10} {1,4} partidos ({2} nuevos)" -f $endpoint, $total, $agregados)
  Start-Sleep -Milliseconds 150
}

# --- completar las fechas anteriores -------------------------------------
# Los endpoints de arriba solo traen la fecha en curso y la que viene. Para la
# tabla de posiciones hacen falta TODAS las fechas jugadas.
Write-Host ""
Write-Host "   completando fechas anteriores de la liga..." -ForegroundColor White

function Ronda-De($juego) {
  $numero = 0
  try { if ($juego.roundNum) { $numero = [int]$juego.roundNum } elseif ($juego.stageNum) { $numero = [int]$juego.stageNum } } catch { }
  return $numero
}

$maxRonda = 0
foreach ($clave in @($juegosPorId.Keys)) {
  $juego = $juegosPorId[$clave]
  try { if ([int]$juego.competitionId -ne $idLiga) { continue } } catch { continue }
  $ronda = Ronda-De $juego
  if ($ronda -gt $maxRonda) { $maxRonda = $ronda }
}
if ($maxRonda -lt 1) { $maxRonda = 10 }

# camino A: pedir fecha por fecha
$agregadosA = 0
for ($ronda = 1; $ronda -le $maxRonda; $ronda++) {
  $respuesta = Obtener-Json "https://webws.365scores.com/web/games/results/?$queryBase&competitions=$idLiga&roundNum=$ronda"
  Guardar-Torneos $respuesta
  $agregadosA += (Guardar-Juegos $respuesta)
  Start-Sleep -Milliseconds 300
}
Write-Host ("      por numero de fecha (1 a {0}): {1} partidos nuevos" -f $maxRonda, $agregadosA)

# camino B: pedir por ventanas de fecha calendario, por si roundNum no existe
$agregadosB = 0
if ($agregadosA -lt 15) {
  $cursorDia = (Get-Date).Date
  for ($ventana = 0; $ventana -lt 14; $ventana++) {
    $hastaDia = $cursorDia
    $desdeDia = $cursorDia.AddDays(-13)
    $direccion = ("https://webws.365scores.com/web/games/results/?$queryBase&competitions=$idLiga&startDate={0}&endDate={1}" -f $desdeDia.ToString('dd/MM/yyyy'), $hastaDia.ToString('dd/MM/yyyy'))
    $respuesta = Obtener-Json $direccion
    Guardar-Torneos $respuesta
    $agregadosB += (Guardar-Juegos $respuesta)
    $cursorDia = $desdeDia.AddDays(-1)
    Start-Sleep -Milliseconds 300
  }
  Write-Host ("      por rango de fechas (ultimos 6 meses): {0} partidos nuevos" -f $agregadosB)
}

# camino C: los gameIds que ya estan guardados en data.js.
# Los endpoints de listado solo devuelven la fecha en curso, pero el endpoint
# de partido individual (el que usa SYNC_365) responde por cualquier gameId.
$agregadosC = 0
$viejosDescartados = 0
$rutaData = Join-Path $carpeta 'data.js'
if (Test-Path $rutaData) {

  # Dos filtros para no meter partidos de la temporada pasada en la tabla:
  #  1) la temporada (seasonNum) tiene que ser una de las que ya vimos
  #  2) la fecha no puede ser anterior al partido mas viejo que tenemos menos
  #     100 dias (por si la API no manda seasonNum)
  $temporadasActuales = New-Object 'System.Collections.Generic.HashSet[string]'
  $fechaMasVieja = $null
  foreach ($clave in @($juegosPorId.Keys)) {
    $juego = $juegosPorId[$clave]
    try { if ([int]$juego.competitionId -ne $idLiga) { continue } } catch { continue }
    if ($null -ne $juego.seasonNum) { [void]$temporadasActuales.Add([string]$juego.seasonNum) }
    $cuando = Leer-Fecha $juego.startTime
    if ($null -ne $cuando -and ($null -eq $fechaMasVieja -or $cuando -lt $fechaMasVieja)) { $fechaMasVieja = $cuando }
  }
  $pisoFecha = (Get-Date).AddDays(-120)
  if ($null -ne $fechaMasVieja) { $pisoFecha = $fechaMasVieja.AddDays(-100) }

  $contenido = Get-Content -LiteralPath $rutaData -Raw
  $coincidencias = [regex]::Matches($contenido, '"(\d{6,9})"\s*:\s*\{\s*"home"')
  $idsViejos = New-Object System.Collections.ArrayList
  foreach ($coincidencia in $coincidencias) {
    $idViejo = [string]$coincidencia.Groups[1].Value
    if ($juegosPorId.ContainsKey($idViejo)) { continue }
    if ($idsViejos.Contains($idViejo)) { continue }
    [void]$idsViejos.Add($idViejo)
  }

  if ($idsViejos.Count -gt 0) {
    Write-Host ("      probando {0} gameIds guardados en data.js..." -f $idsViejos.Count) -NoNewline
    $vuelta = 0
    foreach ($idViejo in $idsViejos) {
      $vuelta++
      if ($vuelta % 10 -eq 0) { Write-Host "." -NoNewline }
      $respuesta = Obtener-Json "https://webws.365scores.com/web/game/?$queryBase&gameId=$idViejo"
      Start-Sleep -Milliseconds 180
      if ($null -eq $respuesta) { continue }
      $juego = $respuesta.game
      if ($null -eq $juego) { $juego = $respuesta }
      if ($null -eq $juego.id) { continue }

      $cuando = Leer-Fecha $juego.startTime
      if ($null -eq $cuando -or $cuando -lt $pisoFecha) { $viejosDescartados++; continue }
      if ($temporadasActuales.Count -gt 0 -and $null -ne $juego.seasonNum) {
        if (-not $temporadasActuales.Contains([string]$juego.seasonNum)) { $viejosDescartados++; continue }
      }

      $clave = [string]$juego.id
      if ($juegosPorId.ContainsKey($clave)) { continue }
      $juegosPorId[$clave] = $juego
      $agregadosC++
    }
    Write-Host ""
    Write-Host ("      desde data.js: {0} partidos nuevos" -f $agregadosC)
    if ($viejosDescartados -gt 0) {
      Write-Host ("      ({0} descartados por ser de una temporada anterior)" -f $viejosDescartados) -ForegroundColor DarkGray
    }
  }
} else {
  Write-Host "      (no encontre data.js, no puedo recuperar fechas viejas)" -ForegroundColor Yellow
}

if ($agregadosA + $agregadosB + $agregadosC -eq 0) {
  Write-Host "      no salio ninguna fecha vieja: la tabla va a tener solo lo reciente" -ForegroundColor Yellow
}
Write-Host ""

foreach ($clave in @($juegosPorId.Keys)) {
  $juego = $juegosPorId[$clave]
  $compId = 0
  try { $compId = [int]$juego.competitionId } catch { }
  if ($compId -ne $idLiga) { continue }
  $lados = Leer-Lados $juego
  if ($null -eq $lados) { continue }
  foreach ($lado in @($lados.local, $lados.visitante)) {
    if ($null -eq $lado -or $null -eq $lado.id) { continue }
    $idEquipo = [string]$lado.id
    if (-not $equiposLiga.ContainsKey($idEquipo)) { $equiposLiga[$idEquipo] = [string]$lado.name }
    [void]$nombresLiga.Add([string]$lado.name)
  }
}

Write-Host ""
Write-Host ("   equipos de la liga detectados: {0}" -f $equiposLiga.Count)
Write-Host ""

if ($equiposLiga.Count -eq 0) {
  Write-Host "   No salio ningun equipo de la liga. Avisame y lo ajusto." -ForegroundColor Red
  exit
}

# ---------------------------------------------------------------------------
# 2. Calendario COMPLETO de cada equipo (todas las competencias)
# ---------------------------------------------------------------------------
Write-Host "   bajando el calendario de cada equipo (liga + copas)..." -ForegroundColor White
Write-Host "   (tarda un par de minutos; si 365Scores tira 504 reintenta solo)" -ForegroundColor DarkGray
$script:equiposSinCalendario = 0
$contador = 0
$totalEquipos = $equiposLiga.Count
foreach ($idEquipo in @($equiposLiga.Keys)) {
  $contador++
  Write-Host ("`r      {0}/{1}  {2,-28}" -f $contador, $totalEquipos, $equiposLiga[$idEquipo]) -NoNewline
  # 'current' ya trae los ultimos jugados + los proximos, que es todo lo que
  # necesitamos. Solo si viene flaco pedimos los otros dos.
  $traidos = 0
  foreach ($endpoint in @('current','fixtures','results')) {
    $respuesta = Obtener-Json "https://webws.365scores.com/web/games/$endpoint/?$queryBase&competitors=$idEquipo"
    Guardar-Torneos $respuesta
    [void](Guardar-Juegos $respuesta)
    if ($respuesta -and $respuesta.games) { $traidos += @($respuesta.games).Count }
    Start-Sleep -Milliseconds 400
    if ($traidos -ge 4) { break }
  }
  if ($traidos -eq 0) { $script:equiposSinCalendario++ }
}
Write-Host ("`r      {0}/{1} equipos listos                                        " -f $totalEquipos, $totalEquipos)
if ($script:reintentos -gt 0) {
  Write-Host ("      ({0} reintentos por timeouts de 365Scores)" -f $script:reintentos) -ForegroundColor DarkGray
}
if ($script:equiposSinCalendario -gt 0) {
  Write-Host ("      OJO: {0} equipos quedaron sin calendario propio" -f $script:equiposSinCalendario) -ForegroundColor Yellow
}
Write-Host ""

# ---------------------------------------------------------------------------
# 3. Normalizar: un registro por partido
# ---------------------------------------------------------------------------
$ahora = Get-Date
$compromisos = New-Object System.Collections.ArrayList

foreach ($clave in @($juegosPorId.Keys)) {
  $juego = $juegosPorId[$clave]
  $lados = Leer-Lados $juego
  if ($null -eq $lados) { continue }
  $cuando = Leer-Fecha $juego.startTime
  if ($null -eq $cuando) { continue }

  $compId = 0
  try { $compId = [int]$juego.competitionId } catch { }
  $esCopa = ($compId -ne $idLiga)

  $tituloTorneo = 'Otro torneo'
  if ($compId -eq $idLiga) { $tituloTorneo = 'Liga Profesional' }
  elseif ($nombreTorneo.ContainsKey([string]$compId)) { $tituloTorneo = $nombreTorneo[[string]$compId] }
  elseif ($juego.competitionDisplayName) { $tituloTorneo = [string]$juego.competitionDisplayName }

  $golesLocal     = Leer-Marcador $lados.local
  $golesVisitante = Leer-Marcador $lados.visitante
  $terminado = ($null -ne $golesLocal -and $null -ne $golesVisitante -and $cuando.AddHours(3) -lt $ahora)

  $numeroFecha = $null
  if ($juego.roundNum)     { try { $numeroFecha = [int]$juego.roundNum } catch { } }
  elseif ($juego.stageNum) { try { $numeroFecha = [int]$juego.stageNum } catch { } }

  $registro = New-Object PSObject
  $registro | Add-Member NoteProperty gid            ([string]$juego.id)
  $registro | Add-Member NoteProperty torneo         $tituloTorneo
  $registro | Add-Member NoteProperty competitionId  $compId
  $registro | Add-Member NoteProperty esCopa         $esCopa
  $registro | Add-Member NoteProperty fecha          $cuando
  $registro | Add-Member NoteProperty idLocal        ([string]$lados.local.id)
  $registro | Add-Member NoteProperty idVisitante    ([string]$lados.visitante.id)
  $registro | Add-Member NoteProperty local          ([string]$lados.local.name)
  $registro | Add-Member NoteProperty visitante      ([string]$lados.visitante.name)
  $registro | Add-Member NoteProperty golesLocal     $golesLocal
  $registro | Add-Member NoteProperty golesVisitante $golesVisitante
  $registro | Add-Member NoteProperty terminado      $terminado
  $registro | Add-Member NoteProperty numeroFecha    $numeroFecha
  [void]$compromisos.Add($registro)
}

$cuantosCopa = @($compromisos | Where-Object { $_.esCopa }).Count
$cuantosLiga = @($compromisos | Where-Object { -not $_.esCopa }).Count
Write-Host ("   partidos: {0} de liga  +  {1} de copa / otros torneos" -f $cuantosLiga, $cuantosCopa)

if ($cuantosCopa -eq 0) {
  Write-Host ""
  Write-Host "   OJO: no aparecio ningun partido de copa." -ForegroundColor Yellow
  Write-Host "   El indice de rotacion va a salir solo del calendario de liga." -ForegroundColor Yellow
}
Write-Host ""

$porTorneo = $compromisos | Group-Object -Property torneo | Sort-Object -Property Count -Descending
foreach ($grupo in $porTorneo) {
  Write-Host ("      {0,-34} {1,4} partidos" -f $grupo.Name, $grupo.Count) -ForegroundColor DarkGray
}
Write-Host ""

# ---------------------------------------------------------------------------
# 4. Agenda por equipo
# ---------------------------------------------------------------------------
$agenda = @{}
foreach ($compromiso in $compromisos) {
  foreach ($lado in @('local','visitante')) {
    if ($lado -eq 'local') {
      $idEquipo = $compromiso.idLocal;     $nombreEquipo = $compromiso.local
      $idRival  = $compromiso.idVisitante; $rival        = $compromiso.visitante
    } else {
      $idEquipo = $compromiso.idVisitante; $nombreEquipo = $compromiso.visitante
      $idRival  = $compromiso.idLocal;     $rival        = $compromiso.local
    }
    if (-not $equiposLiga.ContainsKey($idEquipo)) { continue }

    $viaja = $false
    if ($compromiso.esCopa -and $lado -eq 'visitante' -and -not $equiposLiga.ContainsKey($idRival) -and -not $nombresLiga.Contains($rival)) {
      $viaja = $true
    }

    if (-not $agenda.ContainsKey($nombreEquipo)) { $agenda[$nombreEquipo] = New-Object System.Collections.ArrayList }
    $entrada = New-Object PSObject
    $entrada | Add-Member NoteProperty gid         $compromiso.gid
    $entrada | Add-Member NoteProperty fecha       $compromiso.fecha
    $entrada | Add-Member NoteProperty torneo      $compromiso.torneo
    $entrada | Add-Member NoteProperty esCopa      $compromiso.esCopa
    $entrada | Add-Member NoteProperty rival       $rival
    $entrada | Add-Member NoteProperty deLocal     ($lado -eq 'local')
    $entrada | Add-Member NoteProperty viajeAfuera $viaja
    [void]$agenda[$nombreEquipo].Add($entrada)
  }
}

# ---------------------------------------------------------------------------
# 5. Indice de rotacion para el proximo partido de liga
# ---------------------------------------------------------------------------
$salidaEquipos = @{}

foreach ($nombreEquipo in @($agenda.Keys)) {
  $vistos = New-Object 'System.Collections.Generic.HashSet[string]'
  $lista = New-Object System.Collections.ArrayList
  foreach ($entrada in ($agenda[$nombreEquipo] | Sort-Object -Property fecha)) {
    if ($entrada.gid -and -not $vistos.Add([string]$entrada.gid)) { continue }
    [void]$lista.Add($entrada)
  }

  $partidoLiga = $null
  foreach ($entrada in $lista) {
    if (-not $entrada.esCopa -and $entrada.fecha -gt $ahora.AddHours(-3)) { $partidoLiga = $entrada; break }
  }
  if ($null -eq $partidoLiga) { continue }

  $anterior = $null; $siguiente = $null
  foreach ($entrada in $lista) {
    if ($entrada.fecha -lt $partidoLiga.fecha) { $anterior = $entrada }
    if ($entrada.fecha -gt $partidoLiga.fecha -and $null -eq $siguiente) { $siguiente = $entrada }
  }

  $diasDescanso = 99.0
  if ($null -ne $anterior) { $diasDescanso = [math]::Round(($partidoLiga.fecha - $anterior.fecha).TotalDays, 1) }
  $diasHastaProximo = 99.0
  if ($null -ne $siguiente) { $diasHastaProximo = [math]::Round(($siguiente.fecha - $partidoLiga.fecha).TotalDays, 1) }

  # --- Indice de rotacion (0 a 1) ---
  # Dos causas distintas: llegar cansado, y guardar gente para el miercoles.
  $porCansancio = 0.0
  if     ($diasDescanso -le 2.5) { $porCansancio = 1.00 }
  elseif ($diasDescanso -le 3.5) { $porCansancio = 0.70 }
  elseif ($diasDescanso -le 4.5) { $porCansancio = 0.40 }
  elseif ($diasDescanso -le 5.5) { $porCansancio = 0.15 }

  $porGuardar = 0.0
  if ($null -ne $siguiente -and $siguiente.esCopa) {
    if     ($diasHastaProximo -le 3.5) { $porGuardar = 0.85 }
    elseif ($diasHastaProximo -le 4.5) { $porGuardar = 0.50 }
    elseif ($diasHastaProximo -le 5.5) { $porGuardar = 0.20 }
  }

  $indice = [math]::Max($porCansancio, $porGuardar)
  if ($null -ne $anterior -and $anterior.viajeAfuera) { $indice = $indice * 1.25 }
  if ($null -ne $siguiente -and $siguiente.viajeAfuera -and $porGuardar -gt 0) { $indice = $indice * 1.15 }
  if ($indice -gt 1) { $indice = 1.0 }
  $indice = [math]::Round($indice, 2)

  $detalle = @()
  if ($null -ne $anterior)  { $detalle += ("viene de {0} vs {1} el {2}{3}" -f $anterior.torneo, $anterior.rival, $anterior.fecha.ToString('ddd dd/MM'), $(if ($anterior.viajeAfuera) { ' (afuera)' } else { '' })) }
  if ($null -ne $siguiente) { $detalle += ("despues juega {0} vs {1} el {2}{3}" -f $siguiente.torneo, $siguiente.rival, $siguiente.fecha.ToString('ddd dd/MM'), $(if ($siguiente.viajeAfuera) { ' (afuera)' } else { '' })) }

  $salidaEquipos[$nombreEquipo] = [ordered]@{
    equipo            = $nombreEquipo
    partidoLiga       = $partidoLiga.fecha.ToString('yyyy-MM-ddTHH:mm')
    rivalLiga         = $partidoLiga.rival
    deLocal           = $partidoLiga.deLocal
    diasDescanso      = $diasDescanso
    diasHastaProximo  = $diasHastaProximo
    proximoEsCopa     = $(if ($null -ne $siguiente) { [bool]$siguiente.esCopa } else { $false })
    proximoTorneo     = $(if ($null -ne $siguiente) { [string]$siguiente.torneo } else { '' })
    vieneDeCopa       = $(if ($null -ne $anterior)  { [bool]$anterior.esCopa }  else { $false })
    vieneDeTorneo     = $(if ($null -ne $anterior)  { [string]$anterior.torneo } else { '' })
    vieneDeViaje      = $(if ($null -ne $anterior)  { [bool]$anterior.viajeAfuera } else { $false })
    indiceRotacion    = $indice
    detalle           = ($detalle -join ' - ')
  }
}

# ---------------------------------------------------------------------------
# 6. Archivos de salida
# ---------------------------------------------------------------------------
$partidosLiga = New-Object System.Collections.ArrayList
foreach ($compromiso in ($compromisos | Sort-Object -Property fecha)) {
  if ($compromiso.esCopa) { continue }
  $fila = [ordered]@{
    fecha          = $compromiso.fecha.ToString('yyyy-MM-ddTHH:mm')
    numeroFecha    = $compromiso.numeroFecha
    local          = $compromiso.local
    visitante      = $compromiso.visitante
    golesLocal     = $compromiso.golesLocal
    golesVisitante = $compromiso.golesVisitante
    terminado      = [bool]$compromiso.terminado
  }
  [void]$partidosLiga.Add($fila)
}

# ── EL FIXTURE TIENE QUE SER ACUMULATIVO ───────────────────────────────────
# Mismo problema que tenia SYNC_365: los endpoints de 365Scores devuelven una
# VENTANA MOVIL. Una corrida trajo 75 partidos jugados y la siguiente 17, asi
# que la tabla de posiciones se achicaba sola en cada sync.
# Solucion: fusionar con el dataFixture.json anterior. Si un partido ya estaba
# guardado como jugado y ahora no viene, se conserva el que estaba.
$rutaFixture = Join-Path $carpeta 'dataFixture.json'
if (Test-Path $rutaFixture) {
  $reciengeneradas = @{}
  foreach ($fila in $partidosLiga) { $reciengeneradas[("{0}|{1}" -f $fila['local'], $fila['visitante'])] = $fila }
  $recuperados = 0
  try {
    $previo = [System.IO.File]::ReadAllText($rutaFixture) | ConvertFrom-Json
    foreach ($viejo in @($previo.partidos)) {
      if ($null -eq $viejo.local -or $null -eq $viejo.visitante) { continue }
      $clave = "{0}|{1}" -f $viejo.local, $viejo.visitante
      if ($reciengeneradas.ContainsKey($clave)) {
        # si el guardado estaba terminado y el nuevo no lo trae, gana el guardado
        $nuevoFila = $reciengeneradas[$clave]
        if ((-not $nuevoFila['terminado']) -and $viejo.terminado) {
          $nuevoFila['golesLocal'] = $viejo.golesLocal
          $nuevoFila['golesVisitante'] = $viejo.golesVisitante
          $nuevoFila['terminado'] = $true
          if ($null -eq $nuevoFila['numeroFecha']) { $nuevoFila['numeroFecha'] = $viejo.numeroFecha }
          $recuperados++
        }
        continue
      }
      $rescatada = [ordered]@{
        fecha          = [string]$viejo.fecha
        numeroFecha    = $viejo.numeroFecha
        local          = [string]$viejo.local
        visitante      = [string]$viejo.visitante
        golesLocal     = $viejo.golesLocal
        golesVisitante = $viejo.golesVisitante
        terminado      = [bool]$viejo.terminado
      }
      [void]$partidosLiga.Add($rescatada)
      $reciengeneradas[$clave] = $rescatada
      if ($viejo.terminado) { $recuperados++ }
    }
  } catch {
    Write-Host ("   (no pude leer el dataFixture anterior: {0})" -f $_.Exception.Message) -ForegroundColor Yellow
  }
  if ($recuperados -gt 0) {
    Write-Host ("   recuperados del fixture anterior: {0} partidos jugados que 365Scores ya no devuelve" -f $recuperados) -ForegroundColor Cyan
  }
  $partidosLiga = [System.Collections.ArrayList]@($partidosLiga | Sort-Object -Property @{ Expression = { [string]$_['fecha'] } })
}

# resumen por fecha, para que se pueda controlar de un vistazo
$porFecha = @{}
foreach ($fila in $partidosLiga) {
  if (-not $fila['terminado']) { continue }
  $etiqueta = 'sin fecha'
  if ($null -ne $fila['numeroFecha']) { $etiqueta = [string]$fila['numeroFecha'] }
  if (-not $porFecha.ContainsKey($etiqueta)) { $porFecha[$etiqueta] = 0 }
  $porFecha[$etiqueta] = $porFecha[$etiqueta] + 1
}
if ($porFecha.Count -gt 0) {
  $linea = ''
  foreach ($etiqueta in ($porFecha.Keys | Sort-Object { try { [int]$_ } catch { 999 } })) {
    $linea += ("f{0}:{1}  " -f $etiqueta, $porFecha[$etiqueta])
  }
  Write-Host ("   partidos jugados por fecha:  {0}" -f $linea) -ForegroundColor DarkGray
  Write-Host ""
}

$fixture = [ordered]@{
  generado = (Get-Date).ToString('o')
  fuente   = '365Scores'
  partidos = $partidosLiga
}
[System.IO.File]::WriteAllText((Join-Path $carpeta 'dataFixture.json'),
  ($fixture | ConvertTo-Json -Depth 5), (New-Object System.Text.UTF8Encoding($false)))

$resultado = [ordered]@{
  generado       = (Get-Date).ToString('o')
  fuente         = '365Scores'
  partidosDeCopa = $cuantosCopa
  equipos        = $salidaEquipos
}
[System.IO.File]::WriteAllText((Join-Path $carpeta 'dataCopas.json'),
  ($resultado | ConvertTo-Json -Depth 6), (New-Object System.Text.UTF8Encoding($false)))

$jugados = @($partidosLiga | Where-Object { $_['terminado'] }).Count
Write-Host ("LISTO. dataCopas.json ({0} equipos)  y  dataFixture.json ({1} partidos de liga, {2} jugados)" -f $salidaEquipos.Count, $partidosLiga.Count, $jugados) -ForegroundColor Green
Write-Host ""
Write-Host ("   {0,-26} {1,-9} {2,-9} {3,-7}  {4}" -f 'EQUIPO','descanso','al sig.','rotac.','contexto')
$ordenados = $salidaEquipos.Values | Sort-Object -Property @{ Expression = { [double]$_['indiceRotacion'] } } -Descending
foreach ($equipo in $ordenados) {
  $color = 'Gray'
  if     ($equipo['indiceRotacion'] -ge 0.6) { $color = 'Red' }
  elseif ($equipo['indiceRotacion'] -ge 0.3) { $color = 'Yellow' }
  $descanso = $equipo['diasDescanso'];     if ($descanso -ge 90) { $descanso = '-' }
  $proximo  = $equipo['diasHastaProximo']; if ($proximo  -ge 90) { $proximo  = '-' }
  Write-Host ("   {0,-26} {1,-9} {2,-9} {3,-7}  {4}" -f $equipo['equipo'], $descanso, $proximo, $equipo['indiceRotacion'], $equipo['detalle']) -ForegroundColor $color
}
Write-Host ""
Write-Host "   rojo = alta chance de rotacion (sus jugadores valen menos, los del rival mas)" -ForegroundColor DarkGray
Write-Host ""
