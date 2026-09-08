# =============================================================================
#  SYNC_ROLES.ps1 - EL ROL REAL Y EL JUEGO AEREO, PARTIDO POR PARTIDO
#
#  QUE SACA (todo por jugador Y por partido, o sea con local/visitante adentro):
#     rol       "Defensa Central", "Defensa Lateral Izquierdo", "Extremo"...
#               365Scores lo publica en member.formation.name. Gran DT tiene
#               cuatro posiciones y punto: para el juego un central y un lateral
#               son "DEF" y cobran lo mismo. Aca se separan.
#     aereos    duelos aereos GANADOS (tipo 56)
#     despAlto  despejes por alto (tipo 57)
#     centros   centros (tipo 52)
#     pasesCl   pases claves (tipo 46)
#     sot       remates al arco (tipo 4)
#     bloq      remates bloqueados (tipo 6)
#     regates   regates (tipo 54)
#     toques    toques (tipo 45)
#
#  POR QUE UN ARCHIVO APARTE Y NO TOCAR SYNC_365.ps1:
#  SYNC_365 anda y produce data365.json, que es de lo que cuelga todo el motor.
#  Si le meto campos nuevos y algo sale mal, se cae la fuente principal. Este
#  script escribe SU PROPIO archivo (data365_roles.json) y no toca nada mas:
#  si falla, no se pierde nada de lo que ya funciona.
#
#  OJO: los tipos de estadistica (56, 57, 52, 46, 4, 6, 54, 45) estan leidos del
#  JSON real de 365Scores, no adivinados. Si alguno cambia, el script no rompe:
#  Obtener-Numero devuelve 0 y se ve en el resumen del final.
#
#  Salida: data365_roles.json
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

$T_MIN = 30; $T_AEREOS = 56; $T_DESP_ALTO = 57; $T_CENTROS = 52
$T_PASES_CL = 46; $T_SOT = 4; $T_BLOQ = 6; $T_REGATES = 54; $T_TOQUES = 45

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
      # Mismo cuidado que en SYNC_365: 365Scores manda valores compuestos
      # ("2 (1)", "10/35 (29%)"). Se toma SOLO el primer numero del texto.
      # Se usa la MISMA conversion que SYNC_365, con InvariantCulture: en una
      # Windows en espanol [double]"1.4" puede leerse como 14 porque la coma es
      # el separador decimal. Ese detalle ya rompio los datos una vez.
      $texto = ([string]$estadistica.value) -replace ',', '.'
      $encontrado = [regex]::Match($texto, '-?\d+(\.\d+)?')
      if (-not $encontrado.Success) { return 0.0 }
      try { return [double]::Parse($encontrado.Value, [Globalization.CultureInfo]::InvariantCulture) }
      catch { return 0.0 }
    }
  }
  return 0.0
}

function Nombre-De($miembro) {
  if ($miembro.athlete -and $miembro.athlete.name) { return [string]$miembro.athlete.name }
  if ($miembro.name) { return [string]$miembro.name }
  return ''
}

Write-Host ""
Write-Host "  ROLES Y JUEGO AEREO - 365Scores" -ForegroundColor Cyan
Write-Host "  ================================" -ForegroundColor Cyan
Write-Host ""

# ---------------------------------------------------------------------------
# 1. Lista de partidos: los mismos que ya conoce data365.json, mas el calendario
# ---------------------------------------------------------------------------
$listaIds = New-Object System.Collections.Generic.HashSet[int]
$archivoPrevio = Join-Path $carpeta 'data365.json'
if (Test-Path $archivoPrevio) {
  try {
    $texto = [System.IO.File]::ReadAllText($archivoPrevio)
    foreach ($coincidencia in [regex]::Matches($texto, '"gid"\s*:\s*(\d{6,9})')) {
      [void]$listaIds.Add([int]$coincidencia.Groups[1].Value)
    }
    Write-Host ("   data365.json aporto {0} gameIds" -f $listaIds.Count)
  } catch {
    Write-Host ("   (no pude leer data365.json: {0})" -f $_.Exception.Message) -ForegroundColor Yellow
  }
}
foreach ($endpoint in @('results','current','fixtures')) {
  $respuesta = Obtener-Json "https://webws.365scores.com/web/games/$endpoint/?$queryBase&competitions=$idCompetencia"
  if ($respuesta -and $respuesta.games) {
    foreach ($juego in $respuesta.games) { if ($juego.id) { [void]$listaIds.Add([int]$juego.id) } }
    Write-Host ("   calendario '{0}': {1} partidos" -f $endpoint, @($respuesta.games).Count)
  }
}
if ($listaIds.Count -eq 0) {
  Write-Host "   No pude armar la lista de partidos." -ForegroundColor Red
  exit
}

$idsOrdenados = $listaIds | Sort-Object
$totalIds = @($idsOrdenados).Count
Write-Host ("   {0} partidos a bajar (tarda unos minutos)" -f $totalIds)
Write-Host ""

# ---------------------------------------------------------------------------
# 2. Bajar y extraer
# ---------------------------------------------------------------------------
$filas = New-Object System.Collections.ArrayList
$conDatos = 0; $contador = 0; $sinRol = 0; $sinStats = 0
$rolesVistos = @{}

foreach ($idPartido in $idsOrdenados) {
  $contador++
  if ($contador % 5 -eq 0) {
    Write-Host ("`r   {0}/{1}  ...  {2} partidos con datos     " -f $contador, $totalIds, $conDatos) -NoNewline
  }
  $respuesta = Obtener-Json "https://webws.365scores.com/web/game/?$queryBase&gameId=$idPartido"
  if ($null -eq $respuesta -or $null -eq $respuesta.game) { continue }
  $partido = $respuesta.game
  if ([int]$partido.competitionId -ne $idCompetencia) { continue }

  $numeroFecha = 0
  if ($null -ne $partido.roundNum) { $numeroFecha = [int]$partido.roundNum }

  $lados = @(
    @{ equipo = $partido.homeCompetitor; rival = [string]$partido.awayCompetitor.name; esLocal = $true },
    @{ equipo = $partido.awayCompetitor; rival = [string]$partido.homeCompetitor.name; esLocal = $false }
  )

  $huboAlguno = $false
  foreach ($lado in $lados) {
    if ($null -eq $lado.equipo.lineups) { continue }
    $plantel = $lado.equipo.lineups.members
    if ($null -eq $plantel) { continue }
    $formacionEquipo = [string]$lado.equipo.lineups.formation

    foreach ($miembro in $plantel) {
      $minutos = Obtener-Numero $miembro $T_MIN
      if ($minutos -le 0) { continue }          # no entro a la cancha

      # EL ROL. Viene en member.formation (distinto de lineups.formation, que es
      # el 4-4-2 del equipo). formation.name dice "Defensa Central" o "Defensa
      # Lateral Izquierdo"; position.name dice solo "Defensor".
      $rol = ''; $rolId = 0
      if ($miembro.formation -and $miembro.formation.name) {
        $rol = [string]$miembro.formation.name
        if ($null -ne $miembro.formation.id) { $rolId = [int]$miembro.formation.id }
      }
      if ($rol -eq '') { $sinRol++ }
      else { if ($rolesVistos.ContainsKey($rol)) { $rolesVistos[$rol]++ } else { $rolesVistos[$rol] = 1 } }

      # De que lado de la cancha jugo, por si el rol viene vacio.
      # yardFormation.fieldSide: 0 es una banda, 100 la otra, 50 el centro.
      $lado_ = -1
      if ($miembro.yardFormation -and $null -ne $miembro.yardFormation.fieldSide) {
        $lado_ = [int]$miembro.yardFormation.fieldSide
      }

      if ($null -eq $miembro.stats) { $sinStats++ }

      $f = New-Object PSObject
      $f | Add-Member NoteProperty gid       $idPartido
      $f | Add-Member NoteProperty fecha     $numeroFecha
      $f | Add-Member NoteProperty nombre    (Nombre-De $miembro)
      $f | Add-Member NoteProperty id365     ([string]$miembro.id)
      $f | Add-Member NoteProperty equipo    ([string]$lado.equipo.name)
      $f | Add-Member NoteProperty esLocal   $lado.esLocal
      $f | Add-Member NoteProperty rival     $lado.rival
      $f | Add-Member NoteProperty esquema   $formacionEquipo
      $f | Add-Member NoteProperty rol       $rol
      $f | Add-Member NoteProperty rolId     $rolId
      $f | Add-Member NoteProperty banda     $lado_
      $f | Add-Member NoteProperty min       $minutos
      $f | Add-Member NoteProperty aereos    (Obtener-Numero $miembro $T_AEREOS)
      $f | Add-Member NoteProperty despAlto  (Obtener-Numero $miembro $T_DESP_ALTO)
      $f | Add-Member NoteProperty centros   (Obtener-Numero $miembro $T_CENTROS)
      $f | Add-Member NoteProperty pasesCl   (Obtener-Numero $miembro $T_PASES_CL)
      $f | Add-Member NoteProperty sot       (Obtener-Numero $miembro $T_SOT)
      $f | Add-Member NoteProperty bloq      (Obtener-Numero $miembro $T_BLOQ)
      $f | Add-Member NoteProperty regates   (Obtener-Numero $miembro $T_REGATES)
      $f | Add-Member NoteProperty toques    (Obtener-Numero $miembro $T_TOQUES)
      [void]$filas.Add($f)
      $huboAlguno = $true
    }
  }
  if ($huboAlguno) { $conDatos++ }
}

Write-Host ("`r   {0}/{1}  ...  {2} partidos con datos      " -f $contador, $totalIds, $conDatos)
Write-Host ""

if ($filas.Count -eq 0) {
  Write-Host "   No saque ni una fila. NO se toca el archivo anterior." -ForegroundColor Red
  exit
}

# ---------------------------------------------------------------------------
# 3. Guardian: no pisar un archivo bueno con uno peor
#    (mismo criterio que SYNC_365, que una vez se vacio solo)
# ---------------------------------------------------------------------------
$destino = Join-Path $carpeta 'data365_roles.json'
if (Test-Path $destino) {
  try {
    $viejo = Get-Content $destino -Raw -Encoding UTF8 | ConvertFrom-Json
    $antes = @($viejo.filas).Count
    if ($antes -gt 0 -and $filas.Count -lt ($antes * 0.5)) {
      $rechazado = Join-Path $carpeta 'data365_roles_RECHAZADO.json'
      Write-Host ("   OJO: esta corrida trae {0} filas y la anterior tenia {1}." -f $filas.Count, $antes) -ForegroundColor Red
      Write-Host ("   No piso el archivo bueno. Lo nuevo queda en data365_roles_RECHAZADO.json") -ForegroundColor Red
      $destino = $rechazado
    }
  } catch { }
}

$salida = New-Object PSObject
$salida | Add-Member NoteProperty generado      (Get-Date).ToString('o')
$salida | Add-Member NoteProperty competitionId $idCompetencia
$salida | Add-Member NoteProperty partidos      $conDatos
$salida | Add-Member NoteProperty filas         $filas

$salida | ConvertTo-Json -Depth 6 -Compress | Set-Content -Path $destino -Encoding UTF8

Write-Host ("   Guardado: {0}" -f (Split-Path $destino -Leaf)) -ForegroundColor Green
Write-Host ("   {0} filas jugador-partido de {1} partidos" -f $filas.Count, $conDatos)
if ($sinRol -gt 0)   { Write-Host ("   OJO: {0} filas sin rol (365Scores no lo publico en ese partido)" -f $sinRol) -ForegroundColor Yellow }
if ($sinStats -gt 0) { Write-Host ("   OJO: {0} filas sin bloque de estadisticas" -f $sinStats) -ForegroundColor Yellow }
Write-Host ""
Write-Host "   ROLES QUE APARECIERON:" -ForegroundColor Cyan
foreach ($r in ($rolesVistos.GetEnumerator() | Sort-Object -Property Value -Descending)) {
  Write-Host ("     {0,-34} {1}" -f $r.Key, $r.Value)
}
Write-Host ""
