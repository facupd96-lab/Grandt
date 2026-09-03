# =============================================================================
#  VER_STATS.ps1 (v2) - Segunda pasada del diagnostico.
#  La primera encontro 44 estadisticas por jugador pero NINGUNA de tarjetas.
#  Las tarjetas y los goles con minuto viven en "events", que esta a nivel
#  PARTIDO y no a nivel equipo: la v1 miraba en el lugar equivocado.
#  Ademas el partido trae "hasMissingPlayers", que es justo lo que necesitamos
#  para lesionados y suspendidos.
#  No escribe nada. Tarda unos segundos. Copiame toda la salida.
# =============================================================================

Set-StrictMode -Off
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'

$queryBase = "appTypeId=5&langId=29&timezoneName=America/Argentina/Buenos_Aires&userCountryId=11"
$encabezados = @{
  'User-Agent' = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
  'Accept'     = 'application/json, text/plain, */*'
  'Referer'    = 'https://www.365scores.com/'
}
function Obtener-Json([string]$d) {
  try { return Invoke-RestMethod -Uri $d -Headers $encabezados -TimeoutSec 45 }
  catch { Write-Host ("   error: {0}" -f $_.Exception.Message) -ForegroundColor Red; return $null }
}
function Mostrar-Campos($obj, [string]$sangria) {
  if ($null -eq $obj) { Write-Host ($sangria + '(vacio)') -ForegroundColor DarkGray; return }
  $obj.PSObject.Properties | ForEach-Object {
    $v = $_.Value
    $tipo = ''
    if ($v -is [array]) { $tipo = "[array de $($v.Count)]" }
    elseif ($v -is [psobject] -and $v.PSObject.Properties.Count -gt 0 -and $v -isnot [string]) { $tipo = "{objeto}" }
    else { $tipo = "= $v" }
    Write-Host ("{0}{1,-26} {2}" -f $sangria, $_.Name, $tipo) -ForegroundColor DarkGray
  }
}

Write-Host ""
Write-Host "-- diagnostico 2: tarjetas y jugadores ausentes --" -ForegroundColor Cyan
Write-Host ""

# Buscar un partido JUGADO que tenga eventos, y uno POR JUGARSE para ausentes
$lista = Obtener-Json "https://webws.365scores.com/web/games/results/?$queryBase&competitions=72"
$prox  = Obtener-Json "https://webws.365scores.com/web/games/fixtures/?$queryBase&competitions=72"
if ($null -eq $lista) { Write-Host "no pude bajar el calendario" -ForegroundColor Red; exit }

$idJugado = $null; foreach ($g in $lista.games) { if ($g.id) { $idJugado = [string]$g.id } }
$idProximo = $null; if ($prox -and $prox.games) { foreach ($g in $prox.games) { if ($g.id -and -not $idProximo) { $idProximo = [string]$g.id } } }

# ---------------------------------------------------------------------------
Write-Host ("=== PARTIDO JUGADO (gameId {0}) ===" -f $idJugado) -ForegroundColor Yellow
$r = Obtener-Json "https://webws.365scores.com/web/game/?$queryBase&gameId=$idJugado"
$p = $r.game; if ($null -eq $p) { $p = $r }
Write-Host ("   {0} {1}-{2} {3}" -f $p.homeCompetitor.name, $p.homeCompetitor.score, $p.awayCompetitor.score, $p.awayCompetitor.name)
Write-Host ("   hasMissingPlayers = {0}" -f $p.hasMissingPlayers)
Write-Host ""

Write-Host "   --- p.events (aca deberian estar goles y tarjetas) ---" -ForegroundColor White
if ($null -eq $p.events) {
  Write-Host "      NO existe p.events" -ForegroundColor Red
} else {
  Write-Host ("      {0} eventos. Campos del primero:" -f @($p.events).Count)
  Mostrar-Campos @($p.events)[0] '        '
  Write-Host ""
  Write-Host "      Todos los eventos:" -ForegroundColor White
  $tipos = @{}
  foreach ($e in $p.events) {
    $et = ''
    if ($e.eventType) { $et = "id=$($e.eventType.id) sub=$($e.eventType.subTypeId) nombre='$($e.eventType.name)'" }
    $clave = $et
    if (-not $tipos.ContainsKey($clave)) { $tipos[$clave] = 0 }
    $tipos[$clave] = $tipos[$clave] + 1
    Write-Host ("        min {0,-6} comp={1,-8} jugador={2,-10} {3}" -f $e.gameTime, $e.competitorId, $e.playerId, $et)
  }
  Write-Host ""
  Write-Host "      RESUMEN de tipos de evento:" -ForegroundColor Green
  foreach ($k in $tipos.Keys) { Write-Host ("        {0,-58} x{1}" -f $k, $tipos[$k]) }
}
Write-Host ""

Write-Host "   --- p.members (para cruzar playerId con nombre) ---" -ForegroundColor White
if ($null -eq $p.members) { Write-Host "      NO existe p.members" -ForegroundColor Red }
else {
  Write-Host ("      {0} miembros. Campos del primero:" -f @($p.members).Count)
  Mostrar-Campos @($p.members)[0] '        '
}
Write-Host ""

Write-Host "   --- lineups del equipo local ---" -ForegroundColor White
Mostrar-Campos $p.homeCompetitor.lineups '        '
Write-Host ""

# ---------------------------------------------------------------------------
if ($idProximo) {
  Write-Host ("=== PARTIDO POR JUGARSE (gameId {0}) ===" -f $idProximo) -ForegroundColor Yellow
  $r2 = Obtener-Json "https://webws.365scores.com/web/game/?$queryBase&gameId=$idProximo"
  $p2 = $r2.game; if ($null -eq $p2) { $p2 = $r2 }
  Write-Host ("   {0} vs {1}   ({2})" -f $p2.homeCompetitor.name, $p2.awayCompetitor.name, $p2.startTime)
  Write-Host ("   hasMissingPlayers = {0}   hasLineups = {1}" -f $p2.hasMissingPlayers, $p2.hasLineups)
  Write-Host ""
  Write-Host "   --- campos del equipo local (busco lesionados/suspendidos) ---" -ForegroundColor White
  Mostrar-Campos $p2.homeCompetitor '        '
  Write-Host ""
  foreach ($nombreCampo in @('missingPlayers','missing','absentees','injuries','suspended')) {
    $v = $p2.homeCompetitor.$nombreCampo
    if ($null -ne $v) {
      Write-Host ("   ENCONTRADO: homeCompetitor.{0} con {1} entradas" -f $nombreCampo, @($v).Count) -ForegroundColor Green
      Mostrar-Campos @($v)[0] '        '
      foreach ($x in $v) { Write-Host ("        {0}" -f ($x | ConvertTo-Json -Depth 3 -Compress)) -ForegroundColor DarkGray }
    }
  }
  if ($null -ne $p2.homeCompetitor.lineups) {
    Write-Host "   --- lineups del proximo partido ---" -ForegroundColor White
    Mostrar-Campos $p2.homeCompetitor.lineups '        '
  }
}

Write-Host ""
Write-Host "   Copiame TODA esta salida." -ForegroundColor Cyan
Write-Host ""
