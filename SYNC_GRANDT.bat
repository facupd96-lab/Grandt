@echo off
chcp 65001 >nul
title Gran DT - Ayudante de campo (lesionados, suspendidos, ley del ex)
cd /d "%~dp0"
echo.
echo  Bajando el ayudante de campo del Gran DT oficial...
echo.
powershell -ExecutionPolicy Bypass -File "%~dp0SYNC_GRANDT.ps1"
echo.
pause
