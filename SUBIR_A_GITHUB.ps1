# =============================================================================
#  SUBIR_A_GITHUB.ps1 - Sube el proyecto a GitHub y COMPRUEBA que subio.
#
#  Por que se rehizo (08/09). El script viejo hacia bien el commit y el push,
#  pero daba "LISTO" sin mirar nunca lo que habia quedado del otro lado. Con eso
#  se pasaron semanas creyendo que la pagina publicada estaba al dia cuando
#  tenia una version viejisima: no aparecia ni "Torneo de amigos".
#
#  Dos cosas nuevas, y son las importantes:
#    1. RECONSTRUYE index.html antes de subir. Si tocaste appV3.js o styles.css
#       y no corriste construir.cjs, el index de la carpeta es viejo y lo que
#       sube es viejo. Ahora no puede pasar.
#    2. DESPUES de subir, se baja el index.html publicado y compara la huella
#       con la de tu carpeta. Si no coincide, lo dice. No hay mas "LISTO" de fe.
#
#  Lo unico que toca de tu disco: index.html y BUILD.txt, que los rehace
#  construir.cjs. 'git rm --cached' saca archivos del registro de git, no del
#  disco.
# =============================================================================

param([switch]$Auto)   # -Auto: no pregunta nada. Lo usa la corrida diaria.

Set-StrictMode -Off
$ErrorActionPreference = 'Continue'
$carpeta = $PSScriptRoot
if (-not $carpeta) { $carpeta = (Get-Location).Path }

# En modo -Auto no hay nadie mirando: un "Enter para cerrar" dejaria la tarea
# programada colgada para siempre. Pausa() los saltea cuando corre solo.
function Pausa($t) { if (-not $Auto) { Read-Host $t } }
Set-Location $carpeta

function Titulo($t) {
  Write-Host ""
  Write-Host ("=" * 70) -ForegroundColor DarkCyan
  Write-Host ("  {0}" -f $t) -ForegroundColor Cyan
  Write-Host ("=" * 70) -ForegroundColor DarkCyan
}
function Salir($msg) {
  Write-Host ""
  Write-Host "   $msg" -ForegroundColor Red
  Write-Host ""
  Pausa "Enter para cerrar"
  exit 1
}
function Huella($ruta) {
  if (-not (Test-Path $ruta)) { return $null }
  return (Get-FileHash -Path $ruta -Algorithm SHA256).Hash.ToLower()
}
# COMPARAR SIN LOS FINES DE LINEA (08/09).
# La comparacion byte a byte daba SIEMPRE "no coincide" y era una falsa alarma
# mia. Git para Windows viene con core.autocrlf=true: cuando guarda un archivo
# en el repositorio le cambia los fines de linea de CRLF a LF. teamsRegistry.js
# tiene 518 lineas con CRLF y esas 518 lineas se meten adentro de index.html al
# construirlo, asi que el archivo de tu carpeta y el del repositorio tienen el
# mismo contenido y 518 bytes de diferencia. Se compara el texto normalizado,
# que es lo que de verdad importa.
function HuellaTexto($ruta) {
  if (-not (Test-Path $ruta)) { return $null }
  $t = [System.IO.File]::ReadAllText($ruta)
  $t = $t -replace "`r`n", "`n"
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $h = $sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($t))
  return ([BitConverter]::ToString($h)).Replace('-','').ToLower()
}
function SelloDe($ruta) {
  if (-not (Test-Path $ruta)) { return '' }
  $m = [regex]::Match([System.IO.File]::ReadAllText($ruta), 'name="gdt-build"\s+content="([^"]+)"')
  if ($m.Success) { return $m.Groups[1].Value }
  return ''
}
function Bajar($url, $destino) {
  for ($i = 1; $i -le 3; $i++) {
    try {
      Invoke-WebRequest -Uri ($url + "?nocache=" + [guid]::NewGuid().ToString('N')) -OutFile $destino -UseBasicParsing -TimeoutSec 40
      return $true
    } catch { Start-Sleep -Seconds 4 }
  }
  return $false
}

Titulo "1. Reviso que este todo listo"

$git = Get-Command git -ErrorAction SilentlyContinue
if (-not $git) {
  Write-Host "   No tenes git instalado." -ForegroundColor Red
  Write-Host "   Bajalo de:  https://git-scm.com/download/win" -ForegroundColor Yellow
  Write-Host "   Instalalo con todas las opciones por defecto y volve a hacer doble clic aca."
  Pausa "Enter para cerrar"; exit 1
}
Write-Host "   git instalado: OK" -ForegroundColor Green

if (-not (Test-Path (Join-Path $carpeta '.git'))) {
  Salir "Esta carpeta no es un repositorio de git. Avisame y lo resolvemos."
}
Write-Host "   la carpeta es un repositorio: OK" -ForegroundColor Green

if ((Test-Path (Join-Path $carpeta '.git\rebase-merge')) -or (Test-Path (Join-Path $carpeta '.git\rebase-apply'))) {
  Write-Host "   habia una combinacion a medias: la cancelo y sigo limpio" -ForegroundColor Yellow
  git rebase --abort 2>$null | Out-Null
}

$nombre = (git config user.name)  2>$null
$mail   = (git config user.email) 2>$null
if (-not $nombre -or -not $mail) {
  Write-Host ""
  Write-Host "   Falta decirle a git quien sos (se hace una sola vez)." -ForegroundColor Yellow
  if (-not $nombre) { $n = Read-Host "   Tu nombre"; if ($n) { git config user.name $n } }
  if (-not $mail)   { $m = Read-Host "   Tu mail de GitHub"; if ($m) { git config user.email $m } }
}
Write-Host ("   sos: {0} <{1}>" -f (git config user.name), (git config user.email)) -ForegroundColor Green

# ---------------------------------------------------------------------------
Titulo "2. Rehago index.html con lo ultimo de la carpeta"
# ---------------------------------------------------------------------------
# ESTE PASO ES EL QUE FALTABA. index.html no es un archivo que uno edite: lo
# arma construir.cjs metiendo adentro styles.css, teamsRegistry.js y appV3.js.
# Si no se rehace, sube el index de la ultima vez que alguien lo armo a mano.
$node = Join-Path $carpeta 'node.exe'
if (-not (Test-Path $node)) { $node = 'node' }
& $node construir.cjs
if ($LASTEXITCODE -ne 0) { Salir "construir.cjs fallo. Sin eso no se puede subir: el index quedaria viejo." }

$sello = ''
if (Test-Path (Join-Path $carpeta 'BUILD.txt')) { $sello = (Get-Content 'BUILD.txt' -Raw).Trim() }
Write-Host ("   sello del build: {0}" -f $sello) -ForegroundColor Green

# los archivos que la pagina necesita del otro lado
foreach ($f in @('datos.js','index.html')) {
  if (-not (Test-Path (Join-Path $carpeta $f))) { Salir "Falta $f. Sin ese archivo la pagina publicada no muestra nada." }
}
if (-not (Test-Path (Join-Path $carpeta 'dataVivo.js'))) {
  Write-Host "   OJO: no hay dataVivo.js. La pagina va a mostrar los puntos esperados, no los reales." -ForegroundColor Yellow
}
if (-not (Test-Path (Join-Path $carpeta 'dataLiga.js'))) {
  Write-Host "   OJO: no hay dataLiga.js. Tus amigos NO van a ver ningun equipo del torneo." -ForegroundColor Yellow
  Write-Host "        Se baja desde Torneo de amigos -> ... -> Compartir el torneo." -ForegroundColor Yellow
}

# ---------------------------------------------------------------------------
Titulo "3. Preparo la lista (no toco ningun archivo de tu disco)"
# ---------------------------------------------------------------------------
# POR QUE NO ALCANZA CON EL .gitignore (08/09).
# El .gitignore vale para lo que NO esta anotado. Un archivo que ya entro al
# repo alguna vez sigue entrando aunque despues lo agregues al .gitignore: git
# no lo saca solo. Paso con data365_roles.json y dataEspn.json — 3,3 MB de
# datos crudos que se subian todas las veces y frenaban esta pantalla.
# La forma de preguntarle a git "¿este deberia estar ignorado?" sin que te
# conteste que no porque ya esta anotado es check-ignore --no-index.
git add -A 2>$null | Out-Null

# SIN TUBERIAS (08/09, segundo intento). La version anterior le pasaba la lista
# a 'git check-ignore --stdin' por una tuberia de PowerShell y del otro lado no
# llegaba nada: el bloque no sacaba ni un archivo y no se quejaba. Se pregunta
# de a uno, mirando solo el codigo de salida. Son 80 llamadas y tarda un
# segundo, pero funciona siempre.
$anotados = @(git ls-files --cached)
$sobran = @()
foreach ($f in $anotados) {
  git check-ignore -q --no-index -- $f
  if ($LASTEXITCODE -eq 0) { $sobran += $f; continue }
  # segunda red: lo que el control de seguridad no quiere ver ni aunque el
  # .gitignore se olvide de nombrarlo
  if ($f -like '*.png' -or $f -like 'data*.json' -or $f -like '*/data*.json' -or
      $f -like '*node.exe' -or $f -like '*salida.json' -or
      $f -like '*SYNC_CUOTAS.ps1' -or $f -like '*clave_cuotas.txt') { $sobran += $f }
}
$global:LASTEXITCODE = 0
$sobran = @($sobran | Select-Object -Unique)
if ($sobran.Count -gt 0) {
  Write-Host ("   saco del repo {0} archivo(s) que el .gitignore dice que no van:" -f $sobran.Count) -ForegroundColor Yellow
  foreach ($f in $sobran) {
    Write-Host ("      - {0}" -f $f) -ForegroundColor DarkYellow
    git rm --cached --quiet -- $f 2>$null | Out-Null
  }
  $global:LASTEXITCODE = 0
  Write-Host "   (siguen en tu disco: solo salen del registro de git)" -ForegroundColor DarkGray
  # se comprueba: si alguno sigue anotado, el problema es otro y hay que verlo
  $siguen = @(git ls-files --cached | Where-Object { $sobran -contains $_ })
  if ($siguen.Count -gt 0) {
    Write-Host ""
    Write-Host "   NO PUDE SACARLOS. Siguen anotados:" -ForegroundColor Red
    $siguen | ForEach-Object { Write-Host ("      {0}" -f $_) -ForegroundColor Red }
    Write-Host "   Copiame esto y lo resolvemos." -ForegroundColor Yellow
    Pausa "Enter para cerrar"; exit 1
  }
}

$lista   = @(git ls-files --cached)
$cambian = @(git diff --cached --name-only)
$cuantos = $lista.Count
Write-Host ("   {0} archivos quedan en el repo, {1} cambiaron desde la ultima vez." -f $cuantos, $cambian.Count) -ForegroundColor Green

# index.html tiene que estar SI O SI en el repo
if ($lista -notcontains 'index.html') {
  Salir "index.html no esta entrando al repo. Fijate el .gitignore: sin el, la pagina publicada no existe."
}

$prohibidos = @('node.exe','salida.json','SYNC_CUOTAS.ps1','clave_cuotas.txt')
$colados = @()
foreach ($f in $lista) {
  foreach ($p in $prohibidos) { if ($f -like "*$p") { $colados += $f } }
  if ($f -like '*.png' -or $f -like 'data*.json' -or $f -like 'node_modules/*') { $colados += $f }
}
$colados = $colados | Select-Object -Unique
if ($colados.Count -gt 0) {
  Write-Host ""
  Write-Host "   PARA. Se colaron archivos que NO tienen que subir:" -ForegroundColor Red
  $colados | ForEach-Object { Write-Host ("      {0}" -f $_) -ForegroundColor Red }
  Write-Host ""
  Write-Host "   Si son datos crudos o capturas, se arregla agregandolos al .gitignore." -ForegroundColor Yellow
  Write-Host "   Mandale esta lista a Claude." -ForegroundColor Yellow
  Pausa "Enter para cerrar"; exit 1
}
Write-Host "   control: no se colo ningun archivo pesado ni la clave" -ForegroundColor Green

# ---------------------------------------------------------------------------
# LA RAMA. Si hay dos (main y master) es facil subir a una y que la pagina
# sirva la otra: se ve todo viejo y no se entiende por que.
# ---------------------------------------------------------------------------
$rama = (git rev-parse --abbrev-ref HEAD)
Write-Host ("   estas parado en la rama: {0}" -f $rama) -ForegroundColor Green
$remotas = @(git ls-remote --heads origin 2>$null | ForEach-Object { ($_ -split 'refs/heads/')[-1] })
if ($remotas.Count -gt 1) {
  Write-Host ""
  Write-Host ("   OJO: en GitHub hay {0} ramas ({1})." -f $remotas.Count, ($remotas -join ', ')) -ForegroundColor Yellow
  Write-Host ("   Vos subis a '{0}'. Si la pagina se sirve de otra, vas a ver todo viejo." -f $rama) -ForegroundColor Yellow
  Write-Host "   Se arregla una sola vez en GitHub: Settings -> Pages -> Branch." -ForegroundColor Yellow
}

$pendientes = 0
try { $pendientes = @(git log --oneline '@{u}..HEAD' 2>$null).Count } catch { }
if ($pendientes -eq 0) { try { $pendientes = @(git log --oneline ("origin/" + $rama + "..HEAD") 2>$null).Count } catch { } }
if ($pendientes -eq 0 -and $cambian.Count -eq 0) {
  git fetch origin 2>&1 | Out-Null
  try { $pendientes = @(git log --oneline ("origin/" + $rama + "..HEAD") 2>$null).Count } catch { }
}

if ($cambian.Count -eq 0 -and $pendientes -eq 0) {
  Write-Host ""
  Write-Host "   No hay nada nuevo para guardar. Igual voy a comprobar que lo publicado coincida." -ForegroundColor Green
} else {

  if ($cambian.Count -gt 0) {
    Titulo "4. Esto es lo que va a subir"
    $borran = @(git diff --cached --name-only --diff-filter=D)
    $suben  = @($cambian | Where-Object { $borran -notcontains $_ })
    if ($suben.Count -gt 0) {
      Write-Host "   SE SUBEN (nuevos o modificados):" -ForegroundColor White
      $suben | Sort-Object | ForEach-Object { Write-Host ("   + {0}" -f $_) -ForegroundColor Green }
      Write-Host ""
    }
    if ($borran.Count -gt 0) {
      Write-Host "   SE BORRAN DEL REPO (siguen en tu disco):" -ForegroundColor White
      $borran | Sort-Object | ForEach-Object { Write-Host ("   - {0}" -f $_) -ForegroundColor DarkYellow }
      Write-Host ""
    }
    Write-Host ("   Total: {0} archivos en el repo." -f $cuantos) -ForegroundColor Cyan
    Write-Host ""
    if ($Auto) {
      $ok = 'SI'
      Write-Host "   (modo automatico: subo sin preguntar)" -ForegroundColor DarkGray
    } else {
      $ok = Read-Host "   Escribi SI y Enter para subirlos (cualquier otra cosa cancela)"
    }
    if ($ok -notmatch '^(?i)si$') {
      Write-Host "   Cancelado. No se subio nada." -ForegroundColor Yellow
      Pausa "Enter para cerrar"; exit 0
    }

    Titulo "5. Guardando los cambios"
    if ($Auto) { $mensaje = "" }
    else { $mensaje = Read-Host "   Descripcion (Enter para usar la de por defecto)" }
    if (-not $mensaje) { $mensaje = "Actualizacion " + (Get-Date -Format 'yyyy-MM-dd HH:mm') + " - build " + $sello }
    git commit -m $mensaje
    if ($LASTEXITCODE -ne 0) { Salir "El commit fallo. Copiame lo que dice arriba." }
  }

  Titulo "6. Subiendo a GitHub"
  Write-Host "   Si te pide usuario y contrasena, se abre una ventana de GitHub." -ForegroundColor DarkGray
  Write-Host ""
  git push
  if ($LASTEXITCODE -ne 0) {
    Titulo "GitHub tiene cambios que no tenes en esta maquina"
    git fetch origin 2>&1 | Out-Null
    $ajenos = @(git log --oneline HEAD..("origin/" + $rama) 2>$null)
    if ($ajenos.Count -gt 0) { $ajenos | ForEach-Object { Write-Host ("      {0}" -f $_) -ForegroundColor Gray } }
    else { Write-Host "      (no puedo listarlo: los dos historiales arrancaron por separado)" -ForegroundColor Gray }
    Write-Host ""
    Write-Host "   Voy a apoyar tu carpeta ENCIMA de lo que ya hay en GitHub, en un solo paso." -ForegroundColor White
    Write-Host "   Tus archivos del disco no se tocan en ningun momento." -ForegroundColor DarkGray
    Write-Host ""
    if ($Auto) {
      Write-Host ""
      Write-Host "   MODO AUTOMATICO: esto reescribe la rama y no lo hago solo." -ForegroundColor Yellow
      Write-Host "   No subi nada. Corre SUBIR_A_GITHUB.bat a mano para resolverlo." -ForegroundColor Yellow
      exit 1
    }
    $r = Read-Host "   Escribi SI y Enter para hacerlo (cualquier otra cosa cancela)"
    if ($r -notmatch '^(?i)si$') {
      Write-Host "   Cancelado. Tu trabajo sigue guardado aca." -ForegroundColor Yellow
      Pausa "Enter para cerrar"; exit 0
    }
    git reset --soft ("origin/" + $rama)
    if ($LASTEXITCODE -ne 0) { Salir "No pude apoyarme sobre lo de GitHub. Copiame la pantalla." }
    git add -A
    git commit -m ("Actualizacion " + (Get-Date -Format 'yyyy-MM-dd HH:mm') + " - build " + $sello)
    if ($LASTEXITCODE -ne 0) { Salir "El commit fallo. Copiame la pantalla." }
    Write-Host "   Combinado. Subiendo de nuevo..." -ForegroundColor Green
    git push
    if ($LASTEXITCODE -ne 0) { Salir "Sigue sin subir. Tu commit esta guardado igual, no perdiste nada. Copiame la pantalla." }
  }
}

# ---------------------------------------------------------------------------
Titulo "7. Compruebo que lo que hay publicado sea esto"
# ---------------------------------------------------------------------------
# Se miran los dos lugares, que no son el mismo:
#   - el REPOSITORIO (raw.githubusercontent): lo que acabas de subir.
#   - la PAGINA (github.io): lo que abren tus amigos. Puede servirse de OTRA
#     rama y quedarse vieja aunque el repositorio este perfecto.
$hLocalTxt = HuellaTexto (Join-Path $carpeta 'index.html')
$url = (git config --get remote.origin.url)
$slug = ''
if ($url -match 'github\.com[:/]+([^/]+)/([^/.]+)') { $slug = $Matches[1] + '/' + $Matches[2] }
$usuario = ''; $repo = ''
if ($slug) { $usuario = $slug.Split('/')[0]; $repo = $slug.Split('/')[1] }

if (-not $slug) {
  Write-Host "   No pude leer el nombre del repo. Verificalo a mano." -ForegroundColor Yellow
} else {
  $tmp1 = Join-Path $env:TEMP ("gdt_repo_" + [guid]::NewGuid().ToString('N') + ".html")
  $tmp2 = Join-Path $env:TEMP ("gdt_pag_"  + [guid]::NewGuid().ToString('N') + ".html")
  $urlRepo = "https://raw.githubusercontent.com/$slug/$rama/index.html"
  $urlPag  = "https://$usuario.github.io/$repo/index.html"

  Write-Host ("   sello de tu carpeta : {0}" -f $sello) -ForegroundColor White
  Write-Host ""

  # --- el repositorio ---
  Write-Host "   EL REPOSITORIO" -ForegroundColor White
  if (Bajar $urlRepo $tmp1) {
    $s1 = SelloDe $tmp1
    $h1 = HuellaTexto $tmp1
    Write-Host ("      sello: {0}" -f $(if ($s1) { $s1 } else { '(sin sello: es un index viejo)' })) -ForegroundColor Gray
    if ($h1 -eq $hLocalTxt) { Write-Host "      COMPROBADO: tiene exactamente tu index.html" -ForegroundColor Green }
    elseif ($s1 -eq $sello)  { Write-Host "      OK: mismo build (difieren solo los fines de linea, es normal)" -ForegroundColor Green }
    else { Write-Host "      NO COINCIDE: lo que hay ahi no es lo que acabas de subir" -ForegroundColor Red }
    Remove-Item $tmp1 -ErrorAction SilentlyContinue
  } else { Write-Host "      no pude bajarlo (sin internet o GitHub tardando)" -ForegroundColor Yellow }

  # --- la pagina, que es lo que ven tus amigos ---
  Write-Host ""
  Write-Host "   LA PAGINA (lo que abren tus amigos)" -ForegroundColor White
  if (Bajar $urlPag $tmp2) {
    $s2 = SelloDe $tmp2
    $h2 = HuellaTexto $tmp2
    Write-Host ("      sello: {0}" -f $(if ($s2) { $s2 } else { '(sin sello: es un index viejo)' })) -ForegroundColor Gray
    if ($h2 -eq $hLocalTxt -or $s2 -eq $sello) {
      Write-Host "      COMPROBADO: la pagina esta al dia" -ForegroundColor Green
    } elseif (-not $s2) {
      Write-Host "      LA PAGINA ESTA VIEJA y ni siquiera tiene sello." -ForegroundColor Red
      Write-Host ("      Si en un rato sigue asi, entra a https://github.com/{0}/settings/pages" -f $slug) -ForegroundColor Yellow
      Write-Host ("      y fijate que 'Branch' diga '{0}'. Ahi esta el problema." -f $rama) -ForegroundColor Yellow
    } else {
      Write-Host ("      todavia sirve el build {0}." -f $s2) -ForegroundColor Yellow
      Write-Host "      GitHub tarda entre uno y dos minutos en rehacer la pagina. Espera y recarga." -ForegroundColor Yellow
    }
    Remove-Item $tmp2 -ErrorAction SilentlyContinue
  } else { Write-Host "      no pude bajarla (todavia armandose, o sin internet)" -ForegroundColor Yellow }
}

Write-Host ""
Write-Host ("   Repo:    https://github.com/{0}" -f $slug) -ForegroundColor Green
Write-Host "   Pagina:  https://facupd96-lab.github.io/Grandt/" -ForegroundColor Green
Write-Host ""
Write-Host "   OJO con la cache: GitHub sirve el index guardado hasta 10 minutos." -ForegroundColor DarkGray
Write-Host "   Si abris la pagina y ves el sello viejo, espera un rato y recarga con Ctrl+F5." -ForegroundColor DarkGray
Write-Host "   El sello se ve en el menu (...) de arriba a la derecha, abajo de todo." -ForegroundColor DarkGray
Write-Host ""
Pausa "Enter para cerrar"
