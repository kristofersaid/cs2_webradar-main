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
echo Sprawdzam, czy radar juz dziala na http://localhost:22006 ...
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 http://localhost:22006/; if ($r.StatusCode -ne 200 -or $r.Content -notmatch '/assets/') { exit 1 } } catch { exit 1 }"
if not "%ERRORLEVEL%"=="0" (
    echo.
    echo BLAD: pod http://localhost:22006/ nie ma radaru.
    echo Najpierw odpal radar - zwykly radar.bat albo tunel_start.bat,
    echo ktory dodatkowo zbuduje frontend, i wroc tutaj.
    pause
    exit /b 1
)
echo Radar dziala, stawiam tunel...
echo.
"%CF%" tunnel --url http://localhost:22006

endlocal
