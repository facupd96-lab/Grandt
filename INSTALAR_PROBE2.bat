@echo off
rem  Instala probe2-fuentes.yml en .github\workflows\ (una sola vez).
setlocal
cd /d "%~dp0"
echo.
if not exist "probe2-fuentes.yml" (
  echo   No encuentro probe2-fuentes.yml aca. Si ya lo instalaste, esta todo bien.
  echo.
  pause
  exit /b 1
)
if not exist ".github\workflows" mkdir ".github\workflows"
move /y "probe2-fuentes.yml" ".github\workflows\probe2-fuentes.yml" >nul
echo   Listo: .github\workflows\probe2-fuentes.yml
echo.
echo   Ahora: SUBIR_A_GITHUB.bat, y despues Actions -^> "probe 2 de fuentes" -^> Run workflow
echo   Esta vez la tabla sale en la pagina del run, no hace falta abrir el log.
echo.
pause
