@echo off
chcp 65001 >nul
title Gran DT - Calendario de liga y copas
cd /d "%~dp0"
echo.
echo  Bajando el calendario de la liga, Libertadores, Sudamericana y Copa Argentina...
echo  Sirve para detectar que equipos llegan cansados o van a poner suplentes.
echo.
powershell -ExecutionPolicy Bypass -File "%~dp0SYNC_COPAS.ps1"
echo.
pause
