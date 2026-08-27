@echo off
title Gran DT Analyzer Pro - Enlace para Casa y Amigos
echo =====================================================
echo Generando Enlace Web para Casa y Amigos...
echo =====================================================
cd /d "%~dp0"

echo Asegurate de que el servidor (INICIAR_SERVIDOR.bat) este encendido.
echo.
npx localtunnel --port 3000

pause
