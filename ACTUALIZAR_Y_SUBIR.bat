@echo off
chcp 65001 >nul
title Gran DT - Actualizar y subir (durante la fecha)
cd /d "%~dp0"

rem ===========================================================================
rem  ACTUALIZAR_Y_SUBIR.bat  -  la corrida de TODOS LOS DIAS, mientras la fecha
rem  se esta jugando. Trae los puntajes nuevos y los publica. NO RECALCULA.
rem
rem  POR QUE NO RECALCULA (14/09)
rem  La version anterior corria RECALCULAR en el medio, y eso rompio todo el
rem  13/09: RECALCULAR rehace las proyecciones usando el fixture que hay en la
rem  carpeta, y el fixture solo lo actualizan SYNC_365 y SYNC_COPAS, que esta
rem  cadena no corria. Con el fixture viejo el motor creia que la fecha 9
rem  todavia estaba por jugarse, cuando ya habia terminado. Resultado: proyectaba
rem  partidos ya jugados CON las estadisticas de esos mismos partidos adentro
rem  —se predecia a si mismo— y los rankings salian dados vuelta sin que nada
rem  pareciera roto.
rem  Mientras la fecha se juega no hay NADA que recalcular: los puntos vienen de
rem  SYNC_VIVO. Recalcular es cuando la fecha termina, y para eso esta
rem  CERRAR_FECHA.bat, que si corre todos los syncs.
rem
rem    1. SYNC_PLANETA   puntajes oficiales, si es que ya los publico
rem    2. SYNC_VIVO      goles, tarjetas y minutos de la fecha en curso
rem    3. ARMAR_LIGA     rehace dataLiga.js con los equipos de equipos.txt
rem    4. AUDITAR        si encuentra problemas, corta y NO sube
rem    5. SUBIR_A_GITHUB publica y comprueba que quedo publicado
rem
rem  Doble clic = corre y espera una tecla al final.
rem  Con /auto  = corre y cierra sola (es como la llama la tarea programada).
rem ===========================================================================

set LOG=%~dp0registro_diario.txt
echo. >> "%LOG%"
echo ======================================================== >> "%LOG%"
echo CORRIDA (durante la fecha) %date% %time% >> "%LOG%"

echo [1/5] Puntajes oficiales de Planeta...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0SYNC_PLANETA.ps1" < nul >> "%LOG%" 2>&1
if errorlevel 1 goto :fallo

echo [2/5] Fecha en vivo...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0SYNC_VIVO.ps1" < nul >> "%LOG%" 2>&1
if errorlevel 1 goto :fallo

echo [3/5] Torneo de amigos...
node.exe armar_liga.cjs >> "%LOG%" 2>&1
if errorlevel 1 goto :fallo

echo [4/5] Revisando los datos...
node.exe auditar.cjs >> "%LOG%" 2>&1
if errorlevel 1 goto :auditoria

echo [5/5] Subiendo a GitHub...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0SUBIR_A_GITHUB.ps1" -Auto >> "%LOG%" 2>&1
if errorlevel 1 goto :fallo

echo LISTO %date% %time% >> "%LOG%"
echo.
echo Listo. Todo actualizado y subido.
goto :fin

:auditoria
echo AUDITORIA CON PROBLEMAS, no se subio nada. %date% %time% >> "%LOG%"
echo.
echo El auditor encontro problemas en los datos. NO se subio nada.
echo Abri registro_diario.txt y busca "PROBLEMAS": ahi dice que pasa y que correr.
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
