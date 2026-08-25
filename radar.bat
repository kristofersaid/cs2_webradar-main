@echo off
setlocal

set "ROOT=%~dp0"

start "CS2 WebRadar server" "%ComSpec%" /d /k call "%ROOT%radarserver.bat"
timeout /t 2 /nobreak >nul

start "CS2 WebRadar usermode" "%ComSpec%" /d /c call "%ROOT%radarusermode.bat"
timeout /t 1 /nobreak >nul

if not exist "%ROOT%venv\Scripts\python.exe" (
    echo Nie znaleziono Python venv: "%ROOT%venv\Scripts\python.exe"
    echo Najpierw wykonaj instrukcje instalacji z readme.md.
    pause
    exit /b 1
)

start "CS2 WebRadar overlay" "%ROOT%venv\Scripts\python.exe" "%ROOT%radar_overlay.py"

endlocal
