@echo off
chcp 65001 >nul
title Gran DT - Segunda opinion
cd /d "%~dp0"
if exist node.exe (node.exe mi_auditoria.cjs datos.js) else (node mi_auditoria.cjs datos.js)
echo.
pause
