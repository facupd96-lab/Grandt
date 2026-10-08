@echo off
rem ==========================================================================
rem  La foto de una fecha: lo que el motor esperaba de cada jugador contra lo
rem  que saco de verdad. Es lo que llena la pantalla Revision y lo unico que
rem  permite medir si el modelo sirve.
rem
rem  Necesita que dataVivo.js sea de la fecha que queres fotografiar Y que
rem  este cruzado contra el datos.js de ahora. Si corriste RECALCULAR despues
rem  del ultimo SYNC_VIVO, corre primero:   SYNC_VIVO.bat <numero de fecha>
rem ==========================================================================
cd /d "%~dp0"
echo.
node.exe foto.cjs %*
echo.
pause
