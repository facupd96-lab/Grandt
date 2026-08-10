@echo off
title Gran DT Analyzer Pro Server
echo =====================================================
echo Iniciando Servidor Gran DT Analyzer Pro...
echo =====================================================
cd /d "%~dp0"

start http://localhost:3000
node server.cjs

pause
