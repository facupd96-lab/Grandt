@echo off
chcp 65001 >nul
title Gran DT - Subir a GitHub
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0SUBIR_A_GITHUB.ps1"
