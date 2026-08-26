@echo off
chcp 65001 >nul
title Gran DT - Backtest: el motor contra la realidad
cd /d "%~dp0"
echo.
echo  Compara lo que el motor recomendo ANTES de cada fecha
echo  contra lo que realmente paso, y contra referencias simples.
echo.
if exist "%~dp0node.exe" (
  "%~dp0node.exe" "%~dp0backtest.cjs"
) else (
  node "%~dp0backtest.cjs"
)
echo.
pause
