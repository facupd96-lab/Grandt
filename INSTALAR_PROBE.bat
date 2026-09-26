@echo off
rem ==========================================================================
rem  Pone probe-fuentes.yml donde GitHub lo busca: .github\workflows\
rem  Las herramientas remotas no pueden escribir dentro de .github, asi que
rem  el archivo llega a la raiz de la carpeta y esto lo acomoda. Se corre
rem  UNA sola vez.
rem ==========================================================================
setlocal
cd /d "%~dp0"
echo.
echo   Instalando el probe de fuentes...
echo.
if not exist "probe-fuentes.yml" (
  echo   No encuentro probe-fuentes.yml en esta carpeta.
  echo   Si ya lo instalaste, esta todo bien: fijate en .github\workflows\
  echo.
  pause
  exit /b 1
)
if not exist ".github\workflows" mkdir ".github\workflows"
move /y "probe-fuentes.yml" ".github\workflows\probe-fuentes.yml" >nul
if errorlevel 1 (
  echo   No pude moverlo. Hacelo a mano: .github\workflows\probe-fuentes.yml
  pause
  exit /b 1
)
echo   Listo: .github\workflows\probe-fuentes.yml
echo.
echo   Ahora:
echo     1. corre SUBIR_A_GITHUB.bat
echo     2. entra a github.com/facupd96-lab/Grandt -^> pestana Actions
echo     3. elegi "probe de fuentes" y aprieta Run workflow
echo     4. copiame la tabla que imprime
echo.
pause
