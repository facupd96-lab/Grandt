@echo off
rem  Instala prueba-sync.yml en .github\workflows\ y deja el SYNC_ESPN arreglado.
setlocal
cd /d "%~dp0"
echo.
if not exist ".github\workflows" mkdir ".github\workflows"
if exist "prueba-sync.yml" move /y "prueba-sync.yml" ".github\workflows\prueba-sync.yml" >nul
echo   Listo: .github\workflows\prueba-sync.yml
echo.
echo   Ahora: SUBIR_A_GITHUB.bat, y despues Actions -^> "prueba de sync" -^> Run workflow
echo   Tarda unos minutos (ESPN recorre todo el calendario).
echo.
pause
