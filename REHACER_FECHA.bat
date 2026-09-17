@echo off
chcp 65001 >nul
title Gran DT - Rearmar los puntajes de una fecha
cd /d "%~dp0"

rem ===========================================================================
rem  REHACER_FECHA.bat  -  rescata los puntos de una fecha que quedo a medias.
rem
rem  Para que sirve: si en Revision una fecha quedo incompleta ("12 de 15
rem  partidos"), es porque la foto se saco antes de que Planeta publicara los
rem  ultimos partidos, y despues el motor paso a la fecha siguiente y ya no la
rem  refresca mas. Esto rearma los puntos de esa fecha desde los posts de
rem  Planeta, que siguen en el feed.
rem
rem  Despues de correrlo:
rem    1. abri el index
rem    2. Revision -> elegi esa fecha -> "X borrar esta foto"
rem    3. recarga la pagina: te va a ofrecer rearmarla, ahora completa
rem
rem  OJO: mientras dataVivo.js apunte a esa fecha vieja, la portada no va a
rem  mostrar los puntos en vivo de la fecha actual. Se arregla solo la proxima
rem  vez que corras ACTUALIZAR_Y_SUBIR.bat, o corriendo SYNC_VIVO.bat.
rem
rem  El feed de Planeta guarda los ultimos 10 posts (mas o menos dos fechas y
rem  media). Mas viejo que eso ya no se puede rescatar.
rem ===========================================================================

echo.
echo  Que fecha queres rearmar?
echo    - un numero (por ejemplo 9)
echo    - o escribi  cerrada  para la ultima que tenga los 15 partidos jugados
echo.
set /p CUAL=Fecha: 

if "%CUAL%"=="" (
  echo  No pusiste nada. No toco nada.
  goto :fin
)

echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0SYNC_VIVO.ps1" -Fecha "%CUAL%"
if errorlevel 1 goto :fallo

echo.
echo  Listo. Ahora:
echo    1. abri index.html
echo    2. Revision, elegi esa fecha, "X borrar esta foto"
echo    3. recarga: te la va a ofrecer rearmada y completa
goto :fin

:fallo
echo.
echo  Algo fallo. Mira lo que dice aca arriba.

:fin
echo.
pause
