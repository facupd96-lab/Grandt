@echo off
chcp 65001 >nul
title Gran DT - Actualizar todo
cd /d "%~dp0"
echo.
echo  Actualiza TODO: planilla, tiros y xG por jugador, cuotas, fixture y copas,
echo  y despues recalcula el motor. Tarda entre 10 y 20 minutos.
echo  No cierres la ventana.
echo.
powershell -ExecutionPolicy Bypass -File "%~dp0ACTUALIZAR_TODO.ps1"
echo.
pause
