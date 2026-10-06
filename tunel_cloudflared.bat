@echo off
setlocal

pushd "%~dp0" || (
    echo BLAD: nie moge wejsc do katalogu tego pliku .bat.
    pause
    exit /b 1
)

set "CF="
if exist "%CD%\cloudflared.exe" set "CF=%CD%\cloudflared.exe"
if not defined CF (
    where cloudflared >nul 2>&1
    if not errorlevel 1 set "CF=cloudflared"
)

if not defined CF (
    echo BLAD: nie znaleziono cloudflared.
    echo Jestem w katalogu: %CD%
    echo Pliki EXE w tym katalogu:
    dir /b *.exe
    echo.
    echo 1. Wrzuc cloudflared.exe DO TEGO katalogu, obok tego pliku .bat.
    echo 2. Uruchom ten .bat ponownie.
    pause
    exit /b 1
)

echo Uzywam: "%CF%"
echo Start tunelu do http://localhost:22006 ...
echo (najpierw musial wystartowac tunel_start.bat!)
echo.
"%CF%" tunnel --url http://localhost:22006

endlocal
