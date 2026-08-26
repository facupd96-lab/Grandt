# =============================================================================
#  SYNC_365_HISTORICO.ps1 - Baja el torneo ANTERIOR desde 365Scores
#  PowerShell puro, cero dependencias. Se corre UNA sola vez.
#
#  Para que? Hoy tenemos 5 fechas: cada equipo jugo 2 o 3 partidos de local y
#  2 o 3 de visitante. Con eso no se puede afirmar nada de como juega cada uno
#  segun la condicion. Con el torneo anterior pasamos a 9 o 10 por condicion,
#  y ademas queda una base para PROBAR si el algoritmo acierta.
#
#  Como funciona: los gameId de 365Scores son globales y se asignan cuando se
#  arma el fixture, asi que el torneo anterior esta en un bloque de ids mas
#  bajo. El script lo busca solo: primero un barrido grueso para encontrar
#  donde vive la competencia 72, despues uno fino alrededor de los hallazgos.
#
#  Tarda entre 5 y 15 minutos. Salida: data365_historico.json
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
$tipoMinutos = 30; $tipoGoles = 27; $tipoAsist = 26
$tipoTiros = 3;    $tipoSot = 4;    $tipoXg = 76

# Rango donde buscar. Los ids del Clausura 2026 arrancan cerca de 4.633.300;
# el torneo anterior tiene que estar por debajo.
$idDesde = 4600000
$idHasta = 4633300
$pasoGrueso = 400

function Obtener-Json([string]$direccion) {
  try { return Invoke-RestMethod -Uri $direccion -Headers $encabezados -TimeoutSec 25 }
  catch { return $null }
}
function Obtener-Numero($miembro, [int]$tipo) {
  if ($null -eq $miembro -or $null -eq $miembro.stats) { return 0.0 }
  foreach ($e in $miembro.stats) {
    if ($null -eq $e) { continue }
    if ([int]$e.type -eq $tipo) {
      # Ver la nota en SYNC_365.ps1: los valores compuestos ("2 (1)", "10/35 (29%)")
      # se rompian al borrar los no-digitos. Se toma solo el primer numero.
      $t = ([string]$e.value) -replace ',', '.'
      $hallado = [regex]::Match($t, '-?\d+(\.\d+)?')
      if (-not $hallado.Success) { return 0.0 }
      try { return [double]::Parse($hallado.Value, [Globalization.CultureInfo]::InvariantCulture) } catch { return 0.0 }
    }
  }
  return 0.0
}
function Obtener-Nombre($partido, $miembro) {
  if ($miembro.name) { return [string]$miembro.name }
  if ($miembro.shortName) { return [string]$miembro.shortName }
  if ($partido.members) {
    foreach ($r in $partido.members) {
      if ([string]$r.id -eq [string]$miembro.id) {
        if ($r.name) { return [string]$r.name }
        if ($r.shortName) { return [string]$r.shortName }
      }
    }
  }
  return "id_$($miembro.id)"
}
function R2($v) { return [math]::Round([double]$v, 2) }
function R3($v) { return [math]::Round([double]$v, 3) }

Write-Host ""
Write-Host "-- torneo anterior: buscando donde estan los partidos --" -ForegroundColor Cyan
Write-Host "   (esto tarda entre 5 y 15 minutos, se corre una sola vez)"
Write-Host ""

# ---------------------------------------------------------------------------
# FASE 1: barrido grueso para ubicar el bloque de la competencia 72
# ---------------------------------------------------------------------------
$anclas = New-Object System.Collections.ArrayList
$probados = 0
for ($id = $idDesde; $id -le $idHasta; $id += $pasoGrueso) {
  $probados++
  if ($probados % 10 -eq 0) { Write-Host ("`r   barrido grueso: {0} ids probados, {1} anclas encontradas   " -f $probados, $anclas.Count) -NoNewline }
  $r = Obtener-Json "https://webws.365scores.com/web/game/?$queryBase&gameId=$id"
  $g = $r.game; if ($null -eq $g) { $g = $r }
  if ($null -eq $g -or $null -eq $g.competitionId) { continue }
  if ([int]$g.competitionId -eq $idCompetencia) {
    [void]$anclas.Add($id)
    $cuando = ''
    try { $cuando = ([datetime]::Parse([string]$g.startTime)).ToString('dd/MM/yyyy') } catch { }
    Write-Host ("`r   ancla en {0}  ({1} vs {2}, {3})                    " -f $id, $g.homeCompetitor.name, $g.awayCompetitor.name, $cuando)
  }
  Start-Sleep -Milliseconds 120
}
Write-Host ""
Write-Host ("   barrido grueso terminado: {0} anclas" -f $anclas.Count)

if ($anclas.Count -eq 0) {
  Write-Host ""
  Write-Host "No encontre partidos del torneo anterior en el rango buscado." -ForegroundColor Yellow
  Write-Host "Avisame y ajusto el rango de ids." -ForegroundColor Yellow
  exit
}

# ---------------------------------------------------------------------------
# FASE 2: barrido fino alrededor de cada ancla
# ---------------------------------------------------------------------------
$candidatos = New-Object 'System.Collections.Generic.HashSet[int]'
foreach ($a in $anclas) {
  for ($id = $a - $pasoGrueso; $id -le $a + $pasoGrueso; $id++) { [void]$candidatos.Add($id) }
}
$lista = $candidatos | Sort-Object
Write-Host ("   barrido fino: {0} ids a revisar" -f @($lista).Count)
Write-Host ""

$filasJugador = New-Object System.Collections.ArrayList
$filasEquipo  = New-Object System.Collections.ArrayList
$conDatos = 0; $i = 0; $total = @($lista).Count

foreach ($idPartido in $lista) {
  $i++
  if ($i % 10 -eq 0) { Write-Host ("`r   {0}/{1}  ...  {2} partidos bajados   " -f $i, $total, $conDatos) -NoNewline }

  $r = Obtener-Json "https://webws.365scores.com/web/game/?$queryBase&gameId=$idPartido"
  if ($null -eq $r) { Start-Sleep -Milliseconds 120; continue }
  $partido = $r.game; if ($null -eq $partido) { $partido = $r }
  if ($null -eq $partido.homeCompetitor -or $null -eq $partido.awayCompetitor) { Start-Sleep -Milliseconds 120; continue }
  $comp = 0; try { $comp = [int]$partido.competitionId } catch { }
  if ($comp -ne $idCompetencia) { Start-Sleep -Milliseconds 120; continue }

  $cuando = ''
  if ($partido.startTime) { $cuando = [string]$partido.startTime }

  # Temporada y numero de fecha. seasonNum es lo que separa un torneo del otro
  # (sin esto no se puede saber si un partido es del torneo anterior o de este).
  # roundNum es la fecha de verdad; stageNum es otra cosa y NO sirve como fecha.
  $temporada = 0; try { if ($null -ne $partido.seasonNum) { $temporada = [int]$partido.seasonNum } } catch { }
  $fechaNro = 0;  try { if ($null -ne $partido.roundNum)  { $fechaNro  = [int]$partido.roundNum } } catch { }
  $etapa = 0;     try { if ($null -ne $partido.stageNum)  { $etapa     = [int]$partido.stageNum } } catch { }

  $lados = @(
    @{ equipo = $partido.homeCompetitor; esLocal = $true;  rival = [string]$partido.awayCompetitor.name },
    @{ equipo = $partido.awayCompetitor; esLocal = $false; rival = [string]$partido.homeCompetitor.name }
  )
  $resumen = @(); $minutosDelPartido = 0.0

  foreach ($lado in $lados) {
    $plantel = $null
    if ($lado.equipo.lineups) { $plantel = $lado.equipo.lineups.members }
    if ($null -eq $plantel) { continue }
    $sTiros = 0.0; $sSot = 0.0; $sXg = 0.0
    foreach ($m in $plantel) {
      $min = Obtener-Numero $m $tipoMinutos
      $tir = Obtener-Numero $m $tipoTiros
      $xg  = Obtener-Numero $m $tipoXg
      if ($min -le 0 -and $tir -eq 0 -and $xg -eq 0) { continue }
      $sot = Obtener-Numero $m $tipoSot
      $gol = Obtener-Numero $m $tipoGoles
      $asi = Obtener-Numero $m $tipoAsist
      # Tipos confirmados con VER_STATS sobre el JSON real, no adivinados.
      $faltas    = Obtener-Numero $m 42   # Faltas cometidas
      $faltasRec = Obtener-Numero $m 37   # Faltas recibidas
      $penalCom  = Obtener-Numero $m 48   # Penales cometidos
      $penalAta  = Obtener-Numero $m 44   # Penales atajados
      $salvadas  = Obtener-Numero $m 23   # Salvadas de portero
      $golesRec  = Obtener-Numero $m 35   # Goles recibidos
      $xgEvitado = Obtener-Numero $m 83   # Goles esperados evitados (calidad del arquero)
      $chances   = Obtener-Numero $m 24   # Grandes chances
      $f = New-Object PSObject
      $f | Add-Member NoteProperty gid $idPartido
      $f | Add-Member NoteProperty cuando $cuando
      $f | Add-Member NoteProperty temporada $temporada
      $f | Add-Member NoteProperty fecha $fechaNro
      $f | Add-Member NoteProperty nombre (Obtener-Nombre $partido $m)
      $f | Add-Member NoteProperty equipo ([string]$lado.equipo.name)
      $f | Add-Member NoteProperty esLocal $lado.esLocal
      $f | Add-Member NoteProperty rival $lado.rival
      $f | Add-Member NoteProperty minutos $min
      $f | Add-Member NoteProperty goles $gol
      $f | Add-Member NoteProperty asistencias $asi
      $f | Add-Member NoteProperty tiros $tir
      $f | Add-Member NoteProperty tirosAlArco $sot
      $f | Add-Member NoteProperty xg $xg
      $f | Add-Member NoteProperty faltas $faltas
      $f | Add-Member NoteProperty faltasRecibidas $faltasRec
      $f | Add-Member NoteProperty penalesCometidos $penalCom
      $f | Add-Member NoteProperty penalesAtajados $penalAta
      $f | Add-Member NoteProperty salvadas $salvadas
      $f | Add-Member NoteProperty golesRecibidos $golesRec
      $f | Add-Member NoteProperty xgEvitado $xgEvitado
      $f | Add-Member NoteProperty grandesChances $chances
      [void]$filasJugador.Add($f)
      $sTiros += $tir; $sSot += $sot; $sXg += $xg; $minutosDelPartido += $min
    }
    $e = New-Object PSObject
    $e | Add-Member NoteProperty gid $idPartido
    $e | Add-Member NoteProperty cuando $cuando
    $e | Add-Member NoteProperty temporada $temporada
    $e | Add-Member NoteProperty fecha $fechaNro
    $e | Add-Member NoteProperty etapa $etapa
    $e | Add-Member NoteProperty equipo ([string]$lado.equipo.name)
    $e | Add-Member NoteProperty rival $lado.rival
    $e | Add-Member NoteProperty esLocal $lado.esLocal
    $e | Add-Member NoteProperty tiros $sTiros
    $e | Add-Member NoteProperty sot $sSot
    $e | Add-Member NoteProperty xg $sXg
    $e | Add-Member NoteProperty tirosConc 0.0
    $e | Add-Member NoteProperty sotConc 0.0
    $e | Add-Member NoteProperty xgConc 0.0
    $resumen += $e
  }

  if (@($resumen).Count -eq 2 -and $minutosDelPartido -gt 0) {
    $resumen[0].tirosConc = $resumen[1].tiros; $resumen[0].sotConc = $resumen[1].sot; $resumen[0].xgConc = $resumen[1].xg
    $resumen[1].tirosConc = $resumen[0].tiros; $resumen[1].sotConc = $resumen[0].sot; $resumen[1].xgConc = $resumen[0].xg
    foreach ($x in $resumen) { [void]$filasEquipo.Add($x) }
    $conDatos++
  }
  Start-Sleep -Milliseconds 120
}

Write-Host ""
Write-Host ""
Write-Host ("   {0} partidos bajados" -f $conDatos)

if ($conDatos -eq 0) { Write-Host "Nada para guardar." -ForegroundColor Yellow; exit }

# ---------------------------------------------------------------------------
# Agregar
# ---------------------------------------------------------------------------
$acumJugadores = @{}
foreach ($f in $filasJugador) {
  $k = $f.nombre
  if (-not $acumJugadores.ContainsKey($k)) {
    $n = New-Object PSObject
    $n | Add-Member NoteProperty nombre $f.nombre
    $n | Add-Member NoteProperty equipo $f.equipo
    $n | Add-Member NoteProperty partidos 0
    $n | Add-Member NoteProperty minutos 0.0
    $n | Add-Member NoteProperty goles 0.0
    $n | Add-Member NoteProperty asistencias 0.0
    $n | Add-Member NoteProperty tiros 0.0
    $n | Add-Member NoteProperty tirosAlArco 0.0
    $n | Add-Member NoteProperty xg 0.0
    $n | Add-Member NoteProperty tirosPorPartido 0.0
    $n | Add-Member NoteProperty xgPorPartido 0.0
    $n | Add-Member NoteProperty titularidad 0.0
    $n | Add-Member NoteProperty titulares 0
    $acumJugadores[$k] = $n
  }
  $r = $acumJugadores[$k]
  $r.partidos++; $r.minutos += $f.minutos; $r.goles += $f.goles; $r.asistencias += $f.asistencias
  $r.tiros += $f.tiros; $r.tirosAlArco += $f.tirosAlArco; $r.xg += $f.xg; $r.equipo = $f.equipo
  if ($f.minutos -ge 60) { $r.titulares++ }
}
foreach ($k in @($acumJugadores.Keys)) {
  $r = $acumJugadores[$k]; $n = [math]::Max(1, $r.partidos)
  $r.xg = R2 $r.xg
  $r.tirosPorPartido = R2 ($r.tiros / $n)
  $r.xgPorPartido = R3 ($r.xg / $n)
  $r.titularidad = R2 ($r.titulares / $n)
}

function Nuevo-Bloque {
  $b = New-Object PSObject
  $b | Add-Member NoteProperty pj 0
  $b | Add-Member NoteProperty tiros 0.0; $b | Add-Member NoteProperty tirosConc 0.0
  $b | Add-Member NoteProperty sot 0.0;   $b | Add-Member NoteProperty sotConc 0.0
  $b | Add-Member NoteProperty xg 0.0;    $b | Add-Member NoteProperty xgConc 0.0
  return $b
}
$acumEquipos = @{}
foreach ($f in $filasEquipo) {
  $k = $f.equipo
  if (-not $acumEquipos.ContainsKey($k)) {
    $n = New-Object PSObject
    $n | Add-Member NoteProperty equipo $k
    $n | Add-Member NoteProperty total (Nuevo-Bloque)
    $n | Add-Member NoteProperty local (Nuevo-Bloque)
    $n | Add-Member NoteProperty visitante (Nuevo-Bloque)
    $acumEquipos[$k] = $n
  }
  $dest = @($acumEquipos[$k].total)
  if ($f.esLocal) { $dest += $acumEquipos[$k].local } else { $dest += $acumEquipos[$k].visitante }
  foreach ($b in $dest) {
    $b.pj++; $b.tiros += $f.tiros; $b.tirosConc += $f.tirosConc
    $b.sot += $f.sot; $b.sotConc += $f.sotConc; $b.xg += $f.xg; $b.xgConc += $f.xgConc
  }
}
$salidaEquipos = @{}
foreach ($k in @($acumEquipos.Keys)) {
  $o = $acumEquipos[$k]; $d = [ordered]@{ equipo = $o.equipo }
  foreach ($c in @('total','local','visitante')) {
    $b = $o.$c; $n = [math]::Max(1, $b.pj)
    $d[$c] = [ordered]@{
      pj = $b.pj
      tirosPorPartido = R2 ($b.tiros / $n)
      tirosConcedidosPorPartido = R2 ($b.tirosConc / $n)
      tirosAlArcoPorPartido = R2 ($b.sot / $n)
      tirosAlArcoConcedidosPorPartido = R2 ($b.sotConc / $n)
      xgPorPartido = R3 ($b.xg / $n)
      xgConcedidoPorPartido = R3 ($b.xgConc / $n)
    }
  }
  $salidaEquipos[$k] = $d
}

# Resumen de temporadas encontradas: sirve para saber si el barrido agarro
# solo el torneo anterior o tambien el que se esta jugando.
$porTemporada = @{}
foreach ($x in $filasEquipo) {
  $k = [string]$x.temporada
  if (-not $porTemporada.ContainsKey($k)) { $porTemporada[$k] = New-Object 'System.Collections.Generic.HashSet[string]' }
  [void]$porTemporada[$k].Add([string]$x.gid)
}
Write-Host ""
Write-Host "   partidos por temporada encontrada:" -ForegroundColor White
foreach ($k in ($porTemporada.Keys | Sort-Object)) {
  Write-Host ("      temporada {0,-6} {1,4} partidos" -f $k, $porTemporada[$k].Count)
}

$conteoTemporadas = @{}
foreach ($k in @($porTemporada.Keys)) { $conteoTemporadas[$k] = $porTemporada[$k].Count }

$res = [ordered]@{
  generado = (Get-Date).ToString('o')
  fuente = '365Scores - barrido historico'
  partidos = $conDatos
  temporadas = $conteoTemporadas
  jugadores = $acumJugadores
  equipos = $salidaEquipos
  filasEquipo = $filasEquipo      # una fila por equipo y por partido, con gid, temporada y fecha
  filasJugador = $filasJugador    # una fila por jugador y por partido
}
$json = $res | ConvertTo-Json -Depth 7 -Compress
[System.IO.File]::WriteAllText((Join-Path $carpeta 'data365_historico.json'), $json, (New-Object System.Text.UTF8Encoding($false)))

Write-Host ""
Write-Host "LISTO. Escrito: data365_historico.json" -ForegroundColor Green
Write-Host ("   partidos:  {0}" -f $conDatos)
Write-Host ("   jugadores: {0}" -f $acumJugadores.Count)
Write-Host ("   equipos:   {0}" -f $salidaEquipos.Count)
Write-Host ""
$pjs = @(); foreach ($k in @($salidaEquipos.Keys)) { $pjs += $salidaEquipos[$k].total.pj }
if ($pjs.Count) {
  $media = ($pjs | Measure-Object -Average).Average
  Write-Host ("   promedio de partidos por equipo: {0:N1}  (de local y de visitante: ~{1:N1} cada uno)" -f $media, ($media/2))
}
Write-Host ""
