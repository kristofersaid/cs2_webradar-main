@echo off
set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"
start "CS2 WebRadar overlay" "%ROOT%\venv\Scripts\python.exe" "%ROOT%\radar_overlay.py"
