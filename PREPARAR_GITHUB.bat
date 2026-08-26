@echo off
chcp 65001 >nul
title Gran DT - Preparar para GitHub
cd /d "%~dp0"
echo.
echo  Arma la carpeta _subir_github con todo lo que hay que subir al repo.
echo.
powershell -ExecutionPolicy Bypass -File "%~dp0PREPARAR_GITHUB.ps1"
echo.
pause
