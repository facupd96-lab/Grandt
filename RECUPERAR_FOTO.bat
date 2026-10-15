@echo off
rem ==========================================================================
rem  RECUPERAR LA FOTO DE UNA FECHA
rem
rem  La foto es lo que el motor esperaba de cada jugador contra lo que saco de
rem  verdad. Es lo que llena Revision y lo unico que permite medir el modelo.
rem
rem  Hace falta cuando la fecha quedo sin fotografiar: por ejemplo si un
rem  partido se reprogramo y CERRAR_FECHA no pudo sacarla, o si recalculaste
rem  despues del ultimo SYNC_VIVO (los ids se corren y foto.cjs se niega, con
rem  razon: sin ese candado te colgaria los puntos de un jugador a otro).
rem
rem  BAJA EL FEED PRIMERO (15/10). Antes el paso 1 era "node vivo.cjs %F%", que
rem  LEE feedVivo.json y no lo baja. Con el Sarmiento-River de la fecha 11
rem  reprogramado al 14/10, el feed guardado era del 08/10 y no tenia el post
rem  con esos puntajes: vivo.cjs leia 14 de 15 partidos y foto.cjs se negaba,
rem  una y otra vez, sin que hubiera forma de darse cuenta de por que. Ahora el
rem  paso 1 llama a SYNC_VIVO.ps1, que baja el feed Y arma dataVivo.js para la
rem  fecha pedida.
rem
rem  Son tres pasos y los hace solo:
rem    1. baja el feed de Planeta y rehace dataVivo.js para ESA fecha
rem    2. saca la foto
rem    3. vuelve dataVivo.js a la fecha en curso
rem ==========================================================================
setlocal
cd /d "%~dp0"
echo.
set "F=%~1"
if "%F%"=="" set /p "F=Numero de la fecha que queres fotografiar: "
if "%F%"=="" goto :fin
echo.
echo   [1/3] Bajando los puntajes de la fecha %F%...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0SYNC_VIVO.ps1" -Fecha %F%
if errorlevel 1 goto :mal
echo.
echo   [2/3] La foto...
node.exe foto.cjs
if errorlevel 1 goto :mal
echo.
echo   [3/3] Volviendo dataVivo.js a la fecha en curso...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0SYNC_VIVO.ps1"
echo.
echo   Listo. Ahora corre SUBIR_A_GITHUB.bat
goto :fin
:mal
echo.
echo   Algo fallo. Mira el mensaje de arriba y pasamelo.
:fin
echo.
pause
