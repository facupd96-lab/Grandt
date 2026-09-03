# =============================================================================
#  SYNC_PLANETA.ps1 - Baja la planilla oficial de Planeta Gran DT
#  PowerShell puro, cero dependencias.
#
#  Trae TODAS las columnas, incluidas las que hoy se pierden y bloquean todo:
#    AcT (puntaje acumulado en el torneo)  <- sin esto no hay ficha limpia
#    CT, GV, GO, GR, GE, PA, PE, Cotizacion, y los puntajes fecha por fecha F1..F18
#
#  Salida: dataPlaneta.json
# =============================================================================

Set-StrictMode -Off
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'

$carpeta = $PSScriptRoot
if (-not $carpeta) { $carpeta = (Get-Location).Path }

# Cuando Planeta publica una planilla nueva, se cambia SOLO esta linea.
# El resto se adapta: la planilla vieja tenia una hoja por puesto (gid 17 a 20)
# y la nueva trae los cuatro puestos en una sola hoja. El script prueba primero
# sin gid (una sola hoja con todo) y, si no encuentra los puestos ahi, recien
# ahi sale a buscar hojas separadas.
# EL ID DE LA PLANILLA VIVE EN planilla.json, NO ACA.
# PlanetaGranDT publica una planilla NUEVA cada fecha, con otro ID. Estuvimos
# bajando la de la fecha 6 cuando ya se habia jugado la 7, y ni nos enteramos:
# el log decia "ultima fecha: F6" y parecia normal. Ahora el ID sale de
# planilla.json, que se cambia en dos segundos, y si el archivo no esta se usa
# el ultimo que conociamos.
$idPlanilla = '2PACX-1vQWGNjh7CL09RS5jbryuvTL88q8AYF6yV5kJqmraLlASvJeyK6jYJlb8XulTFWOuEXwIOhHhVBu1CpY'
$rutaPlanilla = Join-Path $carpeta 'planilla.json'
if (Test-Path $rutaPlanilla) {
  try {
    $cfg = Get-Content $rutaPlanilla -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($cfg.id) {
      $idPlanilla = $cfg.id
      Write-Host ("   planilla: la de la fecha {0} (planilla.json, actualizada el {1})" -f $cfg.fecha, $cfg.actualizado) -ForegroundColor DarkGray
    }
  } catch { Write-Host "   OJO: planilla.json no se pudo leer, uso el ID de siempre." -ForegroundColor Yellow }
}
$gidsAProbar = 0..40
$hojas = @()

# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------
function Bajar-Texto([string]$direccion, [bool]$callado = $false) {
  try {
    $respuesta = Invoke-WebRequest -Uri $direccion -UseBasicParsing -TimeoutSec 40
    if ($respuesta.RawContentStream) {
      $bytes = $respuesta.RawContentStream.ToArray()
      if ($bytes.Length -gt 0) { return [System.Text.Encoding]::UTF8.GetString($bytes) }
    }
    return [string]$respuesta.Content
  } catch {
    if (-not $callado) { Write-Host ("   error bajando: {0}" -f $_.Exception.Message) -ForegroundColor Red }
    return $null
  }
}

# Parte una linea de CSV respetando las comillas
function Partir-Linea([string]$linea) {
  $campos = New-Object System.Collections.ArrayList
  $actual = ''
  $entreComillas = $false
  for ($i = 0; $i -lt $linea.Length; $i++) {
    $caracter = $linea[$i]
    if ($caracter -eq '"') {
      if ($entreComillas -and ($i + 1) -lt $linea.Length -and $linea[$i+1] -eq '"') {
        $actual += '"'; $i++
      } else {
        $entreComillas = -not $entreComillas
      }
    } elseif ($caracter -eq ',' -and -not $entreComillas) {
      [void]$campos.Add($actual.Trim()); $actual = ''
    } else {
      $actual += $caracter
    }
  }
  [void]$campos.Add($actual.Trim())
  return $campos
}

# Numeros en formato argentino: "9,00" -> 9.00 · "$ 1.500.000" -> 1500000 · "s/c" -> null
function Parsear-Numero($texto) {
  if ($null -eq $texto) { return $null }
  $limpio = [string]$texto
  $limpio = $limpio.Trim()
  if ($limpio -eq '' -or $limpio -eq 's/c' -or $limpio -eq '-') { return $null }
  $limpio = $limpio -replace '\$', ''
  $limpio = $limpio -replace '\s', ''
  $tienePunto = $limpio.Contains('.')
  $tieneComa  = $limpio.Contains(',')
  if ($tienePunto -and $tieneComa) {
    # 1.500,25 -> el punto es separador de miles
    $limpio = $limpio -replace '\.', ''
    $limpio = $limpio -replace ',', '.'
  } elseif ($tieneComa) {
    $limpio = $limpio -replace ',', '.'
  } elseif ($tienePunto) {
    # 1.500.000 -> miles ; 9.5 -> decimal
    $partes = $limpio.Split('.')
    $ultima = $partes[$partes.Length - 1]
    if ($partes.Length -gt 2 -or $ultima.Length -eq 3) { $limpio = $limpio -replace '\.', '' }
  }
  if ($limpio -eq '' -or $limpio -eq '-') { return $null }
  try { return [double]::Parse($limpio, [Globalization.CultureInfo]::InvariantCulture) }
  catch { return $null }
}

function Valor-O-Cero($valor) { if ($null -eq $valor) { return 0 } else { return $valor } }

Write-Host ""
Write-Host "-- sync planeta gran dt: bajando la planilla oficial --" -ForegroundColor Cyan
Write-Host ""

$todosLosJugadores = New-Object System.Collections.ArrayList
$fechaMaxima = 0
$columnasVistas = $null

# ---------------------------------------------------------------------------
# Descubrir las hojas: se prueba cada gid y se mira si trae tabla de jugadores
# ---------------------------------------------------------------------------
Write-Host "   buscando la planilla..." -ForegroundColor White
$textoPorGid = @{}

function Puestos-De([string]$t) {
  $r = @{}
  # OJO: el nombre viene entrecomillado y CON coma adentro: "Acosta, Lucas",ARQ,...
  # Una clase de caracteres que excluya la coma nunca lo va a matchear.
  foreach ($m in [regex]::Matches($t, '(?m)^(?:"[^"\r\n]{2,60}"|[^,"\r\n]{2,40}),(ARQ|DEF|VOL|DEL),')) {
    $pp = $m.Groups[1].Value
    if (-not $r.ContainsKey($pp)) { $r[$pp] = 0 }
    $r[$pp] = $r[$pp] + 1
  }
  return $r
}

# --- intento 1: una sola hoja con todos los puestos ---
$urlUnica = "https://docs.google.com/spreadsheets/d/e/$idPlanilla/pub?output=csv&t=$([DateTimeOffset]::Now.ToUnixTimeSeconds())"
$textoUnico = Bajar-Texto $urlUnica
if ($null -ne $textoUnico -and $textoUnico.Length -gt 200 -and $textoUnico -match 'Jugador' -and $textoUnico -match 'POS') {
  $p = Puestos-De $textoUnico
  if ($p.Count -ge 2) {
    $textoPorGid['unica'] = $textoUnico
    $hojas += @{ pos = 'TODOS'; gid = 'unica' }
    $detalle = ($p.GetEnumerator() | Sort-Object -Property Name | ForEach-Object { "$($_.Key) $($_.Value)" }) -join ' · '
    Write-Host ("      una sola hoja con todos los puestos: {0}" -f $detalle) -ForegroundColor Green
  }
}

# --- intento 2: una hoja por puesto (formato viejo) ---
if ($hojas.Count -eq 0) {
  Write-Host "      no hay hoja unica, busco una por puesto..." -ForegroundColor DarkGray
foreach ($gid in $gidsAProbar) {
  $url = "https://docs.google.com/spreadsheets/d/e/$idPlanilla/pub?output=csv&gid=$gid&t=$([DateTimeOffset]::Now.ToUnixTimeSeconds())"
  $t = Bajar-Texto $url $true
  if ($null -eq $t -or $t.Length -lt 200) { continue }
  if (-not ($t -match 'Jugador' -and $t -match 'POS')) { continue }
  # que puesto trae? se mira la columna POS de las primeras filas de datos
  $puestos = Puestos-De $t
  if ($puestos.Count -eq 0) { continue }
  $dominante = ($puestos.GetEnumerator() | Sort-Object -Property Value -Descending | Select-Object -First 1).Key
  $textoPorGid[[string]$gid] = $t
  $hojas += @{ pos = $dominante; gid = [string]$gid; filas = $puestos[$dominante] }
  Write-Host ("      gid {0,-3} -> {1}  ({2} jugadores)" -f $gid, $dominante, $puestos[$dominante]) -ForegroundColor DarkGray
}
}
if ($hojas.Count -eq 0) {
  Write-Host "   No encontre ninguna hoja de jugadores. Revisa el id de la planilla." -ForegroundColor Red
  exit
}
Write-Host ("   {0} hoja(s) para procesar" -f $hojas.Count) -ForegroundColor Green
Write-Host ""

foreach ($hoja in $hojas) {

  Write-Host ("   procesando {0} (gid {1}) ..." -f $hoja.pos, $hoja.gid) -NoNewline
  $texto = $textoPorGid[[string]$hoja.gid]
  if ($null -eq $texto -or $texto.Length -lt 100) {
    Write-Host " FALLO" -ForegroundColor Red
    continue
  }

  $lineas = $texto -split "`r?`n"

  # buscar la fila de encabezados
  $filaEncabezado = -1
  for ($i = 0; $i -lt $lineas.Length; $i++) {
    $limpia = $lineas[$i].Trim()
    if ($limpia.StartsWith('Jugador,POS') -or ($limpia.Contains('Jugador') -and $limpia.Contains(',POS,') -and $limpia.Contains('F1'))) {
      $filaEncabezado = $i; break
    }
  }
  if ($filaEncabezado -lt 0) {
    Write-Host " sin encabezado reconocible" -ForegroundColor Yellow
    continue
  }

  $encabezados = Partir-Linea $lineas[$filaEncabezado]
  $indice = @{}
  for ($i = 0; $i -lt $encabezados.Count; $i++) {
    $nombreCol = [string]$encabezados[$i]
    if ($nombreCol -ne '' -and -not $indice.ContainsKey($nombreCol)) { $indice[$nombreCol] = $i }
    # La columna de cotizacion lleva tilde ("Cotizacion") y el acento se rompe
    # segun como Windows lea este archivo. La buscamos por prefijo, sin tilde.
    if ($nombreCol -like 'Cotiz*' -and -not $indice.ContainsKey('__COTIZ')) { $indice['__COTIZ'] = $i }
  }
  if ($null -eq $columnasVistas) { $columnasVistas = ($encabezados | Where-Object { $_ -ne '' }) -join ' ' }

  # columnas de fecha F1..F18
  $columnasFecha = New-Object System.Collections.ArrayList
  foreach ($clave in $indice.Keys) {
    if ($clave -match '^F(\d+)$') {
      $entrada = New-Object PSObject
      $entrada | Add-Member NoteProperty numero ([int]$Matches[1])
      $entrada | Add-Member NoteProperty col    ($indice[$clave])
      [void]$columnasFecha.Add($entrada)
    }
  }
  $columnasFecha = $columnasFecha | Sort-Object -Property numero

  function Tomar($campos, [string]$clave) {
    if (-not $indice.ContainsKey($clave)) { return $null }
    $pos = $indice[$clave]
    if ($pos -ge $campos.Count) { return $null }
    return $campos[$pos]
  }

  $cuantos = 0
  for ($i = $filaEncabezado + 1; $i -lt $lineas.Length; $i++) {
    $linea = $lineas[$i]
    if ($null -eq $linea -or $linea.Trim() -eq '') { continue }
    $campos = Partir-Linea $linea

    $nombre = [string](Tomar $campos 'Jugador')
    if ($null -eq $nombre -or $nombre.Length -lt 2) { continue }
    if ($nombre -eq 'Jugador' -or $nombre.StartsWith('www.')) { continue }

    $puesto = [string](Tomar $campos 'POS')
    if ($puesto -ne 'ARQ' -and $puesto -ne 'DEF' -and $puesto -ne 'VOL' -and $puesto -ne 'DEL') { continue }

    # puntajes fecha por fecha
    $puntajes = New-Object System.Collections.ArrayList
    foreach ($colFecha in $columnasFecha) {
      $celda = ''
      if ($colFecha.col -lt $campos.Count) { $celda = [string]$campos[$colFecha.col] }
      $valor = Parsear-Numero $celda
      [void]$puntajes.Add($valor)
      if ($null -ne $valor -and $colFecha.numero -gt $fechaMaxima) { $fechaMaxima = $colFecha.numero }
    }

    $jugador = [ordered]@{
      nombre     = $nombre
      posicion   = $puesto
      equipo     = [string](Tomar $campos 'Equipo')
      cotizacion = Parsear-Numero (Tomar $campos '__COTIZ')
      puntajes   = $puntajes            # F1..F18, null si no califico

      cg  = Valor-O-Cero (Parsear-Numero (Tomar $campos 'CG'))   # partidos Gran DT
      acg = Valor-O-Cero (Parsear-Numero (Tomar $campos 'AcG'))  # acumulado Gran DT
      prg = Parsear-Numero (Tomar $campos 'PrG')                 # promedio Gran DT

      ct  = Valor-O-Cero (Parsear-Numero (Tomar $campos 'CT'))   # partidos en el torneo
      act = Valor-O-Cero (Parsear-Numero (Tomar $campos 'AcT'))  # ACUMULADO EN EL TORNEO  <-- clave
      prt = Parsear-Numero (Tomar $campos 'PrT')                 # promedio en el torneo

      gt  = Valor-O-Cero (Parsear-Numero (Tomar $campos 'GT'))   # goles totales
      gj  = Valor-O-Cero (Parsear-Numero (Tomar $campos 'GJ'))   # de jugada
      gc  = Valor-O-Cero (Parsear-Numero (Tomar $campos 'GC'))   # de cabeza
      tl  = Valor-O-Cero (Parsear-Numero (Tomar $campos 'TL'))   # de tiro libre
      gp  = Valor-O-Cero (Parsear-Numero (Tomar $campos 'GP'))   # de penal
      gv  = Valor-O-Cero (Parsear-Numero (Tomar $campos 'GV'))   # de visitante
      go  = Valor-O-Cero (Parsear-Numero (Tomar $campos 'GO'))   # de oro
      gr  = Valor-O-Cero (Parsear-Numero (Tomar $campos 'GR'))   # recibidos (ARQ)
      ge  = Valor-O-Cero (Parsear-Numero (Tomar $campos 'GE'))   # en contra

      vf  = Valor-O-Cero (Parsear-Numero (Tomar $campos 'VF'))   # veces figura
      vi  = Valor-O-Cero (Parsear-Numero (Tomar $campos 'VI'))   # vallas invictas
      ta  = Valor-O-Cero (Parsear-Numero (Tomar $campos 'TA'))   # amarillas
      tr  = Valor-O-Cero (Parsear-Numero (Tomar $campos 'TR'))   # rojas
      pe  = Valor-O-Cero (Parsear-Numero (Tomar $campos 'PE'))   # penales errados
      pa  = Valor-O-Cero (Parsear-Numero (Tomar $campos 'PA'))   # penales atajados
    }

    [void]$todosLosJugadores.Add($jugador)
    $cuantos++
  }

  Write-Host (" {0} jugadores" -f $cuantos) -ForegroundColor Green
}

Write-Host ""

if ($todosLosJugadores.Count -eq 0) {
  Write-Host "No se bajo ningun jugador. Reviso la planilla o los gid de las hojas." -ForegroundColor Red
  Write-Host ""
  exit
}

# ---------------------------------------------------------------------------
# Control: reconstruir la ficha limpia y ver si da valores creibles
#   ficha = (AcT - bonos conocidos) / CT
# ---------------------------------------------------------------------------
$valorGol = @{ 'ARQ' = 12; 'DEF' = 9; 'VOL' = 6; 'DEL' = 4 }
$valorValla = @{ 'ARQ' = 3; 'DEF' = 2; 'VOL' = 0; 'DEL' = 0 }

$dentro = 0; $fuera = 0; $sumaFichas = 0.0; $conteoFichas = 0
$ejemplosMalos = New-Object System.Collections.ArrayList

foreach ($jugador in $todosLosJugadores) {
  if ($jugador.ct -lt 1) { $jugador['fichaLimpia'] = $null; continue }

  $golesJugada = [math]::Max(0, $jugador.gt - $jugador.gp)
  $bonos = 0.0
  $bonos += $golesJugada * $valorGol[$jugador.posicion]
  $bonos += $jugador.gp * 3            # gol de penal: 3 fijo
  $bonos += $jugador.gv * 2            # gol de visitante: +2
  $bonos += $jugador.go * 5            # gol de oro
  $bonos += $jugador.vf * 4            # figura
  $bonos += $jugador.vi * $valorValla[$jugador.posicion]
  $bonos += $jugador.pa * 4            # penal atajado
  $bonos += $jugador.gr * (-1)         # gol recibido (ARQ)
  $bonos += $jugador.ge * (-2)         # gol en contra
  $bonos += $jugador.ta * (-2)         # amarilla
  $bonos += $jugador.tr * (-4)         # roja
  $bonos += $jugador.pe * (-4)         # penal errado

  $ficha = ($jugador.act - $bonos) / $jugador.ct
  $jugador['fichaLimpia'] = [math]::Round($ficha, 2)
  $sumaFichas += $ficha; $conteoFichas++

  if ($ficha -ge 1 -and $ficha -le 10) {
    $dentro++
  } else {
    $fuera++
    if ($ejemplosMalos.Count -lt 12) {
      $malo = New-Object PSObject
      $malo | Add-Member NoteProperty nombre $jugador.nombre
      $malo | Add-Member NoteProperty pos    $jugador.posicion
      $malo | Add-Member NoteProperty ct     $jugador.ct
      $malo | Add-Member NoteProperty act    $jugador.act
      $malo | Add-Member NoteProperty ficha  ([math]::Round($ficha,2))
      [void]$ejemplosMalos.Add($malo)
    }
  }
}

$totalEvaluados = $dentro + $fuera
$pctFuera = 0
if ($totalEvaluados -gt 0) { $pctFuera = [math]::Round(100 * $fuera / $totalEvaluados, 1) }
$fichaMedia = 0
if ($conteoFichas -gt 0) { $fichaMedia = [math]::Round($sumaFichas / $conteoFichas, 2) }

# ---------------------------------------------------------------------------
# Guardar
# ---------------------------------------------------------------------------
$resultado = [ordered]@{
  generado       = (Get-Date).ToString('o')
  fuente         = 'Planeta Gran DT'
  ultimaFecha    = $fechaMaxima
  totalJugadores = $todosLosJugadores.Count
  control        = [ordered]@{
    evaluados        = $totalEvaluados
    fichaDentroDe1a10 = $dentro
    fichaFueraDeRango = $fuera
    pctFuera          = $pctFuera
    fichaMedia        = $fichaMedia
    veredicto         = $(if ($pctFuera -le 8) { 'OK' } else { 'REVISAR CONSTANTES DEL REGLAMENTO' })
  }
  columnasDetectadas = $columnasVistas
  jugadores          = $todosLosJugadores
}

$textoJson = $resultado | ConvertTo-Json -Depth 6
$rutaSalida = Join-Path $carpeta 'dataPlaneta.json'
[System.IO.File]::WriteAllText($rutaSalida, $textoJson, (New-Object System.Text.UTF8Encoding($false)))

Write-Host "LISTO. Escrito: dataPlaneta.json" -ForegroundColor Green
Write-Host ""
Write-Host ("   jugadores:        {0}" -f $todosLosJugadores.Count)
Write-Host ("   ultima fecha:     F{0}" -f $fechaMaxima)
Write-Host ""
Write-Host "   -- control de la ficha Clarin reconstruida --" -ForegroundColor Cyan
Write-Host ("   evaluados:        {0}" -f $totalEvaluados)
Write-Host ("   dentro de 1 a 10: {0}" -f $dentro)
Write-Host ("   fuera de rango:   {0} ({1}%)" -f $fuera, $pctFuera)
Write-Host ("   ficha promedio:   {0}" -f $fichaMedia)
if ($pctFuera -le 8) {
  Write-Host "   OK: la reconstruccion cierra" -ForegroundColor Green
} else {
  Write-Host "   OJO: hay alguna constante del reglamento mal. Ejemplos:" -ForegroundColor Yellow
  foreach ($malo in $ejemplosMalos) {
    Write-Host ("      {0,-26} {1}  CT {2}  AcT {3}  -> ficha {4}" -f $malo.nombre, $malo.pos, $malo.ct, $malo.act, $malo.ficha)
  }
}
Write-Host ""

# ordenar por ficha: los diccionarios [ordered] no se ordenan por nombre de
# propiedad, hay que pedirle el valor explicitamente
$mejores = $todosLosJugadores |
  Where-Object { $_['ct'] -ge 3 -and $null -ne $_['fichaLimpia'] } |
  Sort-Object -Property @{ Expression = { [double]$_['fichaLimpia'] } } -Descending |
  Select-Object -First 10
Write-Host "   Top 10 en ficha Clarin limpia (el piso real del jugador):" -ForegroundColor Cyan
$puesto = 1
foreach ($jugador in $mejores) {
  Write-Host ("   {0,2}. {1,-28} {2}  {3,-20} ficha {4}  ({5} PJ)" -f $puesto, $jugador['nombre'], $jugador['posicion'], $jugador['equipo'], $jugador['fichaLimpia'], $jugador['ct'])
  $puesto++
}
Write-Host ""
