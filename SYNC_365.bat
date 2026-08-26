@echo off
chcp 65001 >nul
title Gran DT - Datos individuales de 365Scores
cd /d "%~dp0"
echo.
echo  Bajando datos individuales de 365Scores (tiros, xG, minutos por jugador)...
echo  Esto tarda unos minutos. No cierres la ventana.
echo.
powershell -ExecutionPolicy Bypass -File "%~dp0SYNC_365.ps1"
echo.
pause
