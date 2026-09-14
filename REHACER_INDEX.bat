@echo off
chcp 65001 >nul
title Gran DT - Rehacer el index
cd /d "%~dp0"

rem ===========================================================================
rem  REHACER_INDEX.bat  -  rearma index.html y nada mas. Tarda dos segundos.
rem
rem  POR QUE EXISTE
rem  appV3.js y styles.css NO se cargan aparte: construir.cjs los mete ADENTRO
rem  de index.html. Entonces, cuando cambia el codigo de la app, recargar la
rem  pagina con Ctrl+F5 no alcanza: el navegador vuelve a leer el mismo index
rem  viejo, con el appV3.js viejo adentro. Hay que rehacer el index.
rem
rem  Los que SI se cargan aparte —y por eso se ven al recargar— son los datos:
rem  datos.js, dataVivo.js, dataHist.js, dataLiga.js y dataManual.js.
rem
rem  Si ademas cambiaron los DATOS (corriste un sync), esto no alcanza:
rem  corre RECALCULAR.bat, que rehace las cuentas y despues el index.
rem ===========================================================================

echo.
echo Rearmando index.html...
echo.
node.exe construir.cjs
echo.
echo Listo. Ahora si, Ctrl+F5 en el navegador.
echo.
pause
