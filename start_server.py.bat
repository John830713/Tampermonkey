@echo off
cd /d D:\Tampermonkey
start /B "" python server.py > server_log.txt 2>&1
timeout /t 3 >nul
type server_log.txt