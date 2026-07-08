@echo off
cd /d "%~dp0"
echo [Web Agent] Starting server on http://localhost:8921
echo [Web Agent] Dashboard: http://localhost:8921/dashboard
echo [Web Agent] Tasks: %CD%\tasks\
echo.
python server.py
pause
