@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  === 1. LOS DATOS: hay algo que no puede ser? ===
if exist node.exe ( node.exe auditar.cjs ) else ( node auditar.cjs )
echo.
echo  === 2. LA COHERENCIA: la pantalla dice lo mismo que el motor? ===
if exist node.exe ( node.exe auditar_numeros.cjs ) else ( node auditar_numeros.cjs )
echo.
echo  === 3. EL ALGORITMO: el puntaje esta bien armado? ===
if exist node.exe ( node.exe auditar_motor.cjs ) else ( node auditar_motor.cjs )
echo.
pause
