# =============================================================================
#  SYNC_ESPN.ps1 - CORNERS, POSESION Y CENTROS POR PARTIDO
#
#  QUE SACA (por equipo y por partido, o sea con local/visitante adentro):
#     corners        tiros de esquina a favor  ("wonCorners")
#     posesion       % de posesion             ("possessionPct")
#     centros        centros totales           ("totalCrosses")
#     centrosOk      centros que llegaron      ("accurateCrosses")
#     tiros / sot    remates y remates al arco
#     offsides, faltas, amarillas, rojas
#     tackles, intercepciones, despejes, remates bloqueados, atajadas
#
#  POR QUE ESPN Y NO 365SCORES:
#  365Scores publica estadisticas POR JUGADOR pero no tiene el bloque del
#  equipo: no hay corners ni posesion por ningun lado (verificado en dos
#  endpoints; /game/stats/ tira error 500). ESPN si los tiene, en
#  boxscore.teams[].statistics, y la API es abierta.
#
#  ESTO NO TOCA NINGUNA FUENTE EXISTENTE. Escribe su propio dataEspn.json.
#  Si falla, no se pierde nada de lo que ya funciona.
#
#  El cruce de nombres con nuestros equipos se hace despues, en armar.cjs:
#  ESPN escribe "Belgrano (Cordoba)" y "Sarmiento (Junin)". Aca se guarda el
#  nombre CRUDO de ESPN y ademas el corto, para poder revisar el cruce a mano.
#
#  Salida: dataEspn.json
# =============================================================================

Set-StrictMode -Off
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'

$carpeta = $PSScriptRoot
if (-not $carpeta) { $carpeta = (Get-Location).Path }

$liga = 'arg.1'
$baseScore = "https://site.api.espn.com/apis/site/v2/sports/soccer/$liga/scoreboard"
$baseSum   = "https://site.api.espn.com/apis/site/v2/sports/soccer/$liga/summary"
# ESPN devolvio 403 con los encabezados minimos. Su CDN mira mas cosas que el
# User-Agent: quiere Referer y Origin de espn.com, el Accept-Language y los
# Sec-Fetch-*, que es lo que manda un navegador de verdad.
$encabezados = @{
  'User-Agent'      = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
  'Accept'          = 'application/json, text/plain, */*'
  'Accept-Language' = 'es-AR,es;q=0.9,en;q=0.8'
  'Referer'         = 'https://www.espn.com.ar/'
  'Origin'          = 'https://www.espn.com.ar'
  'Sec-Fetch-Site'  = 'same-site'
  'Sec-Fetch-Mode'  = 'cors'
  'Sec-Fetch-Dest'  = 'empty'
}
# NO PONER 'Connection' ACA (18/09). Windows PowerShell 5.1 lo rechaza porque es
# un encabezado restringido del framework, y revienta ANTES de salir a la red:
#   "Keep-Alive y Close no se pueden establecer con esta propiedad."
# O sea que el modo 1 -el unico que manda encabezados de navegador, el unico que
# ESPN acepta- nunca llego a ejecutarse. El script probaba los tres modos, los
# tres fallaban y parecia que ESPN nos habia bloqueado, cuando en realidad el
# bueno fallaba por un error nuestro de una linea. Lo mismo vale para Host,
# Content-Length, Date, Accept-Encoding y User-Agent en algunas versiones.

# DIAGNOSTICO (06/09). La primera version se comia los errores con un catch
# mudo y el resultado fue "58 semanas revisadas, 0 partidos" sin ninguna pista
# de por que. Ahora el PRIMER error se imprime entero, con la URL.
$script:yaAvise = $false
$script:modo = 0          # 0 = todavia no se cual anda

# TRES FORMAS DE PEDIR, SE USA LA PRIMERA QUE ANDE (06/09).
# ESPN contesto 403 a Invoke-RestMethod con encabezados minimos. No se puede
# adivinar cual es el que le molesta, asi que se prueban tres y se usa la que
# funcione, avisando cual fue:
#   1) Invoke-RestMethod con encabezados de navegador completos
#   2) Invoke-RestMethod sin ningun encabezado (a veces el UA falso es el problema)
#   3) curl.exe, que viene con Windows 10/11 y tiene otra huella de TLS
function Pedir-Modo([string]$direccion, [int]$modo) {
  if ($modo -eq 1) {
    return Invoke-RestMethod -Uri $direccion -Headers $encabezados -TimeoutSec 25 -UseBasicParsing
  } elseif ($modo -eq 2) {
    return Invoke-RestMethod -Uri $direccion -TimeoutSec 25 -UseBasicParsing
  } else {
    $exe = Join-Path $env:SystemRoot 'System32\curl.exe'
    if (-not (Test-Path $exe)) { throw 'curl.exe no esta en este Windows' }
    # SIN --compressed (18/09). Devolvia el cuerpo comprimido sin descomprimir y
    # ConvertFrom-Json moria con "Primitivo JSON no valido: .", que no dice nada
    # de lo que pasa. Se pide sin comprimir y, si igual no es JSON, se muestra el
    # principio de la respuesta: casi siempre es una pagina de bloqueo en HTML.
    $txt = & $exe -s -L --max-time 25 `
             -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36' `
             -H 'Accept: application/json, text/plain, */*' `
             -H 'Accept-Language: es-AR,es;q=0.9,en;q=0.8' `
             -H 'Accept-Encoding: identity' `
             -H 'Referer: https://www.espn.com.ar/' `
             -H 'Origin: https://www.espn.com.ar' `
             $direccion 2>$null
    if ($txt -is [array]) { $txt = ($txt -join '') }
    if (-not $txt) { throw 'curl.exe no devolvio nada' }
    if ($txt.TrimStart()[0] -ne '{') {
      throw ('curl.exe no devolvio JSON, empieza con: ' + $txt.Substring(0, [Math]::Min(160, $txt.Length)))
    }
    return ($txt | ConvertFrom-Json)
  }
}

function Obtener-Json([string]$direccion) {
  if ($script:modo -ne 0) {
    try { return Pedir-Modo $direccion $script:modo } catch { return $null }
  }
  # todavia no sabemos cual anda: se prueban los tres
  $errores = @()
  foreach ($m in 1,2,3) {
    try {
      $r = Pedir-Modo $direccion $m
      if ($null -ne $r) {
        $script:modo = $m
        $nombre = @{1='Invoke-RestMethod con encabezados de navegador';2='Invoke-RestMethod sin encabezados';3='curl.exe de Windows'}[$m]
        Write-Host ("   conexion por: {0}" -f $nombre) -ForegroundColor Green
        return $r
      }
    } catch {
      $cod = ''
      if ($_.Exception.Response) { $cod = ' (HTTP ' + [int]$_.Exception.Response.StatusCode + ')' }
      $errores += ("      modo {0}: {1}{2}" -f $m, $_.Exception.Message, $cod)
    }
  }
  if (-not $script:yaAvise) {
    $script:yaAvise = $true
    Write-Host ""
    Write-Host "   NINGUNA DE LAS TRES FORMAS ANDUVO:" -ForegroundColor Red
    Write-Host ("     URL: {0}" -f $direccion) -ForegroundColor Yellow
    $errores | ForEach-Object { Write-Host $_ -ForegroundColor Yellow }
    Write-Host ""
  }
  return $null
}

# Cuanto para atras buscar. Un año cubre los dos torneos con sobra; los dias sin
# partido devuelven vacio y cuestan una llamada de nada.
$diasAtras = 400

Write-Host ""
Write-Host "  CORNERS Y POSESION - ESPN" -ForegroundColor Cyan
Write-Host "  =========================" -ForegroundColor Cyan
Write-Host ""

# ---------------------------------------------------------------------------
# 1. Juntar los ids de partido recorriendo el calendario de a una semana
# ---------------------------------------------------------------------------
# PRUEBA DE CONEXION antes de recorrer un año entero. Si esto falla no tiene
# sentido seguir, y ademas queda claro si el problema es la red o la fecha.
Write-Host "   probando la conexion con ESPN..."
$prueba = Obtener-Json ($baseScore + '?limit=50')
if ($null -eq $prueba) {
  Write-Host "   No pude conectarme a ESPN desde PowerShell." -ForegroundColor Red
  Write-Host ""
  Write-Host "   SALIDA POR EL NAVEGADOR (siempre funciona):" -ForegroundColor Cyan
  Write-Host "     1. abri BAJAR_ESPN.html (doble clic) y aprieta Empezar" -ForegroundColor Yellow
  Write-Host "     2. te descarga dataEspn.json: movelo a esta carpeta, pisando el viejo" -ForegroundColor Yellow
  Write-Host "     3. corre RECALCULAR.bat" -ForegroundColor Yellow
  Write-Host ""
  Write-Host "   ESPN le contesta 403 a PowerShell pero al navegador lo deja entrar:" -ForegroundColor DarkGray
  Write-Host "   la pagina pide exactamente lo mismo, desde una pestana de Chrome." -ForegroundColor DarkGray
  Write-Host ("   La URL, por si la queres mirar a mano: " + $baseScore + "?limit=50") -ForegroundColor DarkGray
  exit
}
$cuantos = 0
if ($prueba.events) { $cuantos = @($prueba.events).Count }
Write-Host ("   conexion OK — el calendario de hoy trae {0} partidos" -f $cuantos) -ForegroundColor Green
if ($prueba.season) { Write-Host ("   temporada que reporta ESPN: {0}" -f $prueba.season.year) }

$ids = New-Object System.Collections.Generic.HashSet[string]
$hoy = (Get-Date).Date
$desde = $hoy.AddDays(-$diasAtras)
$cursor = $desde
$semanas = 0
while ($cursor -le $hoy) {
  $hasta = $cursor.AddDays(6)
  if ($hasta -gt $hoy) { $hasta = $hoy }
  $rango = "{0}-{1}" -f $cursor.ToString('yyyyMMdd'), $hasta.ToString('yyyyMMdd')
  # URL por concatenacion: el "?" pegado a una variable dentro de comillas dobles
  # es justo el tipo de detalle que rompe callado.
  $url = $baseScore + '?dates=' + $rango + '&limit=500'
  $r = Obtener-Json $url
  if ($r -and $r.events) {
    foreach ($ev in $r.events) { if ($ev.id) { [void]$ids.Add([string]$ev.id) } }
  } else {
    # Si el rango no devolvio nada, se prueba dia por dia esa semana: puede que
    # ESPN no acepte el rango en este endpoint y solo entienda una fecha sola.
    $dia = $cursor
    while ($dia -le $hasta) {
      $r2 = Obtener-Json ($baseScore + '?dates=' + $dia.ToString('yyyyMMdd'))
      if ($r2 -and $r2.events) {
        foreach ($ev in $r2.events) { if ($ev.id) { [void]$ids.Add([string]$ev.id) } }
      }
      $dia = $dia.AddDays(1)
    }
  }
  $semanas++
  if ($semanas % 5 -eq 0) {
    Write-Host ("`r   calendario: {0} semanas revisadas, {1} partidos     " -f $semanas, $ids.Count) -NoNewline
  }
  $cursor = $cursor.AddDays(7)
}
Write-Host ("`r   calendario: {0} semanas revisadas, {1} partidos      " -f $semanas, $ids.Count)

if ($ids.Count -eq 0) {
  Write-Host "   No encontre partidos. NO se toca nada." -ForegroundColor Red
  exit
}

# ---------------------------------------------------------------------------
# 2. Bajar el detalle de cada partido
# ---------------------------------------------------------------------------
$filas = New-Object System.Collections.ArrayList
$contador = 0; $conStats = 0; $sinStats = 0
$total = $ids.Count
$nombresStat = @{}

foreach ($id in ($ids | Sort-Object)) {
  $contador++
  if ($contador % 5 -eq 0) {
    Write-Host ("`r   partido {0}/{1}  ...  {2} con estadisticas     " -f $contador, $total, $conStats) -NoNewline
  }
  $s = Obtener-Json ($baseSum + '?event=' + $id)
  if ($null -eq $s) { continue }
  if ($null -eq $s.boxscore -or $null -eq $s.boxscore.teams) { $sinStats++; continue }

  # cuando / quien
  $cuando = ''
  if ($s.header -and $s.header.competitions -and $s.header.competitions[0].date) {
    $cuando = [string]$s.header.competitions[0].date
  }
  $equipos = @()
  foreach ($t in $s.boxscore.teams) {
    $nom = ''; $corto = ''; $esLocal = $null
    if ($t.team) {
      if ($t.team.displayName) { $nom = [string]$t.team.displayName }
      if ($t.team.shortDisplayName) { $corto = [string]$t.team.shortDisplayName }
    }
    # el lado sale del header, que marca homeAway por equipo
    if ($s.header -and $s.header.competitions) {
      foreach ($c in $s.header.competitions[0].competitors) {
        if ($t.team -and $c.id -eq $t.team.id) { $esLocal = ($c.homeAway -eq 'home') }
      }
    }
    $equipos += ,@{ t = $t; nombre = $nom; corto = $corto; esLocal = $esLocal }
  }
  if ($equipos.Count -ne 2) { $sinStats++; continue }

  $huboAlguna = $false
  for ($i = 0; $i -lt 2; $i++) {
    $yo = $equipos[$i]; $otro = $equipos[1 - $i]
    $f = New-Object PSObject
    $f | Add-Member NoteProperty id       ([string]$id)
    $f | Add-Member NoteProperty cuando   $cuando
    $f | Add-Member NoteProperty equipo   $yo.nombre
    $f | Add-Member NoteProperty corto    $yo.corto
    $f | Add-Member NoteProperty rival    $otro.nombre
    $f | Add-Member NoteProperty esLocal  $yo.esLocal
    $vistas = 0
    foreach ($st in $yo.t.statistics) {
      if ($null -eq $st -or $null -eq $st.name) { continue }
      $nombresStat[[string]$st.name] = $true
      $txt = ([string]$st.displayValue) -replace '%', '' -replace ',', '.'
      $valor = $null
      $enc = [regex]::Match($txt, '-?\d+(\.\d+)?')
      if ($enc.Success) {
        try { $valor = [double]::Parse($enc.Value, [Globalization.CultureInfo]::InvariantCulture) } catch { $valor = $null }
      }
      if ($null -ne $valor) {
        $f | Add-Member NoteProperty ([string]$st.name) $valor -Force
        $vistas++
      }
    }
    if ($vistas -gt 0) { $huboAlguna = $true }
    [void]$filas.Add($f)
  }
  if ($huboAlguna) { $conStats++ } else { $sinStats++ }
}
Write-Host ("`r   partido {0}/{1}  ...  {2} con estadisticas      " -f $contador, $total, $conStats)
Write-Host ""

if ($filas.Count -eq 0) {
  Write-Host "   No saque ni una fila. NO se toca el archivo anterior." -ForegroundColor Red
  exit
}

# ---------------------------------------------------------------------------
# 3. Guardian: no pisar un archivo bueno con uno peor
# ---------------------------------------------------------------------------
$destino = Join-Path $carpeta 'dataEspn.json'
if (Test-Path $destino) {
  try {
    $viejo = Get-Content $destino -Raw | ConvertFrom-Json
    $antes = @($viejo.filas).Count
    if ($antes -gt 0 -and $filas.Count -lt ($antes * 0.5)) {
      Write-Host ("   OJO: esta corrida trae {0} filas y la anterior tenia {1}." -f $filas.Count, $antes) -ForegroundColor Red
      Write-Host  "   No piso el archivo bueno. Lo nuevo queda en dataEspn_RECHAZADO.json" -ForegroundColor Red
      $destino = Join-Path $carpeta 'dataEspn_RECHAZADO.json'
    }
  } catch { }
}

$salida = New-Object PSObject
$salida | Add-Member NoteProperty generado (Get-Date).ToString('o')
$salida | Add-Member NoteProperty fuente   'ESPN site API'
$salida | Add-Member NoteProperty liga     $liga
$salida | Add-Member NoteProperty partidos $conStats
$salida | Add-Member NoteProperty filas    $filas
$salida | ConvertTo-Json -Depth 6 -Compress | Set-Content -Path $destino -Encoding UTF8

Write-Host ("   Guardado: {0}" -f (Split-Path $destino -Leaf)) -ForegroundColor Green
Write-Host ("   {0} filas equipo-partido de {1} partidos" -f $filas.Count, $conStats)
if ($sinStats -gt 0) { Write-Host ("   {0} partidos sin estadisticas (no jugados o sin cobertura)" -f $sinStats) -ForegroundColor Yellow }
Write-Host ""
Write-Host "   ESTADISTICAS QUE TRAJO:" -ForegroundColor Cyan
$linea = ''
foreach ($n in ($nombresStat.Keys | Sort-Object)) {
  $linea += $n + '  '
  if ($linea.Length -gt 90) { Write-Host ("     " + $linea); $linea = '' }
}
if ($linea) { Write-Host ("     " + $linea) }
Write-Host ""
Write-Host "   Pasame este resumen y cruzo los nombres de ESPN con los nuestros." -ForegroundColor Cyan
Write-Host ""
