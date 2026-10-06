@echo off
setlocal

set "ROOT=%~dp0"

echo [1/4] Budowanie frontendu (zeby tunel mial co serwowac)...
pushd "%ROOT%webapp" || (
    echo BLAD: nie znaleziono katalogu webapp.
    pause
    exit /b 1
)
where npm >nul 2>&1 || (
    echo BLAD: nie znaleziono npm. Zainstaluj Node.js i dodaj go do PATH.
    popd
    pause
    exit /b 1
)
call npm run build
if not "%ERRORLEVEL%"=="0" (
    echo BLAD: build frontendu sie nie powiodl.
    popd
    pause
    exit /b 1
)
popd

echo [2/4] Serwer: strona + dane na porcie 22006...
start "Radar tunel serwer" "%ComSpec%" /d /k node "%ROOT%webapp\ws\app.js"
timeout /t 2 /nobreak >nul

echo [3/4] usermode (CS2 musi dzialac)...
start "usermode" "%ComSpec%" /d /c call "%ROOT%radarusermode.bat"
timeout /t 1 /nobreak >nul

echo [4/4] Overlay...
set "VENVPY=%ROOT%venv\Scripts\python.exe"
if not exist "%VENVPY%" (
    echo BLAD: nie znaleziono venv.
    echo Wykonaj instalacje z readme.md, potem wroc tutaj.
    pause
    exit /b 1
)
start "Radar overlay" "%VENVPY%" "%ROOT%radar_overlay.py"

echo.
echo GOTOWE. Teraz uruchom tunel_cloudflared.bat i wyslij koledze link https z jego okna.
echo Instrukcja krok po kroku: JAK_DAC_LINK_KOLEDZE.txt
endlocal
