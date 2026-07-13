@echo off
cd /d "%~dp0"
start "" pythonw resources\tools\tray.py %*
