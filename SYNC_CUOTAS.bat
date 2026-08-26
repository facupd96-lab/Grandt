@echo off
chcp 65001 >nul
title Gran DT - Cuotas de las casas de apuestas
cd /d "%~dp0"
echo.
echo  Bajando cuotas 1X2 y Over/Under de la proxima fecha...
echo.
powershell -ExecutionPolicy Bypass -File "%~dp0SYNC_CUOTAS.ps1"
echo.
pause
