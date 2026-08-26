@echo off
chcp 65001 >nul
title Gran DT - Torneo anterior (una sola vez)
cd /d "%~dp0"
echo.
echo  Bajando el torneo ANTERIOR de 365Scores para agrandar la muestra.
echo  Tarda entre 5 y 15 minutos. Se corre una sola vez. No cierres la ventana.
echo.
powershell -ExecutionPolicy Bypass -File "%~dp0SYNC_365_HISTORICO.ps1"
echo.
pause
