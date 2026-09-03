# =============================================================================
#  SUBIR_A_GITHUB.ps1 - Sube el proyecto a GitHub, de a un paso y preguntando.
#
#  Nace de algo obvio que tarde en ver (03/09): facu no usa PowerShell. Todo el
#  resto del proyecto se maneja con .bat de doble clic, y esto era lo unico que
#  pedia escribir comandos a mano. No tiene sentido.
#
#  No hace nada irreversible sin preguntar. Lo unico que toca de tu disco es
#  NADA: 'git rm --cached' saca archivos del registro de git, no del disco.
# =============================================================================

Set-StrictMode -Off
$ErrorActionPreference = 'Continue'
$carpeta = $PSScriptRoot
if (-not $carpeta) { $carpeta = (Get-Location).Path }
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
  Read-Host "Enter para cerrar"
  exit 1
}

Titulo "1. Reviso que este todo listo"

# git instalado?
$git = Get-Command git -ErrorAction SilentlyContinue
if (-not $git) {
  Write-Host "   No tenes git instalado." -ForegroundColor Red
  Write-Host ""
  Write-Host "   Bajalo de:  https://git-scm.com/download/win" -ForegroundColor Yellow
  Write-Host "   Instalalo con todas las opciones por defecto (Siguiente, Siguiente...)"
  Write-Host "   y despues volve a hacer doble clic aca."
  Write-Host ""
  Read-Host "Enter para cerrar"
  exit 1
}
Write-Host "   git instalado: OK" -ForegroundColor Green

# es un repo?
if (-not (Test-Path (Join-Path $carpeta '.git'))) {
  Salir "Esta carpeta no es un repositorio de git. Avisame y lo resolvemos."
}
Write-Host "   la carpeta es un repositorio: OK" -ForegroundColor Green

# Si una corrida anterior quedo a mitad de una combinacion, salir de ahi antes
# de tocar nada mas (03/09).
if ((Test-Path (Join-Path $carpeta '.git\rebase-merge')) -or (Test-Path (Join-Path $carpeta '.git\rebase-apply'))) {
  Write-Host "   habia una combinacion a medias: la cancelo y sigo limpio" -ForegroundColor Yellow
  git rebase --abort 2>$null | Out-Null
}

# nombre y mail configurados (sin esto el commit falla)
$nombre = (git config user.name)  2>$null
$mail   = (git config user.email) 2>$null
if (-not $nombre -or -not $mail) {
  Write-Host ""
  Write-Host "   Falta decirle a git quien sos (se hace una sola vez)." -ForegroundColor Yellow
  if (-not $nombre) {
    $n = Read-Host "   Tu nombre (ej: Facundo Perez)"
    if ($n) { git config user.name $n }
  }
  if (-not $mail) {
    $m = Read-Host "   Tu mail de GitHub"
    if ($m) { git config user.email $m }
  }
}
Write-Host ("   sos: {0} <{1}>" -f (git config user.name), (git config user.email)) -ForegroundColor Green

Titulo "2. Preparo la lista (no toco ningun archivo de tu disco)"

git rm -r --cached . --quiet 2>$null | Out-Null
git add -A 2>$null | Out-Null

# OJO: 'git diff --cached' muestra solo lo que CAMBIO. Para el control de
# seguridad hace falta TODO lo que va a quedar en el repo, cambiado o no: si
# node.exe ya estaba anotado de antes y no se toco, en el diff no aparece pero
# en GitHub si.
$lista   = @(git ls-files --cached)
$cambian = @(git diff --cached --name-only)
$cuantos = $lista.Count
Write-Host ("   {0} archivos quedan en el repo, {1} cambiaron desde la ultima vez." -f $cuantos, $cambian.Count) -ForegroundColor Green

# control de seguridad: nada de esto tiene que estar
$prohibidos = @('node.exe','datos.js','salida.json','SYNC_CUOTAS.ps1','clave_cuotas.txt')
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
  Write-Host "   No sigas. Mandale esta lista a Claude y lo arregla." -ForegroundColor Yellow
  Write-Host ""
  Read-Host "Enter para cerrar"
  exit 1
}
Write-Host "   control: no se colo ningun archivo pesado ni la clave" -ForegroundColor Green

# COMMITS GUARDADOS QUE NO LLEGARON A SUBIR (03/09).
# Si el push fallo en una corrida anterior, el commit quedo hecho y no hay
# nada nuevo que confirmar: hay que ir derecho a subir. Sin esto el script
# decia "no hay nada nuevo" y se cerraba sin subir el trabajo ya guardado.
$rama = (git rev-parse --abbrev-ref HEAD)
$pendientes = 0
try   { $pendientes = @(git log --oneline '@{u}..HEAD' 2>$null).Count } catch { }
if ($pendientes -eq 0) {
  try { $pendientes = @(git log --oneline ("origin/" + $rama + "..HEAD") 2>$null).Count } catch { }
}
if ($pendientes -eq 0 -and $cambian.Count -eq 0) {
  git fetch origin 2>&1 | Out-Null
  try { $pendientes = @(git log --oneline ("origin/" + $rama + "..HEAD") 2>$null).Count } catch { }
}

if ($cambian.Count -eq 0 -and $pendientes -eq 0) {
  Write-Host ""
  Write-Host "   No hay nada nuevo: ya esta todo subido." -ForegroundColor Green
  Write-Host ""
  Read-Host "Enter para cerrar"
  exit 0
}
if ($cambian.Count -eq 0) {
  Write-Host ""
  Write-Host ("   No hay cambios nuevos, pero tenes {0} cambio(s) guardado(s) sin subir." -f $pendientes) -ForegroundColor Yellow
  Write-Host "   Voy directo a subirlos, sin volver a preguntarte." -ForegroundColor Yellow
}

if ($cambian.Count -gt 0) {
Titulo "3. Esto es lo que va a subir"
# Los borrados se muestran aparte. Antes iban mezclados con los nuevos y
# parecia que se estaban SUBIENDO archivos viejos, cuando en realidad se
# estaban sacando del repo (03/09).
$borran = @(git diff --cached --name-only --diff-filter=D)
$suben  = @($cambian | Where-Object { $borran -notcontains $_ })
if ($suben.Count -gt 0) {
  Write-Host "   SE SUBEN (nuevos o modificados):" -ForegroundColor White
  $suben | Sort-Object | ForEach-Object { Write-Host ("   + {0}" -f $_) -ForegroundColor Green }
  Write-Host ""
}
if ($borran.Count -gt 0) {
  Write-Host "   SE BORRAN DEL REPO (siguen en tu disco, solo salen de GitHub):" -ForegroundColor White
  $borran | Sort-Object | ForEach-Object { Write-Host ("   - {0}" -f $_) -ForegroundColor DarkYellow }
  Write-Host ""
}
Write-Host "   EL REPO COMPLETO QUEDA ASI:" -ForegroundColor White
$lista | Sort-Object | ForEach-Object { Write-Host ("   {0}" -f $_) -ForegroundColor DarkGray }

Write-Host ""
Write-Host ("   Total: {0} archivos en el repo." -f $cuantos) -ForegroundColor Cyan
Write-Host ""
$ok = Read-Host "   Escribi SI y Enter para subirlos (cualquier otra cosa cancela)"
if ($ok -ne 'SI' -and $ok -ne 'si' -and $ok -ne 'Si') {
  Write-Host ""
  Write-Host "   Cancelado. No se subio nada." -ForegroundColor Yellow
  Write-Host ""
  Read-Host "Enter para cerrar"
  exit 0
}
}

if ($cambian.Count -gt 0) {

Titulo "4. Guardando los cambios"
$mensaje = Read-Host "   Descripcion (Enter para usar la de por defecto)"
if (-not $mensaje) { $mensaje = "Motor v29: minutos reales de titular, confianza por remates, valla por minutos en cancha" }
git commit -m $mensaje
if ($LASTEXITCODE -ne 0) { Salir "El commit fallo. Copiame lo que dice arriba." }
}

Titulo "5. Subiendo a GitHub"
Write-Host "   Si te pide usuario y contrasena, se abre una ventana de GitHub." -ForegroundColor DarkGray
Write-Host "   Entra con tu cuenta ahi. Yo no veo nada de eso." -ForegroundColor DarkGray
Write-Host ""
git push
if ($LASTEXITCODE -ne 0) {

  # GITHUB TIENE COSAS QUE VOS NO (03/09).
  # Pasa cuando el repo se creo desde la web, o cuando se subio algo desde otra
  # maquina. Git no deja pisar eso sin querer, y hace bien.
  Titulo "GitHub tiene cambios que no tenes en esta maquina"
  git fetch origin 2>&1 | Out-Null
  Write-Host "   Del otro lado hay esto que vos no tenes:" -ForegroundColor White
  $ajenos = @(git log --oneline HEAD..("origin/" + $rama) 2>$null)
  if ($ajenos.Count -gt 0) { $ajenos | ForEach-Object { Write-Host ("      {0}" -f $_) -ForegroundColor Gray } }
  else { Write-Host "      (no puedo listarlo: los dos historiales arrancaron por separado)" -ForegroundColor Gray }
  Write-Host ""
  Write-Host "   Tu trabajo esta guardado y no se toca." -ForegroundColor Green
  Write-Host ""
  Write-Host "   Lo que voy a hacer:" -ForegroundColor White
  Write-Host "   Apoyar tu carpeta ENCIMA de lo que ya hay en GitHub, en un solo paso."
  Write-Host "   El historial viejo queda intacto y arriba se agrega tu version de hoy."
  Write-Host "   Cuando termine, GitHub va a tener exactamente los archivos de tu carpeta."
  Write-Host ""
  Write-Host "   No se fuerza nada, no se borra historial y no puede haber conflictos." -ForegroundColor DarkGray
  Write-Host "   Tus archivos del disco no se tocan en ningun momento." -ForegroundColor DarkGray
  Write-Host ""
  $r = Read-Host "   Escribi SI y Enter para hacerlo (cualquier otra cosa cancela)"
  if ($r -ne 'SI' -and $r -ne 'si' -and $r -ne 'Si') {
    Write-Host ""
    Write-Host "   Cancelado. Tu trabajo sigue guardado aca, no se perdio." -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Enter para cerrar"
    exit 0
  }

  # EL TRUCO, EXPLICADO (03/09).
  # 'reset --soft' mueve la marca de "donde estoy" hasta la punta de GitHub SIN
  # tocar un solo archivo del disco. Despues se vuelve a anotar todo lo que hay
  # en la carpeta y se guarda como UN cambio apoyado sobre lo que ya estaba.
  # Como el punto de partida pasa a ser el de GitHub, el push entra derecho: no
  # hay nada que combinar, asi que no puede haber conflictos.
  # Se pierden los mensajes de los commits viejos de esta maquina; el contenido
  # no, porque esta todo en la carpeta.
  git reset --soft ("origin/" + $rama)
  if ($LASTEXITCODE -ne 0) { Salir "No pude apoyarme sobre lo de GitHub. Copiame la pantalla." }
  git add -A
  $mensaje2 = "Motor v29: minutos reales de titular, confianza por remates, valla por minutos en cancha"
  git commit -m $mensaje2
  if ($LASTEXITCODE -ne 0) { Salir "El commit fallo. Copiame la pantalla." }

  Write-Host ""
  Write-Host "   Combinado. Subiendo de nuevo..." -ForegroundColor Green
  git push
  if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "   Sigue sin subir. Tu commit esta guardado igual, no perdiste nada." -ForegroundColor Yellow
    Write-Host "   Copiame la pantalla." -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Enter para cerrar"
    exit 1
  }
}

Write-Host ""
Write-Host "   LISTO. Ya esta en https://github.com/facupd96-lab/Grandt" -ForegroundColor Green
Write-Host ""
Read-Host "Enter para cerrar"
