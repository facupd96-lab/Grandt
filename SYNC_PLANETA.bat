@echo off
chcp 65001 >nul
title Gran DT - Planilla oficial de Planeta Gran DT
cd /d "%~dp0"
echo.
echo  Bajando la planilla oficial (puntajes, goles, figuras, vallas, tarjetas)...
echo.
powershell -ExecutionPolicy Bypass -File "%~dp0SYNC_PLANETA.ps1"
echo.
pause
