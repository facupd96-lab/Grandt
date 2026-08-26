# =============================================================================
#  SYNC_365.ps1 - Datos INDIVIDUALES de 365Scores para Gran DT
#  PowerShell puro, cero dependencias. No hace falta instalar nada.
#  Saca por jugador y por partido: minutos, goles, asistencias, TIROS,
#  TIROS AL ARCO y xG. Y arma los agregados por equipo (local / visitante).
#  Salida: data365.json
# =============================================================================

Set-StrictMode -Off
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'

$carpeta = $PSScriptRoot
if (-not $carpeta) { $carpeta = (Get-Location).Path }

$idCompetencia = 72
$queryBase = "appTypeId=5&langId=29&timezoneName=America/Argentina/Buenos_Aires&userCountryId=11"
$encabezados = @{
  'User-Agent' = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
  'Accept'     = 'application/json, text/plain, */*'
  'Referer'    = 'https://www.365scores.com/'
}

# Tipos de estadistica de 365Scores (verificados sobre el JSON real)
$tipoMinutos = 30; $tipoGoles = 27; $tipoAsist = 26
$tipoTiros = 3;    $tipoSot = 4;    $tipoXg = 76

function Obtener-Json([string]$direccion) {
  try { return Invoke-RestMethod -Uri $direccion -Headers $encabezados -TimeoutSec 25 }
  catch { return $null }
}

function Obtener-Numero($miembro, [int]$tipo) {
  if ($null -eq $miembro) { return 0.0 }
  if ($null -eq $miembro.stats) { return 0.0 }
  foreach ($estadistica in $miembro.stats) {
    if ($null -eq $estadistica) { continue }
    if ([int]$estadistica.type -eq $tipo) {
      # OJO: 365Scores manda varios valores compuestos. "Goles" de un jugador que
      # metio dos, uno de penal, viene como "2 (1)". Los pases como "10/35 (29%)".
      # Borrar todo lo que no sea digito pegaba los numeros: "2 (1)" quedaba en 21,
      # y asi Modica figuraba con 46 goles en 6 partidos.
      # Lo correcto es tomar SOLO el primer numero del texto, que en todos los
      # formatos de esta API es el valor que nos interesa:
      #   "2 (1)"        -> 2 goles (el segundo es cuantos de penal)
      #   "10/35 (29%)"  -> 10 pases completados
      #   "0/1"          -> 0 penales atajados de 1
      #   "1.4"          -> 1.4 de xG
      $texto = ([string]$estadistica.value) -replace ',', '.'
      $encontrado = [regex]::Match($texto, '-?\d+(\.\d+)?')
      if (-not $encontrado.Success) { return 0.0 }
      try { return [double]::Parse($encontrado.Value, [Globalization.CultureInfo]::InvariantCulture) }
      catch { return 0.0 }
    }
  }
  return 0.0
}

function Obtener-Nombre($partido, $miembro) {
  if ($miembro.name)      { return [string]$miembro.name }
  if ($miembro.shortName) { return [string]$miembro.shortName }
  if ($partido.members) {
    foreach ($ficha in $partido.members) {
      if ([string]$ficha.id -eq [string]$miembro.id) {
        if ($ficha.name)      { return [string]$ficha.name }
        if ($ficha.shortName) { return [string]$ficha.shortName }
      }
    }
  }
  return "id_$($miembro.id)"
}

function Redondear2($valor) { return [math]::Round([double]$valor, 2) }
function Redondear3($valor) { return [math]::Round([double]$valor, 3) }

Write-Host ""
Write-Host "-- sync365: bajando datos individuales de 365Scores --" -ForegroundColor Cyan
Write-Host ""

# ---------------------------------------------------------------------------
# 1. Juntar los gameIds
# ---------------------------------------------------------------------------
$listaIds = New-Object 'System.Collections.Generic.HashSet[int]'

# ── LA LISTA TIENE QUE SER ACUMULATIVA ─────────────────────────────────────
# Los endpoints de calendario de 365Scores devuelven una VENTANA MOVIL: cuanto
# mas pasa el tiempo, menos partidos viejos traen. Si la lista sale solo de ahi,
# cada corrida pierde partidos y el historial se achica en vez de crecer.
# Paso real: una corrida bajo 80 partidos y la siguiente 67, y un jugador que
# estaba a una amarilla de la suspension desaparecio del aviso.
# Solucion: sembrar la lista con los gameIds que YA tenemos guardados.
foreach ($archivoPrevio in @('data365.json', 'data365_historico.json')) {
  $ruta = Join-Path $carpeta $archivoPrevio
  if (-not (Test-Path $ruta)) { continue }
  $antes = $listaIds.Count
  try {
    $texto = [System.IO.File]::ReadAllText($ruta)
    foreach ($coincidencia in [regex]::Matches($texto, '"gid"\s*:\s*(\d{6,9})')) {
      [void]$listaIds.Add([int]$coincidencia.Groups[1].Value)
    }
  } catch {
    Write-Host ("   (no pude leer {0}: {1})" -f $archivoPrevio, $_.Exception.Message) -ForegroundColor Yellow
  }
  Write-Host ("   {0,-26} aporto {1} gameIds nuevos" -f $archivoPrevio, ($listaIds.Count - $antes))
}

foreach ($endpoint in @('results','current','fixtures')) {
  $respuesta = Obtener-Json "https://webws.365scores.com/web/games/$endpoint/?$queryBase&competitions=$idCompetencia"
  if ($respuesta -and $respuesta.games) {
    foreach ($juego in $respuesta.games) {
      if ($juego.id) { [void]$listaIds.Add([int]$juego.id) }
    }
    Write-Host ("   calendario '{0}': {1} partidos" -f $endpoint, @($respuesta.games).Count)
  }
}

if ($listaIds.Count -eq 0) {
  Write-Host "No pude armar la lista de partidos. Avisame y lo ajusto." -ForegroundColor Red
  exit
}

# barrido hacia adelante por si el calendario no trajo las fechas nuevas
$idMaximo = ($listaIds | Measure-Object -Maximum).Maximum
for ($siguiente = $idMaximo + 1; $siguiente -le $idMaximo + 60; $siguiente++) {
  [void]$listaIds.Add($siguiente)
}

$idsOrdenados = $listaIds | Sort-Object
Write-Host ("   {0} gameIds a probar (esto tarda unos minutos)" -f @($idsOrdenados).Count)
Write-Host ""

# ---------------------------------------------------------------------------
# 2. Bajar cada partido y extraer
# ---------------------------------------------------------------------------
$filasJugador = New-Object System.Collections.ArrayList
$filasEquipo  = New-Object System.Collections.ArrayList
$formacionesProbables = New-Object System.Collections.ArrayList
$filasTarjeta = New-Object System.Collections.ArrayList
$cuandoPorGid = @{}
$conDatos = 0; $descartados = 0; $contador = 0; $noJugados = 0
$totalIds = @($idsOrdenados).Count

foreach ($idPartido in $idsOrdenados) {
  $contador++
  if ($contador % 5 -eq 0) {
    Write-Host ("`r   probando {0}/{1}  ...  {2} partidos con datos      " -f $contador, $totalIds, $conDatos) -NoNewline
  }

  $respuesta = Obtener-Json "https://webws.365scores.com/web/game/?$queryBase&gameId=$idPartido"
  if ($null -eq $respuesta) { $descartados++; continue }

  $partido = $respuesta.game
  if ($null -eq $partido) { $partido = $respuesta }
  if ($null -eq $partido.homeCompetitor -or $null -eq $partido.awayCompetitor) { $descartados++; continue }

  $compId = 0
  try { $compId = [int]$partido.competitionId } catch { $compId = 0 }
  if ($compId -ne $idCompetencia) { $descartados++; continue }

  # OJO: stageNum NO es el numero de fecha. En el JSON real de 365Scores un
  # partido de la fecha 4 viene con roundNum=4 y stageNum=8, y usar stageNum
  # hacia que TODOS los partidos figuraran como "fecha 8".
  $numeroFecha = $null
  if ($partido.roundNum)      { try { $numeroFecha = [int]$partido.roundNum } catch { } }
  elseif ($partido.stageNum)  { try { $numeroFecha = [int]$partido.stageNum } catch { } }
  $temporada = 0; try { if ($null -ne $partido.seasonNum) { $temporada = [int]$partido.seasonNum } } catch { }

  $cuando = ''
  if ($partido.startTime) { $cuando = [string]$partido.startTime }
  if ($cuando -ne '') { $cuandoPorGid[[string]$idPartido] = $cuando }

  # ── TARJETAS Y GOLES CON MINUTO ────────────────────────────────────────────
  # No estan entre las 44 estadisticas por jugador: viven en partido.events,
  # que cuelga del PARTIDO y no del equipo. Codigos verificados con VER_STATS
  # sobre el JSON real: 1 = Gol, 2 = Tarjeta amarilla, 3 = Tarjeta roja,
  # 1000 = Cambio. El nombre del jugador sale de partido.members por playerId.
  $nombrePorId = @{}
  if ($null -ne $partido.members) {
    foreach ($miembroFicha in $partido.members) {
      if ($null -ne $miembroFicha.id) { $nombrePorId[[string]$miembroFicha.id] = [string]$miembroFicha.name }
    }
  }
  if ($null -ne $partido.events) {
    foreach ($ev in $partido.events) {
      $tipoEvento = 0
      try { if ($null -ne $ev.eventType -and $null -ne $ev.eventType.id) { $tipoEvento = [int]$ev.eventType.id } } catch { }
      # 1 = gol, 2 = amarilla, 3 = roja. Los goles se guardan aparte porque
      # sumar la estadistica "Goles" de cada jugador NO cuenta los goles EN
      # CONTRA: el gol lo cobra un equipo pero la estadistica se la lleva un
      # jugador del otro. Se ve en los conflictos de resultado: siempre falta
      # exactamente 1 gol. Con el evento se puede atribuir bien.
      if ($tipoEvento -ne 1 -and $tipoEvento -ne 2 -and $tipoEvento -ne 3) { continue }
      $idJugador = [string]$ev.playerId
      $comoSeLlama = $nombrePorId[$idJugador]
      if (-not $comoSeLlama) { $comoSeLlama = "id_$idJugador" }
      $equipoDelEvento = ''
      if ([string]$ev.competitorId -eq [string]$partido.homeCompetitor.id) { $equipoDelEvento = [string]$partido.homeCompetitor.name }
      elseif ([string]$ev.competitorId -eq [string]$partido.awayCompetitor.id) { $equipoDelEvento = [string]$partido.awayCompetitor.name }
      $t = New-Object PSObject
      $t | Add-Member NoteProperty gid    $idPartido
      $t | Add-Member NoteProperty cuando $cuando
      $t | Add-Member NoteProperty fecha  $numeroFecha
      $t | Add-Member NoteProperty nombre $comoSeLlama
      $t | Add-Member NoteProperty id365  $idJugador
      $t | Add-Member NoteProperty equipo $equipoDelEvento
      $t | Add-Member NoteProperty minuto ([double]$ev.gameTime)
      $subTipo = -1; try { if ($null -ne $ev.eventType.subTypeId) { $subTipo = [int]$ev.eventType.subTypeId } } catch { }
      $t | Add-Member NoteProperty tipo    $(if ($tipoEvento -eq 1) { 'gol' } elseif ($tipoEvento -eq 2) { 'amarilla' } else { 'roja' })
      $t | Add-Member NoteProperty subTipo $subTipo
      $t | Add-Member NoteProperty nombreEvento ([string]$ev.eventType.name)
      $t | Add-Member NoteProperty idEquipo ([string]$ev.competitorId)
      $t | Add-Member NoteProperty esLocal  ([string]$ev.competitorId -eq [string]$partido.homeCompetitor.id)
      [void]$filasTarjeta.Add($t)
    }
  }


  $lados = @(
    @{ equipo = $partido.homeCompetitor; esLocal = $true;  rival = [string]$partido.awayCompetitor.name },
    @{ equipo = $partido.awayCompetitor; esLocal = $false; rival = [string]$partido.homeCompetitor.name }
  )

  $resumenLados = @()
  $minutosDelPartido = 0.0
  $probablesLocal = @()
  $probablesVisita = @()
  foreach ($lado in $lados) {
    $plantel = $null
    if ($lado.equipo.lineups) { $plantel = $lado.equipo.lineups.members }
    if ($null -eq $plantel) { continue }

    $sumaTiros = 0.0; $sumaSot = 0.0; $sumaXg = 0.0
    foreach ($miembro in $plantel) {
      $minutos = Obtener-Numero $miembro $tipoMinutos
      $tiros   = Obtener-Numero $miembro $tipoTiros
      $golesEsp= Obtener-Numero $miembro $tipoXg
      if ($minutos -le 0 -and $tiros -eq 0 -and $golesEsp -eq 0) { continue }   # no entro

      $alArco = Obtener-Numero $miembro $tipoSot
      $goles  = Obtener-Numero $miembro $tipoGoles
      $asist  = Obtener-Numero $miembro $tipoAsist
      # Tipos verificados con VER_STATS sobre el JSON real (no adivinados):
      $faltas    = Obtener-Numero $miembro 42   # Faltas cometidas -> riesgo de amarilla
      $faltasRec = Obtener-Numero $miembro 37   # Faltas recibidas
      $penalCom  = Obtener-Numero $miembro 48   # Penales cometidos
      $penalAta  = Obtener-Numero $miembro 44   # Penales atajados (+4 en el reglamento)
      $salvadas  = Obtener-Numero $miembro 23   # Salvadas de portero
      $golesRec  = Obtener-Numero $miembro 35   # Goles recibidos
      $xgEvitado = Obtener-Numero $miembro 83   # Goles esperados evitados
      $chances   = Obtener-Numero $miembro 24   # Grandes chances

      $nuevaFila = New-Object PSObject
      $nuevaFila | Add-Member NoteProperty gid          $idPartido
      $nuevaFila | Add-Member NoteProperty fecha        $numeroFecha
      $nuevaFila | Add-Member NoteProperty nombre       (Obtener-Nombre $partido $miembro)
      $nuevaFila | Add-Member NoteProperty id365        ([string]$miembro.id)
      $nuevaFila | Add-Member NoteProperty equipo       ([string]$lado.equipo.name)
      $nuevaFila | Add-Member NoteProperty esLocal      $lado.esLocal
      $nuevaFila | Add-Member NoteProperty rival        $lado.rival
      $nuevaFila | Add-Member NoteProperty minutos      $minutos
      $nuevaFila | Add-Member NoteProperty goles        $goles
      $nuevaFila | Add-Member NoteProperty asistencias  $asist
      $nuevaFila | Add-Member NoteProperty tiros        $tiros
      $nuevaFila | Add-Member NoteProperty tirosAlArco  $alArco
      $nuevaFila | Add-Member NoteProperty xg           $golesEsp
      $nuevaFila | Add-Member NoteProperty temporada    $temporada
      $nuevaFila | Add-Member NoteProperty faltas           $faltas
      $nuevaFila | Add-Member NoteProperty faltasRecibidas  $faltasRec
      $nuevaFila | Add-Member NoteProperty penalesCometidos $penalCom
      $nuevaFila | Add-Member NoteProperty penalesAtajados  $penalAta
      $nuevaFila | Add-Member NoteProperty salvadas         $salvadas
      $nuevaFila | Add-Member NoteProperty golesRecibidos   $golesRec
      $nuevaFila | Add-Member NoteProperty xgEvitado        $xgEvitado
      $nuevaFila | Add-Member NoteProperty grandesChances   $chances
      [void]$filasJugador.Add($nuevaFila)

      $sumaTiros += $tiros; $sumaSot += $alArco; $sumaXg += $golesEsp
      $minutosDelPartido += $minutos
    }

    # si el partido todavia no se jugo pero ya publicaron la formacion,
    # nos guardamos quienes estan anunciados: sirve para saber quien juega
    if ($minutosDelPartido -eq 0) {
      foreach ($miembro in $plantel) {
        $anotado = Obtener-Nombre $partido $miembro
        if ($lado.esLocal) { $probablesLocal += $anotado } else { $probablesVisita += $anotado }
      }
    }

    $resumen = New-Object PSObject
    $resumen | Add-Member NoteProperty gid        $idPartido
    $resumen | Add-Member NoteProperty equipo     ([string]$lado.equipo.name)
    $resumen | Add-Member NoteProperty esLocal    $lado.esLocal
    $resumen | Add-Member NoteProperty rival      $lado.rival
    $resumen | Add-Member NoteProperty tiros      $sumaTiros
    $resumen | Add-Member NoteProperty sot        $sumaSot
    $resumen | Add-Member NoteProperty xg         $sumaXg
    $resumen | Add-Member NoteProperty tirosConc  0.0
    $resumen | Add-Member NoteProperty sotConc    0.0
    $resumen | Add-Member NoteProperty xgConc     0.0
    $resumenLados += $resumen
  }

  if (@($resumenLados).Count -eq 2 -and $minutosDelPartido -eq 0) {
    # partido NO jugado con formacion publicada: no contamina los promedios,
    # pero guardamos la formacion probable
    $aviso = New-Object PSObject
    $aviso | Add-Member NoteProperty gid       $idPartido
    $aviso | Add-Member NoteProperty cuando    $cuando
    $aviso | Add-Member NoteProperty local     ([string]$partido.homeCompetitor.name)
    $aviso | Add-Member NoteProperty visitante ([string]$partido.awayCompetitor.name)
    $aviso | Add-Member NoteProperty onceLocal     $probablesLocal
    $aviso | Add-Member NoteProperty onceVisitante $probablesVisita
    # "Confirmado" = es el once de verdad. "Sin confirmar" + isProbable = es un
    # pronostico de 365Scores. Sirve para saber cuanto creerle a la lista.
    $aviso | Add-Member NoteProperty estadoLocal     ([string]$partido.homeCompetitor.lineups.status)
    $aviso | Add-Member NoteProperty estadoVisitante ([string]$partido.awayCompetitor.lineups.status)
    $aviso | Add-Member NoteProperty esProbableLocal     ([bool]$partido.homeCompetitor.lineups.isProbable)
    $aviso | Add-Member NoteProperty esProbableVisitante ([bool]$partido.awayCompetitor.lineups.isProbable)
    [void]$formacionesProbables.Add($aviso)
    $noJugados++
    Start-Sleep -Milliseconds 150
    continue
  }

  if (@($resumenLados).Count -eq 2) {
    # los tiros a favor de uno son los concedidos del otro
    $resumenLados[0].tirosConc = $resumenLados[1].tiros
    $resumenLados[0].sotConc   = $resumenLados[1].sot
    $resumenLados[0].xgConc    = $resumenLados[1].xg
    $resumenLados[1].tirosConc = $resumenLados[0].tiros
    $resumenLados[1].sotConc   = $resumenLados[0].sot
    $resumenLados[1].xgConc    = $resumenLados[0].xg
    foreach ($resumen in $resumenLados) { [void]$filasEquipo.Add($resumen) }
    $conDatos++
  } else {
    $descartados++
  }

  Start-Sleep -Milliseconds 150
}

Write-Host ""
Write-Host ""
Write-Host ("   {0} partidos jugados con datos  ·  {1} con formacion publicada sin jugar  ·  {2} descartados (ids que no existen o de otro torneo)" -f $conDatos, $noJugados, $descartados)
Write-Host ""

if ($conDatos -eq 0) {
  Write-Host "No se bajo ningun partido. Puede que 365Scores haya cambiado el endpoint." -ForegroundColor Red
  Write-Host "Avisame y lo ajusto." -ForegroundColor Red
  exit
}

# ---------------------------------------------------------------------------
# 2b. Quedarse SOLO con el torneo actual
# ---------------------------------------------------------------------------
# Ahora que la lista de gameIds es acumulativa, entran tambien partidos del
# torneo anterior: 365Scores usa la misma competitionId (72) y la misma
# seasonNum para los dos torneos del ano, asi que ninguno de esos campos los
# separa. Lo que si los separa es el parate entre torneos.
# Regla: se ordenan todas las fechas de calendario y se corta en el ultimo hueco
# de mas de 20 dias. Todo lo posterior es el torneo en curso. Sin fechas
# escritas a mano: sale del propio calendario.
$fechasOrdenadas = @($cuandoPorGid.Values | ForEach-Object { try { [datetime]::Parse($_) } catch { } } | Sort-Object)
$corteTorneo = $null
if ($fechasOrdenadas.Count -gt 3) {
  for ($i = $fechasOrdenadas.Count - 1; $i -gt 0; $i--) {
    if (($fechasOrdenadas[$i] - $fechasOrdenadas[$i-1]).TotalDays -gt 20) { $corteTorneo = $fechasOrdenadas[$i]; break }
  }
}
$gidsDelTorneo = New-Object 'System.Collections.Generic.HashSet[string]'
foreach ($clave in @($cuandoPorGid.Keys)) {
  if ($null -eq $corteTorneo) { [void]$gidsDelTorneo.Add($clave); continue }
  try { if ([datetime]::Parse($cuandoPorGid[$clave]) -ge $corteTorneo) { [void]$gidsDelTorneo.Add($clave) } } catch { }
}
if ($null -ne $corteTorneo) {
  Write-Host ""
  Write-Host ("   torneo en curso: arranca el {0}  ({1} de {2} partidos bajados)" -f `
    $corteTorneo.ToString('dd/MM/yyyy'), $gidsDelTorneo.Count, $cuandoPorGid.Count) -ForegroundColor Cyan
  Write-Host "   (los anteriores quedan afuera de los promedios: son del torneo pasado)" -ForegroundColor DarkGray
}

$filasJugador = @($filasJugador | Where-Object { $gidsDelTorneo.Contains([string]$_.gid) })
$filasEquipo  = @($filasEquipo  | Where-Object { $gidsDelTorneo.Contains([string]$_.gid) })
$filasTarjeta = @($filasTarjeta | Where-Object { $gidsDelTorneo.Contains([string]$_.gid) })
$conDatos = $gidsDelTorneo.Count

# ---------------------------------------------------------------------------
# 3. Agregar por jugador
# ---------------------------------------------------------------------------
$acumJugadores = @{}

foreach ($fila in $filasJugador) {
  $clave = $fila.nombre
  if (-not $acumJugadores.ContainsKey($clave)) {
    $nuevo = New-Object PSObject
    $nuevo | Add-Member NoteProperty nombre                $fila.nombre
    $nuevo | Add-Member NoteProperty id365                 $fila.id365
    $nuevo | Add-Member NoteProperty equipo                $fila.equipo
    $nuevo | Add-Member NoteProperty partidos              0
    $nuevo | Add-Member NoteProperty minutos               0.0
    $nuevo | Add-Member NoteProperty goles                 0.0
    $nuevo | Add-Member NoteProperty asistencias           0.0
    $nuevo | Add-Member NoteProperty tiros                 0.0
    $nuevo | Add-Member NoteProperty tirosAlArco           0.0
    $nuevo | Add-Member NoteProperty xg                    0.0
    $nuevo | Add-Member NoteProperty minutosPorPartido     0
    $nuevo | Add-Member NoteProperty tirosPorPartido       0.0
    $nuevo | Add-Member NoteProperty tirosAlArcoPorPartido 0.0
    $nuevo | Add-Member NoteProperty xgPorPartido          0.0
    $nuevo | Add-Member NoteProperty titularidad           0.0
    $nuevo | Add-Member NoteProperty faltas                0.0
    $nuevo | Add-Member NoteProperty penalesCometidos      0.0
    $nuevo | Add-Member NoteProperty penalesAtajados       0.0
    $nuevo | Add-Member NoteProperty salvadas              0.0
    $nuevo | Add-Member NoteProperty golesRecibidos        0.0
    $nuevo | Add-Member NoteProperty xgEvitado             0.0
    $nuevo | Add-Member NoteProperty grandesChances        0.0
    $nuevo | Add-Member NoteProperty faltasPorPartido      0.0
    $nuevo | Add-Member NoteProperty log                   (New-Object System.Collections.ArrayList)
    $acumJugadores[$clave] = $nuevo
  }

  $registro = $acumJugadores[$clave]
  $registro.partidos    = $registro.partidos + 1
  $registro.minutos     = $registro.minutos + $fila.minutos
  $registro.goles       = $registro.goles + $fila.goles
  $registro.asistencias = $registro.asistencias + $fila.asistencias
  $registro.tiros       = $registro.tiros + $fila.tiros
  $registro.tirosAlArco = $registro.tirosAlArco + $fila.tirosAlArco
  $registro.xg          = $registro.xg + $fila.xg
  $registro.equipo      = $fila.equipo
  $registro.faltas           = $registro.faltas + $fila.faltas
  $registro.penalesCometidos = $registro.penalesCometidos + $fila.penalesCometidos
  $registro.penalesAtajados  = $registro.penalesAtajados + $fila.penalesAtajados
  $registro.salvadas         = $registro.salvadas + $fila.salvadas
  $registro.golesRecibidos   = $registro.golesRecibidos + $fila.golesRecibidos
  $registro.xgEvitado        = $registro.xgEvitado + $fila.xgEvitado
  $registro.grandesChances   = $registro.grandesChances + $fila.grandesChances

  $entradaLog = New-Object PSObject
  $entradaLog | Add-Member NoteProperty gid    $fila.gid
  $entradaLog | Add-Member NoteProperty fecha  $fila.fecha
  $entradaLog | Add-Member NoteProperty vs     $fila.rival
  $entradaLog | Add-Member NoteProperty local  $fila.esLocal
  $entradaLog | Add-Member NoteProperty min    $fila.minutos
  $entradaLog | Add-Member NoteProperty tiros  $fila.tiros
  $entradaLog | Add-Member NoteProperty xg     (Redondear2 $fila.xg)
  $entradaLog | Add-Member NoteProperty goles  $fila.goles
  $entradaLog | Add-Member NoteProperty faltas $fila.faltas
  $entradaLog | Add-Member NoteProperty temp   $fila.temporada
  [void]$registro.log.Add($entradaLog)
}

foreach ($clave in @($acumJugadores.Keys)) {
  $registro = $acumJugadores[$clave]
  $cantidad = [math]::Max(1, $registro.partidos)
  $registro.xg = Redondear2 $registro.xg
  $registro.minutosPorPartido     = [math]::Round($registro.minutos / $cantidad)
  $registro.tirosPorPartido       = Redondear2 ($registro.tiros / $cantidad)
  $registro.tirosAlArcoPorPartido = Redondear2 ($registro.tirosAlArco / $cantidad)
  $registro.xgPorPartido          = Redondear3 ($registro.xg / $cantidad)
  $titulares = 0
  foreach ($entrada in $registro.log) { if ($entrada.min -ge 60) { $titulares++ } }
  $registro.titularidad = Redondear2 ($titulares / $cantidad)
  $registro.faltasPorPartido = Redondear2 ($registro.faltas / $cantidad)
  $registro.xgEvitado = Redondear2 $registro.xgEvitado
}

# ---------------------------------------------------------------------------
# 4. Agregar por equipo (total / local / visitante)
# ---------------------------------------------------------------------------
function Nuevo-Bloque {
  $bloque = New-Object PSObject
  $bloque | Add-Member NoteProperty pj        0
  $bloque | Add-Member NoteProperty tiros     0.0
  $bloque | Add-Member NoteProperty tirosConc 0.0
  $bloque | Add-Member NoteProperty sot       0.0
  $bloque | Add-Member NoteProperty sotConc   0.0
  $bloque | Add-Member NoteProperty xg        0.0
  $bloque | Add-Member NoteProperty xgConc    0.0
  return $bloque
}

$acumEquipos = @{}

foreach ($fila in $filasEquipo) {
  $clave = $fila.equipo
  if (-not $acumEquipos.ContainsKey($clave)) {
    $nuevo = New-Object PSObject
    $nuevo | Add-Member NoteProperty equipo    $clave
    $nuevo | Add-Member NoteProperty total     (Nuevo-Bloque)
    $nuevo | Add-Member NoteProperty local     (Nuevo-Bloque)
    $nuevo | Add-Member NoteProperty visitante (Nuevo-Bloque)
    $acumEquipos[$clave] = $nuevo
  }

  $destinos = @()
  $destinos += $acumEquipos[$clave].total
  if ($fila.esLocal) { $destinos += $acumEquipos[$clave].local }
  else               { $destinos += $acumEquipos[$clave].visitante }

  foreach ($bloque in $destinos) {
    $bloque.pj        = $bloque.pj + 1
    $bloque.tiros     = $bloque.tiros + $fila.tiros
    $bloque.tirosConc = $bloque.tirosConc + $fila.tirosConc
    $bloque.sot       = $bloque.sot + $fila.sot
    $bloque.sotConc   = $bloque.sotConc + $fila.sotConc
    $bloque.xg        = $bloque.xg + $fila.xg
    $bloque.xgConc    = $bloque.xgConc + $fila.xgConc
  }
}

$salidaEquipos = @{}
foreach ($clave in @($acumEquipos.Keys)) {
  $origen = $acumEquipos[$clave]
  $destino = [ordered]@{ equipo = $origen.equipo }
  foreach ($condicion in @('total','local','visitante')) {
    $bloque = $origen.$condicion
    $cantidad = [math]::Max(1, $bloque.pj)
    $destino[$condicion] = [ordered]@{
      pj                              = $bloque.pj
      tirosPorPartido                 = Redondear2 ($bloque.tiros / $cantidad)
      tirosConcedidosPorPartido       = Redondear2 ($bloque.tirosConc / $cantidad)
      tirosAlArcoPorPartido           = Redondear2 ($bloque.sot / $cantidad)
      tirosAlArcoConcedidosPorPartido = Redondear2 ($bloque.sotConc / $cantidad)
      xgPorPartido                    = Redondear3 ($bloque.xg / $cantidad)
      xgConcedidoPorPartido           = Redondear3 ($bloque.xgConc / $cantidad)
    }
  }
  $salidaEquipos[$clave] = $destino
}

# ---------------------------------------------------------------------------
# 5. Guardar y reportar
# ---------------------------------------------------------------------------
$cantJugadores = $acumJugadores.Count
$conTiros = 0; $conXg = 0
foreach ($clave in @($acumJugadores.Keys)) {
  if ($acumJugadores[$clave].tiros -gt 0) { $conTiros++ }
  if ($acumJugadores[$clave].xg -gt 0)    { $conXg++ }
}
$divisor = [math]::Max(1, $cantJugadores)
$pctTiros = [math]::Round(100 * $conTiros / $divisor)
$pctXg    = [math]::Round(100 * $conXg / $divisor)

# ---------------------------------------------------------------------------
# Tarjetas por jugador y riesgo de suspension
# ---------------------------------------------------------------------------
# Regla de la Liga Profesional: a la QUINTA amarilla, una fecha de suspension.
# Y una roja es suspension automatica en el partido siguiente.
$ultimaFechaVista = 0
foreach ($t in $filasTarjeta) { if ($t.tipo -ne 'gol' -and $t.fecha -ne $null -and [int]$t.fecha -gt $ultimaFechaVista) { $ultimaFechaVista = [int]$t.fecha } }

$acumTarjetas = @{}
foreach ($t in $filasTarjeta) {
  if ($t.tipo -eq 'gol') { continue }
  $clave = [string]$t.id365
  if (-not $acumTarjetas.ContainsKey($clave)) {
    $reg = New-Object PSObject
    $reg | Add-Member NoteProperty nombre     $t.nombre
    $reg | Add-Member NoteProperty id365      $t.id365
    $reg | Add-Member NoteProperty equipo     $t.equipo
    $reg | Add-Member NoteProperty amarillas  0
    $reg | Add-Member NoteProperty rojas      0
    $reg | Add-Member NoteProperty fechaUltimaRoja $null
    $reg | Add-Member NoteProperty fechas     (New-Object System.Collections.ArrayList)
    $acumTarjetas[$clave] = $reg
  }
  $reg = $acumTarjetas[$clave]
  $reg.equipo = $t.equipo
  if ($t.tipo -eq 'amarilla') { $reg.amarillas = $reg.amarillas + 1 }
  else { $reg.rojas = $reg.rojas + 1; $reg.fechaUltimaRoja = $t.fecha }
  [void]$reg.fechas.Add(@{ fecha = $t.fecha; tipo = $t.tipo; minuto = $t.minuto })
}

$aUnaDeLaSuspension = New-Object System.Collections.ArrayList
$suspendidos        = New-Object System.Collections.ArrayList
foreach ($clave in @($acumTarjetas.Keys)) {
  $reg = $acumTarjetas[$clave]
  if (($reg.amarillas % 5) -eq 4) { [void]$aUnaDeLaSuspension.Add($reg) }
  if ($reg.rojas -gt 0 -and $reg.fechaUltimaRoja -ne $null -and [int]$reg.fechaUltimaRoja -ge $ultimaFechaVista) { [void]$suspendidos.Add($reg) }
}

Write-Host ""
$soloTarjetas = @($filasTarjeta | Where-Object { $_.tipo -ne 'gol' }).Count
$soloGoles    = @($filasTarjeta | Where-Object { $_.tipo -eq 'gol' }).Count
Write-Host ("   tarjetas leidas: {0}  ({1} jugadores)  ·  goles con minuto: {2}" -f $soloTarjetas, $acumTarjetas.Count, $soloGoles) -ForegroundColor White
Write-Host ("   a una amarilla de la suspension: {0}" -f $aUnaDeLaSuspension.Count) -ForegroundColor Yellow
foreach ($x in $aUnaDeLaSuspension) { Write-Host ("      {0,-26} {1,-22} {2} amarillas" -f $x.nombre, $x.equipo, $x.amarillas) -ForegroundColor DarkYellow }
Write-Host ("   expulsados en la fecha {0}: {1}" -f $ultimaFechaVista, $suspendidos.Count) -ForegroundColor Red
foreach ($x in $suspendidos) { Write-Host ("      {0,-26} {1,-22} roja en la fecha {2}" -f $x.nombre, $x.equipo, $x.fechaUltimaRoja) -ForegroundColor DarkYellow }

$resultado = [ordered]@{
  generado      = (Get-Date).ToString('o')
  competitionId = $idCompetencia
  partidos      = $conDatos
  cobertura     = [ordered]@{
    jugadores   = $cantJugadores
    conTiros    = $conTiros
    conXg       = $conXg
    pctConTiros = $pctTiros
    pctConXg    = $pctXg
  }
  jugadores            = $acumJugadores
  equipos              = $salidaEquipos
  formacionesProbables = $formacionesProbables
  tarjetas             = $acumTarjetas
  tarjetasDetalle      = $filasTarjeta
  ultimaFechaConTarjetas = $ultimaFechaVista
}

$textoJson = $resultado | ConvertTo-Json -Depth 8
$rutaSalida = Join-Path $carpeta 'data365.json'
[System.IO.File]::WriteAllText($rutaSalida, $textoJson, (New-Object System.Text.UTF8Encoding($false)))

Write-Host "LISTO. Escrito: data365.json" -ForegroundColor Green
Write-Host ""
Write-Host ("   jugadores:              {0}" -f $cantJugadores)
Write-Host ("   con tiros registrados:  {0} ({1}%)" -f $conTiros, $pctTiros)
Write-Host ("   con xG registrado:      {0} ({1}%)" -f $conXg, $pctXg)
Write-Host ("   equipos:                {0}" -f $salidaEquipos.Count)
Write-Host ("   formaciones probables:  {0} partidos de la proxima fecha" -f $formacionesProbables.Count)
Write-Host ""

# control de coherencia: los tiros generados de la liga tienen que igualar a los concedidos
$sumaFavor = 0.0; $sumaContra = 0.0; $cantEquipos = 0
foreach ($clave in @($salidaEquipos.Keys)) {
  $sumaFavor  += $salidaEquipos[$clave].total.tirosPorPartido
  $sumaContra += $salidaEquipos[$clave].total.tirosConcedidosPorPartido
  $cantEquipos++
}
if ($cantEquipos -gt 0) {
  $mediaFavor  = $sumaFavor / $cantEquipos
  $mediaContra = $sumaContra / $cantEquipos
  Write-Host ("   control: tiros a favor {0:N2} vs concedidos {1:N2} por partido" -f $mediaFavor, $mediaContra)
  if ([math]::Abs($mediaFavor - $mediaContra) -lt 0.5) {
    Write-Host "   OK: el dato es coherente" -ForegroundColor Green
  } else {
    Write-Host "   OJO: no cierra, hay que revisar" -ForegroundColor Yellow
  }
}
Write-Host ""

Write-Host "   Top 10 en tiros por partido:" -ForegroundColor Cyan
$mejores = $acumJugadores.Values | Sort-Object -Property tirosPorPartido -Descending | Select-Object -First 10
$puesto = 1
foreach ($jugador in $mejores) {
  Write-Host ("   {0,2}. {1,-26} {2,-20} {3} tiros/p  ·  {4} xG/p  ·  {5} PJ" -f $puesto, $jugador.nombre, $jugador.equipo, $jugador.tirosPorPartido, $jugador.xgPorPartido, $jugador.partidos)
  $puesto++
}
Write-Host ""
