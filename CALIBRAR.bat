@echo off
cd /d "%~dp0"
echo.
echo Midiendo cuanto hay que creerle a la ficha historica...
node.exe calibrar_ficha.cjs
echo.
pause
