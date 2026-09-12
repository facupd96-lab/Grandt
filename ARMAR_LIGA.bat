@echo off
chcp 65001 >nul
title Gran DT - Armar torneo de amigos
cd /d "%~dp0"
echo.
echo Leyendo equipos.txt y armando dataLiga.js...
echo.
node.exe armar_liga.cjs
echo.
pause
