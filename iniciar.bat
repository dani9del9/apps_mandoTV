@echo off
chcp 65001 >nul
title MandoPC
cd /d "%~dp0"
where node >nul 2>nul || (echo Necesitas Node.js instalado: https://nodejs.org & pause & exit /b)
node server.js
pause
