@echo off
chcp 65001 >nul
title Gran DT - Auditar el torneo de amigos
cd /d "%~dp0"

rem  Recalcula el puntaje de los 7 equipos desde los archivos, con las reglas
rem  del juego (banco y cinta incluidos), y lo compara con lo que deberia dar.
rem  Si la pantalla muestra otro numero, la pantalla esta mal.
rem  Se puede correr cuando quieras: no toca ni un archivo.

node.exe auditar_torneo.cjs
echo.
pause
