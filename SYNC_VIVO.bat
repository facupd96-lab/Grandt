@echo off
rem  Los puntajes de una fecha. Sin argumentos: la fecha en curso.
rem  Con un numero: esa fecha  ->  SYNC_VIVO.bat 11
rem  Con la palabra cerrada:   ->  SYNC_VIVO.bat cerrada
cd /d "%~dp0"
if "%~1"=="" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0SYNC_VIVO.ps1"
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0SYNC_VIVO.ps1" -Fecha "%~1"
)
echo.
pause
