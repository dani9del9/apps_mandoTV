@echo off
cd /d "%~dp0"
if not exist mando.pid (echo MandoPC no parece estar en marcha. & pause & exit /b)
for /f %%p in (mando.pid) do taskkill /PID %%p /T /F
del mando.pid
echo MandoPC parado.
timeout /t 2 >nul
