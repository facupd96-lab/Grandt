@echo off
chcp 65001 >nul
title Gran DT - Actualizar y subir
cd /d "%~dp0"

rem ===========================================================================
rem  ACTUALIZAR_Y_SUBIR.bat  -  la corrida completa, sin preguntar nada.
rem
rem    1. SYNC_PLANETA   puntajes oficiales (solo cambian cuando Planeta sube
rem                      la planilla de la fecha, lunes o martes a la noche)
rem    2. RECALCULAR     rehace datos.js e index.html con lo que haya
rem    3. SYNC_VIVO      goles, tarjetas y minutos de la fecha en curso
rem    4. ARMAR_LIGA     rehace dataLiga.js con los equipos de equipos.txt
rem    5. SUBIR_A_GITHUB publica todo y comprueba que quedo publicado
rem
rem  Los pasos 2 y 5 se llaman con -Auto: eso saltea los "Enter para cerrar"
rem  y el "Escribi SI". Sin eso la tarea programada queda colgada esperando
rem  una tecla que nadie va a apretar.
rem
rem  Si un paso falla, CORTA y no sube nada: mejor que GitHub quede una corrida
rem  atras y no con datos a medio actualizar. Todo queda en registro_diario.txt.
rem
rem  Doble clic = corre y espera una tecla al final.
rem  Con /auto  = corre y cierra sola (es como la llama la tarea programada).
rem ===========================================================================

set LOG=%~dp0registro_diario.txt
echo. >> "%LOG%"
echo ======================================================== >> "%LOG%"
echo CORRIDA %date% %time% >> "%LOG%"

echo [1/5] Puntajes oficiales de Planeta...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0SYNC_PLANETA.ps1" < nul >> "%LOG%" 2>&1
if errorlevel 1 goto :fallo

echo [2/5] Recalculando el motor...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0RECALCULAR.ps1" -Auto >> "%LOG%" 2>&1
if errorlevel 1 goto :fallo

echo [3/5] Fecha en vivo...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0SYNC_VIVO.ps1" < nul >> "%LOG%" 2>&1
if errorlevel 1 goto :fallo

echo [4/5] Torneo de amigos...
node.exe armar_liga.cjs >> "%LOG%" 2>&1
if errorlevel 1 goto :fallo

echo [5/5] Subiendo a GitHub...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0SUBIR_A_GITHUB.ps1" -Auto >> "%LOG%" 2>&1
if errorlevel 1 goto :fallo

echo LISTO %date% %time% >> "%LOG%"
echo.
echo Listo. Todo actualizado y subido.
goto :fin

:fallo
echo FALLO, no se subio nada. %date% %time% >> "%LOG%"
echo.
echo ALGO FALLO. No se subio nada a GitHub.
echo Abri registro_diario.txt y mira el final: ahi esta el motivo.

:fin
if "%1"=="/auto" goto :eof
echo.
pause
