@echo off
title Gran DT Analyzer Pro - Servidor Local
echo =====================================================
echo    INICIANDO GRAN DT ANALYZER PRO (SERVIDOR LOCAL)
echo =====================================================
echo.
cd /d "%~dp0"

powershell -ExecutionPolicy Bypass -File "%~dp0server.ps1"

pause
