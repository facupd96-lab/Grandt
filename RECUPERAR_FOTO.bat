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
rem  Son tres pasos y los hace solo:
rem    1. rehace dataVivo.js para ESA fecha, contra el datos.js de ahora
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
echo   [1/3] Puntajes de la fecha %F%...
node.exe vivo.cjs %F%
if errorlevel 1 goto :mal
echo.
echo   [2/3] La foto...
node.exe foto.cjs
if errorlevel 1 goto :mal
echo.
echo   [3/3] Volviendo dataVivo.js a la fecha en curso...
node.exe vivo.cjs
echo.
echo   Listo. Ahora corre SUBIR_A_GITHUB.bat
goto :fin
:mal
echo.
echo   Algo fallo. Mira el mensaje de arriba y pasamelo.
:fin
echo.
pause
