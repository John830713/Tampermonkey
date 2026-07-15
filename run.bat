@echo off
cd /d "%~dp0"
for /f "tokens=*" %%i in ('powershell -NoProfile -Command "(Get-Content server_config.json | ConvertFrom-Json).show_console"') do set CONSOLE=%%i
if "%CONSOLE%"=="False" (
    start "" pythonw resources\tools\tray.py %*
) else (
    python resources\tools\tray.py %*
)
