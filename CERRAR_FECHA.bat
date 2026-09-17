@echo off
chcp 65001 >nul
title Gran DT - Cerrar la fecha y pasar a la siguiente
cd /d "%~dp0"

rem ===========================================================================
rem  CERRAR_FECHA.bat  -  se corre UNA VEZ, cuando la fecha termino.
rem
rem  Es lo unico que mueve el motor a la fecha siguiente, porque es lo unico
rem  que trae el FIXTURE y las CUOTAS nuevas (SYNC_365 y SYNC_COPAS). Sin esto,
rem  RECALCULAR rehace las cuentas apuntando a la fecha que ya se jugo y los
rem  numeros salen mal sin que se note.
rem
rem    1. SYNC_ROLES        el rol de cada jugador (data365_roles.json)
rem    2. SYNC_ESPN         corners, posesion y tiros por equipo (dataEspn.json)
rem    3. ACTUALIZAR_TODO   los cinco syncs (Planeta, 365, cuotas, copas,
rem                         ayudante de campo) + recalcula + las tres auditorias
rem    4. SYNC_VIVO         los puntajes de la fecha que acaba de terminar.
rem                         VA CON -Fecha cerrada Y NO ES UN DETALLE (17/09):
rem                         para este punto ACTUALIZAR_TODO ya movio el motor a
rem                         la fecha siguiente, asi que SYNC_VIVO sin el
rem                         parametro rehacia dataVivo.js para la fecha NUEVA,
rem                         que esta vacia, y los puntos de la fecha que acababa
rem                         de cerrar se borraban del archivo. Revision se
rem                         quedaba con la foto incompleta que hubiera y ya no
rem                         habia forma de rehacerla. Asi se perdio la fecha 9.
rem    5. ARMAR_LIGA        rehace dataLiga.js
rem    6. FOTO              escribe en dataFotos.js como termino la fecha: el
rem                         once del motor con su banco y cada equipo del
rem                         torneo, calculado desde los archivos. ANTES esto
rem                         vivia solo en el localStorage de Chrome, o sea que
rem                         en Vercel los amigos no veian NINGUN historial y una
rem                         foto mal sacada no se podia arreglar nunca mas.
rem                         Se acumula: una fecha guardada no se pierde.
rem    7. AUDITAR           si hay problemas, corta y NO sube
rem    8. SUBIR_A_GITHUB    publica
rem
rem  ROLES y ESPN van PRIMERO porque armar.cjs los lee: si corren despues de
rem  ACTUALIZAR_TODO, el motor recalcula con los archivos viejos. Y van aca y no
rem  en ACTUALIZAR_TODO porque ESPN trae resultados de la fecha EN CURSO que la
rem  planilla todavia no tiene: solo es seguro con la fecha ya terminada.
rem  Si alguno de los dos falla, se avisa y se sigue: no son criticos, el motor
rem  arranca igual con el archivo anterior.
rem
rem  Tarda bastante: ACTUALIZAR_TODO baja todo de cero.
rem  ANTES de correrlo, abri el index una vez: asi Revision guarda la foto de la
rem  fecha que termino. Despues de esto, los esperados de esa fecha ya no estan.
rem ===========================================================================

set LOG=%~dp0registro_diario.txt
echo. >> "%LOG%"
echo ======================================================== >> "%LOG%"
echo CIERRE DE FECHA %date% %time% >> "%LOG%"

echo [1/8] Roles de cada jugador...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0SYNC_ROLES.ps1" < nul >> "%LOG%" 2>&1
if errorlevel 1 echo ADVERTENCIA: SYNC_ROLES fallo, sigo con el data365_roles.json anterior. >> "%LOG%"

echo [2/8] Corners y posesion (ESPN)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0SYNC_ESPN.ps1" < nul >> "%LOG%" 2>&1
if errorlevel 1 echo ADVERTENCIA: SYNC_ESPN fallo, sigo con el dataEspn.json anterior. >> "%LOG%"

echo [3/8] Bajando todo de nuevo (esto tarda)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ACTUALIZAR_TODO.ps1" < nul >> "%LOG%" 2>&1
if errorlevel 1 goto :fallo

echo [4/8] Puntajes de la fecha que cerro...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0SYNC_VIVO.ps1" -Fecha cerrada < nul >> "%LOG%" 2>&1
if errorlevel 1 goto :fallo

echo [5/8] Torneo de amigos...
node.exe armar_liga.cjs >> "%LOG%" 2>&1
if errorlevel 1 goto :fallo

echo [6/8] La foto de la fecha que cerro...
node.exe foto.cjs >> "%LOG%" 2>&1
if errorlevel 1 echo ADVERTENCIA: no se pudo sacar la foto de la fecha. Mira el log. >> "%LOG%"

echo [7/8] Revisando los datos...
node.exe auditar.cjs >> "%LOG%" 2>&1
if errorlevel 1 goto :auditoria

echo [8/8] Subiendo a GitHub...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0SUBIR_A_GITHUB.ps1" -Auto >> "%LOG%" 2>&1
if errorlevel 1 goto :fallo

echo LISTO %date% %time% >> "%LOG%"
echo.
echo Listo. El motor ya esta en la fecha siguiente y esta todo publicado.
echo.
echo PARA CONFIRMAR QUE QUEDO BIEN:
echo   Abri el index y fijate que Revision muestre la fecha que cerro.
echo   Deberia decir "Esta fecha viene del archivo": eso quiere decir que la
echo   sacó la cadena y que la ven todos, no solo vos.
goto :fin

:auditoria
echo AUDITORIA CON PROBLEMAS, no se subio nada. %date% %time% >> "%LOG%"
echo.
echo El auditor encontro problemas. NO se subio nada.
echo Abri registro_diario.txt y busca "PROBLEMAS".
goto :fin

:fallo
echo FALLO, no se subio nada. %date% %time% >> "%LOG%"
echo.
echo ALGO FALLO. No se subio nada a GitHub. Mira el final de registro_diario.txt.

:fin
if "%1"=="/auto" goto :eof
echo.
pause
