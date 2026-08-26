@echo off
chcp 65001 >nul
title Gran DT - Diagnostico de 365Scores
cd /d "%~dp0"
echo.
echo  Bajando UN partido de 365Scores para ver que datos trae.
echo  No modifica nada. Tarda unos segundos.
echo.
powershell -ExecutionPolicy Bypass -File "%~dp0VER_STATS.ps1"
echo.
pause
